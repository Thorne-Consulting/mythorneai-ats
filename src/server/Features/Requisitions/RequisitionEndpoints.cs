using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
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
                            // What the permission rules read (`can('update', asJob(row))`).
                            x.IsConfidential,
                            Members = x.Members.Select(m => new
                            {
                                m.User!.Email,
                                Role = m.Role.ToString(),
                            }),
                            HiringManager = x
                                .Members.Where(m => m.Role == RequisitionRole.HiringManager)
                                .OrderBy(m => m.CreatedAt)
                                .Select(m => new
                                {
                                    m.UserId,
                                    m.User!.DisplayName,
                                    m.User.Email,
                                })
                                .FirstOrDefault(),
                            Recruiter = x
                                .Members.Where(m => m.Role == RequisitionRole.Recruiter)
                                .OrderBy(m => m.CreatedAt)
                                .Select(m => new
                                {
                                    m.UserId,
                                    m.User!.DisplayName,
                                    m.User.Email,
                                })
                                .FirstOrDefault(),
                            x.TargetStartDate,
                            ActiveApplications = x.Applications.Count(a =>
                                a.Status == ApplicationStatus.Active
                            ),
                            // Active candidates still in the first stage: nobody has moved them on yet.
                            NewApplications = x.Applications.Count(a =>
                                a.Status == ApplicationStatus.Active
                                && a.PipelineStage!.SortOrder
                                    == x.Stages.Min(s => (int?)s.SortOrder)
                            ),
                            Stages = x
                                .Stages.OrderBy(s => s.SortOrder)
                                .Select(s => new
                                {
                                    s.Name,
                                    Type = s.Type.ToString(),
                                    s.Color,
                                    Count = s.Applications.Count(a =>
                                        a.Status == ApplicationStatus.Active
                                    ),
                                }),
                            x.OpenedAt,
                            x.ClosedAt,
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
                        x.LocationCity,
                        x.LocationRegion,
                        x.LocationCountry,
                        x.RemoteCountries,
                        x.SalaryMin,
                        x.SalaryMax,
                        x.SalaryCurrency,
                        x.SalaryPeriod,
                        x.ShowSalary,
                        x.PostingTemplateId,
                        x.PipelineTemplateId,
                        QuestionCount = x.Questions.Count,
                        x.CreatedAt,
                        x.UpdatedAt,
                        x.OpenedAt,
                        x.ClosedAt,
                        x.StatusReason,
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
                                Type = s.Type.ToString(),
                                s.CandidateLabel,
                                EmailOnEntry = s.EmailOnEntry.ToString(),
                                s.TargetDays,
                                s.AssessmentId,
                                s.Color,
                                s.IsTerminal,
                                Count = s.Applications.Count(a =>
                                    allowedApplicationIds.Contains(a.Id)
                                    && a.Status == ApplicationStatus.Active
                                ),
                            }),
                        Members = x
                            .Members.OrderBy(m => m.Role)
                            .ThenBy(m => m.User!.DisplayName)
                            .Select(m => new
                            {
                                m.UserId,
                                m.User!.DisplayName,
                                m.User.Email,
                                Role = m.Role.ToString(),
                                UserRole = m.User.Role.ToString(),
                                m.User.IsActive,
                            }),
                        // Current kits only: frozen versions and archived kits are not offered for new interviews.
                        InterviewKits = x
                            .InterviewKits.Where(k => k.VersionOfId == null && k.ArchivedAt == null)
                            .OrderBy(k => k.SortOrder)
                            .Select(k => new
                            {
                                k.Id,
                                k.Name,
                                k.PipelineStageId,
                                k.Version,
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

        // Interview kits are created, versioned and ordered in Features/InterviewKits.

        api.MapPost(
                "/requisitions",
                async (
                    CreateRequisitionRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    // People picked in the wizard: emails for the legacy fields come from their accounts.
                    var picked = request.Members is { Length: > 0 } members
                        ? await MembersWithEmailsAsync(db, members, ct)
                        : null;
                    var owner = picked is null
                        ? request.OwnerEmail
                        : picked.FirstOrDefault(x => x.Role == RequisitionRole.HiringManager).Email;
                    var recruiter = picked is null
                        ? request.RecruiterEmail
                        : picked.FirstOrDefault(x => x.Role == RequisitionRole.Recruiter).Email
                            ?? owner;
                    var errors = ValidateRequisition(
                        request.Title,
                        request.Department,
                        request.Location,
                        owner,
                        recruiter,
                        request.Openings
                    );
                    if (picked is not null && owner is null)
                        errors["members"] = ["Choose a hiring manager."];
                    if (picked is not null && picked.Count != request.Members!.Length)
                        errors["members"] = ["Choose people who have an account, one role each."];
                    var money = await CurrencyEndpoints.PolicyAsync(db, ct);
                    ValidatePlaceAndSalary(request.Place, request.Salary, errors, money.Supported);
                    var (questionList, questionErrors) = ApplicationQuestions.Normalize(
                        request.Questions
                    );
                    foreach (var (key, value) in questionErrors)
                        errors[key] = value;
                    if (MediaEndpoints.HasImageWithoutAlt(request.Description))
                        errors["description"] = [MediaEndpoints.AltRequired];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var code = await GenerateRequisitionCodeAsync(db, ct);

                    var template = request.PostingTemplateId is null
                        ? null
                        : await db
                            .PostingTemplates.AsNoTracking()
                            .SingleOrDefaultAsync(
                                x => x.Id == request.PostingTemplateId && x.IsActive,
                                ct
                            );
                    if (request.PostingTemplateId is not null && template is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["postingTemplateId"] = ["Posting template not found."],
                            }
                        );
                    // The wizard sends the whole composed posting, so what was previewed is what is saved.
                    var description = request.Description?.Trim() is { Length: > 0 } composed
                        ? composed
                        : string.Join(
                            "\n\n",
                            new[]
                            {
                                template?.HeaderMarkdown,
                                template?.DescriptionMarkdown,
                                template?.BenefitsMarkdown,
                            }.Where(x => !string.IsNullOrWhiteSpace(x))
                        );
                    var source = request.CopyFromId is { } copyFromId
                        ? await db
                            .Requisitions.AsNoTracking()
                            .Include(x => x.Stages)
                            .Include(x => x.InterviewKits)
                                .ThenInclude(x => x.Criteria)
                            .AsSplitQuery()
                            .SingleOrDefaultAsync(x => x.Id == copyFromId, ct)
                        : null;
                    if (
                        request.CopyFromId is not null
                        && (source is null || !CanManage(source, principal))
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["copyFromId"] = ["We could not find the job to start from."],
                            }
                        );
                    var requisition = new Requisition
                    {
                        Code = code,
                        Title = request.Title!.Trim(),
                        Department = request.Department!.Trim(),
                        Location = request.Location!.Trim(),
                        EmploymentType = request.EmploymentType?.Trim() ?? "",
                        WorkMode = request.WorkMode?.Trim() ?? "",
                        Openings = request.Openings,
                        OwnerEmail = owner!.Trim().ToLowerInvariant(),
                        RecruiterEmail = recruiter!.Trim().ToLowerInvariant(),
                        Description = description,
                        PostingTemplateId = template?.Id,
                        PostingTemplateVersion = template?.Version,
                        TargetStartDate = request.TargetStartDate,
                    };
                    ApplyPlaceAndSalary(requisition, request.Place, request.Salary, money.Base);
                    // Questions sent by the wizard, else the template's defaults.
                    var questions =
                        request.Questions is not null ? questionList
                        : template is not null
                            ? ApplicationQuestions.FromJson(template.QuestionsJson)
                        : [];
                    requisition.Questions.AddRange(
                        questions.Select(
                            (q, i) => ApplicationQuestions.ToEntity(q, requisition.Id, i)
                        )
                    );
                    var pipelines = db.PipelineTemplates.AsNoTracking().Include(x => x.Stages);
                    var pipeline = request.PipelineTemplateId is null
                        ? await pipelines.FirstOrDefaultAsync(x => x.IsDefault, ct)
                        : await pipelines.SingleOrDefaultAsync(
                            x => x.Id == request.PipelineTemplateId,
                            ct
                        );
                    if (request.PipelineTemplateId is not null && pipeline is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["pipelineTemplateId"] = ["Pipeline not found."],
                            }
                        );
                    if (source is not null)
                    {
                        // Starting from a job: its stages and interview kits, as Duplicate copies them.
                        var copy = DuplicateRequisition(source, code);
                        requisition.PipelineTemplateId = source.PipelineTemplateId;
                        requisition.Stages.AddRange(
                            copy.Stages.Select(stage =>
                            {
                                stage.RequisitionId = requisition.Id;
                                return stage;
                            })
                        );
                        requisition.InterviewKits.AddRange(
                            copy.InterviewKits.Select(kit =>
                            {
                                kit.RequisitionId = requisition.Id;
                                return kit;
                            })
                        );
                    }
                    else
                    {
                        requisition.PipelineTemplateId = pipeline?.Id;
                        requisition.Stages.AddRange(
                            StageRules.FromTemplate(
                                requisition.Id,
                                pipeline?.Stages is { Count: > 0 } stages
                                    ? stages
                                    : StageRules.DefaultTemplate()
                            )
                        );
                    }
                    if (picked is not null)
                    {
                        requisition.Members.AddRange(
                            picked.Select(x => new RequisitionMember
                            {
                                RequisitionId = requisition.Id,
                                UserId = x.UserId,
                                Role = x.Role,
                            })
                        );
                        RequisitionTeam.Mirror(
                            requisition,
                            [.. picked.Select(x => (x.Role, x.Email!))]
                        );
                    }
                    else
                        requisition.Members.AddRange(
                            RequisitionTeam.FromEmails(
                                requisition,
                                await RequisitionTeam.UserIdsByEmailAsync(db, ct)
                            )
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
                    // The wizard's saved form is done with once the job exists.
                    if (request.DraftId is { } draftId)
                        db.JobDrafts.RemoveRange(
                            await db
                                .JobDrafts.Where(x =>
                                    x.Id == draftId && x.OwnerEmail == principal.Email()
                                )
                                .ToListAsync(ct)
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
                    var money = await CurrencyEndpoints.PolicyAsync(db, ct);
                    ValidatePlaceAndSalary(request.Place, request.Salary, errors, money.Supported);
                    if (MediaEndpoints.HasImageWithoutAlt(request.Description))
                        errors["description"] = [MediaEndpoints.AltRequired];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    // Left out (older callers), the place and pay stay as they are.
                    ApplyPlaceAndSalary(requisition, request.Place, request.Salary, money.Base);
                    requisition.Title = request.Title!.Trim();
                    requisition.Department = request.Department!.Trim();
                    requisition.Location = request.Location!.Trim();
                    requisition.EmploymentType = request.EmploymentType?.Trim() ?? "";
                    requisition.WorkMode = request.WorkMode?.Trim() ?? "";
                    requisition.Openings = request.Openings;
                    // The team lives in members now; a changed address here swaps that member.
                    var owner = request.OwnerEmail!.Trim().ToLowerInvariant();
                    var recruiter = request.RecruiterEmail!.Trim().ToLowerInvariant();
                    await RequisitionTeam.ReplaceAsync(
                        db,
                        id,
                        RequisitionRole.HiringManager,
                        requisition.OwnerEmail,
                        owner,
                        ct
                    );
                    await RequisitionTeam.ReplaceAsync(
                        db,
                        id,
                        RequisitionRole.Recruiter,
                        requisition.RecruiterEmail,
                        recruiter,
                        ct
                    );
                    requisition.OwnerEmail = owner;
                    requisition.RecruiterEmail = recruiter;
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
                    var reason = Clean(request.Reason);
                    var closing = IsClosedStatus(request.Status);
                    if (
                        reason is null
                        && request.Status
                            is RequisitionStatus.OnHold
                                or RequisitionStatus.Closed
                                or RequisitionStatus.Cancelled
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["reason"] = ["Say why the job is on hold, closed or cancelled."],
                            }
                        );
                    if (
                        request.RejectActive is { } reject
                        && (!closing || string.IsNullOrWhiteSpace(reject.Reason))
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["rejectActive"] =
                                [
                                    "Candidates can be rejected only when the job closes, and they need a reason.",
                                ],
                            }
                        );
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
                    var now = DateTimeOffset.UtcNow;
                    if (request.Status == RequisitionStatus.Open)
                        requisition.OpenedAt ??= now;
                    requisition.Status = request.Status;
                    requisition.StatusReason = request.Status
                        is RequisitionStatus.Open
                            or RequisitionStatus.Draft
                        ? null
                        : reason;
                    // Moving between closed statuses keeps the first close date.
                    requisition.ClosedAt = closing ? requisition.ClosedAt ?? now : null;
                    requisition.UpdatedAt = now;

                    var rejected = 0;
                    if (closing && request.RejectActive is { } rejectActive)
                    {
                        var active = await db
                            .Applications.Include(x => x.Candidate)
                            .Where(x =>
                                x.RequisitionId == id && x.Status == ApplicationStatus.Active
                            )
                            .ToListAsync(ct);
                        var dispositionReason = rejectActive.Reason.Trim();
                        foreach (var application in active)
                        {
                            var fromStatus = application.Status;
                            application.Status = ApplicationStatus.Rejected;
                            application.DispositionReason = dispositionReason;
                            application.LastActivityAt = now;
                            if (rejectActive.SendEmail)
                                await EmailTemplates.QueueAsync(
                                    db,
                                    "rejection",
                                    id,
                                    application.Candidate!.Email,
                                    new Dictionary<string, string>
                                    {
                                        ["firstName"] = application.Candidate.FirstName,
                                        ["jobTitle"] = requisition.Title,
                                    },
                                    application.Id,
                                    ct
                                );
                            await PipelineEvents.OnMovedAsync(
                                db,
                                application,
                                application.PipelineStageId,
                                fromStatus,
                                principal.Email(),
                                ct
                            );
                            Audit.Add(
                                db,
                                principal,
                                "Application",
                                application.Id,
                                "RejectedWhenJobClosed",
                                new { Reason = dispositionReason, Emailed = rejectActive.SendEmail }
                            );
                        }
                        rejected = active.Count;
                    }

                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "StatusChanged",
                        new
                        {
                            From = oldStatus.ToString(),
                            To = request.Status.ToString(),
                            Reason = reason,
                            Rejected = rejected,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Rejected = rejected });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Who changed the job's status, when and why, newest first (from the activity history).
        api.MapGet(
            "/requisitions/{id:guid}/status-history",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (
                    !await ScopeRequisitions(db.Requisitions, principal)
                        .AnyAsync(x => x.Id == id, ct)
                )
                    return Results.NotFound();
                var key = id.ToString();
                var rows = await db
                    .AuditEvents.AsNoTracking()
                    .Where(x =>
                        x.EntityType == "Requisition"
                        && x.EntityId == key
                        && (x.Action == "Created" || x.Action == "StatusChanged")
                    )
                    .OrderByDescending(x => x.OccurredAt)
                    .Take(50)
                    .ToListAsync(ct);
                var actors = rows.Select(x => x.ActorEmail).Distinct().ToArray();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(u => actors.Contains(u.Email))
                    .ToDictionaryAsync(
                        u => u.Email,
                        u => u.DisplayName,
                        StringComparer.OrdinalIgnoreCase,
                        ct
                    );
                return Results.Ok(
                    rows.Select(row =>
                        ReadStatusChange(row, names.GetValueOrDefault(row.ActorEmail))
                    )
                );
            }
        );

        // A new draft with the same posting, requirements, stages, kits, team and settings.
        api.MapPost(
                "/requisitions/{id:guid}/duplicate",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var source = await db
                        .Requisitions.AsNoTracking()
                        .Include(x => x.Stages)
                        .Include(x => x.Members)
                        .Include(x => x.Questions)
                        .Include(x => x.InterviewKits)
                            .ThenInclude(x => x.Criteria)
                        .AsSplitQuery()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (source is null || !CanManage(source, principal))
                        return Results.NotFound();
                    var copy = DuplicateRequisition(
                        source,
                        await GenerateRequisitionCodeAsync(db, ct)
                    );
                    db.Requisitions.Add(copy);
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        copy.Id,
                        "Created",
                        new
                        {
                            copy.Code,
                            copy.Title,
                            DuplicatedFrom = source.Code,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/requisitions/{copy.Id}", new { copy.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/requisitions/{id:guid}/board",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var now = DateTimeOffset.UtcNow;
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
                                s.IsTerminal,
                                Type = s.Type.ToString(),
                                s.CandidateLabel,
                                EmailOnEntry = s.EmailOnEntry.ToString(),
                                s.TargetDays,
                                s.AssessmentId,
                                AssessmentName = db
                                    .Assessments.Where(t => t.Id == s.AssessmentId)
                                    .Select(t => t.Name)
                                    .FirstOrDefault(),
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
                                        // The last real move into this stage (a reopen in place does not reset it).
                                        EnteredStageAt = db.StageTransitions.Where(t =>
                                                t.ApplicationId == a.Id
                                                && t.ToStageId == a.PipelineStageId
                                                && (
                                                    t.FromStageId == null
                                                    || t.FromStageId != t.ToStageId
                                                )
                                            )
                                            .Max(t => (DateTimeOffset?)t.OccurredAt)
                                            ?? a.AppliedAt,
                                        // Scorecards still missing from interviews that have happened.
                                        FeedbackOwed = a
                                            .Interviews.Where(i =>
                                                i.Status == InterviewStatus.Completed
                                                || (
                                                    i.Status == InterviewStatus.Scheduled
                                                    && i.EndsAt < now
                                                )
                                            )
                                            .Sum(i =>
                                                i.InterviewerEmails.Length - i.Scorecards.Count
                                            ),
                                        a.Candidate.DoNotContact,
                                        // A knockout answer, for the flag on the card.
                                        Flagged = db.ApplicationAnswers.Any(x =>
                                            x.ApplicationId == a.Id && x.Flagged
                                        ),
                                        // The latest submitted attempt at any assessment, for the score badge.
                                        Assessment = db
                                            .AssessmentInvites.Where(i =>
                                                i.ApplicationId == a.Id
                                                && i.ReplacedAt == null
                                                && i.Status == AssessmentInviteStatus.Submitted
                                            )
                                            .OrderByDescending(i => i.SubmittedAt)
                                            .Select(i => new
                                            {
                                                i.Id,
                                                i.Assessment!.Name,
                                                i.Percent,
                                                Decision = i.Decision == AssessmentDecision.Passed
                                                    ? "Passed"
                                                : i.Decision == AssessmentDecision.Failed ? "Failed"
                                                : null,
                                                i.PendingCount,
                                            })
                                            .FirstOrDefault(),
                                        a.Candidate.FirstName,
                                        a.Candidate.Email,
                                        YearsExperience = a.Candidate.ResumeYearsExperience,
                                        Skills = a.Candidate.ResumeSkills,
                                        a.Candidate.Tags,
                                        // The AI fit check of this job, when it was run.
                                        FitScore = db
                                            .JobFits.Where(f =>
                                                f.RequisitionId == a.RequisitionId
                                                && f.CandidateId == a.CandidateId
                                            )
                                            .Select(f => (int?)f.Score)
                                            .FirstOrDefault(),
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

        // Rejected and withdrawn people, for the board's archived lane and the list filter.
        api.MapGet(
            "/requisitions/{id:guid}/archived",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (
                    !await ScopeRequisitions(db.Requisitions, principal)
                        .AnyAsync(x => x.Id == id, ct)
                )
                    return Results.NotFound();
                return Results.Ok(
                    await ScopeApplications(db.Applications.AsNoTracking(), principal)
                        .Where(a =>
                            a.RequisitionId == id
                            && (
                                a.Status == ApplicationStatus.Rejected
                                || a.Status == ApplicationStatus.Withdrawn
                            )
                        )
                        .OrderByDescending(a => a.LastActivityAt)
                        .Take(500)
                        .Select(a => new
                        {
                            a.Id,
                            a.CandidateId,
                            CandidateName = a.Candidate!.FirstName + " " + a.Candidate.LastName,
                            a.Candidate.CurrentTitle,
                            a.Source,
                            Status = a.Status.ToString(),
                            a.DispositionReason,
                            StageId = a.PipelineStageId,
                            StageName = a.PipelineStage!.Name,
                            a.LastActivityAt,
                        })
                        .ToListAsync(ct)
                );
            }
        );

        MapRequisitionStages(api);
        MapRequisitionTeam(api);
        MapPipelineTemplates(api);
        MapRequisitionStats(api);
        MapApplicationQuestions(api);
        MapJobDrafts(api);

        // Team and location values other jobs use, so the wizard and settings suggest one spelling.
        api.MapGet(
                "/requisitions/values",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var rows = await db
                        .Requisitions.AsNoTracking()
                        .IgnoreAutoIncludes()
                        .Select(x => new
                        {
                            x.Department,
                            x.Location,
                            x.LocationCity,
                            x.LocationRegion,
                            x.LocationCountry,
                            x.WorkMode,
                        })
                        .ToListAsync(ct);
                    // The wizard offers "Open it now" or "Send for approval" from this.
                    var approvalRequired = await db
                        .Organizations.Select(x => x.RequireRequisitionApproval)
                        .FirstOrDefaultAsync(ct);
                    // The catalog seed's pick-lists, ahead of the values jobs already use.
                    var picks = await db
                        .PickListItems.AsNoTracking()
                        .OrderBy(x => x.SortOrder)
                        .ToListAsync(ct);
                    string[] Picks(string kind) =>
                        picks.Where(x => x.Kind == kind).Select(x => x.Value).ToArray();
                    var employmentTypes = Picks(CatalogSeed.EmploymentType);
                    return Results.Ok(
                        new
                        {
                            ApprovalRequired = approvalRequired,
                            Departments = Picks(CatalogSeed.Department)
                                .Concat(rows.Select(x => x.Department.Trim()))
                                .Where(x => x.Length > 0)
                                .Distinct(StringComparer.OrdinalIgnoreCase)
                                .Order(),
                            EmploymentTypes = employmentTypes.Length > 0
                                ? employmentTypes
                                : ["Full time", "Part time", "Contract", "Internship", "Temporary"],
                            Locations = rows.Where(x => x.Location.Trim().Length > 0)
                                .GroupBy(x => x.Location.Trim(), StringComparer.OrdinalIgnoreCase)
                                // The most complete spelling of each place.
                                .Select(g =>
                                    g.OrderByDescending(x => x.LocationCountry != null)
                                        .ThenByDescending(x => x.LocationCity != null)
                                        .First()
                                )
                                .OrderBy(x => x.Location)
                                .Select(x => new
                                {
                                    Location = x.Location.Trim(),
                                    City = x.LocationCity,
                                    Region = x.LocationRegion,
                                    Country = x.LocationCountry,
                                }),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static async Task<
        List<(Guid UserId, RequisitionRole Role, string? Email)>
    > MembersWithEmailsAsync(AtsDbContext db, MemberInput[] members, CancellationToken ct)
    {
        var ids = members.Select(x => x.UserId).Distinct().ToArray();
        var emails = await db
            .Users.AsNoTracking()
            .Where(x => ids.Contains(x.Id) && x.IsActive)
            .ToDictionaryAsync(x => x.Id, x => x.Email, ct);
        return
        [
            .. members
                .Where(x => emails.ContainsKey(x.UserId) && Enum.IsDefined(x.Role))
                .DistinctBy(x => x.UserId)
                .Select(x => (x.UserId, x.Role, (string?)emails[x.UserId])),
        ];
    }

    private static readonly string[] SalaryPeriods = ["Year", "Month", "Hour"];

    private static void ValidatePlaceAndSalary(
        PlaceInput? place,
        SalaryInput? salary,
        Dictionary<string, string[]> errors,
        HashSet<string> supportedCurrencies
    )
    {
        if (place is not null)
        {
            if ((place.City?.Trim().Length ?? 0) > 120 || (place.Region?.Trim().Length ?? 0) > 120)
                errors["place"] = ["Keep the city and region under 120 characters."];
            static bool Iso(string? code) =>
                string.IsNullOrWhiteSpace(code)
                || (code.Trim().Length == 2 && code.Trim().All(char.IsAsciiLetter));
            if (!Iso(place.Country) || (place.RemoteCountries ?? []).Any(x => !Iso(x)))
                errors["place.country"] = ["Choose a country from the list."];
        }
        if (salary is not null)
        {
            if (salary.Min is < 0 or > 100_000_000 || salary.Max is < 0 or > 100_000_000)
                errors["salary"] = ["Enter amounts of 0 or more."];
            else if (salary.Min > salary.Max)
                errors["salary"] = ["The lowest pay should not be more than the highest."];
            if (
                salary.Currency is { } currency
                && (
                    !Currencies.LooksLikeCode(currency.Trim())
                    || !supportedCurrencies.Contains(currency.Trim())
                )
            )
                errors["salary.currency"] =
                [
                    "Choose one of the supported currencies (Settings, then Currencies).",
                ];
            if (
                salary.Period is { } period
                && !SalaryPeriods.Contains(period, StringComparer.OrdinalIgnoreCase)
            )
                errors["salary.period"] = ["Choose year, month or hour."];
            if (salary.Show && salary.Min is null && salary.Max is null)
                errors["salary"] = ["Enter the pay range to show it on the posting."];
        }
    }

    private static void ApplyPlaceAndSalary(
        Requisition requisition,
        PlaceInput? place,
        SalaryInput? salary,
        string baseCurrency
    )
    {
        if (requisition.SalaryCurrency.Length == 0)
            requisition.SalaryCurrency = baseCurrency;
        if (place is not null)
        {
            requisition.LocationCity = Clean(place.City);
            requisition.LocationRegion = Clean(place.Region);
            requisition.LocationCountry = Clean(place.Country)?.ToUpperInvariant();
            requisition.RemoteCountries =
            [
                .. (place.RemoteCountries ?? [])
                    .Select(x => x.Trim().ToUpperInvariant())
                    .Where(x => x.Length == 2)
                    .Distinct(),
            ];
        }
        if (salary is not null)
        {
            requisition.SalaryMin = salary.Min;
            requisition.SalaryMax = salary.Max;
            requisition.SalaryCurrency = Clean(salary.Currency)?.ToUpperInvariant() ?? baseCurrency;
            requisition.SalaryPeriod =
                SalaryPeriods.FirstOrDefault(x =>
                    x.Equals(salary.Period, StringComparison.OrdinalIgnoreCase)
                ) ?? requisition.SalaryPeriod;
            requisition.ShowSalary = salary.Show && (salary.Min ?? salary.Max) is not null;
        }
    }

    private static bool IsClosedStatus(RequisitionStatus status) =>
        status
            is RequisitionStatus.Filled
                or RequisitionStatus.Closed
                or RequisitionStatus.Cancelled;

    // Older rows stored the statuses as numbers; newer ones as names.
    private static object ReadStatusChange(AuditEvent row, string? actorName)
    {
        string? Status(JsonElement details, string name) =>
            details.TryGetProperty(name, out var value)
                ? value.ValueKind == JsonValueKind.Number
                    ? ((RequisitionStatus)value.GetInt32()).ToString()
                    : value.GetString()
                : null;
        using var json = JsonDocument.Parse(row.Details ?? "{}");
        var details = json.RootElement;
        return new
        {
            row.OccurredAt,
            row.ActorEmail,
            ActorName = actorName,
            From = row.Action == "Created" ? null : Status(details, "From"),
            To = row.Action == "Created" ? "Draft" : Status(details, "To"),
            Reason = details.TryGetProperty("Reason", out var reason) ? reason.GetString() : null,
            Rejected = details.TryGetProperty("Rejected", out var rejected)
                ? rejected.GetInt32()
                : 0,
            DuplicatedFrom = details.TryGetProperty("DuplicatedFrom", out var from)
                ? from.GetString()
                : null,
        };
    }

    private static Requisition DuplicateRequisition(Requisition source, string code)
    {
        var copy = new Requisition
        {
            Code = code,
            Title = $"{source.Title} (copy)",
            Department = source.Department,
            Location = source.Location,
            EmploymentType = source.EmploymentType,
            WorkMode = source.WorkMode,
            Openings = source.Openings,
            OwnerEmail = source.OwnerEmail,
            RecruiterEmail = source.RecruiterEmail,
            Description = source.Description,
            LocationCity = source.LocationCity,
            LocationRegion = source.LocationRegion,
            LocationCountry = source.LocationCountry,
            RemoteCountries = [.. source.RemoteCountries],
            SalaryMin = source.SalaryMin,
            SalaryMax = source.SalaryMax,
            SalaryCurrency = source.SalaryCurrency,
            SalaryPeriod = source.SalaryPeriod,
            ShowSalary = source.ShowSalary,
            RequirementsJson = source.RequirementsJson,
            RequirementsEmbedding = source.RequirementsEmbedding,
            IsConfidential = source.IsConfidential,
            ViewerEmails = [.. source.ViewerEmails],
            AllowCandidateReschedule = source.AllowCandidateReschedule,
            AllowCandidateWithdraw = source.AllowCandidateWithdraw,
            PostingTemplateId = source.PostingTemplateId,
            PostingTemplateVersion = source.PostingTemplateVersion,
            PipelineTemplateId = source.PipelineTemplateId,
            TargetStartDate = source.TargetStartDate,
        };
        copy.Stages.AddRange(
            source.Stages.Select(stage => new PipelineStage
            {
                RequisitionId = copy.Id,
                Name = stage.Name,
                SortOrder = stage.SortOrder,
                Type = stage.Type,
                CandidateLabel = stage.CandidateLabel,
                EmailOnEntry = stage.EmailOnEntry,
                TargetDays = stage.TargetDays,
                Color = stage.Color,
                IsTerminal = stage.IsTerminal,
                AssessmentId = stage.AssessmentId,
            })
        );
        copy.Questions.AddRange(
            source.Questions.Select(q => new ApplicationQuestion
            {
                RequisitionId = copy.Id,
                Type = q.Type,
                Label = q.Label,
                HelpText = q.HelpText,
                Required = q.Required,
                Options = [.. q.Options],
                KnockoutAnswers = [.. q.KnockoutAnswers],
                SortOrder = q.SortOrder,
                BankQuestionId = q.BankQuestionId,
            })
        );
        copy.Members.AddRange(
            source.Members.Select(member => new RequisitionMember
            {
                RequisitionId = copy.Id,
                UserId = member.UserId,
                Role = member.Role,
            })
        );
        copy.InterviewKits.AddRange(
            source
                .InterviewKits.Where(kit => kit.VersionOfId == null && kit.ArchivedAt == null)
                .Select(kit => new InterviewKit
                {
                    RequisitionId = copy.Id,
                    Name = kit.Name,
                    Instructions = kit.Instructions,
                    DurationMinutes = kit.DurationMinutes,
                    SortOrder = kit.SortOrder,
                    Criteria = kit
                        .Criteria.Select(criterion => new InterviewCriterion
                        {
                            Name = criterion.Name,
                            Question = criterion.Question,
                            Description = criterion.Description,
                            Weight = criterion.Weight,
                            SortOrder = criterion.SortOrder,
                        })
                        .ToList(),
                })
        );
        return copy;
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
