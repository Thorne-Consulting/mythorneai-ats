using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SendAssessmentRequest(
    Guid AssessmentId,
    DateTimeOffset? ExpiresAt,
    string? Note
);

public sealed record EmailPreviewRequest(Guid ApplicationId, string? Note);

public sealed record BulkSendAssessmentRequest(
    Guid[] ApplicationIds,
    Guid AssessmentId,
    DateTimeOffset? ExpiresAt,
    string? Note
);

public sealed record ExtendInviteRequest(DateTimeOffset? ExpiresAt, int? ExtraMinutes);

public sealed record RetakeRequest(DateTimeOffset? ExpiresAt, string? Note);

public sealed record ReviewScoreRequest(string QuestionId, decimal? Points, string? Note);

public sealed record AssessmentDecisionRequest(AssessmentDecision Decision, string? Comment);

public sealed record ReopenGradingRequest(string? Reason);

public sealed record ExternalResultRequest(int Percent);

public static partial class AtsEndpoints
{
    private static readonly string[] FlagTypes =
    [
        "left",
        "fullscreen-exit",
        "paste",
        "paste-blocked",
    ];

    private static IQueryable<AssessmentInvite> WithInviteDetails(
        IQueryable<AssessmentInvite> query
    ) =>
        query
            .Include(x => x.Assessment)
            .Include(x => x.Version)
            .Include(x => x.Application!)
                .ThenInclude(x => x.Candidate)
            .Include(x => x.Application!)
                .ThenInclude(x => x.Requisition);

    /// <summary>"Candidate 4F2A": what a blind reviewer sees instead of a name.</summary>
    private static string BlindName(Guid inviteId) =>
        $"Candidate {inviteId.ToString("N")[..4].ToUpperInvariant()}";

    private static int FlagCount(string? json) =>
        AssessmentScoring.Events(json).Count(x => FlagTypes.Contains(x.Type));

    private static void MapAssessmentInvites(RouteGroupBuilder api)
    {
        api.MapGet(
            "/assessments/{id:guid}/invites",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var rows = await InviteRowsAsync(
                    ScopedInvites(db, principal).Where(x => x.AssessmentId == id),
                    db,
                    principal,
                    ct
                );
                return Results.Ok(rows);
            }
        );

        // The grading queue across every assessment, oldest first.
        api.MapGet(
            "/assessment-invites/to-review",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var rows = await InviteRowsAsync(
                    ScopedInvites(db, principal)
                        .Where(x =>
                            x.Status == AssessmentInviteStatus.Submitted
                            && x.Decision == null
                            && x.ReplacedAt == null
                        ),
                    db,
                    principal,
                    ct
                );
                return Results.Ok(rows.OrderBy(x => x.SubmittedAt));
            }
        );

        // For the application's results card: every attempt, newest first.
        api.MapGet(
            "/applications/{id:guid}/assessments",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var application = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Include(x => x.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (application is null)
                    return Results.NotFound();
                var rows = await InviteRowsAsync(
                    db.AssessmentInvites.Where(x => x.ApplicationId == id),
                    db,
                    principal,
                    ct
                );
                return Results.Ok(
                    new
                    {
                        canManage = CanManage(application.Requisition!, principal),
                        active = application.Status == ApplicationStatus.Active,
                        invites = rows,
                    }
                );
            }
        );

        // A POST so the note never sits in a web address or a log.
        api.MapPost(
            "/assessments/{id:guid}/email-preview",
            async (
                Guid id,
                EmailPreviewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (applicationId, note) = (request.ApplicationId, request.Note);
                var application = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Include(x => x.Candidate)
                    .Include(x => x.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == applicationId, ct);
                var assessment = await db
                    .Assessments.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (application is null || assessment is null)
                    return Results.NotFound();
                var version = assessment.CurrentVersionId is { } vid
                    ? await db
                        .AssessmentVersions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == vid, ct)
                    : null;
                var invite = new AssessmentInvite
                {
                    InvitedBy = principal.Email(),
                    Assessment = assessment,
                    Version = version,
                    Application = application,
                    ExpiresAt = DateTimeOffset.UtcNow.AddDays(assessment.ExpiryDays),
                };
                var (subject, body) = await AssessmentFlow.PreviewAsync(db, invite, note, ct);
                return Results.Ok(
                    new
                    {
                        subject,
                        body,
                        to = application.Candidate!.Email,
                    }
                );
            }
        );

        api.MapPost(
            "/applications/{id:guid}/assessments",
            async (
                Guid id,
                SendAssessmentRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var application = await ScopeApplications(db.Applications, principal)
                    .Include(x => x.Candidate)
                    .Include(x => x.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (application is null || !CanManage(application.Requisition!, principal))
                    return Results.NotFound();
                var assessment = await db.Assessments.SingleOrDefaultAsync(
                    x => x.Id == request.AssessmentId,
                    ct
                );
                var (invite, error) = await CreateInviteAsync(
                    db,
                    principal.Email(),
                    application,
                    assessment,
                    request.ExpiresAt,
                    request.Note,
                    ct
                );
                if (invite is null)
                    return error!;
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/assessment-invites/{invite.Id}", new { invite.Id });
            }
        );

        // From the pipeline's bulk bar. Anyone already invited, closed or out of reach is skipped and counted.
        api.MapPost(
            "/assessment-invites/bulk",
            async (
                BulkSendAssessmentRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var ids = (request.ApplicationIds ?? []).Distinct().Take(500).ToArray();
                var assessment = await db.Assessments.SingleOrDefaultAsync(
                    x => x.Id == request.AssessmentId,
                    ct
                );
                var applications = await ScopeApplications(db.Applications, principal)
                    .Include(x => x.Candidate)
                    .Include(x => x.Requisition)
                    .Where(x => ids.Contains(x.Id))
                    .ToListAsync(ct);
                var sent = 0;
                IResult? firstError = null;
                foreach (
                    var application in applications.Where(x => CanManage(x.Requisition!, principal))
                )
                {
                    var (invite, error) = await CreateInviteAsync(
                        db,
                        principal.Email(),
                        application,
                        assessment,
                        request.ExpiresAt,
                        request.Note,
                        ct
                    );
                    if (invite is not null)
                        sent++;
                    else
                        firstError ??= error;
                }
                if (sent == 0 && firstError is not null && ids.Length == 1)
                    return firstError;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { sent, skipped = ids.Length - sent });
            }
        );

        api.MapPost(
            "/assessment-invites/{id:guid}/remind",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                if (
                    AssessmentFlow.Effective(invite, now)
                    is not (AssessmentInviteStatus.NotStarted or AssessmentInviteStatus.InProgress)
                )
                    return Results.Conflict(
                        new { message = "Only someone who has not finished can get a reminder." }
                    );
                await AssessmentFlow.QueueEmailAsync(
                    db,
                    AssessmentFlow.ReminderKey,
                    invite,
                    null,
                    ct
                );
                invite.ReminderCount++;
                invite.LastReminderAt = now;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    "AssessmentReminderSent",
                    new { inviteId = id, assessment = invite.Assessment!.Name }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Before submission the link stops working. After it, the result is removed (kept in the database, hidden).
        api.MapPost(
            "/assessment-invites/{id:guid}/revoke",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                if (invite.Decision is not null)
                    return Results.Conflict(
                        new
                        {
                            message = "This result has a decision. An admin must reopen grading before it can be removed.",
                        }
                    );
                if (invite.Status == AssessmentInviteStatus.Revoked)
                    return Results.NoContent();
                var submitted = invite.Status == AssessmentInviteStatus.Submitted;
                invite.Status = AssessmentInviteStatus.Revoked;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    submitted ? "AssessmentResultRemoved" : "AssessmentRevoked",
                    new { inviteId = id, assessment = invite.Assessment!.Name }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // A later expiry date (reopening an expired link) and extra time, for example an accommodation.
        api.MapPost(
            "/assessment-invites/{id:guid}/extend",
            async (
                Guid id,
                ExtendInviteRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                await AssessmentFlow.SettleAsync(db, invite, now, ct);
                if (
                    invite.Status
                    is AssessmentInviteStatus.Submitted
                        or AssessmentInviteStatus.Revoked
                )
                    return Results.Conflict(
                        new
                        {
                            message = "This assessment is already finished. Allow a retake instead.",
                        }
                    );
                if (request.ExpiresAt is { } expires)
                {
                    if (expires <= now || expires > now.AddDays(90))
                        return AssessmentProblem("expiresAt", "Pick a date in the next 90 days.");
                    invite.ExpiresAt = expires;
                    if (invite.Status == AssessmentInviteStatus.Expired)
                        invite.Status = AssessmentInviteStatus.NotStarted;
                }
                if (request.ExtraMinutes is { } extra)
                {
                    if (extra is < 0 or > 600)
                        return AssessmentProblem(
                            "extraMinutes",
                            "Give between 0 and 600 extra minutes."
                        );
                    invite.ExtraMinutes = extra;
                    if (invite.StartedAt is { } started && invite.DeadlineAt is not null)
                        invite.DeadlineAt = started.AddMinutes(
                            AssessmentScoring.Read(invite.Version!.ContentJson).Minutes + extra
                        );
                }
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    "AssessmentDeadlineChanged",
                    new
                    {
                        inviteId = id,
                        invite.ExpiresAt,
                        invite.ExtraMinutes,
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // A fresh attempt; the old one stays readable but leaves the grading queue.
        api.MapPost(
            "/assessment-invites/{id:guid}/retake",
            async (
                Guid id,
                RetakeRequest? request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var old = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (old is null || !CanManage(old.Application!.Requisition!, principal))
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                await AssessmentFlow.SettleAsync(db, old, now, ct);
                if (old.ReplacedAt is not null)
                    return Results.Conflict(new { message = "A retake was already sent." });
                if (old.Decision is not null)
                    return Results.Conflict(
                        new
                        {
                            message = "This result has a decision. An admin must reopen grading first.",
                        }
                    );
                if (
                    old.Status
                    is not (
                        AssessmentInviteStatus.Submitted
                        or AssessmentInviteStatus.Expired
                        or AssessmentInviteStatus.InProgress
                    )
                )
                    return Results.Conflict(
                        new { message = "They have not started yet. Change the deadline instead." }
                    );
                old.ReplacedAt = now;
                if (old.Status == AssessmentInviteStatus.InProgress)
                    await AssessmentFlow.SubmitAsync(
                        db,
                        old,
                        now,
                        auto: false,
                        ct,
                        principal.Email()
                    );
                var (invite, error) = await CreateInviteAsync(
                    db,
                    principal.Email(),
                    old.Application!,
                    old.Assessment,
                    request?.ExpiresAt,
                    request?.Note,
                    ct,
                    old.Attempt + 1
                );
                if (invite is null)
                    return error!;
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/assessment-invites/{invite.Id}", new { invite.Id });
            }
        );

        api.MapGet(
            "/assessment-invites/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null)
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                if (await AssessmentFlow.SettleAsync(db, invite, now, ct))
                    await db.SaveChangesAsync(ct);
                var content = AssessmentScoring.Read(invite.Version!.ContentJson);
                var answers = await db
                    .AssessmentAnswers.AsNoTracking()
                    .Where(x => x.InviteId == id)
                    .ToListAsync(ct);
                var fileIds = answers
                    .Where(x => x.AttachmentId != null)
                    .Select(x => x.AttachmentId!.Value)
                    .Concat(invite.ReportAttachmentId is { } r ? [r] : [])
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
                            x.ContentType,
                        },
                        ct
                    );
                var assessment = invite.Assessment!;
                var application = invite.Application!;
                var blind = assessment.BlindReview && invite.Decision is null;
                var canManage = CanManage(application.Requisition!, principal);
                var people = answers
                    .Select(x => x.ReviewerEmail)
                    .Append(invite.DecidedBy)
                    .OfType<string>()
                    .Distinct()
                    .ToArray();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(x => people.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                var key = id.ToString();
                var history = await db
                    .AuditEvents.AsNoTracking()
                    .Where(x =>
                        x.EntityType == "Application"
                        && x.EntityId == application.Id.ToString()
                        && x.Details != null
                        && x.Details.Contains(key)
                    )
                    .OrderByDescending(x => x.OccurredAt)
                    .Take(30)
                    .Select(x => new
                    {
                        x.Id,
                        x.Action,
                        x.ActorEmail,
                        x.OccurredAt,
                        x.Details,
                    })
                    .ToListAsync(ct);
                var next = await ScopedInvites(db, principal)
                    .AsNoTracking()
                    .Where(x =>
                        x.Id != id
                        && x.Status == AssessmentInviteStatus.Submitted
                        && x.Decision == null
                        && x.ReplacedAt == null
                    )
                    .OrderBy(x => x.SubmittedAt)
                    .Select(x => new { x.Id, x.AssessmentId })
                    .FirstOrDefaultAsync(ct);
                var older = await db
                    .AssessmentInvites.AsNoTracking()
                    .Where(x =>
                        x.ApplicationId == application.Id
                        && x.AssessmentId == assessment.Id
                        && x.Id != id
                    )
                    .OrderBy(x => x.Attempt)
                    .Select(x => new
                    {
                        x.Id,
                        x.Attempt,
                        x.Status,
                        x.Percent,
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        invite.Id,
                        Assessment = new
                        {
                            assessment.Id,
                            assessment.Name,
                            assessment.Kind,
                            assessment.ProviderName,
                            content.PassMark,
                            assessment.BlindReview,
                        },
                        VersionNumber = invite.Version.Number,
                        Blind = blind,
                        Candidate = blind
                            ? null
                            : new
                            {
                                application.Candidate!.Id,
                                Name = $"{application.Candidate.FirstName} {application.Candidate.LastName}".Trim(),
                                application.Candidate.Email,
                            },
                        BlindName = BlindName(invite.Id),
                        ApplicationId = blind ? (Guid?)null : application.Id,
                        Job = new { application.Requisition!.Id, application.Requisition.Title },
                        Status = AssessmentFlow.Effective(invite, now),
                        invite.Attempt,
                        invite.InvitedAt,
                        invite.ExpiresAt,
                        invite.StartedAt,
                        invite.DeadlineAt,
                        invite.SubmittedAt,
                        invite.AutoSubmitted,
                        invite.ExtraMinutes,
                        content.Minutes,
                        content.Timed,
                        Earned = invite.EarnedPoints,
                        Max = invite.MaxPoints,
                        Pending = invite.PendingCount,
                        invite.Percent,
                        invite.Decision,
                        DecidedBy = invite.DecidedBy is { } d
                            ? names.GetValueOrDefault(d, d)
                            : null,
                        invite.DecidedAt,
                        invite.Comment,
                        Sections = AssessmentScoring.Ordered(content, invite.Id),
                        Answers = answers.Select(x => new
                        {
                            x.QuestionId,
                            x.ChoiceIds,
                            x.Text,
                            File = x.AttachmentId is { } f && files.TryGetValue(f, out var file)
                                ? file
                                : null,
                            x.Seconds,
                            x.SavedAt,
                            x.AutoPoints,
                            x.ReviewerPoints,
                            Reviewer = x.ReviewerEmail is { } e
                                ? names.GetValueOrDefault(e, e)
                                : null,
                            x.ReviewerNote,
                        }),
                        Integrity = AssessmentScoring.Events(invite.IntegrityJson),
                        Report = invite.ReportAttachmentId is { } rid
                        && files.TryGetValue(rid, out var report)
                            ? report
                            : null,
                        CanGrade = canManage
                            && invite.Decision is null
                            && invite.Status == AssessmentInviteStatus.Submitted,
                        CanRecordResult = canManage
                            && invite.Decision is null
                            && assessment.Kind == AssessmentKind.External
                            && invite.Status is not AssessmentInviteStatus.Revoked,
                        CanReopen = principal.IsInRole(nameof(UserRole.Admin))
                            && invite.Decision is not null,
                        CanManage = canManage,
                        History = history,
                        Attempts = older,
                        Next = next,
                    }
                );
            }
        );

        // One question's reviewer score, saved as the reviewer works. Locked once a decision is recorded.
        api.MapPut(
            "/assessment-invites/{id:guid}/scores",
            async (
                Guid id,
                ReviewScoreRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                if (invite.Decision is not null)
                    return Results.Conflict(
                        new { message = "The decision is recorded, so scores are locked." }
                    );
                if (invite.Status != AssessmentInviteStatus.Submitted)
                    return Results.Conflict(
                        new { message = "Scores open once the candidate submits." }
                    );
                var content = AssessmentScoring.Read(invite.Version!.ContentJson);
                var question = AssessmentScoring
                    .Questions(content)
                    .SingleOrDefault(x => x.Id == request.QuestionId);
                if (question is null || AssessmentScoring.IsAuto(question))
                    return AssessmentProblem(
                        "questionId",
                        "Only written, code and file answers are scored by a person."
                    );
                var answers = await db
                    .AssessmentAnswers.Where(x => x.InviteId == id)
                    .ToListAsync(ct);
                var answer = answers.SingleOrDefault(x => x.QuestionId == question.Id);
                if (answer is null || AssessmentScoring.IsBlank(question, answer))
                    return AssessmentProblem("questionId", "There is no answer to score.");
                if (request.Points is { } points && (points < 0 || points > question.Points))
                    return AssessmentProblem(
                        "points",
                        $"Give between 0 and {question.Points} points."
                    );
                if ((request.Note?.Length ?? 0) > 4000)
                    return AssessmentProblem("note", "Keep the note under 4,000 characters.");
                answer.ReviewerPoints = request.Points is { } p ? Math.Round(p, 1) : null;
                answer.ReviewerEmail = principal.Email();
                answer.ReviewerNote = Clean(request.Note);
                AssessmentScoring.Apply(invite, content, answers);
                await db.SaveChangesAsync(ct);
                return Results.Ok(
                    new
                    {
                        earned = invite.EarnedPoints,
                        max = invite.MaxPoints,
                        pending = invite.PendingCount,
                        invite.Percent,
                    }
                );
            }
        );

        api.MapPost(
            "/assessment-invites/{id:guid}/decision",
            async (
                Guid id,
                AssessmentDecisionRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                if (invite.Decision is not null)
                    return Results.Conflict(new { message = "A decision is already recorded." });
                if (invite.Status != AssessmentInviteStatus.Submitted || invite.Percent is null)
                    return Results.Conflict(
                        new { message = "Score every answer before you decide." }
                    );
                var comment = request.Comment?.Trim() ?? "";
                if (comment.Length is 0 or > 4000)
                    return AssessmentProblem(
                        "comment",
                        "Say why in a comment of up to 4,000 characters."
                    );
                invite.Decision = request.Decision;
                invite.DecidedBy = principal.Email();
                invite.DecidedAt = DateTimeOffset.UtcNow;
                invite.Comment = comment;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    request.Decision == AssessmentDecision.Passed
                        ? "AssessmentPassed"
                        : "AssessmentFailed",
                    new
                    {
                        inviteId = id,
                        assessment = invite.Assessment!.Name,
                        invite.Percent,
                        comment,
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Admins only, with a reason. The first decision stays in the activity history.
        api.MapPost(
            "/assessment-invites/{id:guid}/reopen",
            async (
                Guid id,
                ReopenGradingRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null)
                    return Results.NotFound();
                if (!principal.IsInRole(nameof(UserRole.Admin)))
                    return Results.StatusCode(StatusCodes.Status403Forbidden);
                if (invite.Decision is null)
                    return Results.Conflict(new { message = "There is no decision to reopen." });
                var reason = request.Reason?.Trim() ?? "";
                if (reason.Length is 0 or > 2000)
                    return AssessmentProblem("reason", "Say why grading is reopened.");
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    "AssessmentGradingReopened",
                    new
                    {
                        inviteId = id,
                        assessment = invite.Assessment!.Name,
                        previousDecision = invite.Decision,
                        previousComment = invite.Comment,
                        decidedBy = invite.DecidedBy,
                        reason,
                    }
                );
                invite.Decision = null;
                invite.DecidedBy = null;
                invite.DecidedAt = null;
                invite.Comment = null;
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // External tests: the reviewer types the provider's score. A provider webhook can fill the same field later.
        api.MapPut(
            "/assessment-invites/{id:guid}/result",
            async (
                Guid id,
                ExternalResultRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                if (invite.Assessment!.Kind != AssessmentKind.External)
                    return Results.Conflict(
                        new { message = "Only external assessments take a typed score." }
                    );
                if (invite.Decision is not null)
                    return Results.Conflict(
                        new { message = "The decision is recorded, so the score is locked." }
                    );
                if (invite.Status == AssessmentInviteStatus.Revoked)
                    return Results.NotFound();
                if (request.Percent is < 0 or > 100)
                    return AssessmentProblem("percent", "Enter a score from 0 to 100.");
                var first = invite.Status != AssessmentInviteStatus.Submitted;
                invite.Status = AssessmentInviteStatus.Submitted;
                invite.SubmittedAt ??= DateTimeOffset.UtcNow;
                invite.MaxPoints = 100;
                invite.EarnedPoints = request.Percent;
                invite.PendingCount = 0;
                invite.Percent = request.Percent;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    invite.ApplicationId,
                    "AssessmentResultRecorded",
                    new { inviteId = id, request.Percent }
                );
                if (first)
                    await PipelineEvents.PublishAsync(
                        db,
                        "assessment.completed",
                        new
                        {
                            inviteId = id,
                            assessmentId = invite.AssessmentId,
                            applicationId = invite.ApplicationId,
                            percent = request.Percent,
                        },
                        ct
                    );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // The provider's report (PDF or Word), kept with the candidate's files.
        api.MapPost(
            "/assessment-invites/{id:guid}/report",
            async (
                Guid id,
                IFormFile file,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var invite = await WithInviteDetails(ScopedInvites(db, principal))
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (invite is null || !CanManage(invite.Application!.Requisition!, principal))
                    return Results.NotFound();
                if (
                    invite.Assessment!.Kind != AssessmentKind.External
                    || invite.Decision is not null
                )
                    return Results.Conflict(
                        new { message = "A report can be added to an open external result only." }
                    );
                try
                {
                    var stored = await files.SaveValidatedAsync(file, ct);
                    var attachment = new Attachment
                    {
                        CandidateId = invite.Application!.CandidateId,
                        OriginalFileName = Path.GetFileName(file.FileName),
                        StoredFileName = stored.StoredName,
                        ContentType = stored.ContentType,
                        Length = file.Length,
                        Kind = AttachmentKinds.Other,
                        UploadedBy = principal.Email(),
                        ScanStatus = "ValidationOnly",
                    };
                    db.Attachments.Add(attachment);
                    invite.ReportAttachmentId = attachment.Id;
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { attachment.Id, Name = attachment.OriginalFileName });
                }
                catch (InvalidDataException exception)
                {
                    return AssessmentProblem("file", exception.Message);
                }
            }
        );
    }

    public sealed record InviteRow(
        Guid Id,
        Guid AssessmentId,
        string AssessmentName,
        AssessmentKind Kind,
        bool Blind,
        Guid ApplicationId,
        Guid CandidateId,
        string Candidate,
        string Email,
        string Job,
        AssessmentInviteStatus Status,
        int Attempt,
        bool Replaced,
        DateTimeOffset InvitedAt,
        DateTimeOffset ExpiresAt,
        DateTimeOffset? StartedAt,
        DateTimeOffset? SubmittedAt,
        bool AutoSubmitted,
        int ExtraMinutes,
        decimal Earned,
        decimal Max,
        int Pending,
        int? Percent,
        AssessmentDecision? Decision,
        string? DecidedBy,
        int PassMark,
        int ReminderCount,
        DateTimeOffset? LastReminderAt,
        int VersionNumber,
        int Flags,
        // Remind, revoke, extend and retake: for people who manage the job, not everyone who can read it.
        bool CanManage
    );

    private static async Task<List<InviteRow>> InviteRowsAsync(
        IQueryable<AssessmentInvite> query,
        AtsDbContext db,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var raw = await query
            .AsNoTracking()
            .Where(x => x.Status != AssessmentInviteStatus.Revoked)
            .OrderByDescending(x => x.InvitedAt)
            .Select(x => new
            {
                Invite = x,
                AssessmentName = x.Assessment!.Name,
                x.Assessment.Kind,
                x.Assessment.BlindReview,
                x.Application!.CandidateId,
                Candidate = x.Application.Candidate!.FirstName
                    + " "
                    + x.Application.Candidate.LastName,
                x.Application.Candidate.Email,
                Job = x.Application.Requisition!.Title,
                x.Application.RequisitionId,
                VersionNumber = x.Version!.Number,
                VersionJson = x.Version.ContentJson,
            })
            .Take(1000)
            .ToListAsync(ct);
        var deciders = raw.Select(x => x.Invite.DecidedBy).OfType<string>().Distinct().ToArray();
        var names = await db
            .Users.AsNoTracking()
            .Where(x => deciders.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        var jobIds = raw.Select(x => x.RequisitionId).Distinct().ToArray();
        var manages = (
            await db.Requisitions.AsNoTracking().Where(x => jobIds.Contains(x.Id)).ToListAsync(ct)
        ).ToDictionary(x => x.Id, x => CanManage(x, principal));
        // Many rows share a version: read each version's pass mark once.
        var passMarks = new Dictionary<string, int>();
        return raw.Select(x =>
            {
                var i = x.Invite;
                var canManage = manages.GetValueOrDefault(x.RequisitionId);
                // Blind review: a grader who does not manage the job never receives who the person is.
                // People who manage the job already see them in the pipeline, so their rows stay named.
                var hidden = x.BlindReview && i.Decision == null && !canManage;
                if (!passMarks.TryGetValue(x.VersionJson, out var passMark))
                    passMarks[x.VersionJson] = passMark = AssessmentScoring
                        .Read(x.VersionJson)
                        .PassMark;
                return new InviteRow(
                    i.Id,
                    i.AssessmentId,
                    x.AssessmentName,
                    x.Kind,
                    x.BlindReview && i.Decision == null,
                    hidden ? Guid.Empty : i.ApplicationId,
                    hidden ? Guid.Empty : x.CandidateId,
                    hidden ? BlindName(i.Id) : x.Candidate.Trim(),
                    hidden ? "" : x.Email,
                    x.Job,
                    AssessmentFlow.Effective(i, now),
                    i.Attempt,
                    i.ReplacedAt != null,
                    i.InvitedAt,
                    i.ExpiresAt,
                    i.StartedAt,
                    i.SubmittedAt,
                    i.AutoSubmitted,
                    i.ExtraMinutes,
                    i.EarnedPoints,
                    i.MaxPoints,
                    i.PendingCount,
                    i.Percent,
                    i.Decision,
                    i.DecidedBy is { } d ? names.GetValueOrDefault(d, d) : null,
                    passMark,
                    i.ReminderCount,
                    i.LastReminderAt,
                    x.VersionNumber,
                    FlagCount(i.IntegrityJson),
                    canManage
                );
            })
            .ToList();
    }

    /// <summary>
    /// Adds an invite and queues its email (the caller saves). Refuses closed applications,
    /// unpublished assessments and anyone with an open or finished attempt (a retake is the way).
    /// </summary>
    internal static async Task<(AssessmentInvite? Invite, IResult? Error)> CreateInviteAsync(
        AtsDbContext db,
        string invitedBy,
        Application application,
        Assessment? assessment,
        DateTimeOffset? expiresAt,
        string? note,
        CancellationToken ct,
        int? attempt = null
    )
    {
        if (
            assessment is null
            || assessment.Status != AssessmentStatus.Active
            || assessment.CurrentVersionId is null
        )
            return (null, AssessmentProblem("assessmentId", "Pick a published assessment."));
        if (application.Status != ApplicationStatus.Active)
            return (
                null,
                Results.Conflict(
                    new { message = "Only an active application can get an assessment." }
                )
            );
        if ((note?.Length ?? 0) > 2000)
            return (null, AssessmentProblem("note", "Keep the note under 2,000 characters."));
        var now = DateTimeOffset.UtcNow;
        var expires = expiresAt ?? now.AddDays(assessment.ExpiryDays);
        if (expires <= now.AddHours(1) || expires > now.AddDays(90))
            return (null, AssessmentProblem("expiresAt", "Pick a due date in the next 90 days."));
        if (attempt is null)
        {
            var previous = await db
                .AssessmentInvites.Where(x =>
                    x.ApplicationId == application.Id
                    && x.AssessmentId == assessment.Id
                    && x.ReplacedAt == null
                    && x.Status != AssessmentInviteStatus.Revoked
                )
                .ToListAsync(ct);
            var blocking = previous.FirstOrDefault(x =>
                AssessmentFlow.Effective(x, now) != AssessmentInviteStatus.Expired
            );
            if (blocking is not null)
                return (
                    null,
                    Results.Conflict(
                        new
                        {
                            message = blocking.Status == AssessmentInviteStatus.Submitted
                                ? "They already took this assessment. Allow a retake from their result instead."
                                : "They already have this assessment open. Change its deadline or send a reminder instead.",
                            inviteId = blocking.Id,
                        }
                    )
                );
            // An expired attempt is replaced by this one.
            foreach (var old in previous)
                old.ReplacedAt = now;
            attempt = previous.Count == 0 ? 1 : previous.Max(x => x.Attempt) + 1;
        }
        var invite = new AssessmentInvite
        {
            AssessmentId = assessment.Id,
            Assessment = assessment,
            VersionId = assessment.CurrentVersionId.Value,
            Version = await db.AssessmentVersions.SingleAsync(
                x => x.Id == assessment.CurrentVersionId,
                ct
            ),
            ApplicationId = application.Id,
            Application = application,
            Attempt = attempt.Value,
            InvitedBy = invitedBy,
            ExpiresAt = expires,
        };
        db.AssessmentInvites.Add(invite);
        await AssessmentFlow.QueueEmailAsync(db, AssessmentFlow.InviteKey, invite, note, ct);
        Audit.Add(
            db,
            invitedBy,
            "Application",
            application.Id,
            attempt > 1 ? "AssessmentRetakeSent" : "AssessmentSent",
            new { inviteId = invite.Id, assessment = assessment.Name }
        );
        application.LastActivityAt = now;
        return (invite, null);
    }
}
