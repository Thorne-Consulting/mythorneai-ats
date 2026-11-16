using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Approvers and how they decide. Empty approvers use the organization's chain; Mode wins over
/// Sequential (kept for older callers). Note goes to the approvers with the request.
/// </summary>
public sealed record SubmitApprovalRequest(
    string[]? Approvers,
    bool? Sequential,
    ApprovalMode? Mode = null,
    string? Note = null
);

public sealed record DecideApprovalRequest(ApprovalDecision Decision, string? Comment);

public sealed record ReassignApprovalRequest(string ApproverEmail);

public sealed record WithdrawApprovalRequest(string SubjectType, Guid SubjectId);

/// <summary>
/// Approvers are emails, or "hiring-manager" for the job's hiring manager. With Departments, the
/// chain is for jobs in those teams (Id names an existing one); without, it is the organization's,
/// and Required applies.
/// </summary>
public sealed record SaveApprovalPolicyRequest(
    bool Required,
    ApprovalMode Mode,
    string[] Approvers,
    int ReminderDays,
    Guid? Id = null,
    string[]? Departments = null
);

public sealed record LinkDecisionRequest(string? Comment);

/// <summary>
/// The approval engine for opening jobs and for offers. Each submit is a new round; rounds are never
/// deleted, so who said what, and why, stays visible after a resubmit. Approvers are asked in order,
/// all at once, or until any one approves. Emails carry signed one-click links.
/// </summary>
public static partial class AtsEndpoints
{
    internal const string HiringManagerApprover = "hiring-manager";
    private static readonly TimeSpan ApprovalLinkLifetime = TimeSpan.FromDays(7);
    private static readonly string[] ApprovalScopes = ["waiting", "requested", "done"];

    private static void MapApprovals(RouteGroupBuilder api)
    {
        api.MapPost(
                "/approvals/{id:guid}/remind",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var approval = await db.Approvals.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (approval is null || !await CanSteerAsync(db, approval, principal, ct))
                        return Results.NotFound();
                    var all = await LoadApprovalsAsync(
                        db,
                        approval.SubjectType,
                        approval.SubjectId,
                        ct
                    );
                    if (!CanDecide(all, approval))
                        return Results.Conflict(
                            new { message = "This approver has nothing to decide right now." }
                        );
                    var since = DateTimeOffset.UtcNow.AddHours(-6);
                    if (approval.LastRemindedAt > since)
                        return Results.Conflict(
                            new { message = "They were reminded in the last 6 hours." }
                        );
                    var label = await ApprovalLabelAsync(db, approval, ct);
                    if (label is null)
                        return Results.NotFound();
                    await QueueApprovalRequestAsync(db, approval, label, approval.RequestedBy, ct);
                    approval.LastRemindedAt = DateTimeOffset.UtcNow;
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
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.Status != RequisitionStatus.Draft)
                        return Results.Conflict(
                            new { message = "Only a draft job can be submitted for approval." }
                        );
                    var approvers = await ResolveApproversAsync(
                        db,
                        principal,
                        RequisitionSubject,
                        requisition,
                        request,
                        ct
                    );
                    if (approvers.Error is not null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["approvers"] = [approvers.Error] }
                        );
                    requisition.Status = RequisitionStatus.PendingApproval;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    var rows = await AddRoundAsync(
                        db,
                        RequisitionSubject,
                        requisition.Id,
                        approvers,
                        principal.Email(),
                        request.Note,
                        ct
                    );
                    await NotifyEligibleApproversAsync(
                        db,
                        rows,
                        JobApprovalLabel(requisition),
                        principal.Email(),
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "SubmittedForApproval",
                        new { approvers = approvers.Emails, mode = approvers.Mode }
                    );
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
                var setup = await ApprovalSetupAsync(db, RequisitionSubject, requisition, ct);
                var approvals = await LoadApprovalsAsync(db, RequisitionSubject, id, ct);
                var me = principal.Email();
                return Results.Ok(
                    new
                    {
                        setup.Required,
                        DefaultApprovers = setup.Approvers,
                        Sequential = setup.Mode == ApprovalMode.Sequential,
                        Mode = setup.Mode.ToString(),
                        Approvals = await ApprovalViewsAsync(db, LatestRound(approvals), me, ct),
                        PreviousRounds = await PreviousRoundViewsAsync(db, approvals, me, ct),
                    }
                );
            }
        );

        // Older callers (the dashboard, the bell): what waits on me.
        api.MapGet(
            "/approvals/mine",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                Results.Ok(await ApprovalListAsync(db, principal.Email(), "waiting", ct))
        );

        // Waiting on me, requested by me, or decided by me, each with what is being approved.
        api.MapGet(
            "/approvals",
            async (
                string? scope,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                scope ??= "waiting";
                if (!ApprovalScopes.Contains(scope))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["scope"] = ["Pick waiting, requested or done."],
                        }
                    );
                return Results.Ok(await ApprovalListAsync(db, principal.Email(), scope, ct));
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
                var approval = await db.Approvals.SingleOrDefaultAsync(
                    x => x.Id == id && x.ApproverEmail == principal.Email(),
                    ct
                );
                return approval is null
                    ? Results.NotFound()
                    : await DecideAsync(
                        db,
                        approval,
                        request.Decision,
                        request.Comment,
                        principal.Email(),
                        ct
                    );
            }
        );

        // Give a waiting step to someone else (out of office, left the company).
        api.MapPost(
                "/approvals/{id:guid}/reassign",
                async (
                    Guid id,
                    ReassignApprovalRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var approval = await db.Approvals.SingleOrDefaultAsync(x => x.Id == id, ct);
                    var me = principal.Email();
                    var isApprover = approval?.ApproverEmail == me;
                    if (
                        approval is null
                        || (!isApprover && !await CanSteerAsync(db, approval, principal, ct))
                    )
                        return Results.NotFound();
                    // A step the organization's chain requires is handed on only by an admin or
                    // by that approver, so a requester can't swap in someone friendlier.
                    if (
                        approval.FromPolicy
                        && !isApprover
                        && !principal.IsInRole(nameof(UserRole.Admin))
                    )
                        return Results.Json(
                            new
                            {
                                message = "Your organization requires this approver. Only an admin or the approver can hand it to someone else.",
                            },
                            statusCode: StatusCodes.Status403Forbidden
                        );
                    if (approval.Decision != ApprovalDecision.Pending)
                        return Results.Conflict(
                            new { message = "This person has already answered." }
                        );
                    var email = request.ApproverEmail?.Trim().ToLowerInvariant() ?? "";
                    var all = await db
                        .Approvals.Where(x =>
                            x.SubjectType == approval.SubjectType
                            && x.SubjectId == approval.SubjectId
                            && x.Round == approval.Round
                        )
                        .ToListAsync(ct);
                    string? problem =
                        email == approval.RequestedBy
                            ? "The person who asked can't approve their own request."
                        : all.Any(x => x.ApproverEmail == email)
                            ? "That person is already an approver on this request."
                        : !await IsApproverAsync(db, email, ct)
                            ? "Choose an active admin, recruiter or hiring manager."
                        : null;
                    if (problem is not null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["approverEmail"] = [problem] }
                        );
                    var before = approval.ApproverEmail;
                    approval.ReassignedFromEmail = before;
                    approval.ReassignedBy = me;
                    approval.ApproverEmail = email;
                    approval.RemindersSent = 0;
                    approval.LastRemindedAt = null;
                    if (CanDecide(all, approval))
                    {
                        var label = await ApprovalLabelAsync(db, approval, ct);
                        if (label is not null)
                            await QueueApprovalRequestAsync(
                                db,
                                approval,
                                label,
                                approval.RequestedBy,
                                ct
                            );
                    }
                    Audit.Add(
                        db,
                        principal,
                        approval.SubjectType == OfferSubject ? "Offer" : "Requisition",
                        approval.SubjectId,
                        "ApproverReplaced",
                        new
                        {
                            From = before,
                            To = email,
                            approval.FromPolicy,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The requester takes the request back: the subject returns to draft, the round stays as history.
        api.MapPost(
                "/approvals/withdraw",
                async (
                    WithdrawApprovalRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var rows = await db
                        .Approvals.Where(x =>
                            x.SubjectType == request.SubjectType
                            && x.SubjectId == request.SubjectId
                            && x.Decision == ApprovalDecision.Pending
                        )
                        .ToListAsync(ct);
                    if (rows.Count == 0)
                        return Results.Conflict(
                            new { message = "Nothing is waiting for approval here." }
                        );
                    if (!await CanSteerAsync(db, rows[0], principal, ct))
                        return Results.NotFound();
                    if (request.SubjectType == OfferSubject)
                    {
                        var offer = await db.Offers.SingleAsync(x => x.Id == request.SubjectId, ct);
                        if (offer.Status == OfferStatus.PendingApproval)
                            offer.Status = OfferStatus.Draft;
                        offer.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                    else if (request.SubjectType == WorkflowRunSubject)
                        await WakeWorkflowRunAsync(db, request.SubjectId, ct);
                    else
                    {
                        var job = await db.Requisitions.SingleAsync(
                            x => x.Id == request.SubjectId,
                            ct
                        );
                        if (job.Status == RequisitionStatus.PendingApproval)
                            job.Status = RequisitionStatus.Draft;
                        job.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                    foreach (var row in rows)
                    {
                        row.Decision = ApprovalDecision.Cancelled;
                        row.DecidedAt = DateTimeOffset.UtcNow;
                    }
                    Audit.Add(
                        db,
                        principal,
                        request.SubjectType == OfferSubject ? "Offer" : "Requisition",
                        request.SubjectId,
                        "ApprovalWithdrawn"
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
                "/approval-policies",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    // Per kind: the organization's chain first, then the chains for some teams.
                    var teams = await db
                        .ApprovalPolicies.AsNoTracking()
                        .Where(x => x.Departments.Length > 0)
                        .ToListAsync(ct);
                    teams =
                    [
                        .. teams.OrderBy(x => x.Departments[0], StringComparer.OrdinalIgnoreCase),
                    ];
                    var items = new List<object>();
                    foreach (var subject in new[] { RequisitionSubject, OfferSubject })
                    {
                        var setup = await ApprovalSetupAsync(db, subject, null, ct, keepKeys: true);
                        items.Add(
                            new
                            {
                                Id = (Guid?)null,
                                SubjectType = subject,
                                Departments = Array.Empty<string>(),
                                setup.Required,
                                Mode = setup.Mode.ToString(),
                                setup.Approvers,
                                setup.ReminderDays,
                            }
                        );
                        items.AddRange(
                            teams
                                .Where(x => x.SubjectType == subject)
                                .Select(x => new
                                {
                                    Id = (Guid?)x.Id,
                                    SubjectType = subject,
                                    x.Departments,
                                    setup.Required,
                                    Mode = x.Mode.ToString(),
                                    x.Approvers,
                                    x.ReminderDays,
                                })
                        );
                    }
                    return Results.Ok(items);
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/approval-policies/{subjectType}",
                async (
                    string subjectType,
                    SaveApprovalPolicyRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (subjectType is not (RequisitionSubject or OfferSubject))
                        return Results.NotFound();
                    var keys = (request.Approvers ?? [])
                        .Select(x => x.Trim().ToLowerInvariant())
                        .Where(x => x.Length > 0)
                        .Distinct()
                        .ToArray();
                    var emails = keys.Where(x => x != HiringManagerApprover).ToArray();
                    var known = await db
                        .Users.AsNoTracking()
                        .Where(x => emails.Contains(x.Email) && x.IsActive)
                        .Where(x =>
                            x.Role == UserRole.Admin
                            || x.Role == UserRole.Recruiter
                            || x.Role == UserRole.HiringManager
                        )
                        .Select(x => x.Email)
                        .ToListAsync(ct);
                    var errors = new Dictionary<string, string[]>();
                    if (keys.Length > 10)
                        errors["approvers"] = ["Choose up to 10 approvers."];
                    else if (emails.Except(known).ToArray() is { Length: > 0 } unknown)
                        errors["approvers"] =
                        [
                            $"These people can't approve: {string.Join(", ", unknown)}. Choose admins, recruiters or hiring managers.",
                        ];
                    if (!Enum.IsDefined(request.Mode))
                        errors["mode"] = ["Choose how the approvers decide."];
                    if (request.ReminderDays is < 0 or > 30)
                        errors["reminderDays"] = ["Choose between 0 and 30 days."];
                    // A team chain: each team has at most one chain per kind.
                    var departments = (request.Departments ?? [])
                        .Select(x => x.Trim())
                        .Where(x => x.Length > 0)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                    // Departments (even empty) or an id mean a team chain; neither, the organization's.
                    var forTeams = request.Departments is not null || request.Id is not null;
                    var teamChains = await db
                        .ApprovalPolicies.Where(x =>
                            x.SubjectType == subjectType && x.Departments.Length > 0
                        )
                        .ToListAsync(ct);
                    if (forTeams && departments.Length == 0)
                        errors["departments"] = ["Choose at least one team."];
                    else if (departments.Length > 20)
                        errors["departments"] = ["Choose up to 20 teams."];
                    else if (
                        teamChains
                            .Where(x => x.Id != request.Id)
                            .SelectMany(x => x.Departments)
                            .FirstOrDefault(x =>
                                departments.Contains(x, StringComparer.OrdinalIgnoreCase)
                            ) is
                        { } taken
                    )
                        errors["departments"] = [$"{taken} already has its own chain."];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    var policy = forTeams
                        ? teamChains.FirstOrDefault(x => x.Id == request.Id)
                        : await db
                            .ApprovalPolicies.Where(x =>
                                x.SubjectType == subjectType && x.Departments.Length == 0
                            )
                            .FirstOrDefaultAsync(ct);
                    if (policy is null && request.Id is not null)
                        return Results.NotFound();
                    if (policy is null)
                    {
                        policy = new ApprovalPolicy { SubjectType = subjectType };
                        db.ApprovalPolicies.Add(policy);
                    }
                    policy.Departments = departments;
                    policy.Mode = request.Mode;
                    policy.Approvers = keys;
                    policy.ReminderDays = request.ReminderDays;
                    policy.UpdatedBy = principal.Email();
                    policy.UpdatedAt = DateTimeOffset.UtcNow;
                    var organization = await db.Organizations.SingleAsync(ct);
                    if (!forTeams)
                    {
                        if (subjectType == OfferSubject)
                            organization.RequireOfferApproval = request.Required;
                        else
                            organization.RequireRequisitionApproval = request.Required;
                        // The setup checklist and older screens read the organization's list.
                        var other = await db
                            .ApprovalPolicies.AsNoTracking()
                            .Where(x => x.SubjectType != subjectType && x.Departments.Length == 0)
                            .Select(x => x.Approvers)
                            .ToListAsync(ct);
                        organization.DefaultApproverEmails =
                        [
                            .. emails
                                .Concat(other.SelectMany(x => x))
                                .Where(x => x != HiringManagerApprover)
                                .Distinct(),
                        ];
                        organization.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Organization",
                        organization.Id,
                        "ApprovalChainSaved",
                        new
                        {
                            subjectType,
                            request.Required,
                            request.Mode,
                            Approvers = keys,
                            request.ReminderDays,
                            Departments = departments,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return forTeams ? Results.Ok(new { policy.Id }) : Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // Removes a team's chain; its jobs use the organization's chain again.
        api.MapDelete(
                "/approval-policies/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var policy = await db.ApprovalPolicies.SingleOrDefaultAsync(
                        x => x.Id == id && x.Departments.Length > 0,
                        ct
                    );
                    if (policy is null)
                        return Results.NotFound();
                    db.ApprovalPolicies.Remove(policy);
                    var organization = await db.Organizations.SingleAsync(ct);
                    Audit.Add(
                        db,
                        principal,
                        "Organization",
                        organization.Id,
                        "ApprovalChainRemoved",
                        new { policy.SubjectType, policy.Departments }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    /// <summary>
    /// The chain for a job in this team: a chain naming the team (the fewest teams wins), else the
    /// organization's chain (no teams), else none.
    /// </summary>
    internal static ApprovalPolicy? PickPolicy(
        IEnumerable<ApprovalPolicy> policies,
        string? department
    )
    {
        var list = policies.ToList();
        var team = department?.Trim();
        return (
                string.IsNullOrEmpty(team)
                    ? null
                    : list.Where(x =>
                            x.Departments.Contains(team, StringComparer.OrdinalIgnoreCase)
                        )
                        .OrderBy(x => x.Departments.Length)
                        .ThenBy(x => x.UpdatedAt)
                        .FirstOrDefault()
            ) ?? list.FirstOrDefault(x => x.Departments.Length == 0);
    }

    /// <summary>
    /// The one-click links in approval emails. Opening a link only shows the request; the decision
    /// is a POST from that page, so mail scanners that open links decide nothing. A link names one
    /// approval step, one person and one decision, expires after 7 days, and stops working once the
    /// step is decided, given to someone else or withdrawn.
    /// </summary>
    internal static void MapApprovalLinks(RouteGroupBuilder publicApi)
    {
        publicApi.MapGet(
            "/approvals/{token}",
            async (string token, AtsDbContext db, CancellationToken ct) =>
            {
                var link = await ReadApprovalLinkAsync(db, token, ct);
                if (link.Approval is null)
                    return Results.Ok(new { link.State });
                var items = await ApprovalItemsAsync(
                    db,
                    [link.Approval],
                    link.Approval.ApproverEmail,
                    ct
                );
                return Results.Ok(
                    new
                    {
                        link.State,
                        Decision = link.Decision.ToString(),
                        Item = items.SingleOrDefault(),
                    }
                );
            }
        );

        publicApi.MapPost(
            "/approvals/{token}",
            async (
                string token,
                LinkDecisionRequest request,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var link = await ReadApprovalLinkAsync(db, token, ct);
                if (link.Approval is null || link.State != "ready")
                    return Results.Conflict(new { message = LinkProblem(link.State) });
                var approval = await db.Approvals.SingleAsync(x => x.Id == link.Approval.Id, ct);
                return await DecideAsync(
                    db,
                    approval,
                    link.Decision,
                    request.Comment,
                    approval.ApproverEmail,
                    ct
                );
            }
        );
    }

    private static string LinkProblem(string state) =>
        state switch
        {
            "expired" => "This link has expired. Open the request in MyThorneAI instead.",
            "replaced" => "This request was given to someone else or taken back.",
            "done" => "You have already answered this request.",
            "closed" => "This request is no longer waiting for an answer.",
            "notYet" => "This request is waiting on someone before you.",
            _ => "This link can't be used.",
        };

    private sealed record ApprovalLink(string State, Approval? Approval, ApprovalDecision Decision);

    private static IDataProtector ApprovalLinkProtector(AtsDbContext db) =>
        (
            db.GetService<IDbContextOptions>()
                .FindExtension<CoreOptionsExtension>()
                ?.ApplicationServiceProvider?.GetService<IDataProtectionProvider>()
            ?? throw new InvalidOperationException("Data protection is not registered.")
        ).CreateProtector("approval-link.v1");

    internal static string ApprovalLinkToken(
        AtsDbContext db,
        Approval approval,
        ApprovalDecision decision
    ) =>
        ApprovalLinkProtector(db)
            .ToTimeLimitedDataProtector()
            .Protect(
                $"{approval.Id:N}|{approval.ApproverEmail}|{(decision == ApprovalDecision.Approved ? "a" : "r")}",
                ApprovalLinkLifetime
            );

    private static async Task<ApprovalLink> ReadApprovalLinkAsync(
        AtsDbContext db,
        string token,
        CancellationToken ct
    )
    {
        string text;
        try
        {
            text = ApprovalLinkProtector(db).ToTimeLimitedDataProtector().Unprotect(token);
        }
        catch (CryptographicException)
        {
            return new("expired", null, ApprovalDecision.Pending);
        }
        var parts = text.Split('|');
        if (parts.Length != 3 || !Guid.TryParse(parts[0], out var id))
            return new("expired", null, ApprovalDecision.Pending);
        var decision = parts[2] == "a" ? ApprovalDecision.Approved : ApprovalDecision.Rejected;
        var approval = await db.Approvals.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (approval is null || approval.ApproverEmail != parts[1])
            return new("replaced", null, decision);
        if (approval.Decision is ApprovalDecision.Approved or ApprovalDecision.Rejected)
            return new("done", approval, decision);
        if (approval.Decision == ApprovalDecision.Cancelled)
            return new("closed", approval, decision);
        var all = await LoadApprovalsAsync(db, approval.SubjectType, approval.SubjectId, ct);
        return new(CanDecide(all, approval) ? "ready" : "notYet", approval, decision);
    }

    /// <summary>Record one approver's answer and move the request along. Shared by the app and the email link.</summary>
    private static async Task<IResult> DecideAsync(
        AtsDbContext db,
        Approval approval,
        ApprovalDecision decision,
        string? comment,
        string actorEmail,
        CancellationToken ct
    )
    {
        if (decision is not (ApprovalDecision.Approved or ApprovalDecision.Rejected))
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { ["decision"] = ["Approve or reject."] }
            );
        if (decision == ApprovalDecision.Rejected && string.IsNullOrWhiteSpace(comment))
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["comment"] = ["Say why you're rejecting this."],
                }
            );
        if (
            string.Equals(
                approval.ApproverEmail,
                approval.RequestedBy,
                StringComparison.OrdinalIgnoreCase
            )
        )
            return Results.Conflict(
                new { message = "You can't approve something you asked for yourself." }
            );
        var all = await db
            .Approvals.Where(x =>
                x.SubjectType == approval.SubjectType && x.SubjectId == approval.SubjectId
            )
            .ToListAsync(ct);
        // The tracked row from the list, so the decision below saves.
        approval = all.Single(x => x.Id == approval.Id);
        if (!CanDecide(all, approval))
            return Results.Conflict(new { message = "This isn't waiting on you right now." });
        approval.Decision = decision;
        approval.Comment = comment?.Trim() is { Length: > 0 } text
            ? text[..Math.Min(text.Length, 2000)]
            : null;
        approval.DecidedAt = DateTimeOffset.UtcNow;
        var message = await ApplyDecisionAsync(db, all, approval, actorEmail, ct);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { message });
    }

    // Only the live round counts, and in order a step waits for every step before it to approve.
    private static bool CanDecide(IReadOnlyCollection<Approval> all, Approval mine) =>
        mine.Decision == ApprovalDecision.Pending
        && all.Where(x => x.Round == mine.Round && x.Sequence < mine.Sequence)
            .All(x => x.Decision == ApprovalDecision.Approved);

    // When this step's turn began: when it was asked, or when the last step before it approved.
    private static DateTimeOffset TurnStartedAt(IEnumerable<Approval> all, Approval row) =>
        all.Where(x => x.Round == row.Round && x.Sequence < row.Sequence && x.DecidedAt != null)
            .Select(x => x.DecidedAt!.Value)
            .Append(row.CreatedAt)
            .Max();

    private static List<Approval> LatestRound(IReadOnlyCollection<Approval> all)
    {
        if (all.Count == 0)
            return [];
        var round = all.Max(x => x.Round);
        return [.. all.Where(x => x.Round == round)];
    }

    /// <summary>Pending, Approved, Rejected, or Stopped (withdrawn or the terms changed before everyone answered).</summary>
    internal static string RoundOutcome(IReadOnlyCollection<Approval> round) =>
        round.Any(x => x.Decision == ApprovalDecision.Rejected) ? "Rejected"
        : round.Any(x => x.Decision == ApprovalDecision.Pending) ? "Pending"
        : round.Count > 0
        && (
            round.All(x => x.Decision == ApprovalDecision.Approved)
            || (
                round.Any(x => x.AnyOne)
                && round.Any(x =>
                    x.Decision == ApprovalDecision.Approved && SettlesAnyOne(round, x)
                )
            )
        )
            ? "Approved"
        : "Stopped";

    // With "any one", an approval settles the round only from an approver the chain requires
    // (or from anyone when the chain named nobody), never from someone the requester added.
    private static bool SettlesAnyOne(IEnumerable<Approval> round, Approval approved) =>
        approved.FromPolicy || !round.Any(x => x.FromPolicy);

    // How much a mode asks of approvers: everyone in order, everyone, or one.
    private static int Strength(ApprovalMode mode) =>
        mode switch
        {
            ApprovalMode.Sequential => 2,
            ApprovalMode.Parallel => 1,
            _ => 0,
        };

    private static async Task<List<Approval>> LoadApprovalsAsync(
        AtsDbContext db,
        string subjectType,
        Guid subjectId,
        CancellationToken ct
    ) =>
        await db
            .Approvals.AsNoTracking()
            .Where(x => x.SubjectType == subjectType && x.SubjectId == subjectId)
            .OrderBy(x => x.Round)
            .ThenBy(x => x.Sequence)
            .ThenBy(x => x.CreatedAt)
            .ToListAsync(ct);

    private static async Task<Dictionary<string, string>> NamesAsync(
        AtsDbContext db,
        IEnumerable<string?> emails,
        CancellationToken ct
    )
    {
        var list = emails.Where(x => x is not null).Distinct().ToArray();
        return await db
            .Users.AsNoTracking()
            .Where(x => list.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
    }

    private static object ApprovalView(
        Approval x,
        IReadOnlyCollection<Approval> round,
        IReadOnlyDictionary<string, string> names,
        string me
    ) =>
        new
        {
            x.Id,
            x.ApproverEmail,
            ApproverName = names.GetValueOrDefault(x.ApproverEmail, x.ApproverEmail),
            x.Sequence,
            Decision = x.Decision.ToString(),
            x.Comment,
            x.DecidedAt,
            CanDecide = x.ApproverEmail == me && CanDecide(round, x),
            // Their turn now, so a reminder or a new approver makes sense.
            Waiting = CanDecide(round, x),
            x.Round,
            x.AnyOne,
            ReassignedFromName = x.ReassignedFromEmail is null
                ? null
                : names.GetValueOrDefault(x.ReassignedFromEmail, x.ReassignedFromEmail),
            ReassignedByName = x.ReassignedBy is null
                ? null
                : names.GetValueOrDefault(x.ReassignedBy, x.ReassignedBy),
            x.FromPolicy,
            x.LastRemindedAt,
        };

    private static async Task<object[]> ApprovalViewsAsync(
        AtsDbContext db,
        List<Approval> round,
        string me,
        CancellationToken ct
    )
    {
        var names = await NamesAsync(
            db,
            round.SelectMany(x => new[] { x.ApproverEmail, x.ReassignedFromEmail, x.ReassignedBy }),
            ct
        );
        return [.. round.Select(x => ApprovalView(x, round, names, me))];
    }

    /// <summary>Every round before the live one, newest first, each with how it ended.</summary>
    private static async Task<object[]> PreviousRoundViewsAsync(
        AtsDbContext db,
        List<Approval> all,
        string me,
        CancellationToken ct
    )
    {
        if (all.Count == 0)
            return [];
        var latest = all.Max(x => x.Round);
        var names = await NamesAsync(
            db,
            all.SelectMany(x =>
                new[] { x.ApproverEmail, x.ReassignedFromEmail, x.ReassignedBy, x.RequestedBy }
            ),
            ct
        );
        return
        [
            .. all.Where(x => x.Round < latest)
                .GroupBy(x => x.Round)
                .OrderByDescending(g => g.Key)
                .Select(g =>
                {
                    var round = g.ToList();
                    return (object)
                        new
                        {
                            Round = g.Key,
                            Outcome = RoundOutcome(round),
                            RequestedByName = names.GetValueOrDefault(
                                round[0].RequestedBy,
                                round[0].RequestedBy
                            ),
                            round[0].CreatedAt,
                            round[0].Note,
                            Approvals = round.Select(x => ApprovalView(x, round, names, me)),
                        };
                }),
        ];
    }

    private sealed record ApprovalSetup(
        bool Required,
        ApprovalMode Mode,
        string[] Approvers,
        int ReminderDays
    );

    /// <summary>
    /// The organization's chain for one kind of request. The policy row when an admin saved one,
    /// else the organization's older single list. With a job, "hiring-manager" becomes its hiring
    /// manager's email; <paramref name="keepKeys"/> keeps the key for the settings page.
    /// </summary>
    private static async Task<ApprovalSetup> ApprovalSetupAsync(
        AtsDbContext db,
        string subjectType,
        Requisition? job,
        CancellationToken ct,
        bool keepKeys = false
    )
    {
        var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        var policy = PickPolicy(
            await db
                .ApprovalPolicies.AsNoTracking()
                .Where(x => x.SubjectType == subjectType)
                .ToListAsync(ct),
            job?.Department
        );
        var required =
            subjectType == OfferSubject
                ? organization?.RequireOfferApproval ?? true
                : organization?.RequireRequisitionApproval ?? false;
        var mode =
            policy?.Mode
            ?? (
                organization?.ApprovalsSequential == true
                    ? ApprovalMode.Sequential
                    : ApprovalMode.Parallel
            );
        var keys = policy?.Approvers ?? organization?.DefaultApproverEmails ?? [];
        if (!keepKeys)
        {
            var manager =
                job?.Members.Where(m => m.Role == RequisitionRole.HiringManager)
                    .OrderBy(m => m.CreatedAt)
                    .Select(m => m.User?.Email)
                    .FirstOrDefault(x => x is not null)
                ?? job?.OwnerEmail;
            keys = [.. keys.Select(k => k == HiringManagerApprover ? manager ?? "" : k)];
        }
        return new(
            required,
            mode,
            [.. keys.Select(x => x.Trim().ToLowerInvariant()).Where(x => x.Length > 0).Distinct()],
            policy?.ReminderDays ?? 2
        );
    }

    /// <summary>Emails in order; FromPolicy: those the organization's chain named.</summary>
    private sealed record ResolvedApprovers(
        string[] Emails,
        ApprovalMode Mode,
        string? Error,
        string[]? FromPolicy = null
    );

    private static async Task<ResolvedApprovers> ResolveApproversAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        string subjectType,
        Requisition job,
        SubmitApprovalRequest request,
        CancellationToken ct
    )
    {
        var me = principal.Email();
        var setup = await ApprovalSetupAsync(db, subjectType, job, ct);
        var defaults = setup.Approvers;
        var chosen = request.Approvers is { Length: > 0 } ? request.Approvers : defaults;
        // Only an admin can drop the organization's approvers; everyone else adds to them.
        var requested = (
            principal.IsInRole(nameof(UserRole.Admin)) ? chosen : chosen.Concat(defaults)
        )
            .Select(x => x.Trim().ToLowerInvariant())
            // Nobody approves their own request, whatever they typed.
            .Where(x => x.Length > 0 && x != me && x != HiringManagerApprover)
            .Distinct()
            .ToArray();
        // Older callers send only Sequential. False means "not in order", which "any one" also is,
        // so it asks for "all at once" only against an in-order rule.
        var asked =
            request.Mode
            ?? (
                request.Sequential == true ? (ApprovalMode?)ApprovalMode.Sequential
                : request.Sequential == false && setup.Mode == ApprovalMode.Sequential
                    ? ApprovalMode.Parallel
                : null
            );
        // Only an admin can ask less of the approvers than the organization's rule.
        var admin = principal.IsInRole(nameof(UserRole.Admin));
        if (!admin && asked is { } weaker && Strength(weaker) < Strength(setup.Mode))
            return new(
                [],
                setup.Mode,
                setup.Mode == ApprovalMode.Sequential
                    ? "Your organization asks approvers one after another. Only an admin can change that."
                    : "Your organization needs every approver to agree. Only an admin can change that."
            );
        var mode =
            admin ? asked ?? setup.Mode
            : asked is { } stronger && Strength(stronger) > Strength(setup.Mode) ? stronger
            : setup.Mode;
        // Opening a job always needs someone once it is sent; an offer only when approval is on.
        var needed = subjectType == RequisitionSubject || setup.Required;
        if (requested.Length == 0)
            return new(
                [],
                mode,
                needed ? "Choose at least one approver other than yourself." : null
            );
        var known = new List<string>();
        foreach (var email in requested)
            if (await IsApproverAsync(db, email, ct))
                known.Add(email);
        var unknown = requested.Except(known).ToArray();
        return unknown.Length > 0
            ? new([], mode, $"No active user: {string.Join(", ", unknown)}.")
            : new(requested, mode, null, [.. requested.Intersect(defaults)]);
    }

    private static Task<bool> IsApproverAsync(
        AtsDbContext db,
        string email,
        CancellationToken ct
    ) =>
        db.Users.AnyAsync(
            x =>
                x.Email == email
                && x.IsActive
                && (
                    x.Role == UserRole.Admin
                    || x.Role == UserRole.Recruiter
                    || x.Role == UserRole.HiringManager
                ),
            ct
        );

    /// <summary>Starts a new round. Anything still waiting from an earlier round is cancelled, never deleted.</summary>
    private static async Task<List<Approval>> AddRoundAsync(
        AtsDbContext db,
        string subjectType,
        Guid subjectId,
        ResolvedApprovers approvers,
        string requestedBy,
        string? note,
        CancellationToken ct
    )
    {
        await CloseRoundAsync(db, subjectType, subjectId, ct);
        var round =
            (
                await db
                    .Approvals.Where(x => x.SubjectType == subjectType && x.SubjectId == subjectId)
                    .MaxAsync(x => (int?)x.Round, ct)
                ?? 0
            ) + 1;
        var text = note?.Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 2000)] : null;
        var rows = approvers
            .Emails.Select(
                (email, index) =>
                    new Approval
                    {
                        SubjectType = subjectType,
                        SubjectId = subjectId,
                        ApproverEmail = email,
                        Sequence = approvers.Mode == ApprovalMode.Sequential ? index : 0,
                        AnyOne = approvers.Mode == ApprovalMode.AnyOne,
                        FromPolicy = approvers.FromPolicy?.Contains(email) == true,
                        Round = round,
                        Note = text,
                        RequestedBy = requestedBy,
                    }
            )
            .ToList();
        db.Approvals.AddRange(rows);
        return rows;
    }

    /// <summary>Cancels whatever still waits in the live round (the caller saves).</summary>
    private static async Task CloseRoundAsync(
        AtsDbContext db,
        string subjectType,
        Guid subjectId,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        foreach (
            var row in await db
                .Approvals.Where(x =>
                    x.SubjectType == subjectType
                    && x.SubjectId == subjectId
                    && x.Decision == ApprovalDecision.Pending
                )
                .ToListAsync(ct)
        )
        {
            row.Decision = ApprovalDecision.Cancelled;
            row.DecidedAt = now;
        }
    }

    // The requester, an admin, or someone who manages the job can remind, replace or withdraw.
    private static async Task<bool> CanSteerAsync(
        AtsDbContext db,
        Approval approval,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        if (approval.RequestedBy == principal.Email() || principal.IsInRole(nameof(UserRole.Admin)))
            return true;
        var jobId =
            approval.SubjectType == OfferSubject
                ? await db
                    .Offers.Where(x => x.Id == approval.SubjectId)
                    .Select(x => (Guid?)x.Application!.RequisitionId)
                    .SingleOrDefaultAsync(ct)
                : approval.SubjectId;
        // Loaded as an entity so its team comes with it.
        var job = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == jobId, ct);
        return job is not null && CanManage(job, principal);
    }

    private static string JobApprovalLabel(Requisition job) =>
        $"open the job {job.Title} ({job.Code})";

    private static async Task<string?> ApprovalLabelAsync(
        AtsDbContext db,
        Approval approval,
        CancellationToken ct
    )
    {
        if (approval.SubjectType == OfferSubject)
        {
            var offer = await db
                .Offers.AsNoTracking()
                .Include(x => x.Application!.Candidate)
                .Include(x => x.Application!.Requisition)
                .SingleOrDefaultAsync(x => x.Id == approval.SubjectId, ct);
            return offer is null ? null : OfferLabel(offer);
        }
        if (approval.SubjectType == WorkflowRunSubject)
            return approval.Note ?? "a workflow step";
        var job = await db
            .Requisitions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == approval.SubjectId, ct);
        return job is null ? null : JobApprovalLabel(job);
    }

    private static async Task NotifyEligibleApproversAsync(
        AtsDbContext db,
        List<Approval> approvals,
        string label,
        string requestedBy,
        CancellationToken ct
    )
    {
        var waiting = approvals.Where(x => x.Decision == ApprovalDecision.Pending).ToList();
        if (waiting.Count == 0)
            return;
        var lowest = waiting.Min(x => x.Sequence);
        var asked = waiting.Where(x => x.Sequence == lowest).ToList();
        foreach (var approval in asked)
            await QueueApprovalRequestAsync(db, approval, label, requestedBy, ct);
        await PipelineEvents.NotifyAsync(
            db,
            $"Approval needed: {label} (requested by {requestedBy}).",
            ct,
            TeamChannel.ApprovalRequested,
            $"/approvals?open={asked[0].Id}"
        );
    }

    /// <summary>The approval email: one-click approve and reject links, and a link that opens the item.</summary>
    private static async Task QueueApprovalRequestAsync(
        AtsDbContext db,
        Approval approval,
        string label,
        string requestedBy,
        CancellationToken ct
    )
    {
        var names = await NamesAsync(db, [requestedBy], ct);
        var site = await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct);
        string Link(string path) =>
            string.IsNullOrWhiteSpace(site) ? "" : $"{site.TrimEnd('/')}{path}";
        await EmailTemplates.QueueAsync(
            db,
            "approval-request",
            null,
            approval.ApproverEmail,
            new Dictionary<string, string>
            {
                ["subject"] = label,
                ["requestedBy"] = names.GetValueOrDefault(requestedBy, requestedBy),
                ["approvalLink"] = Link(await ApprovalPathAsync(db, approval, ct)),
                ["approveLink"] = Link(
                    $"/approve/{ApprovalLinkToken(db, approval, ApprovalDecision.Approved)}"
                ),
                ["rejectLink"] = Link(
                    $"/approve/{ApprovalLinkToken(db, approval, ApprovalDecision.Rejected)}"
                ),
            },
            null,
            ct
        );
    }

    // Offers open on the application's Offer tab when the approver can see the job; otherwise on Approvals.
    private static async Task<string> ApprovalPathAsync(
        AtsDbContext db,
        Approval approval,
        CancellationToken ct
    )
    {
        var fallback = $"/approvals?open={approval.Id}";
        if (approval.SubjectType != OfferSubject)
            return fallback;
        var offer = await db
            .Offers.AsNoTracking()
            .Where(x => x.Id == approval.SubjectId)
            .Select(x => new { x.ApplicationId, Job = x.Application!.Requisition })
            .SingleOrDefaultAsync(ct);
        var approver = await db
            .Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Email == approval.ApproverEmail, ct);
        if (offer?.Job is null || approver is null)
            return fallback;
        var involved = await db.RequisitionMembers.AnyAsync(
            m => m.RequisitionId == offer.Job.Id && m.UserId == approver.Id,
            ct
        );
        var sees = approver.Role switch
        {
            UserRole.Admin => true,
            UserRole.Recruiter => !offer.Job.IsConfidential || involved,
            UserRole.HiringManager => involved,
            _ => false,
        };
        return sees ? $"/applications/{offer.ApplicationId}/offer" : fallback;
    }

    // Moves the offer or job along once an approver has decided; returns what to tell the approver.
    private static async Task<string> ApplyDecisionAsync(
        AtsDbContext db,
        List<Approval> all,
        Approval decided,
        string actorEmail,
        CancellationToken ct
    )
    {
        if (decided.SubjectType == WorkflowRunSubject)
            return await ApplyWorkflowDecisionAsync(db, all, decided, actorEmail, ct);
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
            label = OfferLabel(offer);
        }
        else
        {
            requisition = await db.Requisitions.SingleAsync(x => x.Id == decided.SubjectId, ct);
            label = $"opening {requisition.Title}";
        }
        var href = offer is not null
            ? $"/applications/{offer.ApplicationId}/offer"
            : $"/jobs/{requisition!.Id}";
        var actorName = (await NamesAsync(db, [actorEmail], ct)).GetValueOrDefault(
            actorEmail,
            actorEmail
        );

        Audit.Add(
            db,
            actorEmail,
            decided.SubjectType == OfferSubject ? "Application" : "Requisition",
            offer?.ApplicationId ?? requisition!.Id,
            decided.Decision == ApprovalDecision.Approved ? "ApprovalGiven" : "ApprovalRejected",
            new
            {
                decided.SubjectType,
                decided.Comment,
                decided.Round,
            }
        );
        var round = all.Where(x => x.Round == decided.Round && x.Id != decided.Id).ToList();

        void CancelRest()
        {
            foreach (var row in round.Where(x => x.Decision == ApprovalDecision.Pending))
            {
                row.Decision = ApprovalDecision.Cancelled;
                row.DecidedAt = DateTimeOffset.UtcNow;
            }
        }

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
            // The rest of the round is void; the requester resubmits as a new round.
            CancelRest();
            await Notify.AddAsync(
                db,
                [decided.RequestedBy],
                new NotificationDraft(
                    NotificationKinds.ApprovalDecided,
                    $"{actorName} turned down {label}",
                    href,
                    Body: $"Reason: {decided.Comment}",
                    ActorEmail: actorEmail,
                    ApplicationId: offer?.ApplicationId
                ),
                ct
            );
            return "Rejected. The requester has been told why.";
        }

        var pending = round.Where(x => x.Decision == ApprovalDecision.Pending).ToList();
        if (decided.AnyOne && SettlesAnyOne(round.Append(decided), decided))
            CancelRest();
        else if (pending.Count > 0)
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
        await Notify.AddAsync(
            db,
            [decided.RequestedBy],
            new NotificationDraft(
                NotificationKinds.ApprovalDecided,
                offer is not null
                    ? $"Approved: {label}. You can send it now."
                    : $"Approved: {label}. The job is open.",
                href,
                ActorEmail: actorEmail,
                ApplicationId: offer?.ApplicationId
            ),
            ct
        );
        return offer is not null
            ? "Approved. The recruiter can send the offer now."
            : "Approved. The job is open.";
    }

    /// <summary>
    /// Reminds approvers whose turn it is after their chain's number of days, then every that many
    /// days, up to the organization's MaxReminders. When the last reminder goes unanswered for that
    /// long too, the requester and the admins are told once (escalation). Called by the email
    /// worker's reminder sweep (outside quiet hours); the emails go through the outbox.
    /// </summary>
    public static async Task SendApprovalRemindersAsync(
        AtsDbContext db,
        Organization organization,
        CancellationToken ct
    )
    {
        var policies = await db.ApprovalPolicies.AsNoTracking().ToListAsync(ct);
        var max = Math.Clamp(organization.MaxReminders, 0, 10);
        // 0 turns reminders off for the whole organization, and so the escalation after them.
        if (max == 0)
            return;
        var pending = await db
            .Approvals.Where(x =>
                x.Decision == ApprovalDecision.Pending
                && (x.RemindersSent < max || x.EscalatedAt == null)
            )
            .OrderBy(x => x.CreatedAt)
            .Take(200)
            .ToListAsync(ct);
        if (pending.Count == 0)
            return;
        var subjects = pending.Select(x => x.SubjectId).Distinct().ToArray();
        var all = await db
            .Approvals.AsNoTracking()
            .Where(x => subjects.Contains(x.SubjectId))
            .ToListAsync(ct);
        // The team each request is about picks its chain, and so its reminder days.
        var teams = await db
            .Requisitions.AsNoTracking()
            .Where(x => subjects.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Department, ct);
        foreach (
            var offer in await db
                .Offers.AsNoTracking()
                .Where(x => subjects.Contains(x.Id))
                .Select(x => new { x.Id, x.Application!.Requisition!.Department })
                .ToListAsync(ct)
        )
            teams[offer.Id] = offer.Department;
        var admins = await db
            .Users.AsNoTracking()
            .Where(x => x.Role == UserRole.Admin && x.IsActive)
            .Select(x => x.Email)
            .ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var sent = 0;
        foreach (var row in pending)
        {
            var every =
                PickPolicy(
                    policies.Where(x => x.SubjectType == row.SubjectType),
                    teams.GetValueOrDefault(row.SubjectId)
                )?.ReminderDays
                ?? 2;
            if (every <= 0)
                continue;
            var siblings = all.Where(x =>
                    x.SubjectType == row.SubjectType && x.SubjectId == row.SubjectId
                )
                .ToList();
            if (!CanDecide(siblings, row))
                continue;
            var since = row.LastRemindedAt ?? TurnStartedAt(siblings, row);
            if (now - since < TimeSpan.FromDays(every))
                continue;
            var label = await ApprovalLabelAsync(db, row, ct);
            if (label is null)
                continue;
            if (row.RemindersSent < max)
            {
                await QueueApprovalRequestAsync(db, row, label, row.RequestedBy, ct);
                row.RemindersSent++;
                row.LastRemindedAt = now;
            }
            else
            {
                await EscalateApprovalAsync(db, row, label, admins, ct);
                row.EscalatedAt = now;
            }
            sent++;
        }
        if (sent > 0)
            await db.SaveChangesAsync(ct);
    }

    /// <summary>The approver ran out of reminders: the requester and the admins hear it is stuck.</summary>
    private static async Task EscalateApprovalAsync(
        AtsDbContext db,
        Approval row,
        string label,
        IEnumerable<string> admins,
        CancellationToken ct
    )
    {
        var names = await NamesAsync(db, [row.ApproverEmail], ct);
        var who = names.GetValueOrDefault(row.ApproverEmail, row.ApproverEmail);
        var reminders = row.RemindersSent == 1 ? "1 reminder" : $"{row.RemindersSent} reminders";
        await Notify.AddAsync(
            db,
            // A workflow's request names the workflow, not a person, so only the admins hear.
            [row.RequestedBy.Contains('@') ? row.RequestedBy : null, .. admins],
            new NotificationDraft(
                NotificationKinds.ApprovalStuck,
                $"Approval is stuck with {who}",
                $"/approvals?open={row.Id}",
                $"{who} has not answered the request to {label} after {reminders}. Give the step to someone else, or withdraw the request.",
                GroupKey: $"approval-stuck:{row.Id}"
            ),
            ct
        );
        await PipelineEvents.NotifyAsync(
            db,
            $"Approval is stuck with {who}: {label} ({reminders}, no answer).",
            ct,
            TeamChannel.ApprovalStuck,
            $"/approvals?open={row.Id}"
        );
    }

    /// <summary>One list item per approval row given, with what is being approved, every step of its round and the earlier rounds.</summary>
    private static async Task<List<object>> ApprovalItemsAsync(
        AtsDbContext db,
        IReadOnlyList<Approval> rows,
        string me,
        CancellationToken ct
    )
    {
        var subjectIds = rows.Select(x => x.SubjectId).Distinct().ToArray();
        var all = await db
            .Approvals.AsNoTracking()
            .Where(x => subjectIds.Contains(x.SubjectId))
            .OrderBy(x => x.Round)
            .ThenBy(x => x.Sequence)
            .ThenBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var offerIds = rows.Where(x => x.SubjectType == OfferSubject)
            .Select(x => x.SubjectId)
            .Distinct()
            .ToArray();
        var jobIds = rows.Where(x => x.SubjectType == RequisitionSubject)
            .Select(x => x.SubjectId)
            .Distinct()
            .ToArray();
        var offers = await db
            .Offers.AsNoTracking()
            .Include(x => x.Application!.Candidate)
            .Include(x => x.Application!.Requisition)
            .Include(x => x.Application!.PipelineStage)
            .Where(x => offerIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var jobs = await db
            .Requisitions.AsNoTracking()
            .Where(x => jobIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, ct);
        var applicationIds = offers.Values.Select(x => x.ApplicationId).ToArray();
        var scores = await db
            .Scorecards.AsNoTracking()
            .Where(s => applicationIds.Contains(s.Interview!.ApplicationId))
            .GroupBy(s => s.Interview!.ApplicationId)
            .Select(g => new
            {
                g.Key,
                Yes = g.Count(s =>
                    s.Recommendation == Recommendation.Yes
                    || s.Recommendation == Recommendation.StrongYes
                ),
                No = g.Count(s =>
                    s.Recommendation == Recommendation.No
                    || s.Recommendation == Recommendation.StrongNo
                ),
                Total = g.Count(),
            })
            .ToDictionaryAsync(x => x.Key, ct);
        var names = await NamesAsync(
            db,
            all.SelectMany(x =>
                new[] { x.ApproverEmail, x.RequestedBy, x.ReassignedFromEmail, x.ReassignedBy }
            ),
            ct
        );

        var items = new List<object>();
        foreach (var row in rows)
        {
            var subject = all.Where(x =>
                    x.SubjectType == row.SubjectType && x.SubjectId == row.SubjectId
                )
                .ToList();
            var round = subject.Where(x => x.Round == row.Round).ToList();
            var earlier = subject
                .Where(x => x.Round < row.Round)
                .GroupBy(x => x.Round)
                .OrderByDescending(g => g.Key)
                .Select(g =>
                {
                    var r = g.ToList();
                    return new
                    {
                        Round = g.Key,
                        Outcome = RoundOutcome(r),
                        r[0].CreatedAt,
                        r[0].Note,
                        Approvals = r.Select(x => ApprovalView(x, r, names, me)),
                    };
                })
                .ToList();
            string title,
                detail,
                subjectStatus;
            object summary;
            Guid? applicationId = null,
                requisitionId = null;
            if (row.SubjectType == OfferSubject)
            {
                if (!offers.TryGetValue(row.SubjectId, out var offer))
                    continue;
                var candidate = offer.Application!.Candidate!;
                var job = offer.Application.Requisition!;
                var score = scores.GetValueOrDefault(offer.ApplicationId);
                title = $"Offer for {candidate.FirstName} {candidate.LastName}";
                detail = $"{job.Title} ({job.Code})";
                subjectStatus = offer.Status.ToString();
                applicationId = offer.ApplicationId;
                summary = new
                {
                    CandidateName = $"{candidate.FirstName} {candidate.LastName}",
                    candidate.CurrentTitle,
                    JobTitle = job.Title,
                    JobCode = job.Code,
                    Stage = offer.Application.PipelineStage?.Name,
                    offer.Application.AppliedAt,
                    Terms = OfferTermsText(offer)
                        .Split('\n', StringSplitOptions.RemoveEmptyEntries),
                    offer.Note,
                    Scorecards = new
                    {
                        Yes = score?.Yes ?? 0,
                        No = score?.No ?? 0,
                        Total = score?.Total ?? 0,
                    },
                };
            }
            else if (row.SubjectType == WorkflowRunSubject)
            {
                if (await WorkflowApprovalItemAsync(db, row.SubjectId, ct) is not { } run)
                    continue;
                (title, detail, subjectStatus, var appId, summary) = run;
                applicationId = appId;
            }
            else
            {
                if (!jobs.TryGetValue(row.SubjectId, out var job))
                    continue;
                title = $"Open {job.Title}";
                detail =
                    $"{job.Code} · {job.Department} · {job.Openings} {(job.Openings == 1 ? "opening" : "openings")}";
                subjectStatus = job.Status.ToString();
                requisitionId = job.Id;
                var manager = job
                    .Members.Where(m => m.Role == RequisitionRole.HiringManager)
                    .OrderBy(m => m.CreatedAt)
                    .Select(m => m.User?.DisplayName)
                    .FirstOrDefault(x => x is not null);
                var plain = EmailHtml.PlainText(job.Description).Trim();
                summary = new
                {
                    job.Title,
                    job.Code,
                    job.Department,
                    job.Location,
                    job.WorkMode,
                    job.EmploymentType,
                    job.Openings,
                    job.TargetStartDate,
                    HiringManager = manager,
                    Salary = SalaryText(job),
                    Summary = plain.Length > 400 ? plain[..400].TrimEnd() + "…" : plain,
                };
            }
            items.Add(
                new
                {
                    row.Id,
                    Type = row.SubjectType,
                    row.SubjectId,
                    Title = title,
                    Detail = detail,
                    Note = row.Note ?? "",
                    ApplicationId = applicationId,
                    RequisitionId = requisitionId,
                    row.RequestedBy,
                    RequestedByName = names.GetValueOrDefault(row.RequestedBy, row.RequestedBy),
                    round[0].CreatedAt,
                    WaitingSince = TurnStartedAt(round, row),
                    Decision = row.Decision.ToString(),
                    row.DecidedAt,
                    row.Comment,
                    Status = RoundOutcome(round),
                    SubjectStatus = subjectStatus,
                    row.Round,
                    Mode = round.Any(x => x.AnyOne) ? "AnyOne"
                    : round.Select(x => x.Sequence).Distinct().Count() > 1 ? "Sequential"
                    : "Parallel",
                    Approved = round.Count(x => x.Decision == ApprovalDecision.Approved),
                    Total = round.Count,
                    CanDecide = row.ApproverEmail == me && CanDecide(round, row),
                    Approvers = round.Select(x => ApprovalView(x, round, names, me)),
                    PreviousRounds = earlier,
                    Subject = summary,
                }
            );
        }
        return items;
    }

    private static async Task<List<object>> ApprovalListAsync(
        AtsDbContext db,
        string me,
        string scope,
        CancellationToken ct
    )
    {
        List<Approval> rows;
        if (scope == "waiting")
        {
            var mine = await db
                .Approvals.AsNoTracking()
                .Where(x => x.ApproverEmail == me && x.Decision == ApprovalDecision.Pending)
                .ToListAsync(ct);
            var ids = mine.Select(x => x.SubjectId).Distinct().ToArray();
            var siblings = await db
                .Approvals.AsNoTracking()
                .Where(x => ids.Contains(x.SubjectId))
                .ToListAsync(ct);
            rows =
            [
                .. mine.Where(x =>
                        CanDecide(
                            siblings
                                .Where(s =>
                                    s.SubjectType == x.SubjectType && s.SubjectId == x.SubjectId
                                )
                                .ToList(),
                            x
                        )
                    )
                    .OrderBy(x => x.CreatedAt),
            ];
        }
        else if (scope == "requested")
        {
            // One item per request: the first step of each subject's latest round.
            var asked = await db
                .Approvals.AsNoTracking()
                .Where(x => x.RequestedBy == me)
                .ToListAsync(ct);
            rows =
            [
                .. asked
                    .GroupBy(x => (x.SubjectType, x.SubjectId))
                    .Select(g =>
                    {
                        var latest = g.Max(x => x.Round);
                        return g.Where(x => x.Round == latest)
                            .OrderBy(x => x.Sequence)
                            .ThenBy(x => x.CreatedAt)
                            .First();
                    })
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(100),
            ];
        }
        else
        {
            rows = await db
                .Approvals.AsNoTracking()
                .Where(x =>
                    x.ApproverEmail == me
                    && (
                        x.Decision == ApprovalDecision.Approved
                        || x.Decision == ApprovalDecision.Rejected
                    )
                )
                .OrderByDescending(x => x.DecidedAt)
                .Take(100)
                .ToListAsync(ct);
        }
        return await ApprovalItemsAsync(db, rows, me, ct);
    }

    /// <summary>"USD 90,000 – 120,000 a year", or null when the job has no range.</summary>
    internal static string? SalaryText(Requisition job)
    {
        if (job.SalaryMin is null && job.SalaryMax is null)
            return null;
        static string Amount(decimal value) =>
            value.ToString("#,0.##", CultureInfo.InvariantCulture);
        var range =
            job.SalaryMin is { } min && job.SalaryMax is { } max && min != max
                ? $"{Amount(min)} – {Amount(max)}"
                : Amount((job.SalaryMin ?? job.SalaryMax)!.Value);
        var per = job.SalaryPeriod switch
        {
            "Hour" => "an hour",
            "Month" => "a month",
            _ => "a year",
        };
        return $"{job.SalaryCurrency} {range} {per}";
    }
}
