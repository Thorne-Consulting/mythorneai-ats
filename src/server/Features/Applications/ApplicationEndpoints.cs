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
    private static void MapApplications(RouteGroupBuilder api)
    {
        api.MapPost(
                "/applications",
                async (
                    CreateApplicationRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.Include(x => x.Stages)
                        .SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.Status != RequisitionStatus.Open)
                        return Results.Conflict(
                            new
                            {
                                message = "Applications can only be added to an open requisition.",
                            }
                        );
                    if (!await db.Candidates.AnyAsync(x => x.Id == request.CandidateId, ct))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["candidateId"] = ["Candidate not found."],
                            }
                        );
                    if (
                        await db.Applications.AnyAsync(
                            x =>
                                x.CandidateId == request.CandidateId
                                && x.RequisitionId == request.RequisitionId
                                && x.Status == ApplicationStatus.Active,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "This candidate already has an active application for the requisition.",
                            }
                        );

                    var firstStage = requisition.Stages.OrderBy(x => x.SortOrder).First();
                    var application = new Application
                    {
                        CandidateId = request.CandidateId,
                        RequisitionId = request.RequisitionId,
                        PipelineStageId = firstStage.Id,
                        Source = request.Source.Trim(),
                    };
                    db.Applications.Add(application);
                    PipelineEvents.RecordMove(db, application, null, null, principal.Email());
                    await PipelineEvents.PublishApplicationAsync(db, "application.created", application, ct);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        application.Id,
                        "Created",
                        new { request.CandidateId, request.RequisitionId }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/applications/{application.Id}",
                        new { application.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/applications/bulk-stage",
                async (
                    BulkMoveApplicationsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var ids = request.ApplicationIds.Distinct().Take(201).ToArray();
                    if (ids.Length is 0 or > 200)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["applicationIds"] = ["Select between 1 and 200 applications."],
                            }
                        );
                    var applications = await db
                        .Applications.Include(x => x.Requisition)
                        .Where(x => ids.Contains(x.Id))
                        .ToListAsync(ct);
                    if (
                        applications.Count != ids.Length
                        || applications.Any(x =>
                            x.Requisition is null || !CanManage(x.Requisition, principal)
                        )
                    )
                        return Results.NotFound();
                    var requisitionIds = applications
                        .Select(x => x.RequisitionId)
                        .Distinct()
                        .ToArray();
                    if (requisitionIds.Length != 1)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["applicationIds"] =
                                [
                                    "Bulk actions must stay within one hiring session.",
                                ],
                            }
                        );
                    var stage = await db.PipelineStages.SingleOrDefaultAsync(
                        x => x.Id == request.StageId && x.RequisitionId == requisitionIds[0],
                        ct
                    );
                    if (stage is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["stageId"] = ["Stage does not belong to this hiring session."],
                            }
                        );
                    if (request.Status is ApplicationStatus.Hired or ApplicationStatus.PendingVerification)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["status"] = ["Use Active, Rejected or Withdrawn here. Hiring goes through an approved acceptance."],
                            }
                        );
                    if (IsHiredStage(stage) && applications.Any(x => x.Status != ApplicationStatus.Hired))
                        return Results.Conflict(
                            new
                            {
                                message = "Hiring goes through an acceptance. Start one from each application.",
                            }
                        );
                    foreach (var application in applications)
                    {
                        var oldStageId = application.PipelineStageId;
                        var oldStatus = application.Status;
                        application.PipelineStageId = stage.Id;
                        application.Status = request.Status;
                        application.DispositionReason = Clean(request.DispositionReason);
                        application.LastActivityAt = DateTimeOffset.UtcNow;
                        await PipelineEvents.OnMovedAsync(
                            db,
                            application,
                            oldStageId,
                            oldStatus,
                            principal.Email(),
                            ct
                        );
                        Audit.Add(
                            db,
                            principal,
                            "Application",
                            application.Id,
                            "BulkStageChanged",
                            new
                            {
                                StageId = stage.Id,
                                application.Status,
                                application.DispositionReason,
                            }
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Updated = applications.Count });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/applications/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeHiringDetails =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var currentEmail = principal.Email();
                var application = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.Id,
                        x.CandidateId,
                        CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        CandidateEmail = canSeeHiringDetails ? x.Candidate.Email : "Restricted",
                        CandidatePhone = canSeeHiringDetails ? x.Candidate.Phone : null,
                        CandidateLocation = x.Candidate.Location,
                        CandidateTitle = x.Candidate.CurrentTitle,
                        CandidateTags = x.Candidate.Tags,
                        x.RequisitionId,
                        RequisitionCode = x.Requisition!.Code,
                        RequisitionTitle = x.Requisition.Title,
                        StageId = x.PipelineStageId,
                        Stage = x.PipelineStage!.Name,
                        Status = x.Status.ToString(),
                        x.Source,
                        x.DispositionReason,
                        x.Rating,
                        x.AppliedAt,
                        x.LastActivityAt,
                        Stages = x
                            .Requisition.Stages.OrderBy(s => s.SortOrder)
                            .Select(s => new
                            {
                                s.Id,
                                s.Name,
                                s.Color,
                                s.SortOrder,
                                s.IsTerminal,
                            }),
                        InterviewKits = x
                            .Requisition.InterviewKits.OrderBy(k => k.SortOrder)
                            .Select(k => new
                            {
                                k.Id,
                                k.Name,
                                k.Instructions,
                                k.DurationMinutes,
                                Criteria = k
                                    .Criteria.OrderBy(c => c.SortOrder)
                                    .Select(c => new
                                    {
                                        c.Id,
                                        c.Name,
                                        c.Question,
                                        c.Description,
                                        c.Weight,
                                        c.SortOrder,
                                    }),
                            }),
                        Notes = x
                            .Notes.Where(n => canSeeHiringDetails || !n.IsPrivate)
                            .OrderByDescending(n => n.CreatedAt)
                            .Select(n => new
                            {
                                n.Id,
                                n.Body,
                                n.AuthorEmail,
                                n.IsPrivate,
                                n.CreatedAt,
                            }),
                        Interviews = x
                            .Interviews.OrderByDescending(i => i.StartsAt)
                            .Select(i => new
                            {
                                i.Id,
                                i.Title,
                                i.InterviewKitId,
                                InterviewKitName = i.InterviewKit == null
                                    ? null
                                    : i.InterviewKit.Name,
                                InterviewKitInstructions = i.InterviewKit == null
                                    ? null
                                    : i.InterviewKit.Instructions,
                                Criteria = i.InterviewKit!.Criteria.OrderBy(c => c.SortOrder)
                                    .Select(c => new
                                    {
                                        c.Id,
                                        c.Name,
                                        c.Question,
                                        c.Description,
                                        c.Weight,
                                        c.SortOrder,
                                    }),
                                i.StartsAt,
                                i.EndsAt,
                                i.TimeZone,
                                i.MeetingLink,
                                i.InterviewerEmails,
                                i.CalendarStatus,
                                i.CalendarProvider,
                                Status = i.Status.ToString(),
                                i.MeetingNotes,
                                i.MeetingNotesSource,
                                i.MeetingNotesUpdatedAt,
                                SubmittedScorecards = i.Scorecards.Count,
                                ScorecardsVisible = !i.InterviewerEmails.Contains(currentEmail)
                                    || i.Scorecards.Any(mine =>
                                        mine.InterviewerEmail == currentEmail
                                    ),
                                Scorecards = i
                                    .Scorecards.Where(s =>
                                        !i.InterviewerEmails.Contains(currentEmail)
                                        || i.Scorecards.Any(mine =>
                                            mine.InterviewerEmail == currentEmail
                                        )
                                    )
                                    .OrderBy(s => s.SubmittedAt)
                                    .Select(s => new
                                    {
                                        s.Id,
                                        s.InterviewerEmail,
                                        Recommendation = s.Recommendation.ToString(),
                                        s.Rating,
                                        s.Evidence,
                                        s.Strengths,
                                        s.Concerns,
                                        s.SubmittedAt,
                                        Criteria = s
                                            .CriterionRatings.OrderBy(r =>
                                                r.InterviewCriterion!.SortOrder
                                            )
                                            .Select(r => new
                                            {
                                                CriterionId = r.InterviewCriterionId,
                                                CriterionName = r.InterviewCriterion!.Name,
                                                r.Rating,
                                                r.Evidence,
                                            }),
                                    }),
                                Recordings = i
                                    .Recordings.OrderByDescending(r => r.RecordedAt)
                                    .Select(r => new
                                    {
                                        r.Id,
                                        r.OriginalFileName,
                                        r.ContentType,
                                        r.Length,
                                        r.UploadedBy,
                                        r.ConsentConfirmed,
                                        r.Transcript,
                                        r.RecordedAt,
                                    }),
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                if (application is null)
                    return Results.NotFound();

                var audits = await db
                    .AuditEvents.AsNoTracking()
                    .Where(x => x.EntityType == "Application" && x.EntityId == id.ToString())
                    .OrderByDescending(x => x.OccurredAt)
                    .Take(50)
                    .ToListAsync(ct);
                var emails = canSeeHiringDetails
                    ? await db.EmailOutbox.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(50)
                        .Select(x => new { x.Id, x.Recipient, x.Subject, Status = x.Status.ToString(), x.DeliveryStatus, x.TemplateKey, x.CreatedAt })
                        .ToListAsync(ct)
                    : [];
                var thread = canSeeHiringDetails
                    ? await db.ApplicationMessages.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderBy(x => x.CreatedAt)
                        .Select(x => new { x.Id, x.FromCandidate, x.Body, x.AuthorEmail, x.CreatedAt, x.ReadAt })
                        .ToListAsync(ct)
                    : [];
                return Results.Ok(new { Application = application, Audit = audits, Emails = emails, Messages = thread });
            }
        );

        api.MapPatch(
                "/applications/{id:guid}/stage",
                async (
                    Guid id,
                    MoveApplicationRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var application = await db
                        .Applications.Include(x => x.Requisition).Include(x => x.Candidate)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    var stage = await db.PipelineStages.SingleOrDefaultAsync(
                        x =>
                            x.Id == request.StageId && x.RequisitionId == application.RequisitionId,
                        ct
                    );
                    if (stage is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["stageId"] = ["Stage does not belong to this requisition."],
                            }
                        );
                    if (
                        request.Status is ApplicationStatus.Rejected or ApplicationStatus.Withdrawn
                        && string.IsNullOrWhiteSpace(request.DispositionReason)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["dispositionReason"] = ["A disposition reason is required."],
                            }
                        );

                    // Hired and PendingVerification are set by the acceptance flow and email verification, never by hand.
                    if (request.Status is ApplicationStatus.Hired or ApplicationStatus.PendingVerification)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["status"] = ["Use Active, Rejected or Withdrawn here. Hiring goes through an approved acceptance."],
                            }
                        );
                    // The Hired stage is reached only by sending an acceptance, whatever the approval setting.
                    if (IsHiredStage(stage) && application.Status != ApplicationStatus.Hired)
                        return Results.Conflict(
                            new
                            {
                                message = "Hiring goes through an acceptance. Start one from the application.",
                            }
                        );
                    var oldStage = application.PipelineStageId;
                    var oldStatus = application.Status;
                    application.PipelineStageId = stage.Id;
                    application.Status = request.Status;
                    application.DispositionReason = Clean(request.DispositionReason);
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    var rejected = application.Status == ApplicationStatus.Rejected;
                    await EmailTemplates.QueueAsync(
                        db,
                        rejected ? "rejection" : "stage-update",
                        application.RequisitionId,
                        application.Candidate!.Email,
                        new Dictionary<string, string>
                        {
                            ["firstName"] = application.Candidate.FirstName,
                            ["jobTitle"] = application.Requisition.Title,
                            ["stage"] = stage.Name,
                        },
                        application.Id,
                        ct,
                        request.Message
                    );
                    await PipelineEvents.OnMovedAsync(
                        db,
                        application,
                        oldStage,
                        oldStatus,
                        principal.Email(),
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "StageChanged",
                        new
                        {
                            FromStageId = oldStage,
                            ToStageId = stage.Id,
                            FromStatus = oldStatus,
                            ToStatus = application.Status,
                            application.DispositionReason,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        MapApplicationNotes(api);
    }
}
