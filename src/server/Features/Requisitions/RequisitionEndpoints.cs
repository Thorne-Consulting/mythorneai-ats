using System.Security.Claims;
using System.Security.Cryptography;
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
    private static void MapRequisitions(RouteGroupBuilder api)
    {
        MapPostingTemplates(api);

        api.MapGet(
            "/requisitions",
            async (
                string? search,
                RequisitionStatus? status,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var query = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
                if (status is not null)
                    query = query.Where(x => x.Status == status);
                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(x =>
                        x.Title.ToLower().Contains(term)
                        || x.Code.ToLower().Contains(term)
                        || x.Department.ToLower().Contains(term)
                    );
                }

                return Results.Ok(
                    await query
                        .OrderByDescending(x => x.UpdatedAt)
                        .Select(x => new
                        {
                            x.Id,
                            x.Code,
                            x.Title,
                            x.Department,
                            x.Location,
                            x.EmploymentType,
                            x.WorkMode,
                            x.Openings,
                            Status = x.Status.ToString(),
                            x.OwnerEmail,
                            x.RecruiterEmail,
                            x.TargetStartDate,
                            ActiveApplications = x.Applications.Count(a =>
                                a.Status == ApplicationStatus.Active
                            ),
                            x.UpdatedAt,
                        })
                        .ToListAsync(ct)
                );
            }
        );

        api.MapGet(
            "/requisitions/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var item = await ScopeRequisitions(db.Requisitions.AsNoTracking(), principal)
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.Id,
                        x.Code,
                        x.Title,
                        x.Department,
                        x.Location,
                        x.EmploymentType,
                        x.WorkMode,
                        x.Openings,
                        Status = x.Status.ToString(),
                        x.OwnerEmail,
                        x.RecruiterEmail,
                        x.Description,
                        x.TargetStartDate,
                        x.CreatedAt,
                        x.UpdatedAt,
                        x.RequirementsJson,
                        x.IsConfidential,
                        x.ViewerEmails,
                        x.AllowCandidateReschedule,
                        x.AllowCandidateWithdraw,
                        Stages = x
                            .Stages.OrderBy(s => s.SortOrder)
                            .Select(s => new
                            {
                                s.Id,
                                s.Name,
                                s.SortOrder,
                                s.Color,
                                s.IsTerminal,
                                Count = s.Applications.Count(a =>
                                    allowedApplicationIds.Contains(a.Id)
                                    && a.Status == ApplicationStatus.Active
                                ),
                            }),
                        InterviewKits = x
                            .InterviewKits.OrderBy(k => k.SortOrder)
                            .Select(k => new
                            {
                                k.Id,
                                k.Name,
                                k.Instructions,
                                k.CandidateMessage,
                                k.InterviewerMessage,
                                k.DurationMinutes,
                                k.SortOrder,
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
                    })
                    .SingleOrDefaultAsync(ct);
                return item is null ? Results.NotFound() : Results.Ok(item);
            }
        );

        api.MapPost(
                "/requisitions/{id:guid}/interview-kits",
                async (
                    Guid id,
                    CreateInterviewKitRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requestedCriteria = request.Criteria ?? [];
                    var criterionNames = requestedCriteria
                        .Select(x => x.Name?.Trim() ?? "")
                        .Where(x => x.Length > 0)
                        .ToArray();
                    if (
                        string.IsNullOrWhiteSpace(request.Name)
                        || request.DurationMinutes is < 15 or > 480
                        || criterionNames.Length == 0
                        || requestedCriteria.Any(x =>
                            string.IsNullOrWhiteSpace(x.Question) || x.Weight is < 1 or > 5
                        )
                        || criterionNames.Distinct(StringComparer.OrdinalIgnoreCase).Count()
                            != criterionNames.Length
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKit"] =
                                [
                                    "A name, a 15–480 minute duration, and unique criteria with a question and 1–5 weight are required.",
                                ],
                            }
                        );

                    var requisition = await db
                        .Requisitions.Include(x => x.InterviewKits)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();

                    var kit = new InterviewKit
                    {
                        RequisitionId = id,
                        Name = request.Name.Trim(),
                        Instructions = request.Instructions?.Trim() ?? "",
                        CandidateMessage = request.CandidateMessage?.Trim() is { Length: > 0 } candidateMessage
                            ? candidateMessage
                            : "Please choose an interview time from the available options.",
                        InterviewerMessage = request.InterviewerMessage?.Trim() is { Length: > 0 } interviewerMessage
                            ? interviewerMessage
                            : "You are assigned to this interview. Please complete your scorecard afterward.",
                        DurationMinutes = request.DurationMinutes,
                        SortOrder = requisition.InterviewKits.Count,
                    };
                    kit.Criteria.AddRange(
                        requestedCriteria
                            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
                            .Select(
                                (criterion, index) =>
                                    new InterviewCriterion
                                    {
                                        Name = criterion.Name.Trim(),
                                        Question = criterion.Question.Trim(),
                                        Description = criterion.Description?.Trim() ?? "",
                                        Weight = criterion.Weight,
                                        SortOrder = index,
                                    }
                            )
                    );
                    db.InterviewKits.Add(kit);
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitCreated",
                        new
                        {
                            kit.Id,
                            kit.Name,
                            Criteria = kit.Criteria.Count,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/requisitions/{id}/interview-kits/{kit.Id}",
                        new { kit.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}",
                async (
                    Guid id,
                    Guid kitId,
                    UpdateInterviewKitRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requestedCriteria = request.Criteria ?? [];
                    var criterionNames = requestedCriteria
                        .Select(x => x.Name?.Trim() ?? "")
                        .Where(x => x.Length > 0)
                        .ToArray();
                    if (
                        string.IsNullOrWhiteSpace(request.Name)
                        || request.DurationMinutes is < 15 or > 480
                        || criterionNames.Length == 0
                        || requestedCriteria.Any(x =>
                            string.IsNullOrWhiteSpace(x.Name)
                            || string.IsNullOrWhiteSpace(x.Question)
                            || x.Weight is < 1 or > 5
                        )
                        || criterionNames.Distinct(StringComparer.OrdinalIgnoreCase).Count()
                            != criterionNames.Length
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKit"] =
                                [
                                    "A name, a 15–480 minute duration, and unique criteria with a question and 1–5 weight are required.",
                                ],
                            }
                        );

                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var kit = await db
                        .InterviewKits.Include(x => x.Criteria)
                        .SingleOrDefaultAsync(x => x.Id == kitId && x.RequisitionId == id, ct);
                    if (kit is null)
                        return Results.NotFound();

                    var existingIds = kit.Criteria.Select(x => x.Id).ToHashSet();
                    var keptIds = requestedCriteria
                        .Where(x => x.Id is not null)
                        .Select(x => x.Id!.Value)
                        .ToHashSet();
                    if (keptIds.Any(x => !existingIds.Contains(x)))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKit"] = ["A criterion does not belong to this kit."],
                            }
                        );

                    // A competency that interviewers have already scored cannot be removed
                    // without losing those scores, so keep it or leave it as is.
                    var removed = kit.Criteria.Where(x => !keptIds.Contains(x.Id)).ToList();
                    var removedIds = removed.Select(x => x.Id).ToArray();
                    var scored = await db
                        .ScorecardCriterionRatings.Where(x =>
                            removedIds.Contains(x.InterviewCriterionId)
                        )
                        .Select(x => x.InterviewCriterionId)
                        .Distinct()
                        .ToListAsync(ct);
                    if (scored.Count > 0)
                        return Results.Conflict(
                            new
                            {
                                message = "A competency that already has scores can't be removed: "
                                    + string.Join(
                                        ", ",
                                        removed.Where(x => scored.Contains(x.Id)).Select(x => x.Name)
                                    )
                                    + ".",
                            }
                        );

                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    kit.Name = request.Name.Trim();
                    kit.Instructions = request.Instructions?.Trim() ?? "";
                    if (request.CandidateMessage?.Trim() is { Length: > 0 } candidateMessage)
                        kit.CandidateMessage = candidateMessage;
                    if (request.InterviewerMessage?.Trim() is { Length: > 0 } interviewerMessage)
                        kit.InterviewerMessage = interviewerMessage;
                    kit.DurationMinutes = request.DurationMinutes;

                    db.InterviewCriteria.RemoveRange(removed);
                    // (KitId, SortOrder) is unique, so park the survivors out of the way first.
                    foreach (var criterion in kit.Criteria.Where(x => keptIds.Contains(x.Id)))
                        criterion.SortOrder += 1000;
                    await db.SaveChangesAsync(ct);

                    for (var index = 0; index < requestedCriteria.Length; index++)
                    {
                        var item = requestedCriteria[index];
                        var criterion = item.Id is { } criterionId
                            ? kit.Criteria.Single(x => x.Id == criterionId)
                            : null;
                        if (criterion is null)
                        {
                            criterion = new InterviewCriterion
                            {
                                InterviewKitId = kit.Id,
                                Name = item.Name.Trim(),
                                Question = item.Question.Trim(),
                            };
                            db.InterviewCriteria.Add(criterion);
                        }
                        criterion.Name = item.Name.Trim();
                        criterion.Question = item.Question.Trim();
                        criterion.Description = item.Description?.Trim() ?? "";
                        criterion.Weight = item.Weight;
                        criterion.SortOrder = index;
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitUpdated",
                        new
                        {
                            kit.Id,
                            kit.Name,
                            Criteria = requestedCriteria.Length,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/requisitions",
                async (
                    CreateRequisitionRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var errors = ValidateRequisition(
                        request.Title,
                        request.Department,
                        request.Location,
                        request.OwnerEmail,
                        request.RecruiterEmail,
                        request.Openings
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var code = await GenerateRequisitionCodeAsync(db, ct);

                    var template = request.PostingTemplateId is null ? null : await db.PostingTemplates
                        .AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.PostingTemplateId && x.IsActive, ct);
                    if (request.PostingTemplateId is not null && template is null)
                        return Results.ValidationProblem(new Dictionary<string, string[]>
                        {
                            ["postingTemplateId"] = ["Posting template not found."]
                        });
                    var description = string.Join("\n\n", new[]
                    {
                        template?.HeaderMarkdown, request.Description?.Trim() is { Length: > 0 } descriptionMarkdown ? descriptionMarkdown : template?.DescriptionMarkdown,
                        template?.BenefitsMarkdown,
                    }.Where(x => !string.IsNullOrWhiteSpace(x)));
                    var requisition = new Requisition
                    {
                        Code = code,
                        Title = request.Title!.Trim(),
                        Department = request.Department!.Trim(),
                        Location = request.Location!.Trim(),
                        EmploymentType = request.EmploymentType?.Trim() ?? "",
                        WorkMode = request.WorkMode?.Trim() ?? "",
                        Openings = request.Openings,
                        OwnerEmail = request.OwnerEmail!.Trim().ToLowerInvariant(),
                        RecruiterEmail = request.RecruiterEmail!.Trim().ToLowerInvariant(),
                        Description = description,
                        ApplicationQuestionsMarkdown = template?.ApplicationQuestionsMarkdown ?? "",
                        PostingTemplateId = template?.Id,
                        PostingTemplateVersion = template?.Version,
                        TargetStartDate = request.TargetStartDate,
                    };
                    var pipeline = request.PipelineTemplateId is null
                        ? await db.PipelineTemplates.AsNoTracking().FirstOrDefaultAsync(x => x.IsDefault, ct)
                        : await db.PipelineTemplates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.PipelineTemplateId, ct);
                    if (request.PipelineTemplateId is not null && pipeline is null)
                        return Results.ValidationProblem(new Dictionary<string, string[]>
                        {
                            ["pipelineTemplateId"] = ["Pipeline not found."]
                        });
                    requisition.Stages.AddRange(
                        pipeline is null
                            ? SeedData.CreateDefaultStages(requisition.Id)
                            : SeedData.CreateStages(requisition.Id, pipeline.StageNames)
                    );
                    db.Requisitions.Add(requisition);
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        requisition.Id,
                        "Created",
                        new { requisition.Code, requisition.Title }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/requisitions/{requisition.Id}",
                        new { requisition.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/requisitions/{id:guid}",
                async (
                    Guid id,
                    UpdateRequisitionRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var errors = ValidateRequisition(
                        request.Title,
                        request.Department,
                        request.Location,
                        request.OwnerEmail,
                        request.RecruiterEmail,
                        request.Openings
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    requisition.Title = request.Title!.Trim();
                    requisition.Department = request.Department!.Trim();
                    requisition.Location = request.Location!.Trim();
                    requisition.EmploymentType = request.EmploymentType?.Trim() ?? "";
                    requisition.WorkMode = request.WorkMode?.Trim() ?? "";
                    requisition.Openings = request.Openings;
                    requisition.OwnerEmail = request.OwnerEmail!.Trim().ToLowerInvariant();
                    requisition.RecruiterEmail = request.RecruiterEmail!.Trim().ToLowerInvariant();
                    requisition.Description = request.Description?.Trim() ?? "";
                    requisition.TargetStartDate = request.TargetStartDate;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Requisition", id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/requisitions/{id:guid}/status",
                async (
                    Guid id,
                    ChangeRequisitionStatusRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var oldStatus = requisition.Status;
                    if (
                        request.Status == RequisitionStatus.Open
                        && requisition.OpenedAt is null
                        && (
                            oldStatus == RequisitionStatus.PendingApproval
                            || await db
                                .Organizations.Select(x => (bool?)x.RequireRequisitionApproval)
                                .SingleOrDefaultAsync(ct) == true
                        )
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "Opening this job needs approval. Submit it for approval first.",
                            }
                        );
                    if (request.Status == RequisitionStatus.Open)
                        requisition.OpenedAt ??= DateTimeOffset.UtcNow;
                    requisition.Status = request.Status;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "StatusChanged",
                        new
                        {
                            From = oldStatus,
                            To = request.Status,
                            request.Reason,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/requisitions/{id:guid}/board",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var requisition = await ScopeRequisitions(db.Requisitions.AsNoTracking(), principal)
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.Id,
                        x.Code,
                        x.Title,
                        Stages = x
                            .Stages.OrderBy(s => s.SortOrder)
                            .Select(s => new
                            {
                                s.Id,
                                s.Name,
                                s.Color,
                                s.SortOrder,
                                Applications = s
                                    .Applications.Where(a =>
                                        allowedApplicationIds.Contains(a.Id)
                                        && a.Status == ApplicationStatus.Active
                                    )
                                    .OrderByDescending(a => a.LastActivityAt)
                                    .Select(a => new
                                    {
                                        a.Id,
                                        CandidateId = a.CandidateId,
                                        CandidateName = a.Candidate!.FirstName
                                            + " "
                                            + a.Candidate.LastName,
                                        a.Candidate.CurrentTitle,
                                        a.Candidate.Location,
                                        a.Source,
                                        a.Rating,
                                        a.LastActivityAt,
                                        a.AppliedAt,
                                        YearsExperience = a.Candidate.ResumeYearsExperience,
                                        Skills = a.Candidate.ResumeSkills,
                                        NextInterviewAt = a
                                            .Interviews.Where(i =>
                                                i.Status == InterviewStatus.Scheduled
                                                && i.StartsAt > DateTimeOffset.UtcNow
                                            )
                                            .Min(i => (DateTimeOffset?)i.StartsAt),
                                    }),
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                return requisition is null ? Results.NotFound() : Results.Ok(requisition);
            }
        );
    }

    private static async Task<string> GenerateRequisitionCodeAsync(
        AtsDbContext db,
        CancellationToken ct
    )
    {
        const string alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
        while (true)
        {
            var suffix = new string(
                Enumerable
                    .Range(0, 6)
                    .Select(_ => alphabet[RandomNumberGenerator.GetInt32(alphabet.Length)])
                    .ToArray()
            );
            var code = $"REQ-{suffix}";
            if (!await db.Requisitions.AnyAsync(x => x.Code == code, ct))
                return code;
        }
    }
}
