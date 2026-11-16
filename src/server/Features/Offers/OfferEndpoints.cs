using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>The offer's terms. Every field is optional until the offer is submitted for approval.</summary>
public sealed record OfferTermsRequest(
    string? Note = null,
    decimal? BaseSalary = null,
    string? Currency = null,
    string? PayPeriod = null,
    string? Bonus = null,
    string? Equity = null,
    DateOnly? StartDate = null,
    string? EmploymentType = null,
    string? WorkMode = null,
    string? Location = null,
    DateOnly? ExpiresOn = null
);

public sealed record SendOfferRequest(bool NotifyCandidate = true);

/// <summary>The team records the candidate's answer. <c>DeclineReason</c> is a key from <see cref="OfferDeclines"/>; free text still works and is kept as the note under Other.</summary>
public sealed record OfferResponseRequest(
    bool Accepted,
    string? DeclineReason,
    string? DeclineNote = null
);

public static partial class AtsEndpoints
{
    private const string OfferSubject = "Offer";
    private const string RequisitionSubject = "Requisition";
    private static readonly string[] PayPeriods = ["Year", "Month", "Hour"];

    // An application has at most one of these at a time; a declined or withdrawn offer makes room for a new one.
    private static readonly OfferStatus[] OpenOfferStatuses =
    [
        OfferStatus.Draft,
        OfferStatus.PendingApproval,
        OfferStatus.Approved,
        OfferStatus.Sent,
        OfferStatus.Accepted,
    ];

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
                var offers = await db
                    .Offers.AsNoTracking()
                    .Where(x => x.ApplicationId == id)
                    .OrderByDescending(x => x.CreatedAt)
                    .ToListAsync(ct);
                var offer = offers.FirstOrDefault();
                var me = principal.Email();
                var approvals = offer is null
                    ? []
                    : await LoadApprovalsAsync(db, OfferSubject, offer.Id, ct);
                if (
                    !CanManage(application.Requisition, principal)
                    && !approvals.Any(x => x.ApproverEmail == me)
                )
                    return Results.NotFound();
                var setup = await ApprovalSetupAsync(db, OfferSubject, application.Requisition, ct);
                var creators = offers
                    .Select(x => x.CreatedBy)
                    .Concat(offers.Select(x => x.RespondedBy ?? ""))
                    .Distinct()
                    .ToArray();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(x => creators.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                var letterIds = offers.Select(x => x.LetterTemplateId).OfType<Guid>().ToArray();
                var letters = await db
                    .EmailTemplates.AsNoTracking()
                    .Where(x => letterIds.Contains(x.Id))
                    .ToDictionaryAsync(x => x.Id, x => x.Name ?? "", ct);
                var job = application.Requisition;
                return Results.Ok(
                    new
                    {
                        Offer = offer is null ? null : OfferView(offer, names, letters),
                        // Earlier offers stay readable after a decline or a withdrawal.
                        History = offers.Skip(1).Select(x => OfferView(x, names, letters)),
                        Job = new
                        {
                            job.EmploymentType,
                            job.WorkMode,
                            job.Location,
                            job.TargetStartDate,
                        },
                        // The live (latest) round; earlier rounds stay readable below it.
                        Approvals = await ApprovalViewsAsync(db, LatestRound(approvals), me, ct),
                        PreviousRounds = await PreviousRoundViewsAsync(db, approvals, me, ct),
                        ApprovalRequired = setup.Required,
                        DefaultApprovers = setup.Approvers,
                        Sequential = setup.Mode == ApprovalMode.Sequential,
                        Mode = setup.Mode.ToString(),
                        DeclineReasons = OfferDeclines.All.Select(x => new { x.Key, x.Label }),
                    }
                );
            }
        );

        api.MapPost(
                "/applications/{id:guid}/offer",
                async (
                    Guid id,
                    OfferTermsRequest? request,
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
                            new { message = "Only an active application can get an offer." }
                        );
                    var previous = await db
                        .Offers.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .FirstOrDefaultAsync(ct);
                    if (previous is not null && OpenOfferStatuses.Contains(previous.Status))
                        return Results.Conflict(
                            new { message = "This application already has an open offer." }
                        );
                    var job = application.Requisition;
                    // A revision starts from the offer it replaces; a first offer starts from the job.
                    var letter = previous is null ? await OfferLetters.DefaultAsync(db, ct) : null;
                    var offer = previous is null
                        ? new Offer
                        {
                            ApplicationId = id,
                            CreatedBy = principal.Email(),
                            EmploymentType = job.EmploymentType,
                            WorkMode = job.WorkMode,
                            Location = job.Location,
                            StartDate = job.TargetStartDate,
                            LetterTemplateId = letter?.Id,
                            LetterTemplateVersion = letter?.Version,
                            LetterMarkdown = letter?.Body,
                        }
                        : new Offer
                        {
                            ApplicationId = id,
                            CreatedBy = principal.Email(),
                            ReplacesOfferId = previous.Id,
                            Note = previous.Note,
                            BaseSalary = previous.BaseSalary,
                            Currency = previous.Currency,
                            PayPeriod = previous.PayPeriod,
                            Bonus = previous.Bonus,
                            Equity = previous.Equity,
                            StartDate = previous.StartDate,
                            EmploymentType = previous.EmploymentType,
                            WorkMode = previous.WorkMode,
                            Location = previous.Location,
                            LetterTemplateId = previous.LetterTemplateId,
                            LetterTemplateVersion = previous.LetterTemplateVersion,
                            LetterMarkdown = previous.LetterMarkdown,
                        };
                    if (
                        request is not null
                        && ApplyTerms(offer, request, replace: false) is { } error
                    )
                        return Results.ValidationProblem(error);
                    db.Offers.Add(offer);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "OfferDrafted",
                        new { offer.Id, offer.ReplacesOfferId }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/offers/{offer.Id}", new { offer.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/offers/{id:guid}",
                async (
                    Guid id,
                    OfferTermsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (
                        offer.Status
                        is not (
                            OfferStatus.Draft
                            or OfferStatus.PendingApproval
                            or OfferStatus.Approved
                        )
                    )
                        return Results.Conflict(
                            new { message = "A sent offer can no longer be changed." }
                        );
                    if (ApplyTerms(offer, request, replace: true) is { } error)
                        return Results.ValidationProblem(error);
                    // Approvers said yes to the old terms, so changed terms go back to them.
                    var reset = offer.Status != OfferStatus.Draft;
                    if (reset)
                    {
                        offer.Status = OfferStatus.Draft;
                        // The round stays as history; whoever had not answered is no longer asked.
                        await CloseRoundAsync(db, OfferSubject, offer.Id, ct);
                        Audit.Add(
                            db,
                            principal,
                            "Application",
                            offer.ApplicationId,
                            "OfferReopenedForEdit",
                            new { offer.Id }
                        );
                    }
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { reset });
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
                        return Results.Conflict(new { message = "Only a draft can be submitted." });
                    if (offer.BaseSalary is null or <= 0 || offer.StartDate is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["terms"] = ["Add the base salary and the start date first."],
                            }
                        );
                    var approvers = await ResolveApproversAsync(
                        db,
                        principal,
                        OfferSubject,
                        offer.Application!.Requisition!,
                        request,
                        ct
                    );
                    if (approvers.Error is not null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["approvers"] = [approvers.Error] }
                        );
                    if (approvers.Emails.Length == 0)
                    {
                        offer.Status = OfferStatus.Approved;
                    }
                    else
                    {
                        offer.Status = OfferStatus.PendingApproval;
                        var rows = await AddRoundAsync(
                            db,
                            OfferSubject,
                            offer.Id,
                            approvers,
                            principal.Email(),
                            request.Note,
                            ct
                        );
                        await NotifyEligibleApproversAsync(
                            db,
                            rows,
                            OfferLabel(offer),
                            principal.Email(),
                            ct
                        );
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

        // Sending tells the candidate. It does not hire: that waits for their answer.
        api.MapPost(
                "/offers/{id:guid}/send",
                async (
                    Guid id,
                    SendOfferRequest? request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Approved)
                        return Results.Conflict(
                            new { message = "The offer has to be approved before it is sent." }
                        );
                    var application = offer.Application!;
                    if (application.Status != ApplicationStatus.Active)
                        return Results.Conflict(
                            new { message = "Only an active application can get an offer." }
                        );
                    var notify = request?.NotifyCandidate ?? true;
                    if (notify && application.Candidate!.DoNotContact)
                        return Results.Conflict(
                            new
                            {
                                message = "This candidate asked not to be contacted. Mark it as sent without an email.",
                            }
                        );
                    var now = DateTimeOffset.UtcNow;
                    var zone = await db
                        .Organizations.Select(x => x.TimeZone)
                        .FirstOrDefaultAsync(ct);
                    var closes = offer.ExpiresOn is { } lastDay
                        ? OfferLetters.ClosesAt(lastDay, TimeText.Zone(zone))
                        : (DateTimeOffset?)null;
                    if (closes <= now)
                        return Results.Conflict(
                            new
                            {
                                message = "The last day to accept has passed. Change the date, then send it.",
                            }
                        );
                    // What the candidate reads is frozen here and never changes after.
                    if (!string.IsNullOrWhiteSpace(offer.LetterMarkdown))
                    {
                        var values = await OfferLetters.ValuesAsync(
                            db,
                            offer,
                            principal.Email(),
                            ct
                        );
                        if (MediaEndpoints.HasImageWithoutAlt(offer.LetterMarkdown))
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["letter"] = [MediaEndpoints.AltRequired],
                                }
                            );
                        var missing = EmailTemplates.Missing(offer.LetterMarkdown, values);
                        if (missing.Length > 0)
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["letter"] =
                                    [
                                        $"The letter uses details this offer does not have: {string.Join(", ", missing.Select(OfferLetters.Label))}. Fill them in or take them out of the letter.",
                                    ],
                                }
                            );
                        offer.LetterSent = OfferLetters.Fill(offer.LetterMarkdown, values);
                    }
                    offer.ExpiresAt = closes;
                    offer.Status = OfferStatus.Sent;
                    offer.SentAt = now;
                    offer.UpdatedAt = now;
                    application.LastActivityAt = now;
                    if (notify)
                    {
                        // A one-click link that signs them in on the offer page.
                        var link = await CandidateLinks.CreateAsync(
                            db,
                            application.CandidateId,
                            application.Id,
                            OfferLetters.PortalPath(application.Id),
                            ct
                        );
                        var details = new Dictionary<string, string>
                        {
                            ["firstName"] = application.Candidate!.FirstName,
                            ["jobTitle"] = application.Requisition!.Title,
                        };
                        if (link is not null)
                            details["portalLink"] = link;
                        await EmailTemplates.QueueAsync(
                            db,
                            "acceptance",
                            application.RequisitionId,
                            application.Candidate.Email,
                            details,
                            application.Id,
                            ct
                        );
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        application.Id,
                        "OfferSent",
                        new { offer.Id, Emailed = notify }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The candidate's answer, recorded by the team (by phone, email or in person). Accepting hires.
        // A late answer after the deadline can still be recorded here; the portal refuses it.
        api.MapPost(
                "/offers/{id:guid}/response",
                async (
                    Guid id,
                    OfferResponseRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status is not (OfferStatus.Sent or OfferStatus.Expired))
                        return Results.Conflict(
                            new { message = "Only a sent offer can be accepted or declined." }
                        );
                    if (!request.Accepted)
                    {
                        var (key, note) = OfferDeclines.Normalize(
                            request.DeclineReason,
                            request.DeclineNote
                        );
                        await DeclineOfferAsync(db, offer, principal.Email(), key, note, ct);
                        return Results.Ok(new { JobFilled = false, StillActive = 0 });
                    }
                    if (await AcceptOfferAsync(db, offer, principal.Email(), null, ct) is { } error)
                        return Results.Conflict(new { message = error });
                    var requisition = offer.Application!.Requisition!;
                    // When the last opening fills, the team usually closes out everyone else.
                    var filled = requisition.Status == RequisitionStatus.Filled;
                    var stillActive = filled
                        ? await db.Applications.CountAsync(
                            x =>
                                x.RequisitionId == requisition.Id
                                && x.Status == ApplicationStatus.Active,
                            ct
                        )
                        : 0;
                    return Results.Ok(new { JobFilled = filled, StillActive = stillActive });
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
                    if (!WithdrawableOfferStatuses.Contains(offer.Status))
                        return Results.Conflict(
                            new { message = "This offer can no longer be withdrawn." }
                        );
                    await WithdrawOfferAsync(db, offer, principal.Email(), ct);
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Undo hire: the acceptance fell through. The offer goes back to Sent and the application to where it was.
        api.MapPost(
                "/offers/{id:guid}/reverse",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.Status != OfferStatus.Accepted || offer.PreviousStageId is null)
                        return Results.Conflict(
                            new { message = "Only an accepted offer can be undone." }
                        );
                    var application = offer.Application!;
                    var fromStage = application.PipelineStageId;
                    var fromStatus = application.Status;
                    application.PipelineStageId = offer.PreviousStageId.Value;
                    application.Status = offer.PreviousStatus ?? ApplicationStatus.Active;
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    offer.Status = OfferStatus.Sent;
                    offer.RespondedAt = null;
                    offer.RespondedBy = null;
                    offer.RespondedName = null;
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    var requisition = application.Requisition!;
                    if (requisition.Status == RequisitionStatus.Filled)
                    {
                        requisition.Status = RequisitionStatus.Open;
                        requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    }
                    PipelineEvents.RecordMove(
                        db,
                        application,
                        fromStage,
                        fromStatus,
                        principal.Email()
                    );
                    await PipelineEvents.PublishApplicationAsync(
                        db,
                        "application.stage_changed",
                        application,
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        application.Id,
                        "HireUndone",
                        new { offer.Id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        MapOfferLetters(api);
        MapApprovals(api);
    }

    // Anything not answered or closed yet: rejecting someone can withdraw it.
    internal static readonly OfferStatus[] WithdrawableOfferStatuses =
    [
        OfferStatus.Draft,
        OfferStatus.PendingApproval,
        OfferStatus.Approved,
        OfferStatus.Sent,
    ];

    /// <summary>Withdraws the offer and drops waiting approvals (the caller saves).</summary>
    internal static async Task WithdrawOfferAsync(
        AtsDbContext db,
        Offer offer,
        string actorEmail,
        CancellationToken ct
    )
    {
        offer.Status = OfferStatus.Withdrawn;
        offer.UpdatedAt = DateTimeOffset.UtcNow;
        await CloseRoundAsync(db, OfferSubject, offer.Id, ct);
        Audit.Add(
            db,
            actorEmail,
            "Application",
            offer.ApplicationId,
            "OfferWithdrawn",
            new { offer.Id }
        );
    }

    /// <summary>
    /// Accepting hires: the application moves to the job's Hired stage. Used by the team's "Mark as
    /// accepted" and by the candidate in the portal (<paramref name="typedName"/> is what they typed).
    /// Saves. Returns why it could not, or null.
    /// </summary>
    internal static async Task<string?> AcceptOfferAsync(
        AtsDbContext db,
        Offer offer,
        string actorEmail,
        string? typedName,
        CancellationToken ct
    )
    {
        var application = offer.Application!;
        if (application.Status != ApplicationStatus.Active)
            return "Only an active application can be hired.";
        var hiredStage = await FindHiredStageAsync(db, application.RequisitionId, ct);
        if (hiredStage is null)
            return "This job has no Hired stage.";
        var now = DateTimeOffset.UtcNow;
        var fromStage = application.PipelineStageId;
        var fromStatus = application.Status;
        offer.Status = OfferStatus.Accepted;
        offer.RespondedAt = now;
        offer.RespondedBy = actorEmail;
        offer.RespondedName = typedName;
        offer.UpdatedAt = now;
        offer.PreviousStageId = fromStage;
        offer.PreviousStatus = fromStatus;
        application.PipelineStageId = hiredStage.Id;
        application.Status = ApplicationStatus.Hired;
        application.DispositionReason = null;
        application.DispositionNote = null;
        application.LastActivityAt = now;
        await PipelineEvents.OnMovedAsync(db, application, fromStage, fromStatus, actorEmail, ct);
        await OfferAnsweredAsync(db, application, true, null, actorEmail, ct);
        Audit.Add(
            db,
            actorEmail,
            "Application",
            application.Id,
            "OfferAccepted",
            new { offer.Id, InPortal = typedName is not null }
        );
        await db.SaveChangesAsync(ct);
        return null;
    }

    /// <summary>Records a decline with its reason key and note, tells the team, and saves.</summary>
    internal static async Task DeclineOfferAsync(
        AtsDbContext db,
        Offer offer,
        string actorEmail,
        string reason,
        string? note,
        CancellationToken ct
    )
    {
        var application = offer.Application!;
        var now = DateTimeOffset.UtcNow;
        offer.Status = OfferStatus.Declined;
        offer.RespondedAt = now;
        offer.RespondedBy = actorEmail;
        offer.UpdatedAt = now;
        offer.DeclineReason = reason;
        offer.DeclineNote = note;
        application.LastActivityAt = now;
        Audit.Add(
            db,
            actorEmail,
            "Application",
            application.Id,
            "OfferDeclined",
            new
            {
                offer.Id,
                DeclineReason = OfferDeclines.Label(reason),
                offer.DeclineNote,
            }
        );
        var why = note is null
            ? OfferDeclines.Label(reason)
            : $"{OfferDeclines.Label(reason)}. {note}";
        await OfferAnsweredAsync(db, application, false, why, actorEmail, ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// The job's recruiters (and whoever owns the conversation) hear that the candidate answered,
    /// in the app and in the team channel. The person who recorded the answer is not told.
    /// </summary>
    private static async Task OfferAnsweredAsync(
        AtsDbContext db,
        Application application,
        bool accepted,
        string? reason,
        string actorEmail,
        CancellationToken ct
    )
    {
        var name = $"{application.Candidate!.FirstName} {application.Candidate.LastName}";
        var title =
            $"{name} {(accepted ? "accepted" : "turned down")} the offer for {application.Requisition!.Title}";
        var href = $"/applications/{application.Id}/offer";
        await Notify.AddAsync(
            db,
            [
                application.AssigneeEmail,
                .. await EmailThreads.RecruitersAsync(db, application.Requisition, ct),
            ],
            new NotificationDraft(
                NotificationKinds.OfferResponse,
                title,
                href,
                Body: reason is null ? null : $"Their reason: {reason}",
                ActorEmail: actorEmail,
                ApplicationId: application.Id
            ),
            ct
        );
        await PipelineEvents.NotifyAsync(db, $"{title}.", ct, TeamChannel.OfferResponse, href);
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
        return
            offer?.Application?.Requisition is not null
            && CanManage(offer.Application.Requisition, principal)
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
        return StageRules.Hired(stages);
    }

    private static string OfferLabel(Offer offer) =>
        $"the offer for {offer.Application!.Candidate!.FirstName} {offer.Application.Candidate.LastName} ({offer.Application.Requisition!.Title})";

    /// <summary>The terms as a few plain lines, for approvers who read them outside the offer page.</summary>
    internal static string OfferTermsText(Offer offer) =>
        string.Join("\n", OfferTermRows(offer).Select(x => $"{x.Label}: {x.Value}"));

    /// <summary>Each term that is filled in, in reading order.</summary>
    internal static List<(string Label, string Value)> OfferTermRows(Offer offer)
    {
        var rows = new List<(string, string)>();
        if (offer.BaseSalary is { } salary)
            rows.Add(
                (
                    "Base salary",
                    $"{offer.Currency} {salary.ToString("#,0.##", CultureInfo.InvariantCulture)} per {offer.PayPeriod.ToLowerInvariant()}"
                )
            );
        if (offer.Bonus.Length > 0)
            rows.Add(("Bonus", offer.Bonus));
        if (offer.Equity.Length > 0)
            rows.Add(("Equity", offer.Equity));
        if (offer.StartDate is { } start)
            rows.Add(("Start date", start.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture)));
        var role = new[] { offer.EmploymentType, offer.WorkMode, offer.Location }
            .Where(x => x.Length > 0)
            .ToArray();
        if (role.Length > 0)
            rows.Add(("Role", string.Join(", ", role)));
        if (offer.ExpiresOn is { } expires)
            rows.Add(
                ("Offer open until", expires.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture))
            );
        return rows;
    }

    private static object OfferView(
        Offer offer,
        IReadOnlyDictionary<string, string> names,
        IReadOnlyDictionary<Guid, string> letters
    ) =>
        new
        {
            offer.Id,
            Status = offer.Status.ToString(),
            offer.Note,
            offer.BaseSalary,
            offer.Currency,
            offer.PayPeriod,
            offer.Bonus,
            offer.Equity,
            offer.StartDate,
            offer.EmploymentType,
            offer.WorkMode,
            offer.Location,
            offer.ExpiresOn,
            offer.ExpiresAt,
            offer.LetterTemplateId,
            // A deleted letter has no name; the version still says which wording it was.
            LetterTemplateName = offer.LetterTemplateId is { } letterId
                ? letters.GetValueOrDefault(letterId)
                : null,
            offer.LetterTemplateVersion,
            offer.LetterMarkdown,
            offer.LetterSent,
            offer.CreatedBy,
            CreatedByName = names.GetValueOrDefault(offer.CreatedBy, offer.CreatedBy),
            offer.CreatedAt,
            offer.UpdatedAt,
            offer.SentAt,
            offer.RespondedAt,
            offer.RespondedName,
            // Answered in the portal, or recorded by someone on the team.
            RespondedByName = offer.RespondedName is not null ? null
            : offer.RespondedBy is null ? null
            : names.GetValueOrDefault(offer.RespondedBy, offer.RespondedBy),
            offer.DeclineReason,
            DeclineReasonLabel = offer.DeclineReason is null
                ? null
                : OfferDeclines.Label(offer.DeclineReason),
            offer.DeclineNote,
            offer.ReplacesOfferId,
        };

    // Validates and copies the terms. PUT replaces them all (a missing date clears it); a new
    // offer only takes what was sent on top of what it was prefilled with.
    private static Dictionary<string, string[]>? ApplyTerms(
        Offer offer,
        OfferTermsRequest request,
        bool replace
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (request.BaseSalary is < 0 or > 100_000_000)
            errors["baseSalary"] = ["Enter a base salary of 0 or more."];
        var currency = request.Currency?.Trim().ToUpperInvariant();
        if (
            currency is not null
            && (currency.Length != 3 || !currency.All(char.IsAsciiLetterUpper))
        )
            errors["currency"] = ["Choose a currency."];
        var period = PayPeriods.FirstOrDefault(x =>
            x.Equals(request.PayPeriod, StringComparison.OrdinalIgnoreCase)
        );
        if (request.PayPeriod is not null && period is null)
            errors["payPeriod"] = ["Choose year, month or hour."];
        if (request.StartDate is { } start && request.ExpiresOn is { } expires && expires > start)
            errors["expiresOn"] = ["The offer should close before the start date."];
        if (errors.Count > 0)
            return errors;
        string Text(string? value, string current, int max) =>
            value is null ? (replace ? "" : current)
            : value.Trim() is var v && v.Length > max ? v[..max]
            : v;
        offer.Note = Text(request.Note, offer.Note, 4000);
        offer.Bonus = Text(request.Bonus, offer.Bonus, 300);
        offer.Equity = Text(request.Equity, offer.Equity, 300);
        offer.EmploymentType = Text(request.EmploymentType, offer.EmploymentType, 40);
        offer.WorkMode = Text(request.WorkMode, offer.WorkMode, 40);
        offer.Location = Text(request.Location, offer.Location, 200);
        if (replace || request.BaseSalary is not null)
            offer.BaseSalary = request.BaseSalary;
        if (replace || request.StartDate is not null)
            offer.StartDate = request.StartDate;
        if (replace || request.ExpiresOn is not null)
            offer.ExpiresOn = request.ExpiresOn;
        offer.Currency = currency ?? offer.Currency;
        offer.PayPeriod = period ?? offer.PayPeriod;
        return null;
    }
}
