using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record CreateOfferRequest(string? Note);

public sealed record SubmitApprovalRequest(string[]? Approvers, bool? Sequential);

public sealed record DecideApprovalRequest(ApprovalDecision Decision, string? Comment);

public static partial class AtsEndpoints
{
    private const string OfferSubject = "Offer";
    private const string RequisitionSubject = "Requisition";

    private static void MapOffers(RouteGroupBuilder api)
    {
        api.MapGet(
            "/applications/{id:guid}/offer",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var application = await db
                    .Applications.AsNoTracking()
                    .Include(x => x.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (application?.Requisition is null)
                    return Results.NotFound();
                var offer = await db
                    .Offers.AsNoTracking()
                    .Where(x => x.ApplicationId == id)
                    .OrderByDescending(x => x.CreatedAt)
                    .FirstOrDefaultAsync(ct);
                var me = principal.Email();
                var approvals =
                    offer is null ? [] : await LoadApprovalsAsync(db, OfferSubject, offer.Id, ct);
                if (
                    !CanManage(application.Requisition, principal)
                    && !approvals.Any(x => x.ApproverEmail == me)
                )
                    return Results.NotFound();
                var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                return Results.Ok(
                    new
                    {
                        Offer = offer is null
                            ? null
                            : new
                            {
                                offer.Id,
                                Status = offer.Status.ToString(),
                                offer.Note,
                                offer.CreatedBy,
                                offer.CreatedAt,
                                offer.SentAt,
                            },
                        Approvals = await ApprovalViewsAsync(db, approvals, me, ct),
                        ApprovalRequired = organization?.RequireOfferApproval ?? true,
                        DefaultApprovers = organization?.DefaultApproverEmails ?? [],
                        Sequential = organization?.ApprovalsSequential ?? false,
                    }
                );
            }
        );

        api.MapPost(
                "/applications/{id:guid}/offer",
                async (
                    Guid id,
                    CreateOfferRequest request,
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
                    if (application.Status != ApplicationStatus.Active)
                        return Results.Conflict(
                            new { message = "Only an active application can be accepted." }
                        );
                    if (
                        await db.Offers.AnyAsync(
                            x =>
                                x.ApplicationId == id
                                && (
                                    x.Status == OfferStatus.Draft
                                    || x.Status == OfferStatus.PendingApproval
                                    || x.Status == OfferStatus.Approved
                                ),
                            ct
                        )
                    )
                        return Results.Conflict(
                            new { message = "This application already has an open acceptance." }
                        );
                    var offer = new Offer
                    {
                        ApplicationId = id,
                        Note = request.Note?.Trim() ?? "",
                        CreatedBy = principal.Email(),
                    };
                    db.Offers.Add(offer);
                    Audit.Add(db, principal, "Application", id, "OfferDrafted", new { offer.Id });
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/offers/{offer.Id}", new { offer.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/offers/{id:guid}",
                async (
                    Guid id,
                    CreateOfferRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Draft)
                        return Results.Conflict(new { message = "Only a draft can be edited." });
                    offer.Note = request.Note?.Trim() ?? "";
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/offers/{id:guid}/submit",
                async (
                    Guid id,
                    SubmitApprovalRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Draft)
                        return Results.Conflict(
                            new { message = "Only a draft can be submitted." }
                        );
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    var required = organization?.RequireOfferApproval ?? true;
                    var approvers = await ResolveApproversAsync(db, principal, organization, request, required, ct);
                    if (approvers.Error is not null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["approvers"] = [approvers.Error] }
                        );
                    var candidate = offer.Application!.Candidate!;
                    var label =
                        $"accept {candidate.FirstName} {candidate.LastName} for {offer.Application.Requisition!.Title}";
                    if (approvers.Emails.Length == 0)
                    {
                        offer.Status = OfferStatus.Approved;
                    }
                    else
                    {
                        offer.Status = OfferStatus.PendingApproval;
                        db.Approvals.RemoveRange(
                            db.Approvals.Where(x => x.SubjectType == OfferSubject && x.SubjectId == offer.Id)
                        );
                        var rows = AddApprovals(db, OfferSubject, offer.Id, approvers, principal.Email());
                        await NotifyEligibleApproversAsync(db, rows, label, principal.Email(), ct);
                    }
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        offer.ApplicationId,
                        "OfferSubmitted",
                        new { offer.Id, approvers = approvers.Emails }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/offers/{id:guid}/send",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Approved)
                        return Results.Conflict(
                            new { message = "The acceptance has to be approved before it is sent." }
                        );
                    var application = offer.Application!;
                    var requisition = application.Requisition!;
                    if (application.Status != ApplicationStatus.Active)
                        return Results.Conflict(
                            new { message = "Only an active application can be accepted." }
                        );
                    if (application.Candidate!.DoNotContact)
                        return Results.Conflict(
                            new { message = "This candidate is marked do not contact." }
                        );
                    var hiredStage = await FindHiredStageAsync(db, requisition.Id, ct);
                    if (hiredStage is null)
                        return Results.Conflict(new { message = "This job has no Hired stage." });

                    var fromStage = application.PipelineStageId;
                    var fromStatus = application.Status;
                    offer.PreviousStageId = fromStage;
                    offer.PreviousStatus = fromStatus;
                    application.PipelineStageId = hiredStage.Id;
                    application.Status = ApplicationStatus.Hired;
                    application.DispositionReason = null;
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    offer.Status = OfferStatus.Sent;
                    offer.SentAt = DateTimeOffset.UtcNow;
                    offer.UpdatedAt = offer.SentAt.Value;
                    await EmailTemplates.QueueAsync(
                        db,
                        "acceptance",
                        requisition.Id,
                        application.Candidate.Email,
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
                        fromStage,
                        fromStatus,
                        principal.Email(),
                        ct
                    );
                    await PipelineEvents.NotifyAsync(
                        db,
                        $"{application.Candidate.FirstName} {application.Candidate.LastName} was accepted for {requisition.Title}.",
                        ct
                    );
                    Audit.Add(db, principal, "Application", application.Id, "AcceptanceSent", new { offer.Id });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/offers/{id:guid}/withdraw",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status is OfferStatus.Sent or OfferStatus.Withdrawn)
                        return Results.Conflict(
                            new { message = "This acceptance can no longer be withdrawn." }
                        );
                    offer.Status = OfferStatus.Withdrawn;
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Application", offer.ApplicationId, "OfferWithdrawn", new { offer.Id });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The email can't be unsent, so this only restores the pipeline when the candidate falls through.
        api.MapPost(
                "/offers/{id:guid}/reverse",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Sent || offer.PreviousStageId is null)
                        return Results.Conflict(
                            new { message = "Only a sent acceptance can be reversed." }
                        );
                    var application = offer.Application!;
                    var fromStage = application.PipelineStageId;
                    var fromStatus = application.Status;
                    application.PipelineStageId = offer.PreviousStageId.Value;
                    application.Status = offer.PreviousStatus ?? ApplicationStatus.Active;
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    offer.Status = OfferStatus.Withdrawn;
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    var requisition = application.Requisition!;
                    if (requisition.Status == RequisitionStatus.Filled)
                    {
                        requisition.Status = RequisitionStatus.Open;
                        requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                    PipelineEvents.RecordMove(db, application, fromStage, fromStatus, principal.Email());
                    await PipelineEvents.PublishApplicationAsync(
                        db,
                        "application.stage_changed",
                        application,
                        ct
                    );
                    Audit.Add(db, principal, "Application", application.Id, "AcceptanceReversed", new { offer.Id });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/requisitions/{id:guid}/submit-for-approval",
                async (
                    Guid id,
                    SubmitApprovalRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.Status != RequisitionStatus.Draft)
                        return Results.Conflict(
                            new { message = "Only a draft job can be submitted for approval." }
                        );
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    var approvers = await ResolveApproversAsync(db, principal, organization, request, true, ct);
                    if (approvers.Error is not null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["approvers"] = [approvers.Error] }
                        );
                    requisition.Status = RequisitionStatus.PendingApproval;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    db.Approvals.RemoveRange(
                        db.Approvals.Where(x => x.SubjectType == RequisitionSubject && x.SubjectId == id)
                    );
                    var rows = AddApprovals(db, RequisitionSubject, requisition.Id, approvers, principal.Email());
                    await NotifyEligibleApproversAsync(
                        db,
                        rows,
                        $"open the job {requisition.Title} ({requisition.Code})",
                        principal.Email(),
                        ct
                    );
                    Audit.Add(db, principal, "Requisition", id, "SubmittedForApproval", new { approvers = approvers.Emails });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/requisitions/{id:guid}/approval",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var requisition = await db
                    .Requisitions.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (requisition is null || !CanManage(requisition, principal))
                    return Results.NotFound();
                var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                var approvals = await LoadApprovalsAsync(db, RequisitionSubject, id, ct);
                return Results.Ok(
                    new
                    {
                        Required = organization?.RequireRequisitionApproval ?? false,
                        DefaultApprovers = organization?.DefaultApproverEmails ?? [],
                        Sequential = organization?.ApprovalsSequential ?? false,
                        Approvals = await ApprovalViewsAsync(db, approvals, principal.Email(), ct),
                    }
                );
            }
        );

        api.MapGet(
            "/approvals/mine",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var mine = await db
                    .Approvals.AsNoTracking()
                    .Where(x => x.ApproverEmail == me && x.Decision == ApprovalDecision.Pending)
                    .OrderBy(x => x.CreatedAt)
                    .ToListAsync(ct);
                var requesters = mine.Select(x => x.RequestedBy).Distinct().ToArray();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(x => requesters.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                var items = new List<object>();
                foreach (var approval in mine)
                {
                    var all = await LoadApprovalsAsync(db, approval.SubjectType, approval.SubjectId, ct);
                    if (!CanDecide(all, approval))
                        continue;
                    if (approval.SubjectType == OfferSubject)
                    {
                        var offer = await db
                            .Offers.AsNoTracking()
                            .Where(x => x.Id == approval.SubjectId)
                            .Select(x => new
                            {
                                x.ApplicationId,
                                x.Note,
                                Candidate = x.Application!.Candidate!.FirstName + " " + x.Application.Candidate.LastName,
                                Job = x.Application.Requisition!.Title,
                                Code = x.Application.Requisition.Code,
                            })
                            .SingleOrDefaultAsync(ct);
                        if (offer is null)
                            continue;
                        items.Add(
                            new
                            {
                                approval.Id,
                                Type = OfferSubject,
                                Title = $"Accept {offer.Candidate}",
                                Detail = $"{offer.Job} ({offer.Code})",
                                offer.Note,
                                offer.ApplicationId,
                                RequisitionId = (Guid?)null,
                                approval.RequestedBy,
                                RequestedByName = names.GetValueOrDefault(approval.RequestedBy, approval.RequestedBy),
                                approval.CreatedAt,
                            }
                        );
                    }
                    else
                    {
                        var requisition = await db
                            .Requisitions.AsNoTracking()
                            .Where(x => x.Id == approval.SubjectId)
                            .Select(x => new { x.Title, x.Code, x.Department, x.Openings })
                            .SingleOrDefaultAsync(ct);
                        if (requisition is null)
                            continue;
                        items.Add(
                            new
                            {
                                approval.Id,
                                Type = RequisitionSubject,
                                Title = $"Open {requisition.Title}",
                                Detail = $"{requisition.Code} · {requisition.Department} · {requisition.Openings} opening(s)",
                                Note = "",
                                ApplicationId = (Guid?)null,
                                RequisitionId = (Guid?)approval.SubjectId,
                                approval.RequestedBy,
                                RequestedByName = names.GetValueOrDefault(approval.RequestedBy, approval.RequestedBy),
                                approval.CreatedAt,
                            }
                        );
                    }
                }
                return Results.Ok(items);
            }
        );

        api.MapPost(
            "/approvals/{id:guid}/decide",
            async (
                Guid id,
                DecideApprovalRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (request.Decision == ApprovalDecision.Pending)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["decision"] = ["Approve or reject."] }
                    );
                if (request.Decision == ApprovalDecision.Rejected && string.IsNullOrWhiteSpace(request.Comment))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["comment"] = ["Say why you're rejecting this."] }
                    );
                var approval = await db.Approvals.SingleOrDefaultAsync(
                    x => x.Id == id && x.ApproverEmail == principal.Email(),
                    ct
                );
                if (approval is null)
                    return Results.NotFound();
                if (string.Equals(approval.ApproverEmail, approval.RequestedBy, StringComparison.OrdinalIgnoreCase))
                    return Results.Conflict(new { message = "You can't approve something you asked for yourself." });
                var all = await db
                    .Approvals.Where(x => x.SubjectType == approval.SubjectType && x.SubjectId == approval.SubjectId)
                    .ToListAsync(ct);
                if (!CanDecide(all, approval))
                    return Results.Conflict(
                        new { message = "This isn't waiting on you right now." }
                    );
                approval.Decision = request.Decision;
                approval.Comment = request.Comment?.Trim();
                approval.DecidedAt = DateTimeOffset.UtcNow;
                var message = await ApplyDecisionAsync(db, all, approval, principal, ct);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { message });
            }
        );
    }

    private static bool CanDecide(IReadOnlyCollection<Approval> all, Approval mine) =>
        mine.Decision == ApprovalDecision.Pending
        && all.Where(x => x.Sequence < mine.Sequence).All(x => x.Decision == ApprovalDecision.Approved);

    private static async Task<List<Approval>> LoadApprovalsAsync(
        AtsDbContext db,
        string subjectType,
        Guid subjectId,
        CancellationToken ct
    ) =>
        await db
            .Approvals.AsNoTracking()
            .Where(x => x.SubjectType == subjectType && x.SubjectId == subjectId)
            .OrderBy(x => x.Sequence)
            .ThenBy(x => x.CreatedAt)
            .ToListAsync(ct);

    private static async Task<object[]> ApprovalViewsAsync(
        AtsDbContext db,
        List<Approval> approvals,
        string me,
        CancellationToken ct
    )
    {
        var emails = approvals.Select(x => x.ApproverEmail).Distinct().ToArray();
        var names = await db
            .Users.AsNoTracking()
            .Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        return approvals
            .Select(x =>
                (object)
                    new
                    {
                        x.Id,
                        x.ApproverEmail,
                        ApproverName = names.GetValueOrDefault(x.ApproverEmail, x.ApproverEmail),
                        x.Sequence,
                        Decision = x.Decision.ToString(),
                        x.Comment,
                        x.DecidedAt,
                        CanDecide = x.ApproverEmail == me && CanDecide(approvals, x),
                    }
            )
            .ToArray();
    }

    private static async Task<Offer?> LoadManagedOfferAsync(
        AtsDbContext db,
        Guid id,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var offer = await db
            .Offers.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        return offer?.Application?.Requisition is not null && CanManage(offer.Application.Requisition, principal)
            ? offer
            : null;
    }

    private static async Task<PipelineStage?> FindHiredStageAsync(
        AtsDbContext db,
        Guid requisitionId,
        CancellationToken ct
    )
    {
        var stages = await db
            .PipelineStages.AsNoTracking()
            .Where(x => x.RequisitionId == requisitionId)
            .ToListAsync(ct);
        return stages.FirstOrDefault(x => x.Name.Equals("Hired", StringComparison.OrdinalIgnoreCase))
            ?? stages.Where(x => x.IsTerminal).OrderByDescending(x => x.SortOrder).FirstOrDefault();
    }

    private sealed record ResolvedApprovers(string[] Emails, bool Sequential, string? Error);

    private static async Task<ResolvedApprovers> ResolveApproversAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Organization? organization,
        SubmitApprovalRequest request,
        bool required,
        CancellationToken ct
    )
    {
        var me = principal.Email();
        var defaults = organization?.DefaultApproverEmails ?? [];
        var chosen = request.Approvers is { Length: > 0 } ? request.Approvers : defaults;
        // Only an admin can drop the organization's default approvers; everyone else adds to them.
        var requested = (principal.IsInRole(nameof(UserRole.Admin)) ? chosen : chosen.Concat(defaults))
            .Select(x => x.Trim().ToLowerInvariant())
            // Nobody approves their own request, whatever they typed.
            .Where(x => x.Length > 0 && x != me)
            .Distinct()
            .ToArray();
        var sequential = request.Sequential ?? organization?.ApprovalsSequential ?? false;
        if (requested.Length == 0)
            return new([], sequential, required ? "Choose at least one approver other than yourself." : null);
        var known = await db
            .Users.AsNoTracking()
            .Where(x =>
                x.IsActive
                && requested.Contains(x.Email)
                && (x.Role == UserRole.Admin || x.Role == UserRole.Recruiter || x.Role == UserRole.HiringManager))
            .Select(x => x.Email)
            .ToListAsync(ct);
        var unknown = requested.Except(known).ToArray();
        return unknown.Length > 0
            ? new([], sequential, $"No active user: {string.Join(", ", unknown)}.")
            : new(requested, sequential, null);
    }

    private static List<Approval> AddApprovals(
        AtsDbContext db,
        string subjectType,
        Guid subjectId,
        ResolvedApprovers approvers,
        string requestedBy
    )
    {
        var rows = approvers
            .Emails.Select(
                (email, index) =>
                    new Approval
                    {
                        SubjectType = subjectType,
                        SubjectId = subjectId,
                        ApproverEmail = email,
                        Sequence = approvers.Sequential ? index : 0,
                        RequestedBy = requestedBy,
                    }
            )
            .ToList();
        db.Approvals.AddRange(rows);
        return rows;
    }

    private static async Task NotifyEligibleApproversAsync(
        AtsDbContext db,
        List<Approval> approvals,
        string label,
        string requestedBy,
        CancellationToken ct
    )
    {
        var lowest = approvals.Where(x => x.Decision == ApprovalDecision.Pending).Min(x => x.Sequence);
        foreach (var approval in approvals.Where(x => x.Decision == ApprovalDecision.Pending && x.Sequence == lowest))
            await EmailTemplates.QueueAsync(
                db,
                "approval-request",
                null,
                approval.ApproverEmail,
                new Dictionary<string, string> { ["subject"] = label, ["requestedBy"] = requestedBy },
                null,
                ct
            );
        await PipelineEvents.NotifyAsync(db, $"Approval needed: {label} (requested by {requestedBy}).", ct);
    }

    // Moves the offer or job along once an approver has decided; returns what to tell the approver.
    private static async Task<string> ApplyDecisionAsync(
        AtsDbContext db,
        List<Approval> all,
        Approval decided,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        Offer? offer = null;
        Requisition? requisition = null;
        string label;
        if (decided.SubjectType == OfferSubject)
        {
            offer = await db
                .Offers.Include(x => x.Application)
                    .ThenInclude(x => x!.Candidate)
                .Include(x => x.Application)
                    .ThenInclude(x => x!.Requisition)
                .SingleAsync(x => x.Id == decided.SubjectId, ct);
            label =
                $"accepting {offer.Application!.Candidate!.FirstName} {offer.Application.Candidate.LastName} for {offer.Application.Requisition!.Title}";
        }
        else
        {
            requisition = await db.Requisitions.SingleAsync(x => x.Id == decided.SubjectId, ct);
            label = $"opening {requisition.Title}";
        }

        Audit.Add(
            db,
            principal,
            decided.SubjectType == OfferSubject ? "Application" : "Requisition",
            offer?.ApplicationId ?? requisition!.Id,
            decided.Decision == ApprovalDecision.Approved ? "ApprovalGiven" : "ApprovalRejected",
            new { decided.SubjectType, decided.Comment }
        );

        if (decided.Decision == ApprovalDecision.Rejected)
        {
            if (offer is not null)
            {
                offer.Status = OfferStatus.Draft;
                offer.UpdatedAt = DateTimeOffset.UtcNow;
            }
            else
            {
                requisition!.Status = RequisitionStatus.Draft;
                requisition.UpdatedAt = DateTimeOffset.UtcNow;
            }
            // Pending approvals from a rejected round are void; the recruiter resubmits with fresh ones.
            db.Approvals.RemoveRange(all.Where(x => x.Decision == ApprovalDecision.Pending && x.Id != decided.Id));
            db.EmailOutbox.Add(
                new EmailOutboxItem
                {
                    Recipient = decided.RequestedBy,
                    Subject = $"Approval rejected: {label}",
                    Body = $"{principal.Email()} rejected {label}.\n\nReason: {decided.Comment}",
                }
            );
            return "Rejected. The requester has been told why.";
        }

        var pending = all.Where(x => x.Id != decided.Id && x.Decision == ApprovalDecision.Pending).ToList();
        if (pending.Count > 0)
        {
            var next = pending.Min(x => x.Sequence);
            if (next > decided.Sequence && pending.All(x => x.Sequence >= next))
                await NotifyEligibleApproversAsync(
                    db,
                    pending.Where(x => x.Sequence == next).ToList(),
                    label,
                    decided.RequestedBy,
                    ct
                );
            return "Approved. Waiting on the other approvers.";
        }

        if (offer is not null)
        {
            offer.Status = OfferStatus.Approved;
            offer.UpdatedAt = DateTimeOffset.UtcNow;
        }
        else
        {
            requisition!.Status = RequisitionStatus.Open;
            requisition.OpenedAt ??= DateTimeOffset.UtcNow;
            requisition.UpdatedAt = DateTimeOffset.UtcNow;
        }
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                Recipient = decided.RequestedBy,
                Subject = $"Approved: {label}",
                Body =
                    offer is not null
                        ? $"Everyone approved {label}. You can send the acceptance email from the application."
                        : $"Everyone approved {label}. The job is now open.",
            }
        );
        return offer is not null ? "Approved. The recruiter can send the email now." : "Approved. The job is open.";
    }
}
