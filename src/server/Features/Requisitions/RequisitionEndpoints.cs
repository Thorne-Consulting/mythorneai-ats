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
    private static void MapRequisitions(RouteGroupBuilder api)
    {
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
                        request.Code,
                        request.Title,
                        request.Department,
                        request.Location,
                        request.OwnerEmail,
                        request.RecruiterEmail,
                        request.Openings
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var code = request.Code.Trim().ToUpperInvariant();
                    if (await db.Requisitions.AnyAsync(x => x.Code == code, ct))
                        return Results.Conflict(
                            new { message = "A requisition with that code already exists." }
                        );

                    var requisition = new Requisition
                    {
                        Code = code,
                        Title = request.Title.Trim(),
                        Department = request.Department.Trim(),
                        Location = request.Location.Trim(),
                        EmploymentType = request.EmploymentType.Trim(),
                        WorkMode = request.WorkMode.Trim(),
                        Openings = request.Openings,
                        OwnerEmail = request.OwnerEmail.Trim().ToLowerInvariant(),
                        RecruiterEmail = request.RecruiterEmail.Trim().ToLowerInvariant(),
                        Description = request.Description.Trim(),
                        TargetStartDate = request.TargetStartDate,
                    };
                    requisition.Stages.AddRange(SeedData.CreateDefaultStages(requisition.Id));
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
                        requisition.Code,
                        request.Title,
                        request.Department,
                        request.Location,
                        request.OwnerEmail,
                        request.RecruiterEmail,
                        request.Openings
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    requisition.Title = request.Title.Trim();
                    requisition.Department = request.Department.Trim();
                    requisition.Location = request.Location.Trim();
                    requisition.EmploymentType = request.EmploymentType.Trim();
                    requisition.WorkMode = request.WorkMode.Trim();
                    requisition.Openings = request.Openings;
                    requisition.OwnerEmail = request.OwnerEmail.Trim().ToLowerInvariant();
                    requisition.RecruiterEmail = request.RecruiterEmail.Trim().ToLowerInvariant();
                    requisition.Description = request.Description.Trim();
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
                                    }),
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                return requisition is null ? Results.NotFound() : Results.Ok(requisition);
            }
        );
    }
}
