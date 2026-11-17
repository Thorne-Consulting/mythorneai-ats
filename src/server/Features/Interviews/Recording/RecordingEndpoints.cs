using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Interviews.Recording;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Recording in chunks while the interview runs (no request near the server's size limit), the
/// transcript with timestamps, captions, and the saved AI summary. Transcripts and summaries follow
/// the scorecard rule: nobody on the panel reads them before their own scorecard is in.
/// </summary>
public static partial class AtsEndpoints
{
    /// <summary>What the browser sends at a time. Well under Kestrel's 30 MB request limit.</summary>
    public const int RecordingChunkBytes = 4 * 1024 * 1024;
    private const long MaxRecordingBytes = 2L * 1024 * 1024 * 1024;

    private static readonly Dictionary<string, string> RecordingTypes = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        [".webm"] = "video/webm",
        [".mp4"] = "video/mp4",
        [".m4a"] = "audio/mp4",
        [".mp3"] = "audio/mpeg",
        [".ogg"] = "audio/ogg",
        [".wav"] = "audio/wav",
    };

    private static void MapRecordingPipeline(RouteGroupBuilder api)
    {
        api.MapPost(
            "/interviews/{id:guid}/recordings/uploads",
            async (
                Guid id,
                StartRecordingRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                if (!request.ConsentConfirmed)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["consentConfirmed"] = ["Confirm that everyone agreed to be recorded."],
                        }
                    );
                var extension = Path.GetExtension(request.FileName ?? "").ToLowerInvariant();
                if (!RecordingTypes.TryGetValue(extension, out var contentType))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["fileName"] = ["Choose a WebM, MP4, M4A, MP3, OGG or WAV file."],
                        }
                    );
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
                var recording = new InterviewRecording
                {
                    InterviewId = id,
                    OriginalFileName = Path.GetFileName(request.FileName!),
                    StoredFileName = $"{Guid.NewGuid():N}{extension}",
                    ContentType = contentType,
                    UploadedBy = principal.Email(),
                    ConsentConfirmed = true,
                    Status = RecordingStatus.Uploading,
                    Source = request.Source == "Upload" ? "Upload" : "Browser",
                    LastChunkAt = DateTimeOffset.UtcNow,
                };
                db.InterviewRecordings.Add(recording);
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    interview.ApplicationId,
                    "InterviewRecordingStarted",
                    new { recording.Id, InterviewId = id }
                );
                await db.SaveChangesAsync(ct);
                return Results.Created(
                    $"/api/interview-recordings/{recording.Id}",
                    new { recording.Id, ChunkBytes = RecordingChunkBytes }
                );
            }
        );

        // Chunk n of an upload. Sending the same chunk again replaces it, so retries are safe.
        api.MapPost(
            "/interview-recordings/{id:guid}/chunks/{index:int}",
            async (
                Guid id,
                int index,
                IFormFile file,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                if (index is < 0 or > 99_999 || file.Length is <= 0 or > 2 * RecordingChunkBytes)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["file"] = ["Each piece is up to 8 MB."],
                        }
                    );
                var recording = await db.InterviewRecordings.SingleOrDefaultAsync(
                    x => x.Id == id,
                    ct
                );
                if (recording is null || recording.UploadedBy != principal.Email())
                    return Results.NotFound();
                if (recording.Status != RecordingStatus.Uploading)
                    return Results.Conflict(new { message = "This recording is already saved." });
                if ((long)(index + 1) * 2 * RecordingChunkBytes > MaxRecordingBytes)
                    return Results.Conflict(new { message = "Recordings can be up to 2 GB." });
                if (
                    index == 0
                    && !await RecordingStartsRightAsync(
                        file,
                        Path.GetExtension(recording.StoredFileName),
                        ct
                    )
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["file"] =
                            [
                                "The file does not look like the kind of recording its name says.",
                            ],
                        }
                    );
                var part = files.NewPath(
                    RecordingPipeline.PartName(recording.StoredFileName, index)
                );
                await using (var output = new FileStream(part, FileMode.Create, FileAccess.Write))
                    await file.CopyToAsync(output, ct);
                await db
                    .InterviewRecordings.Where(x => x.Id == id)
                    .ExecuteUpdateAsync(
                        set =>
                            set.SetProperty(x => x.LastChunkAt, DateTimeOffset.UtcNow)
                                .SetProperty(
                                    x => x.ChunksReceived,
                                    x => Math.Max(x.ChunksReceived, index + 1)
                                ),
                        ct
                    );
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/interview-recordings/{id:guid}/complete",
            async (
                Guid id,
                CompleteRecordingRequest? request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var recording = await db.InterviewRecordings.SingleOrDefaultAsync(
                    x => x.Id == id,
                    ct
                );
                if (recording is null || recording.UploadedBy != principal.Email())
                    return Results.NotFound();
                if (recording.Status == RecordingStatus.Uploading)
                {
                    recording.Status = RecordingStatus.Processing;
                    if (request?.DurationSeconds is > 0 and < 24 * 3600)
                        recording.DurationSeconds = request.DurationSeconds;
                    await db.SaveChangesAsync(ct);
                }
                return Results.Ok(new { recording.Id, recording.Status });
            }
        );

        api.MapGet(
            "/interview-recordings/{id:guid}/transcript",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var access = await RecordingAccessAsync(db, principal, id, ct);
                if (access is null)
                    return Results.NotFound();
                var (recording, blinded) = access.Value;
                if (blinded)
                    return Results.Json(
                        new { message = "The transcript opens after you send your scorecard." },
                        statusCode: StatusCodes.Status403Forbidden
                    );
                return Results.Ok(
                    new
                    {
                        recording.Id,
                        recording.Status,
                        recording.TranscriptStatus,
                        recording.TranscriptError,
                        recording.TranscriptModel,
                        recording.TranscribedAt,
                        recording.DurationSeconds,
                        recording.Source,
                        Segments = RecordingPipeline.Segments(recording.SegmentsJson),
                        SpeakerNames = RecordingPipeline.SpeakerNames(recording.SpeakerNamesJson),
                    }
                );
            }
        );

        api.MapGet(
            "/interview-recordings/{id:guid}/captions.vtt",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var access = await RecordingAccessAsync(db, principal, id, ct);
                if (access is not { Blinded: false } allowed)
                    return Results.NotFound();
                return Results.Text(
                    RecordingPipeline.Vtt(
                        RecordingPipeline.Segments(allowed.Recording.SegmentsJson),
                        RecordingPipeline.SpeakerNames(allowed.Recording.SpeakerNamesJson)
                    ),
                    "text/vtt; charset=utf-8"
                );
            }
        );

        api.MapGet(
            "/interviews/{id:guid}/summary",
            async (
                Guid id,
                ClaimsPrincipal principal,
                AtsDbContext db,
                IAiAssistant ai,
                CancellationToken ct
            ) =>
            {
                var access = await SummaryAccessAsync(db, principal, id, ct);
                if (access is null)
                    return Results.NotFound();
                if (!access.Value.CanRead)
                    return Results.Ok(
                        new
                        {
                            Locked = true,
                            CanWrite = false,
                            Summary = (object?)null,
                            Versions = 0,
                            AiReady = ai.IsConfigured,
                        }
                    );
                var versions = await db.InterviewSummaries.CountAsync(x => x.InterviewId == id, ct);
                var latest = await db
                    .InterviewSummaries.AsNoTracking()
                    .Where(x => x.InterviewId == id)
                    .OrderByDescending(x => x.CreatedAt)
                    .FirstOrDefaultAsync(ct);
                return Results.Ok(
                    new
                    {
                        Locked = false,
                        CanWrite = access.Value.CanManage,
                        Summary = latest,
                        Versions = versions,
                        AiReady = ai.IsConfigured,
                    }
                );
            }
        );

        api.MapPost(
                "/interviews/{id:guid}/summary",
                async (
                    Guid id,
                    RegenerateSummaryRequest? request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    if (request?.Reason?.Length > 300)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["reason"] = ["Keep the reason under 300 characters."],
                            }
                        );
                    var access = await SummaryAccessAsync(db, principal, id, ct);
                    if (access is not { CanManage: true, CanRead: true })
                        return Results.NotFound();
                    try
                    {
                        var summary = await InterviewSummaries.WriteAsync(
                            db,
                            ai,
                            id,
                            principal.Email(),
                            Clean(request?.Reason),
                            ct
                        );
                        return summary is null
                            ? Results.Conflict(
                                new
                                {
                                    message = "There is nothing to summarize yet. Add a recording, notes or a scorecard first.",
                                }
                            )
                            : Results.Ok(summary);
                    }
                    catch (AiUnavailableException)
                    {
                        return Results.Json(
                            new
                            {
                                message = "AI is not set up, so the summary cannot be written. Ask your administrator.",
                            },
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/interviews/{id:guid}/summary",
                async (
                    Guid id,
                    UpdateSummaryRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Length > 50_000)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] =
                                [
                                    "The summary needs some text, up to 50,000 characters.",
                                ],
                            }
                        );
                    var access = await SummaryAccessAsync(db, principal, id, ct);
                    if (access is not { CanManage: true, CanRead: true })
                        return Results.NotFound();
                    var latest = await db
                        .InterviewSummaries.Where(x => x.InterviewId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .FirstOrDefaultAsync(ct);
                    if (latest is null)
                        return Results.NotFound();
                    latest.Body = request.Body.Trim();
                    latest.EditedBy = principal.Email();
                    latest.EditedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(latest);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>The recording when it is in scope, and whether the reader still owes a scorecard on the application.</summary>
    private static async Task<(InterviewRecording Recording, bool Blinded)?> RecordingAccessAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid recordingId,
        CancellationToken ct
    )
    {
        var applicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal)
            .Select(x => x.Id);
        var recording = await db
            .InterviewRecordings.AsNoTracking()
            .Include(x => x.Interview)
            .SingleOrDefaultAsync(
                x => x.Id == recordingId && applicationIds.Contains(x.Interview!.ApplicationId),
                ct
            );
        if (recording is null)
            return null;
        var blinded =
            (
                await BlindingInterviewsAsync(
                    db,
                    recording.Interview!.ApplicationId,
                    principal.Email(),
                    ct
                )
            ).Length > 0;
        return (recording, blinded);
    }

    /// <summary>Who may read and write an interview's summary: the people who run the job, and the panel once their scorecards are in.</summary>
    private static async Task<(bool CanRead, bool CanManage)?> SummaryAccessAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid interviewId,
        CancellationToken ct
    )
    {
        var applicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal)
            .Select(x => x.Id);
        var interview = await db
            .Interviews.AsNoTracking()
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .SingleOrDefaultAsync(
                x => x.Id == interviewId && applicationIds.Contains(x.ApplicationId),
                ct
            );
        if (interview?.Application?.Requisition is null)
            return null;
        var email = principal.Email();
        var manage = CanManage(interview.Application.Requisition, principal);
        var assigned = interview.InterviewerEmails.Contains(
            email,
            StringComparer.OrdinalIgnoreCase
        );
        var blinded =
            (await BlindingInterviewsAsync(db, interview.ApplicationId, email, ct)).Length > 0;
        return ((manage || assigned) && !blinded, manage);
    }

    private static async Task<bool> RecordingStartsRightAsync(
        IFormFile file,
        string extension,
        CancellationToken ct
    )
    {
        await using var input = file.OpenReadStream();
        var header = new byte[12];
        var read = await input.ReadAsync(header, ct);
        return extension switch
        {
            ".webm" => read >= 4
                && header.AsSpan(0, 4).SequenceEqual(new byte[] { 0x1A, 0x45, 0xDF, 0xA3 }),
            ".mp4" or ".m4a" => read >= 8 && header.AsSpan(4, 4).SequenceEqual("ftyp"u8),
            ".ogg" => read >= 4 && header.AsSpan(0, 4).SequenceEqual("OggS"u8),
            ".wav" => read >= 4 && header.AsSpan(0, 4).SequenceEqual("RIFF"u8),
            _ => read > 0,
        };
    }
}
