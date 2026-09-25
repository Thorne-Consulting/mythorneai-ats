using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapInterviews(RouteGroupBuilder api)
    {
        api.MapGet(
                "/interviews",
                async (
                    DateTimeOffset from,
                    DateTimeOffset to,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (to <= from)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["range"] = ["The end of the calendar range must follow its start."],
                            }
                        );

                    var applicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal)
                        .Select(x => x.Id);
                    var email = principal.Email();
                    var interviews = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && (principal.IsHiringStaff()
                                || principal.IsInRole(nameof(UserRole.HiringManager))
                                || x.InterviewerEmails.Contains(email))
                            && x.StartsAt >= from
                            && x.StartsAt < to
                            && x.Status == InterviewStatus.Scheduled
                        )
                        .OrderBy(x => x.StartsAt)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.StartsAt,
                            x.EndsAt,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            RequisitionTitle = x.Application.Requisition!.Title,
                            x.InterviewerEmails,
                        })
                        .ToListAsync(ct);
                    return Results.Ok(interviews);
                }
            )
            .RequireAuthorization();

        api.MapPost(
                "/applications/{id:guid}/interviews",
                async (
                    Guid id,
                    ScheduleInterviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    CancellationToken ct
                ) =>
                {
                    if (
                        request.EndsAt <= request.StartsAt
                        || request.InterviewerEmails.Length == 0
                        || string.IsNullOrWhiteSpace(request.Title)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interview"] =
                                [
                                    "Title, interviewer, and a valid time range are required.",
                                ],
                            }
                        );
                    var application = await db
                        .Applications.Include(x => x.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        request.InterviewKitId is not null
                        && !await db.InterviewKits.AnyAsync(
                            x =>
                                x.Id == request.InterviewKitId
                                && x.RequisitionId == application.RequisitionId,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKitId"] =
                                [
                                    "Interview kit does not belong to this requisition.",
                                ],
                            }
                        );

                    var interview = new Interview
                    {
                        ApplicationId = id,
                        InterviewKitId = request.InterviewKitId,
                        Title = request.Title.Trim(),
                        StartsAt = request.StartsAt,
                        EndsAt = request.EndsAt,
                        TimeZone = request.TimeZone.Trim(),
                        MeetingLink = Clean(request.MeetingLink),
                        InterviewerEmails = request
                            .InterviewerEmails.Select(x => x.Trim().ToLowerInvariant())
                            .Distinct()
                            .ToArray(),
                        CalendarStatus = integration.IsEnabled ? "Queued" : "NotConfigured",
                        CalendarProvider = integration.IsEnabled ? integration.ProviderName : null,
                    };
                    db.Interviews.Add(interview);
                    if (integration.IsEnabled)
                        db.IntegrationOutbox.Add(
                            new IntegrationOutboxItem
                            {
                                Operation = IntegrationOperation.CreateCalendarEvent,
                                EntityId = interview.Id,
                            }
                        );
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "InterviewScheduled",
                        new
                        {
                            interview.Id,
                            interview.StartsAt,
                            interview.InterviewerEmails,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/applications/{id}/interviews/{interview.Id}",
                        new { interview.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/interviews/{id:guid}",
                async (
                    Guid id,
                    UpdateInterviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    CancellationToken ct
                ) =>
                {
                    if (
                        request.EndsAt <= request.StartsAt
                        || request.InterviewerEmails.Length == 0
                        || string.IsNullOrWhiteSpace(request.Title)
                        || string.IsNullOrWhiteSpace(request.TimeZone)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interview"] =
                                [
                                    "Title, timezone, interviewer, and a valid time range are required.",
                                ],
                            }
                        );
                    var interview = await db
                        .Interviews.Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        interview?.Application?.Requisition is null
                        || !CanManage(interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        request.InterviewKitId is not null
                        && !await db.InterviewKits.AnyAsync(
                            x =>
                                x.Id == request.InterviewKitId
                                && x.RequisitionId == interview.Application.RequisitionId,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKitId"] =
                                [
                                    "Interview kit does not belong to this hiring session.",
                                ],
                            }
                        );

                    interview.Title = request.Title.Trim();
                    interview.InterviewKitId = request.InterviewKitId;
                    interview.StartsAt = request.StartsAt;
                    interview.EndsAt = request.EndsAt;
                    interview.TimeZone = request.TimeZone.Trim();
                    interview.MeetingLink = Clean(request.MeetingLink);
                    interview.InterviewerEmails = request
                        .InterviewerEmails.Select(x => x.Trim().ToLowerInvariant())
                        .Where(x => x.Length > 0)
                        .Distinct()
                        .ToArray();
                    interview.Status = request.Status;
                    if (
                        integration.IsEnabled
                        && (
                            request.Status == InterviewStatus.Scheduled
                            || request.Status == InterviewStatus.Cancelled
                        )
                    )
                    {
                        var operation =
                            request.Status == InterviewStatus.Cancelled
                                ? IntegrationOperation.CancelCalendarEvent
                                : IntegrationOperation.CreateCalendarEvent;
                        var outbox = await db.IntegrationOutbox.SingleOrDefaultAsync(
                            x => x.Operation == operation && x.EntityId == id,
                            ct
                        );
                        if (outbox is null)
                            db.IntegrationOutbox.Add(
                                new IntegrationOutboxItem { Operation = operation, EntityId = id }
                            );
                        else
                        {
                            outbox.Status = IntegrationOutboxStatus.Pending;
                            outbox.Attempts = 0;
                            outbox.NextAttemptAt = DateTimeOffset.UtcNow;
                            outbox.LockedUntil = null;
                            outbox.LastError = null;
                            outbox.CompletedAt = null;
                        }
                        interview.CalendarStatus =
                            request.Status == InterviewStatus.Cancelled
                                ? "CancellationQueued"
                                : "Queued";
                    }
                    interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "InterviewUpdated",
                        new
                        {
                            interview.Id,
                            interview.StartsAt,
                            interview.Status,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
            "/interviews/{id:guid}/meeting-notes",
            async (
                Guid id,
                UpdateMeetingNotesRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (string.IsNullOrWhiteSpace(request.Notes) || request.Notes.Length > 100_000)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["notes"] =
                            [
                                "Meeting notes are required and may not exceed 100,000 characters.",
                            ],
                        }
                    );
                if (request.Source?.Length > 120)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["source"] = ["The notes source may not exceed 120 characters."],
                        }
                    );

                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (interview?.Application?.Requisition is null)
                    return Results.NotFound();

                var isAssigned = interview.InterviewerEmails.Contains(
                    principal.Email(),
                    StringComparer.OrdinalIgnoreCase
                );
                if (!isAssigned && !CanManage(interview.Application.Requisition, principal))
                    return Results.Forbid();

                interview.MeetingNotes = request.Notes.Trim();
                interview.MeetingNotesSource = Clean(request.Source) ?? "Manual import";
                interview.MeetingNotesUpdatedAt = DateTimeOffset.UtcNow;
                interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    interview.ApplicationId,
                    "MeetingNotesUpdated",
                    new { interview.Id, interview.MeetingNotesSource }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/interviews/{id:guid}/recordings",
            async (
                Guid id,
                bool consentConfirmed,
                IFormFile file,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                if (!consentConfirmed)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["consentConfirmed"] =
                            [
                                "Confirm that every participant agreed to recording.",
                            ],
                        }
                    );
                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (interview?.Application?.Requisition is null)
                    return Results.NotFound();
                var isAssigned = interview.InterviewerEmails.Contains(
                    principal.Email(),
                    StringComparer.OrdinalIgnoreCase
                );
                if (!isAssigned && !CanManage(interview.Application.Requisition, principal))
                    return Results.Forbid();
                try
                {
                    var stored = await files.SaveRecordingAsync(file, ct);
                    var recording = new InterviewRecording
                    {
                        InterviewId = id,
                        OriginalFileName = Path.GetFileName(file.FileName),
                        StoredFileName = stored.StoredName,
                        ContentType = stored.ContentType,
                        Length = file.Length,
                        UploadedBy = principal.Email(),
                        ConsentConfirmed = true,
                    };
                    db.InterviewRecordings.Add(recording);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "InterviewRecordingUploaded",
                        new { recording.Id, recording.Length }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interview-recordings/{recording.Id}",
                        new { recording.Id }
                    );
                }
                catch (InvalidDataException exception)
                {
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                    );
                }
            }
        );

        api.MapGet(
            "/interview-recordings/{id:guid}",
            async (
                Guid id,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var recording = await db
                    .InterviewRecordings.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && allowedApplicationIds.Contains(x.Interview!.ApplicationId),
                        ct
                    );
                return recording is null
                    ? Results.NotFound()
                    : Results.File(
                        files.OpenRead(recording.StoredFileName),
                        recording.ContentType,
                        enableRangeProcessing: true
                    );
            }
        );

        api.MapDelete(
                "/interview-recordings/{id:guid}",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var recording = await db
                        .InterviewRecordings.Include(x => x.Interview)
                            .ThenInclude(x => x!.Application)
                                .ThenInclude(x => x!.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        recording?.Interview?.Application?.Requisition is null
                        || !CanManage(recording.Interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    db.InterviewRecordings.Remove(recording);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        recording.Interview.ApplicationId,
                        "InterviewRecordingDeleted",
                        new { recording.Id }
                    );
                    await db.SaveChangesAsync(ct);
                    files.Delete(recording.StoredFileName);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/interviews/{id:guid}/scorecards",
                async (
                    Guid id,
                    SubmitScorecardRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (
                        request.Rating is < 1 or > 5
                        || string.IsNullOrWhiteSpace(request.Evidence)
                        || string.IsNullOrWhiteSpace(request.Strengths)
                        || string.IsNullOrWhiteSpace(request.Concerns)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["scorecard"] =
                                [
                                    "A 1–5 rating, summary, strengths, and concerns are required.",
                                ],
                            }
                        );
                    var interview = await db
                        .Interviews.Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .Include(x => x.InterviewKit)
                            .ThenInclude(x => x!.Criteria)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (interview?.Application?.Requisition is null)
                        return Results.NotFound();
                    var email = principal.Email();
                    var isAssigned = interview.InterviewerEmails.Contains(
                        email,
                        StringComparer.OrdinalIgnoreCase
                    );
                    if (!isAssigned)
                        return Results.Forbid();
                    if (
                        await db.Scorecards.AnyAsync(
                            x => x.InterviewId == id && x.InterviewerEmail == email,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new { message = "Your scorecard is already submitted and locked." }
                        );

                    var expectedCriteria = interview.InterviewKit?.Criteria ?? [];
                    var submittedCriteria = request.Criteria ?? [];
                    var submittedIds = submittedCriteria.Select(x => x.CriterionId).ToArray();
                    if (
                        (expectedCriteria.Count == 0 && submittedCriteria.Length > 0)
                        || (
                            expectedCriteria.Count > 0
                            && (
                                submittedCriteria.Length != expectedCriteria.Count
                                || submittedIds.Distinct().Count() != submittedIds.Length
                                || expectedCriteria.Any(x => !submittedIds.Contains(x.Id))
                                || submittedCriteria.Any(x =>
                                    x.Rating is < 1 or > 5 || string.IsNullOrWhiteSpace(x.Evidence)
                                )
                            )
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["criteria"] =
                                [
                                    "Every interview criterion needs a 1–5 rating and evidence.",
                                ],
                            }
                        );

                    var scorecard = new Scorecard
                    {
                        InterviewId = id,
                        InterviewerEmail = email,
                        Recommendation = request.Recommendation,
                        Rating = request.Rating,
                        Evidence = request.Evidence.Trim(),
                        Strengths = request.Strengths.Trim(),
                        Concerns = request.Concerns.Trim(),
                    };
                    scorecard.CriterionRatings.AddRange(
                        submittedCriteria.Select(x => new ScorecardCriterionRating
                        {
                            InterviewCriterionId = x.CriterionId,
                            Rating = x.Rating,
                            Evidence = x.Evidence.Trim(),
                        })
                    );
                    db.Scorecards.Add(scorecard);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "ScorecardSubmitted",
                        new { InterviewId = interview.Id, ScorecardId = scorecard.Id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interviews/{id}/scorecards/{scorecard.Id}",
                        new { scorecard.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.SubmitScorecard);
    }
}
