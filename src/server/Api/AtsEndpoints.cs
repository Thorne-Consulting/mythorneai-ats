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

public static class AtsEndpoints
{
    public static RouteGroupBuilder MapAtsEndpoints(this RouteGroupBuilder api)
    {
        MapDashboard(api);
        MapRequisitions(api);
        MapCandidates(api);
        MapApplications(api);
        MapAdministration(api);
        MapSearch(api);
        return api;
    }

    private static void MapDashboard(RouteGroupBuilder api)
    {
        api.MapGet(
            "/dashboard",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var requisitions = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
                var applications = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var applicationIds = applications.Select(x => x.Id);
                var email = principal.Email();
                var now = DateTimeOffset.UtcNow;

                var summary = new
                {
                    OpenRequisitions = await requisitions.CountAsync(
                        x => x.Status == RequisitionStatus.Open,
                        ct
                    ),
                    ActiveCandidates = await applications.CountAsync(
                        x => x.Status == ApplicationStatus.Active,
                        ct
                    ),
                    InterviewsThisWeek = await db
                        .Interviews.AsNoTracking()
                        .CountAsync(
                            x =>
                                applicationIds.Contains(x.ApplicationId)
                                && (
                                    principal.IsHiringStaff()
                                    || principal.IsInRole(nameof(UserRole.HiringManager))
                                    || x.InterviewerEmails.Contains(email)
                                )
                                && x.StartsAt >= now
                                && x.StartsAt < now.AddDays(7)
                                && x.Status == InterviewStatus.Scheduled,
                            ct
                        ),
                    RecentApplications = await applications
                        .OrderByDescending(x => x.LastActivityAt)
                        .Take(6)
                        .Select(x => new
                        {
                            x.Id,
                            CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            CandidateTitle = x.Candidate.CurrentTitle,
                            RequisitionTitle = x.Requisition!.Title,
                            Stage = x.PipelineStage!.Name,
                            x.LastActivityAt,
                        })
                        .ToListAsync(ct),
                    UpcomingInterviews = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && (
                                principal.IsHiringStaff()
                                || principal.IsInRole(nameof(UserRole.HiringManager))
                                || x.InterviewerEmails.Contains(email)
                            )
                            && x.StartsAt >= now
                            && x.Status == InterviewStatus.Scheduled
                        )
                        .OrderBy(x => x.StartsAt)
                        .Take(5)
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
                        })
                        .ToListAsync(ct),
                };

                return Results.Ok(summary);
            }
        );
    }

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

    private static void MapCandidates(RouteGroupBuilder api)
    {
        api.MapGet(
            "/candidates",
            async (
                string? search,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var query = db
                    .Candidates.AsNoTracking()
                    .Where(x => canSeeAllCandidates || allowedCandidateIds.Contains(x.Id));
                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(x =>
                        x.FirstName.ToLower().Contains(term)
                        || x.LastName.ToLower().Contains(term)
                        || x.Email.ToLower().Contains(term)
                        || (x.CurrentTitle != null && x.CurrentTitle.ToLower().Contains(term))
                    );
                }

                return Results.Ok(
                    await query
                        .OrderByDescending(x => x.UpdatedAt)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                            x.Phone,
                            x.Location,
                            x.CurrentTitle,
                            x.Source,
                            x.Tags,
                            x.DoNotContact,
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
            "/candidates/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeContact =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var candidate = await db
                    .Candidates.AsNoTracking()
                    .Where(x =>
                        x.Id == id
                        && (
                            canSeeAllCandidates
                            || x.Applications.Any(a => allowedApplicationIds.Contains(a.Id))
                        )
                    )
                    .Select(x => new
                    {
                        x.Id,
                        x.FirstName,
                        x.LastName,
                        Email = canSeeContact ? x.Email : "Restricted",
                        Phone = canSeeContact ? x.Phone : null,
                        x.Location,
                        x.CurrentTitle,
                        LinkedInUrl = canSeeContact ? x.LinkedInUrl : null,
                        x.Source,
                        x.Tags,
                        x.DoNotContact,
                        x.CreatedAt,
                        x.UpdatedAt,
                        Applications = x
                            .Applications.Where(a => allowedApplicationIds.Contains(a.Id))
                            .OrderByDescending(a => a.LastActivityAt)
                            .Select(a => new
                            {
                                a.Id,
                                RequisitionId = a.RequisitionId,
                                RequisitionCode = a.Requisition!.Code,
                                RequisitionTitle = a.Requisition.Title,
                                Stage = a.PipelineStage!.Name,
                                Status = a.Status.ToString(),
                                a.AppliedAt,
                                a.LastActivityAt,
                            }),
                        Attachments = x
                            .Attachments.OrderByDescending(a => a.UploadedAt)
                            .Select(a => new
                            {
                                a.Id,
                                a.OriginalFileName,
                                a.ContentType,
                                a.Length,
                                a.ScanStatus,
                                a.UploadedAt,
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                return candidate is null ? Results.NotFound() : Results.Ok(candidate);
            }
        );

        api.MapPost(
                "/candidates",
                async (
                    CreateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    var possibleDuplicate = await db
                        .Candidates.AsNoTracking()
                        .Where(x => x.Email == email)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                        })
                        .FirstOrDefaultAsync(ct);
                    if (possibleDuplicate is not null)
                        return Results.Conflict(
                            new
                            {
                                message = "A candidate with this email already exists.",
                                candidate = possibleDuplicate,
                            }
                        );

                    var candidate = new Candidate
                    {
                        FirstName = request.FirstName.Trim(),
                        LastName = request.LastName.Trim(),
                        Email = email,
                        Phone = Clean(request.Phone),
                        Location = Clean(request.Location),
                        CurrentTitle = Clean(request.CurrentTitle),
                        LinkedInUrl = Clean(request.LinkedInUrl),
                        Source = request.Source.Trim(),
                        Tags =
                            request
                                .Tags?.Select(x => x.Trim().ToLowerInvariant())
                                .Where(x => x.Length > 0)
                                .Distinct()
                                .ToArray()
                            ?? [],
                    };
                    db.Candidates.Add(candidate);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        candidate.Id,
                        "Created",
                        new { candidate.Email, candidate.Source }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/candidates/{candidate.Id}", new { candidate.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPut(
                "/candidates/{id:guid}",
                async (
                    Guid id,
                    UpdateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    if (await db.Candidates.AnyAsync(x => x.Id != id && x.Email == email, ct))
                        return Results.Conflict(
                            new { message = "Another candidate has this email." }
                        );

                    candidate.FirstName = request.FirstName.Trim();
                    candidate.LastName = request.LastName.Trim();
                    candidate.Email = email;
                    candidate.Phone = Clean(request.Phone);
                    candidate.Location = Clean(request.Location);
                    candidate.CurrentTitle = Clean(request.CurrentTitle);
                    candidate.LinkedInUrl = Clean(request.LinkedInUrl);
                    candidate.Source = request.Source.Trim();
                    candidate.Tags =
                        request
                            .Tags?.Select(x => x.Trim().ToLowerInvariant())
                            .Where(x => x.Length > 0)
                            .Distinct()
                            .ToArray()
                        ?? [];
                    candidate.DoNotContact = request.DoNotContact;
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/candidates/{id:guid}/attachments",
                async (
                    Guid id,
                    IFormFile file,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    if (!await db.Candidates.AnyAsync(x => x.Id == id, ct))
                        return Results.NotFound();
                    try
                    {
                        var stored = await files.SaveValidatedAsync(file, ct);
                        var attachment = new Attachment
                        {
                            CandidateId = id,
                            OriginalFileName = Path.GetFileName(file.FileName),
                            StoredFileName = stored.StoredName,
                            ContentType = stored.ContentType,
                            Length = file.Length,
                            UploadedBy = principal.Email(),
                            ScanStatus = "ValidationOnly",
                        };
                        db.Attachments.Add(attachment);
                        Audit.Add(
                            db,
                            principal,
                            "Candidate",
                            id,
                            "AttachmentUploaded",
                            new
                            {
                                attachment.Id,
                                attachment.OriginalFileName,
                                attachment.Length,
                            }
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.Created(
                            $"/api/attachments/{attachment.Id}",
                            new { attachment.Id }
                        );
                    }
                    catch (InvalidDataException exception)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
            "/attachments/{id:guid}",
            async (
                Guid id,
                bool inline,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var attachment = await db
                    .Attachments.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && (canSeeAllCandidates || allowedCandidateIds.Contains(x.CandidateId)),
                        ct
                    );
                return attachment is null
                    ? Results.NotFound()
                    : Results.File(
                        files.OpenRead(attachment.StoredFileName),
                        attachment.ContentType,
                        inline ? null : attachment.OriginalFileName,
                        attachment.UploadedAt,
                        enableRangeProcessing: true
                    );
            }
        );
    }

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

    private static void MapAdministration(RouteGroupBuilder api)
    {
        api.MapGet(
                "/admin/integrations",
                async (IWorkplaceIntegration integration, AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        new
                        {
                            Provider = integration.ProviderName,
                            Enabled = integration.IsEnabled,
                            Calendar = integration.IsEnabled
                                ? "Configured"
                                : "Internal scheduling only",
                            Pending = await db.IntegrationOutbox.CountAsync(
                                x =>
                                    x.Status == IntegrationOutboxStatus.Pending
                                    || x.Status == IntegrationOutboxStatus.Processing,
                                ct
                            ),
                            Failed = await db.IntegrationOutbox.CountAsync(
                                x => x.Status == IntegrationOutboxStatus.Failed,
                                ct
                            ),
                        }
                    )
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/integrations/retry-failed",
                async (
                    ClaimsPrincipal principal,
                    IWorkplaceIntegration integration,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!integration.IsEnabled)
                        return Results.Conflict(
                            new
                            {
                                message = "Configure a workplace provider before retrying delivery.",
                            }
                        );
                    var failed = await db
                        .IntegrationOutbox.Where(x => x.Status == IntegrationOutboxStatus.Failed)
                        .ToListAsync(ct);
                    foreach (var item in failed)
                    {
                        item.Status = IntegrationOutboxStatus.Pending;
                        item.Attempts = 0;
                        item.NextAttemptAt = DateTimeOffset.UtcNow;
                        item.LockedUntil = null;
                        item.LastError = null;
                        item.CompletedAt = null;
                    }
                    var entityIds = failed.Select(x => x.EntityId).ToArray();
                    await db
                        .Interviews.Where(x => entityIds.Contains(x.Id))
                        .ExecuteUpdateAsync(
                            update =>
                                update
                                    .SetProperty(x => x.CalendarStatus, "Queued")
                                    .SetProperty(x => x.CalendarError, (string?)null),
                            ct
                        );
                    Audit.Add(
                        db,
                        principal,
                        "Integration",
                        integration.ProviderName,
                        "FailedDeliveryRetried",
                        new { Count = failed.Count }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Count = failed.Count });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/users",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Users.AsNoTracking()
                            .OrderBy(x => x.DisplayName)
                            .Select(x => new
                            {
                                x.Id,
                                x.Email,
                                x.DisplayName,
                                Role = x.Role.ToString(),
                                x.Department,
                                x.IsActive,
                                x.UpdatedAt,
                            })
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/users",
                async (
                    UpsertUserRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (
                        string.IsNullOrWhiteSpace(request.Email)
                        || string.IsNullOrWhiteSpace(request.DisplayName)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["user"] = ["Email and display name are required."],
                            }
                        );
                    var email = request.Email.Trim().ToLowerInvariant();
                    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email, ct);
                    if (user is null)
                    {
                        user = new AppUser
                        {
                            Email = email,
                            DisplayName = request.DisplayName.Trim(),
                            Role = request.Role,
                            Department = Clean(request.Department),
                            IsActive = request.IsActive,
                        };
                        db.Users.Add(user);
                        Audit.Add(
                            db,
                            principal,
                            "User",
                            user.Id,
                            "Created",
                            new { user.Email, user.Role }
                        );
                    }
                    else
                    {
                        user.DisplayName = request.DisplayName.Trim();
                        user.Role = request.Role;
                        user.Department = Clean(request.Department);
                        user.IsActive = request.IsActive;
                        user.UpdatedAt = DateTimeOffset.UtcNow;
                        Audit.Add(
                            db,
                            principal,
                            "User",
                            user.Id,
                            "Updated",
                            new { user.Role, user.IsActive }
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { user.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/audit",
                async (string? entityType, AtsDbContext db, CancellationToken ct) =>
                {
                    var query = db.AuditEvents.AsNoTracking();
                    if (!string.IsNullOrWhiteSpace(entityType))
                        query = query.Where(x => x.EntityType == entityType);
                    return Results.Ok(
                        await query.OrderByDescending(x => x.OccurredAt).Take(250).ToListAsync(ct)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    private static void MapSearch(RouteGroupBuilder api)
    {
        api.MapGet(
            "/search",
            async (string q, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
                    return Results.Ok(
                        new
                        {
                            Requisitions = Array.Empty<object>(),
                            Candidates = Array.Empty<object>(),
                        }
                    );
                var term = q.Trim().ToLower();
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var requisitions = await ScopeRequisitions(
                        db.Requisitions.AsNoTracking(),
                        principal
                    )
                    .Where(x => x.Title.ToLower().Contains(term) || x.Code.ToLower().Contains(term))
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        x.Code,
                        x.Title,
                        Type = "Requisition",
                    })
                    .ToListAsync(ct);
                var candidates = await db
                    .Candidates.AsNoTracking()
                    .Where(x =>
                        (canSeeAllCandidates || allowedCandidateIds.Contains(x.Id))
                        && (
                            x.FirstName.ToLower().Contains(term)
                            || x.LastName.ToLower().Contains(term)
                            || x.Email.ToLower().Contains(term)
                        )
                    )
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.FirstName + " " + x.LastName,
                        Email = principal.IsInRole(nameof(UserRole.Interviewer))
                            ? "Restricted"
                            : x.Email,
                        Type = "Candidate",
                    })
                    .ToListAsync(ct);
                return Results.Ok(new { Requisitions = requisitions, Candidates = candidates });
            }
        );
    }

    private static IQueryable<Requisition> ScopeRequisitions(
        IQueryable<Requisition> query,
        ClaimsPrincipal principal
    )
    {
        if (principal.IsHiringStaff())
            return query;
        var email = principal.Email();
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x => x.OwnerEmail == email || x.RecruiterEmail == email);
        return query.Where(x =>
            x.Applications.Any(a => a.Interviews.Any(i => i.InterviewerEmails.Contains(email)))
        );
    }

    private static IQueryable<Application> ScopeApplications(
        IQueryable<Application> query,
        ClaimsPrincipal principal
    )
    {
        if (principal.IsHiringStaff())
            return query;
        var email = principal.Email();
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x =>
                x.Requisition!.OwnerEmail == email || x.Requisition.RecruiterEmail == email
            );
        return query.Where(x => x.Interviews.Any(i => i.InterviewerEmails.Contains(email)));
    }

    private static bool CanManage(Requisition requisition, ClaimsPrincipal principal) =>
        principal.IsHiringStaff()
        || (
            principal.IsInRole(nameof(UserRole.HiringManager))
            && (
                requisition.OwnerEmail == principal.Email()
                || requisition.RecruiterEmail == principal.Email()
            )
        );

    private static Dictionary<string, string[]> ValidateRequisition(
        string code,
        string title,
        string department,
        string location,
        string owner,
        string recruiter,
        int openings
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(code))
            errors["code"] = ["Code is required."];
        if (string.IsNullOrWhiteSpace(title))
            errors["title"] = ["Title is required."];
        if (string.IsNullOrWhiteSpace(department))
            errors["department"] = ["Department is required."];
        if (string.IsNullOrWhiteSpace(location))
            errors["location"] = ["Location is required."];
        if (!LooksLikeEmail(owner))
            errors["ownerEmail"] = ["A valid owner email is required."];
        if (!LooksLikeEmail(recruiter))
            errors["recruiterEmail"] = ["A valid recruiter email is required."];
        if (openings < 1)
            errors["openings"] = ["At least one opening is required."];
        return errors;
    }

    private static Dictionary<string, string[]> ValidateCandidate(
        string firstName,
        string lastName,
        string email,
        string source
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(firstName))
            errors["firstName"] = ["First name is required."];
        if (string.IsNullOrWhiteSpace(lastName))
            errors["lastName"] = ["Last name is required."];
        if (!LooksLikeEmail(email))
            errors["email"] = ["A valid email is required."];
        if (string.IsNullOrWhiteSpace(source))
            errors["source"] = ["Source is required."];
        return errors;
    }

    private static bool LooksLikeEmail(string value) =>
        !string.IsNullOrWhiteSpace(value) && value.Contains('@') && value.Length <= 320;

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
