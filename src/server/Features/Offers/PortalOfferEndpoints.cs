using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>"Accept offer": the candidate types their full name to confirm. Not a legal signature.</summary>
public sealed record PortalAcceptOfferRequest(string? FullName);

public sealed record PortalDeclineOfferRequest(string? Reason, string? Note);

/// <summary>
/// The candidate's side of an offer, signed in with the portal session. They read the letter and
/// the terms, then accept (which hires them, the same as the team's "Mark as accepted") or decline.
/// An offer whose last day has passed cannot be answered.
/// </summary>
public static partial class AtsEndpoints
{
    public static IEndpointRouteBuilder MapPublicOffers(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints
            .MapGroup("/public/portal/applications/{applicationId:guid}/offer")
            .RequireRateLimiting("public-candidate");

        api.MapGet(
            "",
            async (
                Guid applicationId,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var offer = await SentOfferAsync(db, applicationId, candidateId.Value, ct);
                // No offer yet is not an error: the application page asks on every visit.
                if (offer is null)
                    return Results.NoContent();
                var application = offer.Application!;
                var company = await db.Organizations.Select(x => x.Name).FirstOrDefaultAsync(ct);
                return Results.Ok(
                    new
                    {
                        Id = offer.Id,
                        Status = PortalStatus(offer, DateTimeOffset.UtcNow),
                        JobTitle = application.Requisition!.Title,
                        Company = company,
                        CandidateName = $"{application.Candidate!.FirstName} {application.Candidate.LastName}".Trim(),
                        Letter = offer.LetterSent,
                        Terms = OfferTermRows(offer).Select(x => new { x.Label, x.Value }),
                        offer.ExpiresAt,
                        offer.SentAt,
                        offer.RespondedAt,
                        offer.RespondedName,
                        DeclineReason = offer.Status == OfferStatus.Declined
                        && offer.DeclineReason is { } key
                            ? OfferDeclines.Label(key)
                            : null,
                        DeclineReasons = OfferDeclines.All.Select(x => new { x.Key, x.Label }),
                    }
                );
            }
        );

        api.MapPost(
            "/accept",
            async (
                Guid applicationId,
                PortalAcceptOfferRequest request,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var offer = await SentOfferAsync(db, applicationId, candidateId.Value, ct);
                if (offer is null)
                    return Results.NotFound();
                if (Unanswerable(offer) is { } refused)
                    return refused;
                var candidate = offer.Application!.Candidate!;
                if (!NameMatches(request.FullName, candidate.FirstName, candidate.LastName))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["fullName"] =
                            [
                                $"Type your full name as we have it: {candidate.FirstName} {candidate.LastName}.",
                            ],
                        }
                    );
                if (
                    await AcceptOfferAsync(
                        db,
                        offer,
                        candidate.Email,
                        Squash(request.FullName!),
                        ct
                    ) is
                    { } error
                )
                    return Results.Conflict(new { message = error });
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/decline",
            async (
                Guid applicationId,
                PortalDeclineOfferRequest request,
                [FromHeader(Name = PublicEndpoints.SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var offer = await SentOfferAsync(db, applicationId, candidateId.Value, ct);
                if (offer is null)
                    return Results.NotFound();
                if (Unanswerable(offer) is { } refused)
                    return refused;
                if (!OfferDeclines.All.Any(x => x.Key == request.Reason))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["reason"] = ["Choose a reason."] }
                    );
                var (key, note) = OfferDeclines.Normalize(request.Reason, request.Note);
                await DeclineOfferAsync(
                    db,
                    offer,
                    offer.Application!.Candidate!.Email,
                    key,
                    note,
                    ct
                );
                return Results.NoContent();
            }
        );

        return endpoints;
    }

    /// <summary>The latest offer the team actually sent on this person's own application.</summary>
    private static Task<Offer?> SentOfferAsync(
        AtsDbContext db,
        Guid applicationId,
        Guid candidateId,
        CancellationToken ct
    ) =>
        db
            .Offers.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Where(x =>
                x.ApplicationId == applicationId
                && x.Application!.CandidateId == candidateId
                && x.SentAt != null
            )
            .OrderByDescending(x => x.SentAt)
            .FirstOrDefaultAsync(ct);

    /// <summary>What the candidate sees: a sent offer past its last day reads Expired even before the worker runs.</summary>
    internal static string PortalStatus(Offer offer, DateTimeOffset now) =>
        offer.Status == OfferStatus.Sent && offer.ExpiresAt <= now
            ? nameof(OfferStatus.Expired)
            : offer.Status.ToString();

    private static IResult? Unanswerable(Offer offer) =>
        PortalStatus(offer, DateTimeOffset.UtcNow) switch
        {
            nameof(OfferStatus.Sent) => null,
            nameof(OfferStatus.Expired) => Results.Conflict(
                new
                {
                    message = "This offer closed before it was answered. Message the team if you are still interested.",
                }
            ),
            _ => Results.Conflict(
                new { message = "This offer has already been answered or withdrawn." }
            ),
        };

    /// <summary>Same letters in any case, with spaces and accents as typed: "  jordan   LEE " matches "Jordan Lee".</summary>
    internal static bool NameMatches(string? typed, string firstName, string lastName) =>
        typed is not null
        && string.Equals(
            Squash(typed),
            Squash($"{firstName} {lastName}"),
            StringComparison.CurrentCultureIgnoreCase
        );

    private static string Squash(string text) => Spaces().Replace(text.Trim(), " ");

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    /// <summary>
    /// Sent offers past their last day become Expired, and the job's recruiters hear about it.
    /// The worker calls this every few minutes. Returns how many expired.
    /// </summary>
    public static async Task<int> ExpireOffersAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var due = await db
            .Offers.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Where(x => x.Status == OfferStatus.Sent && x.ExpiresAt <= now)
            .Take(200)
            .ToListAsync(ct);
        foreach (var offer in due)
        {
            var application = offer.Application!;
            offer.Status = OfferStatus.Expired;
            offer.UpdatedAt = now;
            Audit.Add(
                db,
                "system",
                "Application",
                application.Id,
                "OfferExpired",
                new { offer.Id }
            );
            var name = $"{application.Candidate!.FirstName} {application.Candidate.LastName}";
            await Notify.AddAsync(
                db,
                [
                    application.AssigneeEmail,
                    .. await EmailThreads.RecruitersAsync(db, application.Requisition!, ct),
                ],
                new NotificationDraft(
                    NotificationKinds.OfferResponse,
                    $"{name}'s offer for {application.Requisition!.Title} closed without an answer",
                    $"/applications/{application.Id}/offer",
                    Body: "You can still record their answer, or start a revised offer.",
                    ApplicationId: application.Id
                ),
                ct
            );
        }
        if (due.Count > 0)
            await db.SaveChangesAsync(ct);
        return due.Count;
    }
}

public static partial class AtsEndpoints
{
    public static readonly TimeSpan OfferReminderLead = TimeSpan.FromHours(48);

    /// <summary>
    /// Two days before a sent offer closes: the candidate gets the <c>offer-reminder</c> email (with
    /// a one-click link to the offer) and the job's recruiters a notification. Once per offer, and
    /// only for offers that were open longer than two days to begin with. Returns how many.
    /// </summary>
    public static async Task<int> RemindOffersAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var soon = now + OfferReminderLead;
        var due = (
            await db
                .Offers.Include(x => x.Application)
                    .ThenInclude(x => x!.Candidate)
                .Include(x => x.Application)
                    .ThenInclude(x => x!.Requisition)
                .Where(x =>
                    x.Status == OfferStatus.Sent
                    && x.ReminderSentAt == null
                    && x.ExpiresAt > now
                    && x.ExpiresAt <= soon
                )
                .Take(200)
                .ToListAsync(ct)
        )
            .Where(x => x.SentAt < x.ExpiresAt - OfferReminderLead)
            .ToList();
        if (due.Count == 0)
            return 0;
        var organizationZone = await db
            .Organizations.Select(x => x.TimeZone)
            .FirstOrDefaultAsync(ct);
        foreach (var offer in due)
        {
            var application = offer.Application!;
            var candidate = application.Candidate!;
            var job = application.Requisition!;
            offer.ReminderSentAt = now;
            if (!candidate.DoNotContact)
            {
                var details = new Dictionary<string, string>
                {
                    ["firstName"] = candidate.FirstName,
                    ["jobTitle"] = job.Title,
                    // The last minute of the last day: "Tuesday, December 1, 2026 at 11:59 PM ...".
                    ["dueDate"] = TimeText.DateTime(
                        offer.ExpiresAt!.Value.AddMinutes(-1),
                        TimeText.Zone(candidate.TimeZone, organizationZone)
                    ),
                };
                if (
                    await CandidateLinks.CreateAsync(
                        db,
                        candidate.Id,
                        application.Id,
                        OfferLetters.PortalPath(application.Id),
                        ct
                    ) is
                    { } link
                )
                    details["portalLink"] = link;
                await EmailTemplates.QueueAsync(
                    db,
                    "offer-reminder",
                    job.Id,
                    candidate.Email,
                    details,
                    application.Id,
                    ct
                );
            }
            Audit.Add(
                db,
                "system",
                "Application",
                application.Id,
                "OfferReminderSent",
                new { offer.Id, Emailed = !candidate.DoNotContact }
            );
            await Notify.AddAsync(
                db,
                [application.AssigneeEmail, .. await EmailThreads.RecruitersAsync(db, job, ct)],
                new NotificationDraft(
                    NotificationKinds.OfferResponse,
                    $"{candidate.FirstName} {candidate.LastName}'s offer for {job.Title} closes in 2 days",
                    $"/applications/{application.Id}/offer",
                    Body: candidate.DoNotContact
                        ? "They have not answered yet. They asked not to be contacted, so we did not remind them."
                        : "They have not answered yet. We emailed them a reminder.",
                    ApplicationId: application.Id
                ),
                ct
            );
        }
        await db.SaveChangesAsync(ct);
        return due.Count;
    }
}

/// <summary>
/// Reminds candidates two days before an offer closes, then closes offers whose last day has
/// passed. Small and frequent, so the deadline is close to exact.
/// </summary>
public sealed class OfferExpiryWorker(
    IServiceScopeFactory scopes,
    ILogger<OfferExpiryWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                await AtsEndpoints.RemindOffersAsync(db, DateTimeOffset.UtcNow, stoppingToken);
                await AtsEndpoints.ExpireOffersAsync(db, DateTimeOffset.UtcNow, stoppingToken);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogWarning(error, "Closing expired offers failed; trying again later.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
