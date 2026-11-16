using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Interviews.Recording;

namespace MyThorneAI.Ats.Api.Interviews.Recording
{
    /// <summary>
    /// Reads a transcript file from another tool: WebVTT (Zoom, Teams, Meet), SubRip (.srt), or plain
    /// text. Speakers come from WebVTT voice tags or a "Name: " at the start of a line.
    /// </summary>
    public static partial class TranscriptFiles
    {
        public static readonly string[] Extensions = [".vtt", ".srt", ".txt"];

        [GeneratedRegex(
            @"^\s*(?<a>(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\s*-->\s*(?<b>(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)"
        )]
        private static partial Regex Cue();

        [GeneratedRegex(@"^\s*\[?(?<t>(?:\d+:)?\d{1,2}:\d{2})\]?\s+")]
        private static partial Regex LeadingTime();

        [GeneratedRegex(@"<v(?:\.[^ >]*)?\s+(?<name>[^>]+)>")]
        private static partial Regex Voice();

        [GeneratedRegex(@"<[^>]+>")]
        private static partial Regex Tag();

        // "Jordan Lee: I think…" or "Speaker 2: …": up to four capitalized words (or numbers) before a colon.
        [GeneratedRegex(
            @"^(?<name>\p{Lu}[\p{L}\p{M}'’.\-]*(?: (?:\p{Lu}[\p{L}\p{M}'’.\-]*|\d+)){0,3})\s*:\s+(?<text>.+)$"
        )]
        private static partial Regex NamePrefix();

        public static double Seconds(string stamp)
        {
            var parts = stamp.Replace(',', '.').Split(':');
            var total = 0d;
            foreach (var part in parts)
                total = total * 60 + double.Parse(part, CultureInfo.InvariantCulture);
            return total;
        }

        public static List<TranscriptSegment> Parse(string content)
        {
            var lines = content.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
            return content.Contains("-->") ? Cues(lines) : Plain(lines);
        }

        private static (string? Speaker, string Text) Speaker(string text)
        {
            var voice = Voice().Match(text);
            if (voice.Success)
                return (voice.Groups["name"].Value.Trim(), Tag().Replace(text, "").Trim());
            text = Tag().Replace(text, "").Trim();
            var named = NamePrefix().Match(text);
            return named.Success
                ? (named.Groups["name"].Value.Trim(), named.Groups["text"].Value.Trim())
                : (null, text);
        }

        private static List<TranscriptSegment> Cues(string[] lines)
        {
            var segments = new List<TranscriptSegment>();
            for (var i = 0; i < lines.Length; i++)
            {
                var cue = Cue().Match(lines[i]);
                if (!cue.Success)
                    continue;
                var text = new StringBuilder();
                for (i++; i < lines.Length && lines[i].Trim().Length > 0; i++)
                    text.Append(text.Length > 0 ? " " : "").Append(lines[i].Trim());
                var (speaker, words) = Speaker(text.ToString());
                if (words.Length == 0)
                    continue;
                var start = Seconds(cue.Groups["a"].Value);
                var end = Math.Max(start, Seconds(cue.Groups["b"].Value));
                // Tools often split one person's sentence over several cues: join them back.
                if (
                    segments.Count > 0
                    && segments[^1].Speaker == speaker
                    && speaker is not null
                    && start - segments[^1].End < 1
                    && segments[^1].Text.Length < 400
                )
                    segments[^1] = segments[^1] with
                    {
                        End = end,
                        Text = $"{segments[^1].Text} {words}",
                    };
                else
                    segments.Add(new TranscriptSegment(start, end, speaker, words));
            }
            return segments;
        }

        private static List<TranscriptSegment> Plain(string[] lines)
        {
            var segments = new List<TranscriptSegment>();
            var at = 0d;
            foreach (var raw in lines)
            {
                var line = raw.Trim();
                if (line.Length == 0)
                    continue;
                var time = LeadingTime().Match(line);
                if (time.Success)
                {
                    at = Seconds(time.Groups["t"].Value);
                    line = line[time.Length..].Trim();
                }
                var (speaker, text) = Speaker(line);
                if (text.Length == 0)
                    continue;
                if (segments.Count > 0 && segments[^1] is { } last && last.Start < at)
                    segments[^1] = last with { End = at };
                segments.Add(new TranscriptSegment(at, at, speaker, text));
            }
            return segments;
        }
    }
}

namespace MyThorneAI.Ats.Api.Api
{
    /// <summary>Who each speaker is. An empty name clears it.</summary>
    public sealed record SpeakerNamesRequest(Dictionary<string, string?> Names);

    public static partial class AtsEndpoints
    {
        private const long MaxTranscriptBytes = 2 * 1024 * 1024;

        private static void MapTranscripts(RouteGroupBuilder api)
        {
            // A transcript from an interview recorded somewhere else (Zoom, Teams, Meet, a note taker).
            api.MapPost(
                "/interviews/{id:guid}/transcripts",
                async (
                    Guid id,
                    IFormFile file,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                    if (!TranscriptFiles.Extensions.Contains(extension))
                        return TranscriptProblem(
                            "Choose a transcript file: WebVTT (.vtt), SubRip (.srt) or plain text (.txt)."
                        );
                    if (file.Length is <= 0 or > MaxTranscriptBytes)
                        return TranscriptProblem("Choose a transcript file under 2 MB.");
                    var interview = await db
                        .Interviews.Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (interview?.Application?.Requisition is null)
                        return Results.NotFound();
                    var assigned = interview.InterviewerEmails.Contains(
                        principal.Email(),
                        StringComparer.OrdinalIgnoreCase
                    );
                    if (!assigned && !CanManage(interview.Application.Requisition, principal))
                        return Results.Forbid();
                    string content;
                    using (var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8))
                        content = await reader.ReadToEndAsync(ct);
                    var segments = TranscriptFiles.Parse(content);
                    if (segments.Count == 0)
                        return TranscriptProblem(
                            "We could not find any words in that file. Check that it is a transcript."
                        );
                    var recording = new InterviewRecording
                    {
                        InterviewId = id,
                        OriginalFileName = Path.GetFileName(file.FileName),
                        StoredFileName = "",
                        ContentType = extension == ".vtt" ? "text/vtt" : "text/plain",
                        Length = file.Length,
                        UploadedBy = principal.Email(),
                        ConsentConfirmed = true,
                        Status = RecordingStatus.Ready,
                        Source = RecordingStatus.TranscriptSource,
                        SegmentsJson = JsonSerializer.Serialize(
                            segments,
                            new JsonSerializerOptions(JsonSerializerDefaults.Web)
                        ),
                        Transcript = string.Join("\n", segments.Select(x => x.Text)),
                        TranscriptModel = "Imported",
                        TranscribedAt = DateTimeOffset.UtcNow,
                        DurationSeconds =
                            segments[^1].End > 0 ? (int)Math.Ceiling(segments[^1].End) : null,
                        // The recording worker writes the summary next.
                        TranscriptStatus = ai.IsConfigured
                            ? RecordingStatus.TranscriptQueued
                            : RecordingStatus.Ready,
                    };
                    db.InterviewRecordings.Add(recording);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "InterviewTranscriptImported",
                        new
                        {
                            recording.Id,
                            InterviewId = id,
                            recording.OriginalFileName,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interview-recordings/{recording.Id}",
                        new { recording.Id, Segments = segments.Count }
                    );
                }
            );

            api.MapPut(
                "/interview-recordings/{id:guid}/speakers",
                async (
                    Guid id,
                    SpeakerNamesRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var access = await RecordingAccessAsync(db, principal, id, ct);
                    if (access is null)
                        return Results.NotFound();
                    if (access.Value.Blinded)
                        return Results.Json(
                            new { message = "The transcript opens after you send your scorecard." },
                            statusCode: StatusCodes.Status403Forbidden
                        );
                    var recording = await db
                        .InterviewRecordings.Include(x => x.Interview!.Application!.Requisition)
                        .SingleAsync(x => x.Id == id, ct);
                    var interview = recording.Interview!;
                    var assigned = interview.InterviewerEmails.Contains(
                        principal.Email(),
                        StringComparer.OrdinalIgnoreCase
                    );
                    if (!assigned && !CanManage(interview.Application!.Requisition!, principal))
                        return Results.Forbid();
                    var speakers = RecordingPipeline
                        .Segments(recording.SegmentsJson)
                        .Select(x => x.Speaker)
                        .OfType<string>()
                        .ToHashSet();
                    var names = RecordingPipeline.SpeakerNames(recording.SpeakerNamesJson);
                    foreach (var (key, value) in request.Names ?? [])
                    {
                        if (!speakers.Contains(key))
                            return TranscriptProblem("That speaker is not in this transcript.");
                        var name = value?.Trim() ?? "";
                        if (name.Length > 100)
                            return TranscriptProblem("Keep each name under 100 characters.");
                        if (name.Length == 0)
                            names.Remove(key);
                        else
                            names[key] = name;
                    }
                    recording.SpeakerNamesJson =
                        names.Count == 0 ? null : JsonSerializer.Serialize(names);
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { SpeakerNames = names });
                }
            );
        }

        private static IResult TranscriptProblem(string message) =>
            Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });
    }
}
