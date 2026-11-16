using System.IO.Compression;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SaveAnswerRequest(string[]? ChoiceIds, string? Text, int? Seconds);

public sealed record IntegritySignalsRequest(IntegrityEvent[]? Events);

/// <summary>
/// The candidate side, signed in with the portal session (cookie or header). A candidate only ever
/// reaches invites on their own applications; anything else is "not found".
/// </summary>
public static class PublicAssessmentEndpoints
{
    public const string RatePolicy = "assessment-taking";
    public const long MaxUpload = 25 * 1024 * 1024;

    /// <summary>File types a take-home can be, checked by content as well as name.</summary>
    public static readonly string[] UploadTypes =
    [
        ".pdf",
        ".doc",
        ".docx",
        ".png",
        ".jpg",
        ".jpeg",
        ".zip",
        ".txt",
        ".md",
        ".csv",
    ];

    /// <summary>Registered from Program.cs: the worker and a rate limit that allows autosave while typing.</summary>
    public static IServiceCollection AddAssessments(this IServiceCollection services)
    {
        services.AddHostedService<AssessmentWorker>();
        services.Configure<RateLimiterOptions>(options =>
            options.AddPolicy(
                RatePolicy,
                context =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        context.Request.Headers[PublicEndpoints.SessionHeader].ToString()
                            is { Length: > 0 } token
                            ? token
                            : context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = 240,
                            Window = TimeSpan.FromMinutes(1),
                            QueueLimit = 0,
                        }
                    )
            )
        );
        return services;
    }

    public static void MapPublicAssessments(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/public/assessments").RequireRateLimiting(RatePolicy);

        // The candidate's tests: what to take next, and what they sent.
        api.MapGet(
            "",
            async (
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var now = DateTimeOffset.UtcNow;
                var rows = await db
                    .AssessmentInvites.AsNoTracking()
                    .Where(x =>
                        x.Application!.CandidateId == candidateId
                        && x.Status != AssessmentInviteStatus.Revoked
                        && x.ReplacedAt == null
                        && x.Application.Status != ApplicationStatus.PendingVerification
                    )
                    .OrderByDescending(x => x.InvitedAt)
                    .Select(x => new
                    {
                        Invite = x,
                        x.Assessment!.Name,
                        x.Assessment.Kind,
                        x.Assessment.ProviderName,
                        x.Application!.Status,
                        JobTitle = x.Application.Requisition!.Title,
                        x.Version!.ContentJson,
                    })
                    .Take(50)
                    .ToListAsync(ct);
                return Results.Ok(
                    rows.Select(x =>
                    {
                        var content = AssessmentScoring.Read(x.ContentJson);
                        var status = AssessmentFlow.Effective(x.Invite, now);
                        return new
                        {
                            x.Invite.Id,
                            x.Invite.ApplicationId,
                            x.JobTitle,
                            x.Name,
                            x.Kind,
                            x.ProviderName,
                            // A closed application's open test is shown as expired: nobody will grade it.
                            Status = x.Status != ApplicationStatus.Active
                            && status
                                is AssessmentInviteStatus.NotStarted
                                    or AssessmentInviteStatus.InProgress
                                ? AssessmentInviteStatus.Expired
                                : status,
                            content.Minutes,
                            content.Timed,
                            Questions = AssessmentScoring.Questions(content).Count(),
                            x.Invite.InvitedAt,
                            x.Invite.ExpiresAt,
                            x.Invite.DeadlineAt,
                            x.Invite.SubmittedAt,
                        };
                    })
                );
            }
        );

        api.MapGet(
            "/{id:guid}",
            async (
                Guid id,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                if (await AssessmentFlow.SettleAsync(db, invite, DateTimeOffset.UtcNow, ct))
                    await db.SaveChangesAsync(ct);
                return Results.Ok(await ViewAsync(db, invite, ct));
            }
        );

        // Starts the clock on the server. Starting twice is harmless and returns the same deadline.
        api.MapPost(
            "/{id:guid}/start",
            async (
                Guid id,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                // Whole seconds: the database keeps microseconds, so the start and deadline it
                // gives back must equal the ones this reply sends.
                var now = DateTimeOffset.UtcNow;
                now = now.AddTicks(-(now.Ticks % TimeSpan.TicksPerSecond));
                await AssessmentFlow.SettleAsync(db, invite, now, ct);
                if (invite.Status == AssessmentInviteStatus.NotStarted)
                {
                    if (invite.Application!.Status != ApplicationStatus.Active)
                        return Results.Conflict(
                            new
                            {
                                message = "This application is closed, so the assessment is no longer open.",
                            }
                        );
                    // Fixes published since the invite reach anyone who has not started.
                    if (
                        invite.Assessment!.CurrentVersionId is { } current
                        && current != invite.VersionId
                    )
                    {
                        invite.VersionId = current;
                        invite.Version = await db.AssessmentVersions.SingleAsync(
                            x => x.Id == current,
                            ct
                        );
                    }
                    var content = AssessmentScoring.Read(invite.Version!.ContentJson);
                    invite.Status = AssessmentInviteStatus.InProgress;
                    invite.StartedAt = now;
                    invite.DeadlineAt =
                        invite.Assessment.Kind == AssessmentKind.Native && content.Timed
                            ? now.AddMinutes(content.Minutes + invite.ExtraMinutes)
                            : null;
                    Audit.Add(
                        db,
                        "candidate",
                        "Application",
                        invite.ApplicationId,
                        "AssessmentStarted",
                        new { inviteId = id }
                    );
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(await ViewAsync(db, invite, ct));
            }
        );

        // External tests: opening the provider's link counts as starting.
        api.MapPost(
            "/{id:guid}/open",
            async (
                Guid id,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                var assessment = invite.Assessment!;
                if (assessment.Kind != AssessmentKind.External || assessment.ExternalUrl is null)
                    return Results.NotFound();
                await AssessmentFlow.SettleAsync(db, invite, DateTimeOffset.UtcNow, ct);
                if (invite.Status == AssessmentInviteStatus.Expired)
                    return Results.Conflict(
                        new
                        {
                            message = "This link has expired. Write to the hiring team if you still want to take it.",
                        }
                    );
                if (invite.Status == AssessmentInviteStatus.NotStarted)
                {
                    invite.Status = AssessmentInviteStatus.InProgress;
                    invite.StartedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                }
                return Results.Ok(
                    new
                    {
                        url = AssessmentScoring.ExternalLink(
                            assessment.ExternalUrl,
                            invite.Application!.Candidate!,
                            invite.Id
                        ),
                    }
                );
            }
        );

        // Autosave for one answer. Refused once the time is up (plus a short grace for slow networks).
        api.MapPut(
            "/{id:guid}/answers/{questionId}",
            async (
                Guid id,
                string questionId,
                SaveAnswerRequest request,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                if (Closed(invite) is { } closed)
                    return closed;
                var question = AssessmentScoring
                    .Questions(AssessmentScoring.Read(invite.Version!.ContentJson))
                    .SingleOrDefault(x => x.Id == questionId);
                if (question is null || question.Type == QuestionTypes.File)
                    return Results.NotFound();
                var text = request.Text ?? "";
                if (text.Length > 100_000)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["text"] = ["Keep your answer under 100,000 characters."],
                        }
                    );
                var choices = (request.ChoiceIds ?? [])
                    .Where(c => question.Options.Any(o => o.Id == c))
                    .Distinct()
                    .ToArray();
                if (question.Type == QuestionTypes.Single && choices.Length > 1)
                    choices = choices[..1];
                var answer = await AnswerAsync(db, invite.Id, questionId, ct);
                answer.ChoiceIds = AssessmentScoring.IsAuto(question) ? choices : [];
                answer.Text = AssessmentScoring.IsAuto(question) ? null : text;
                answer.Seconds = Math.Clamp(request.Seconds ?? answer.Seconds, 0, 24 * 3600);
                answer.SavedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { savedAt = answer.SavedAt });
            }
        );

        // Take-home files: up to 25 MB, kept with the candidate's files. A new file replaces the last one.
        api.MapPost(
            "/{id:guid}/files/{questionId}",
            async (
                Guid id,
                string questionId,
                HttpRequest request,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                if (Closed(invite) is { } closed)
                    return closed;
                var question = AssessmentScoring
                    .Questions(AssessmentScoring.Read(invite.Version!.ContentJson))
                    .SingleOrDefault(x => x.Id == questionId);
                if (question?.Type != QuestionTypes.File)
                    return Results.NotFound();
                if (!request.HasFormContentType)
                    return FileProblem("Choose a file to upload.");
                var file = (await request.ReadFormAsync(ct)).Files.GetFile("file");
                if (file is null || file.Length == 0)
                    return FileProblem("Choose a file to upload.");
                if (file.Length > MaxUpload)
                    return FileProblem(
                        "Files can be up to 25 MB. Make it smaller, or zip it, and try again."
                    );
                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                var allowed = Allowed(question.Accept);
                if (!allowed.Contains(extension))
                    return FileProblem($"This question takes {string.Join(", ", allowed)} files.");
                await using var input = file.OpenReadStream();
                if (!await LooksLikeAsync(input, extension, ct))
                    return FileProblem(
                        "The file does not match its type. Save it again and upload it."
                    );
                input.Position = 0;
                var stored = $"{Guid.NewGuid():N}{extension}";
                await using (
                    var output = new FileStream(
                        files.FullPath(stored),
                        FileMode.CreateNew,
                        FileAccess.Write,
                        FileShare.None,
                        64 * 1024,
                        FileOptions.Asynchronous
                    )
                )
                    await input.CopyToAsync(output, ct);
                var candidate = invite.Application!.Candidate!;
                var attachment = new Attachment
                {
                    CandidateId = candidate.Id,
                    OriginalFileName = Path.GetFileName(file.FileName),
                    StoredFileName = stored,
                    ContentType = ContentType(extension),
                    Length = file.Length,
                    Kind = AttachmentKinds.Other,
                    UploadedBy = PublicEndpoints.CandidateUploader(candidate.Email),
                    ScanStatus = "ValidationOnly",
                };
                db.Attachments.Add(attachment);
                var answer = await AnswerAsync(db, invite.Id, questionId, ct);
                await RemoveFileAsync(db, files, answer, ct);
                answer.AttachmentId = attachment.Id;
                answer.SavedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                return Results.Ok(
                    new
                    {
                        attachment.Id,
                        Name = attachment.OriginalFileName,
                        attachment.Length,
                    }
                );
            }
        );

        api.MapDelete(
            "/{id:guid}/files/{questionId}",
            async (
                Guid id,
                string questionId,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                if (Closed(invite) is { } closed)
                    return closed;
                var answer = await db.AssessmentAnswers.SingleOrDefaultAsync(
                    x => x.InviteId == id && x.QuestionId == questionId,
                    ct
                );
                if (answer is not null)
                {
                    await RemoveFileAsync(db, files, answer, ct);
                    answer.SavedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                }
                return Results.NoContent();
            }
        );

        // Tab switches, full-screen exits and pastes, in batches. They inform the reviewer; they never fail anyone.
        api.MapPost(
            "/{id:guid}/signals",
            async (
                Guid id,
                IntegritySignalsRequest request,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                if (
                    invite.Status != AssessmentInviteStatus.InProgress
                    || invite.StartedAt is not { } started
                )
                    return Results.NoContent();
                var now = DateTimeOffset.UtcNow;
                var events = AssessmentScoring.Events(invite.IntegrityJson);
                foreach (var e in (request.Events ?? []).Take(50))
                {
                    if (!AssessmentScoring.IntegrityTypes.Contains(e.Type) || events.Count >= 500)
                        continue;
                    // The browser's clock is only trusted inside the attempt.
                    var at =
                        e.At < started ? started
                        : e.At > now ? now
                        : e.At;
                    events.Add(
                        new IntegrityEvent(
                            e.Type,
                            at,
                            e.QuestionId is { Length: <= 64 } q ? q : null,
                            e.Seconds is { } s ? Math.Clamp(s, 0, 24 * 3600) : null
                        )
                    );
                }
                invite.IntegrityJson = JsonSerializer.Serialize(events, AssessmentScoring.Json);
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/{id:guid}/submit",
            async (
                Guid id,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (invite, error) = await LoadAsync(db, token, id, ct, track: true);
                if (invite is null)
                    return error!;
                var now = DateTimeOffset.UtcNow;
                if (!await AssessmentFlow.SettleAsync(db, invite, now, ct))
                {
                    if (invite.Status != AssessmentInviteStatus.InProgress)
                        return invite.Status == AssessmentInviteStatus.Submitted
                            ? Results.Ok(await ViewAsync(db, invite, ct))
                            : Results.Conflict(new { message = "This assessment is not open." });
                    await AssessmentFlow.SubmitAsync(
                        db,
                        invite,
                        now,
                        auto: false,
                        ct,
                        PublicEndpoints.CandidateUploader(invite.Application!.Candidate!.Email)
                    );
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(await ViewAsync(db, invite, ct));
            }
        );
    }

    private static IResult FileProblem(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });

    private static async Task<(AssessmentInvite? Invite, IResult? Error)> LoadAsync(
        AtsDbContext db,
        string? token,
        Guid id,
        CancellationToken ct,
        bool track
    )
    {
        var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(db, token, ct);
        if (candidateId is null)
            return (null, Results.Unauthorized());
        var query = db
            .AssessmentInvites.Include(x => x.Assessment)
            .Include(x => x.Version)
            .Include(x => x.Application!)
                .ThenInclude(x => x.Candidate)
            .Include(x => x.Application!)
                .ThenInclude(x => x.Requisition)
            .Where(x =>
                x.Id == id
                && x.Application!.CandidateId == candidateId
                && x.Status != AssessmentInviteStatus.Revoked
                && x.ReplacedAt == null
                && x.Application.Status != ApplicationStatus.PendingVerification
            );
        var invite = await (track ? query : query.AsNoTracking()).SingleOrDefaultAsync(ct);
        return invite is null ? (null, Results.NotFound()) : (invite, null);
    }

    /// <summary>Why answers are refused right now, or null when they are accepted.</summary>
    private static IResult? Closed(AssessmentInvite invite)
    {
        if (invite.Status != AssessmentInviteStatus.InProgress)
            return Results.Conflict(new { message = "This assessment is not open for answers." });
        if (DateTimeOffset.UtcNow > AssessmentScoring.ClosesAt(invite) + AssessmentScoring.Grace)
            return Results.Conflict(
                new
                {
                    message = "Time is up, so new answers are not saved. We kept everything saved before.",
                }
            );
        return null;
    }

    private static async Task<AssessmentAnswer> AnswerAsync(
        AtsDbContext db,
        Guid inviteId,
        string questionId,
        CancellationToken ct
    )
    {
        var answer = await db.AssessmentAnswers.SingleOrDefaultAsync(
            x => x.InviteId == inviteId && x.QuestionId == questionId,
            ct
        );
        if (answer is null)
        {
            answer = new AssessmentAnswer { InviteId = inviteId, QuestionId = questionId };
            db.AssessmentAnswers.Add(answer);
        }
        return answer;
    }

    private static async Task RemoveFileAsync(
        AtsDbContext db,
        LocalFileStore files,
        AssessmentAnswer answer,
        CancellationToken ct
    )
    {
        if (answer.AttachmentId is not { } old)
            return;
        answer.AttachmentId = null;
        var attachment = await db.Attachments.SingleOrDefaultAsync(x => x.Id == old, ct);
        if (attachment is null)
            return;
        db.Attachments.Remove(attachment);
        files.Delete(attachment.StoredFileName);
    }

    /// <summary>What the page needs in each phase. Questions only once started; correct answers and scoring notes never.</summary>
    private static async Task<object> ViewAsync(
        AtsDbContext db,
        AssessmentInvite invite,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var assessment = invite.Assessment!;
        var content = AssessmentScoring.Read(invite.Version!.ContentJson);
        // Before starting, describe the newest version: that is the one they will get.
        if (
            invite.Status == AssessmentInviteStatus.NotStarted
            && assessment.CurrentVersionId is { } current
            && current != invite.VersionId
        )
            content = AssessmentScoring.Read(
                await db
                    .AssessmentVersions.Where(x => x.Id == current)
                    .Select(x => x.ContentJson)
                    .SingleAsync(ct)
            );
        var questions = AssessmentScoring.Questions(content).ToList();
        var status = AssessmentFlow.Effective(invite, now);
        if (
            invite.Application!.Status != ApplicationStatus.Active
            && status is AssessmentInviteStatus.NotStarted
        )
            status = AssessmentInviteStatus.Expired;
        object? sections = null;
        object? answers = null;
        if (status == AssessmentInviteStatus.InProgress && assessment.Kind == AssessmentKind.Native)
        {
            sections = AssessmentScoring.ForCandidate(
                AssessmentScoring.Ordered(content, invite.Id)
            );
            var saved = await db
                .AssessmentAnswers.AsNoTracking()
                .Where(x => x.InviteId == invite.Id)
                .ToListAsync(ct);
            var fileIds = saved
                .Where(x => x.AttachmentId != null)
                .Select(x => x.AttachmentId!.Value)
                .ToArray();
            var files = await db
                .Attachments.AsNoTracking()
                .Where(x => fileIds.Contains(x.Id))
                .ToDictionaryAsync(
                    x => x.Id,
                    x => new
                    {
                        x.Id,
                        Name = x.OriginalFileName,
                        x.Length,
                    },
                    ct
                );
            answers = saved.Select(x => new
            {
                x.QuestionId,
                x.ChoiceIds,
                x.Text,
                x.Seconds,
                File = x.AttachmentId is { } f && files.TryGetValue(f, out var file) ? file : null,
                x.SavedAt,
            });
        }
        var company = await db
            .Organizations.AsNoTracking()
            .Select(x => x.Name)
            .SingleOrDefaultAsync(ct);
        return new
        {
            invite.Id,
            invite.ApplicationId,
            JobTitle = invite.Application.Requisition!.Title,
            Company = company,
            assessment.Name,
            assessment.Kind,
            assessment.ProviderName,
            Status = status,
            content.Instructions,
            content.Minutes,
            content.Timed,
            Questions = questions.Count,
            Points = questions.Sum(x => x.Points),
            Sections = content.Sections.Count,
            Types = questions.Select(x => x.Type).Distinct(),
            Checks = new
            {
                content.TabSwitch,
                content.Fullscreen,
                content.BlockPaste,
            },
            invite.ExpiresAt,
            invite.StartedAt,
            invite.DeadlineAt,
            invite.SubmittedAt,
            invite.AutoSubmitted,
            ServerNow = now,
            GraceSeconds = (int)AssessmentScoring.Grace.TotalSeconds,
            Content = sections,
            Answers = answers,
        };
    }

    private static string[] Allowed(string? accept)
    {
        var picked = (accept ?? "")
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.StartsWith('.') ? x.ToLowerInvariant() : $".{x.ToLowerInvariant()}")
            .Where(UploadTypes.Contains)
            .ToArray();
        return picked.Length > 0 ? picked : UploadTypes;
    }

    private static string ContentType(string extension) =>
        extension switch
        {
            ".pdf" => "application/pdf",
            ".doc" => "application/msword",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".zip" => "application/zip",
            ".csv" => "text/csv",
            ".md" => "text/markdown",
            ".txt" => "text/plain",
            _ => "application/octet-stream",
        };

    /// <summary>The first bytes must match the type, so a renamed program is refused.</summary>
    public static async Task<bool> LooksLikeAsync(
        Stream input,
        string extension,
        CancellationToken ct
    )
    {
        var header = new byte[8192];
        var read = await input.ReadAtLeastAsync(
            header,
            header.Length,
            throwOnEndOfStream: false,
            ct
        );
        input.Position = 0;
        bool Starts(ReadOnlySpan<byte> magic) =>
            read >= magic.Length && header.AsSpan(0, magic.Length).SequenceEqual(magic);
        switch (extension)
        {
            case ".pdf":
                return Starts("%PDF-"u8);
            case ".png":
                return Starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
            case ".jpg" or ".jpeg":
                return Starts([0xFF, 0xD8, 0xFF]);
            case ".doc":
                return Starts([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
            case ".zip":
                return Starts("PK\x03\x04"u8) || Starts("PK\x05\x06"u8);
            case ".docx":
                if (!Starts("PK\x03\x04"u8))
                    return false;
                try
                {
                    using var archive = new ZipArchive(input, ZipArchiveMode.Read, leaveOpen: true);
                    return archive.GetEntry("word/document.xml") is not null;
                }
                catch (InvalidDataException)
                {
                    return false;
                }
                finally
                {
                    input.Position = 0;
                }
            default:
                // Text: no NUL bytes in the first 8 KB.
                return read > 0 && !header.AsSpan(0, read).Contains((byte)0);
        }
    }
}
