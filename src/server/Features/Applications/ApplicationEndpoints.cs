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
        api.MapGet(
            "/applications",
            async (
                Guid? requisitionId,
                Guid? stageId,
                ApplicationStatus? status,
                string? source,
                string? tag,
                string? location,
                bool? hasResume,
                int? minRating,
                string? search,
                string? sort,
                int page,
                int pageSize,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                page = Math.Max(page, 1);
                pageSize = Math.Clamp(pageSize == 0 ? 50 : pageSize, 10, 100);
                var query = ScopeApplications(db.Applications.AsNoTracking(), principal);
                if (requisitionId is not null)
                    query = query.Where(x => x.RequisitionId == requisitionId);
                if (stageId is not null)
                    query = query.Where(x => x.PipelineStageId == stageId);
                if (status is not null)
                    query = query.Where(x => x.Status == status);
                if (!string.IsNullOrWhiteSpace(source))
                    query = query.Where(x => x.Source == source.Trim());
                if (!string.IsNullOrWhiteSpace(tag))
                    query = query.Where(x => x.Candidate!.Tags.Contains(tag.Trim()));
                if (!string.IsNullOrWhiteSpace(location))
                {
                    var value = location.Trim().ToLower();
                    query = query.Where(x =>
                        x.Candidate!.Location != null
                        && x.Candidate.Location.ToLower().Contains(value)
                    );
                }
                if (hasResume is not null)
                    query = hasResume.Value
                        ? query.Where(x => x.Candidate!.Attachments.Any())
                        : query.Where(x => !x.Candidate!.Attachments.Any());
                if (minRating is not null)
                    query = query.Where(x => x.Rating >= minRating);
                if (!string.IsNullOrWhiteSpace(search))
                {
                    var value = search.Trim().ToLower();
                    query = query.Where(x =>
                        x.Candidate!.FirstName.ToLower().Contains(value)
                        || x.Candidate.LastName.ToLower().Contains(value)
                        || x.Candidate.Email.ToLower().Contains(value)
                        || (
                            x.Candidate.CurrentTitle != null
                            && x.Candidate.CurrentTitle.ToLower().Contains(value)
                        )
                    );
                }

                var total = await query.CountAsync(ct);
                query = sort?.ToLowerInvariant() switch
                {
                    "oldest" => query.OrderBy(x => x.AppliedAt),
                    "name" => query
                        .OrderBy(x => x.Candidate!.LastName)
                        .ThenBy(x => x.Candidate!.FirstName),
                    "rating" => query
                        .OrderByDescending(x => x.Rating)
                        .ThenByDescending(x => x.AppliedAt),
                    _ => query.OrderByDescending(x => x.AppliedAt),
                };
                var items = await query
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(x => new
                    {
                        x.Id,
                        x.CandidateId,
                        CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        x.Candidate.Email,
                        x.Candidate.Location,
                        x.Candidate.CurrentTitle,
                        x.Candidate.Tags,
                        HasResume = x.Candidate.Attachments.Any(),
                        ResumeCount = x.Candidate.Attachments.Count,
                        x.RequisitionId,
                        RequisitionCode = x.Requisition!.Code,
                        RequisitionTitle = x.Requisition.Title,
                        Team = x.Requisition.Department,
                        StageId = x.PipelineStageId,
                        Stage = x.PipelineStage!.Name,
                        Status = x.Status.ToString(),
                        x.Source,
                        x.Rating,
                        x.AppliedAt,
                        x.LastActivityAt,
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        Items = items,
                        Total = total,
                        Page = page,
                        PageSize = pageSize,
                    }
                );
            }
        );

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
                    foreach (var application in applications)
                    {
                        application.PipelineStageId = stage.Id;
                        application.Status = stage.Name.Equals(
                            "Hired",
                            StringComparison.OrdinalIgnoreCase
                        )
                            ? ApplicationStatus.Hired
                            : request.Status;
                        application.DispositionReason = Clean(request.DispositionReason);
                        application.LastActivityAt = DateTimeOffset.UtcNow;
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
                return Results.Ok(new { Application = application, Audit = audits });
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
                        .Applications.Include(x => x.Requisition)
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

                    var oldStage = application.PipelineStageId;
                    var oldStatus = application.Status;
                    application.PipelineStageId = stage.Id;
                    application.Status =
                        stage.IsTerminal
                        && stage.Name.Equals("Hired", StringComparison.OrdinalIgnoreCase)
                            ? ApplicationStatus.Hired
                            : request.Status;
                    application.DispositionReason = Clean(request.DispositionReason);
                    application.LastActivityAt = DateTimeOffset.UtcNow;
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

        api.MapPost(
                "/applications/{id:guid}/notes",
                async (
                    Guid id,
                    AddNoteRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (string.IsNullOrWhiteSpace(request.Body))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] = ["Note text is required."],
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
                    var note = new ApplicationNote
                    {
                        ApplicationId = id,
                        Body = request.Body.Trim(),
                        AuthorEmail = principal.Email(),
                        IsPrivate = request.IsPrivate,
                    };
                    db.Notes.Add(note);
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "NoteAdded",
                        new { note.Id, note.IsPrivate }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/applications/{id}/notes/{note.Id}",
                        new { note.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
