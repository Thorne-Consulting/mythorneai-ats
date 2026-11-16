using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Interviews.Recording;

public enum TranscriptionPlan
{
    /// <summary>Send the file as it is.</summary>
    Whole,

    /// <summary>Cut it into pieces with ffmpeg and send each.</summary>
    Split,

    /// <summary>Too big to send, and no ffmpeg to make it smaller.</summary>
    TooLong,
}

/// <summary>
/// After the last chunk: join the pieces, make the file seekable and extract audio (with ffmpeg),
/// transcribe with timestamps, then write the summary. Each step is one call so tests can run it.
/// </summary>
public static class RecordingPipeline
{
    /// <summary>The transcription service takes files up to 25 MB.</summary>
    public const long MaxUploadBytes = 25L * 1024 * 1024;

    /// <summary>Pieces of 20 minutes stay far under the limit at the audio bit rate we write.</summary>
    public const int PieceSeconds = 20 * 60;

    /// <summary>A browser that stops sending chunks for this long has crashed or closed: keep what arrived.</summary>
    public static readonly TimeSpan StaleUpload = TimeSpan.FromMinutes(10);

    public const string TooLongMessage =
        "This recording is too long to transcribe on this server. Ask your administrator to install ffmpeg, which makes recordings small enough to send.";

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static TranscriptionPlan Plan(long bytes, bool ffmpeg) =>
        bytes <= MaxUploadBytes ? TranscriptionPlan.Whole
        : ffmpeg ? TranscriptionPlan.Split
        : TranscriptionPlan.TooLong;

    public static string PartName(string storedName, int index) => $"{storedName}.part{index:D5}";

    public static IReadOnlyList<TranscriptSegment> Segments(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<List<TranscriptSegment>>(json, Json) ?? [];

    /// <summary>"4:05" or "1:02:03".</summary>
    public static string Stamp(double seconds)
    {
        var time = TimeSpan.FromSeconds(Math.Max(0, Math.Floor(seconds)));
        return time.TotalHours >= 1
            ? $"{(int)time.TotalHours}:{time.Minutes:00}:{time.Seconds:00}"
            : $"{time.Minutes}:{time.Seconds:00}";
    }

    /// <summary>Who each speaker label is, from <see cref="InterviewRecording.SpeakerNamesJson"/>.</summary>
    public static Dictionary<string, string> SpeakerNames(string? json) =>
        string.IsNullOrWhiteSpace(json)
            ? []
            : JsonSerializer.Deserialize<Dictionary<string, string>>(json, Json) ?? [];

    /// <summary>"Jordan Lee" once named; "Speaker A" for a model's label; an imported name as it is.</summary>
    public static string SpeakerName(IReadOnlyDictionary<string, string> names, string speaker) =>
        names.GetValueOrDefault(speaker) is { Length: > 0 } name ? name
        : speaker.Length <= 2 ? $"Speaker {speaker}"
        : speaker;

    /// <summary>Captions for the player's track element.</summary>
    public static string Vtt(
        IReadOnlyList<TranscriptSegment> segments,
        IReadOnlyDictionary<string, string>? names = null
    )
    {
        static string At(double seconds) =>
            TimeSpan
                .FromSeconds(Math.Max(0, seconds))
                .ToString(@"hh\:mm\:ss\.fff", CultureInfo.InvariantCulture);
        var text = new StringBuilder("WEBVTT\n\n");
        foreach (var segment in segments)
            text.Append(At(segment.Start))
                .Append(" --> ")
                .Append(At(Math.Max(segment.End, segment.Start + 0.5)))
                .Append('\n')
                .Append(
                    segment.Speaker is null
                        ? ""
                        : $"<v {SpeakerName(names ?? new Dictionary<string, string>(), segment.Speaker).Replace(">", "")}>"
                )
                .Append(segment.Text.Replace("-->", "->"))
                .Append("\n\n");
        return text.ToString();
    }

    /// <summary>Uploads that stopped arriving go on with what they have.</summary>
    public static Task<int> FinishStaleUploadsAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var cutoff = now - StaleUpload;
        return db
            .InterviewRecordings.Where(x =>
                x.Status == RecordingStatus.Uploading && (x.LastChunkAt ?? x.RecordedAt) < cutoff
            )
            .ExecuteUpdateAsync(
                set => set.SetProperty(x => x.Status, RecordingStatus.Processing),
                ct
            );
    }

    /// <summary>Joins the chunks of one recording, then (with ffmpeg) makes it seekable and extracts audio.</summary>
    public static async Task<bool> ProcessNextAsync(
        AtsDbContext db,
        LocalFileStore files,
        MediaTools media,
        ILogger logger,
        CancellationToken ct
    )
    {
        var recording = await db
            .InterviewRecordings.Where(x => x.Status == RecordingStatus.Processing)
            .OrderBy(x => x.RecordedAt)
            .FirstOrDefaultAsync(ct);
        if (recording is null)
            return false;
        try
        {
            await ProcessAsync(db, files, media, logger, recording, ct);
        }
        catch (Exception exception)
            when (exception is not (OperationCanceledException or DbUpdateConcurrencyException))
        {
            logger.LogError(exception, "Recording {Id} could not be saved.", recording.Id);
            recording.Status = RecordingStatus.Failed;
            recording.ProcessingError = "We could not save this recording. Try recording again.";
            await db.SaveChangesAsync(ct);
        }
        return true;
    }

    private static async Task ProcessAsync(
        AtsDbContext db,
        LocalFileStore files,
        MediaTools media,
        ILogger logger,
        InterviewRecording recording,
        CancellationToken ct
    )
    {
        var path = files.FullPath(recording.StoredFileName);
        var parts = Directory.Exists(Path.GetDirectoryName(path))
            ? Directory
                .GetFiles(Path.GetDirectoryName(path)!, Path.GetFileName(path) + ".part*")
                .Order()
                .ToArray()
            : [];
        if (parts.Length > 0)
        {
            // Only the unbroken run from the first chunk: a gap would make the rest unplayable.
            await using (var output = new FileStream(path, FileMode.Create, FileAccess.Write))
                for (
                    var index = 0;
                    index < parts.Length
                        && parts[index]
                            == files.FullPath(PartName(recording.StoredFileName, index));
                    index++
                )
                {
                    await using var input = File.OpenRead(parts[index]);
                    await input.CopyToAsync(output, ct);
                }
            foreach (var part in parts)
                File.Delete(part);
        }
        recording.Length = File.Exists(path) ? new FileInfo(path).Length : 0;
        if (recording.Length == 0)
        {
            recording.Status = RecordingStatus.Failed;
            recording.ProcessingError =
                "Nothing was recorded. Check that the browser was allowed to record, then try again.";
            await db.SaveChangesAsync(ct);
            return;
        }
        if (media.Available)
            try
            {
                var extension = Path.GetExtension(recording.StoredFileName);
                var seekable = $"{Guid.NewGuid():N}{extension}";
                if (await media.RemuxAsync(path, files.FullPath(seekable), ct))
                {
                    var old = recording.StoredFileName;
                    recording.StoredFileName = seekable;
                    recording.Length = new FileInfo(files.FullPath(seekable)).Length;
                    files.Delete(old);
                }
                recording.DurationSeconds =
                    await media.DurationSecondsAsync(files.FullPath(recording.StoredFileName), ct)
                    ?? recording.DurationSeconds;
                var audio = $"{Guid.NewGuid():N}.ogg";
                if (
                    await media.ExtractAudioAsync(
                        files.FullPath(recording.StoredFileName),
                        files.FullPath(audio),
                        ct
                    )
                )
                    recording.AudioStoredFileName = audio;
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // The original still plays; only seeking and the smaller audio are lost.
                logger.LogWarning(
                    exception,
                    "ffmpeg could not process recording {Id}.",
                    recording.Id
                );
            }
        recording.Status = RecordingStatus.Ready;
        recording.TranscriptStatus = RecordingStatus.TranscriptQueued;
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Transcribes the next waiting recording, then writes the interview's summary.</summary>
    public static async Task<bool> TranscribeNextAsync(
        AtsDbContext db,
        LocalFileStore files,
        IAiAssistant ai,
        MediaTools media,
        ILogger logger,
        CancellationToken ct
    )
    {
        var recording = await db
            .InterviewRecordings.Where(x =>
                x.Status == RecordingStatus.Ready
                && x.TranscriptStatus == RecordingStatus.TranscriptQueued
            )
            .OrderBy(x => x.RecordedAt)
            .FirstOrDefaultAsync(ct);
        if (recording is null)
            return false;
        // An imported transcript already has its text: only the summary is left to write.
        if (recording.Source == RecordingStatus.TranscriptSource)
        {
            recording.TranscriptStatus = RecordingStatus.Ready;
            await db.SaveChangesAsync(ct);
            await WriteSummaryAsync(db, ai, recording.InterviewId, logger, ct);
            return true;
        }
        if (!ai.IsConfigured)
        {
            recording.TranscriptStatus = "Failed";
            recording.TranscriptError = "Transcripts need AI to be set up. Ask your administrator.";
            await db.SaveChangesAsync(ct);
            return true;
        }
        recording.TranscriptStatus = RecordingStatus.TranscriptRunning;
        recording.TranscriptError = null;
        await db.SaveChangesAsync(ct);

        var source = recording.AudioStoredFileName ?? recording.StoredFileName;
        var path = files.FullPath(source);
        var context = new AiContext(
            "transcribe-recording",
            "system:transcription",
            "InterviewRecording",
            recording.Id.ToString()
        );
        try
        {
            DetailedTranscript transcript;
            switch (Plan(new FileInfo(path).Length, media.Available))
            {
                case TranscriptionPlan.TooLong:
                    recording.TranscriptStatus = RecordingStatus.TranscriptTooLong;
                    recording.TranscriptError = TooLongMessage;
                    await db.SaveChangesAsync(ct);
                    return true;
                case TranscriptionPlan.Whole:
                    await using (var stream = files.OpenRead(source))
                        transcript = await ai.TranscribeDetailedAsync(
                            stream,
                            $"interview{Path.GetExtension(source)}",
                            ct,
                            context
                        );
                    break;
                default:
                    transcript = await TranscribePiecesAsync(ai, media, path, context, ct);
                    break;
            }
            recording.SegmentsJson = JsonSerializer.Serialize(transcript.Segments, Json);
            recording.Transcript = string.Join("\n", transcript.Segments.Select(x => x.Text));
            recording.TranscriptModel = transcript.Model;
            recording.TranscribedAt = DateTimeOffset.UtcNow;
            recording.TranscriptStatus = RecordingStatus.Ready;
            if (recording.DurationSeconds is null && transcript.Segments.Count > 0)
                recording.DurationSeconds = (int)Math.Ceiling(transcript.Segments[^1].End);
            await db.SaveChangesAsync(ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(exception, "Transcribing recording {Id} failed.", recording.Id);
            recording.TranscriptStatus = "Failed";
            recording.TranscriptError =
                exception is AiUnavailableException
                    ? "Transcripts need AI to be set up. Ask your administrator."
                    : "We could not transcribe this recording. Try again in a few minutes.";
            await db.SaveChangesAsync(ct);
            return true;
        }

        await WriteSummaryAsync(db, ai, recording.InterviewId, logger, ct);
        return true;
    }

    private static async Task WriteSummaryAsync(
        AtsDbContext db,
        IAiAssistant ai,
        Guid interviewId,
        ILogger logger,
        CancellationToken ct
    )
    {
        if (!ai.IsConfigured)
            return;
        try
        {
            await InterviewSummaries.WriteAsync(db, ai, interviewId, "system:transcript", null, ct);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogWarning(
                exception,
                "The summary for interview {Id} could not be written.",
                interviewId
            );
        }
    }

    private static async Task<DetailedTranscript> TranscribePiecesAsync(
        IAiAssistant ai,
        MediaTools media,
        string path,
        AiContext context,
        CancellationToken ct
    )
    {
        var folder = Path.Combine(Path.GetTempPath(), $"transcribe-{Guid.NewGuid():N}");
        try
        {
            var pieces = await media.SplitAsync(path, folder, PieceSeconds, ct);
            var segments = new List<TranscriptSegment>();
            var text = new StringBuilder();
            var model = "";
            for (var index = 0; index < pieces.Count; index++)
            {
                await using var stream = File.OpenRead(pieces[index]);
                var piece = await ai.TranscribeDetailedAsync(
                    stream,
                    Path.GetFileName(pieces[index]),
                    ct,
                    context
                );
                var offset = index * PieceSeconds;
                // Speaker labels restart in each piece, so they are only kept when there is one piece.
                segments.AddRange(
                    piece.Segments.Select(x =>
                        x with
                        {
                            Start = x.Start + offset,
                            End = x.End + offset,
                            Speaker = pieces.Count == 1 ? x.Speaker : null,
                        }
                    )
                );
                text.AppendLine(piece.Text);
                model = piece.Model;
            }
            return new DetailedTranscript(model, text.ToString().Trim(), segments);
        }
        finally
        {
            if (Directory.Exists(folder))
                Directory.Delete(folder, true);
        }
    }
}

/// <summary>The AI summary of one interview: written from the transcript, notes and scorecards, then saved.</summary>
public static class InterviewSummaries
{
    /// <summary>Longer transcripts are summarized in parts of about this many characters, then combined.</summary>
    public const int PartLimit = 40_000;

    /// <summary>Lines grouped into parts of at most <paramref name="limit"/> characters, never splitting a line.</summary>
    public static List<string> Parts(IEnumerable<string> lines, int limit = PartLimit)
    {
        var parts = new List<string>();
        var part = new StringBuilder();
        foreach (var line in lines)
        {
            var text = line.Length > limit ? line[..limit] : line;
            if (part.Length > 0 && part.Length + text.Length + 1 > limit)
            {
                parts.Add(part.ToString());
                part.Clear();
            }
            part.Append(part.Length > 0 ? "\n" : "").Append(text);
        }
        if (part.Length > 0)
            parts.Add(part.ToString());
        return parts;
    }

    /// <summary>Writes and saves a new version. Null when there is nothing to summarize yet.</summary>
    public static async Task<InterviewSummary?> WriteAsync(
        AtsDbContext db,
        IAiAssistant ai,
        Guid interviewId,
        string createdBy,
        string? reason,
        CancellationToken ct
    )
    {
        var interview = await db
            .Interviews.AsNoTracking()
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Include(x => x.InterviewKit)
                .ThenInclude(x => x!.Criteria)
            .Include(x => x.Scorecards)
                .ThenInclude(x => x.CriterionRatings)
                    .ThenInclude(x => x.InterviewCriterion)
            .Include(x => x.Recordings)
            .SingleAsync(x => x.Id == interviewId, ct);
        var lines = interview
            .Recordings.Where(x => x.TranscriptStatus == RecordingStatus.Ready)
            .OrderBy(x => x.RecordedAt)
            .SelectMany(x =>
            {
                var names = RecordingPipeline.SpeakerNames(x.SpeakerNamesJson);
                return RecordingPipeline
                    .Segments(x.SegmentsJson)
                    .Select(s =>
                        $"[{RecordingPipeline.Stamp(s.Start)}]{(s.Speaker is null ? "" : $" {RecordingPipeline.SpeakerName(names, s.Speaker)}:")} {s.Text}"
                    );
            })
            .ToList();
        var context = new AiContext(
            "summarize-interview",
            createdBy,
            "Interview",
            interviewId.ToString()
        );
        var transcript = string.Join("\n", lines);
        var transcriptLabel = "Transcript";
        if (transcript.Length > PartLimit)
        {
            // Too long for one careful read: notes on each part (times kept), then one summary of the notes.
            var parts = Parts(lines);
            var notes = new List<string>();
            for (var i = 0; i < parts.Count; i++)
                notes.Add(
                    $"Part {i + 1} of {parts.Count}:\n"
                        + (
                            await ai.CompleteAsync(
                                "You are reading one part of a long interview transcript. Write factual notes in Markdown bullets: "
                                    + "what was asked, what the candidate said (with examples and numbers), and any questions the candidate asked. "
                                    + "Keep each point's time in square brackets exactly as given, for example [12:34]. Never judge the candidate.",
                                $"Interview: {interview.Title}\nTranscript part {i + 1} of {parts.Count}:\n{parts[i]}",
                                ct,
                                context
                            )
                        ).Trim()
                );
            transcript = string.Join("\n\n", notes);
            transcriptLabel =
                $"Transcript notes (the transcript was long, so it was read in {parts.Count} parts)";
        }
        var sources = new List<string>();
        if (transcript.Length > 0)
            sources.Add("the transcript");
        if (!string.IsNullOrWhiteSpace(interview.MeetingNotes))
            sources.Add("the meeting notes");
        if (interview.Scorecards.Count > 0)
            sources.Add(
                interview.Scorecards.Count == 1
                    ? "1 scorecard"
                    : $"{interview.Scorecards.Count} scorecards"
            );
        if (sources.Count == 0)
            return null;

        var criteria = interview.InterviewKit is null
            ? "No interview kit was used."
            : string.Join(
                "\n",
                interview
                    .InterviewKit.Criteria.OrderBy(c => c.SortOrder)
                    .Select(c => $"- {c.Name}: {c.Question}")
            );
        var scorecards = string.Join(
            "\n",
            interview.Scorecards.Select(card =>
                $"{card.InterviewerEmail}: rating {card.Rating}/5. Evidence: {card.Evidence}. "
                + string.Join(
                    "; ",
                    card.CriterionRatings.Select(r =>
                        $"{r.InterviewCriterion!.Name} {r.Rating}/5 ({r.Evidence})"
                    )
                )
            )
        );
        var body = await ai.CompleteAsync(
            "Summarize an interview for the hiring team. Be factual and brief, and keep evidence apart from guesses. "
                + "Never say whether to hire, and never rate the candidate. Write Markdown with these headings: "
                + "## Overview (3 to 5 sentences), ## Evidence by question (one bullet per kit question, saying what was said, "
                + "or 'No evidence'), ## Questions the candidate asked, ## Open questions for the next round. "
                + "When a point comes from the transcript, cite its time in square brackets exactly as given, for example [12:34].",
            $"Job: {interview.Application!.Requisition!.Title}\nInterview: {interview.Title}\nKit questions:\n{criteria}\n"
                + $"Meeting notes:\n{(string.IsNullOrWhiteSpace(interview.MeetingNotes) ? "None." : interview.MeetingNotes)}\n"
                + $"{transcriptLabel}:\n{(transcript.Length == 0 ? "None." : transcript)}\n"
                + $"Scorecards:\n{(scorecards.Length == 0 ? "None yet." : scorecards)}",
            ct,
            context
        );
        var summary = new InterviewSummary
        {
            InterviewId = interviewId,
            Body = body.Trim(),
            Model = "AI",
            Sources = string.Join(", ", sources),
            Reason = reason,
            CreatedBy = createdBy,
        };
        db.InterviewSummaries.Add(summary);
        await db.SaveChangesAsync(ct);
        return summary;
    }
}
