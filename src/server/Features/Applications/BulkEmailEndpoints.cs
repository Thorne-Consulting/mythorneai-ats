using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// People from a Candidates, Pipeline or talent pool selection. Applications become messages in
/// their own threads (replies come back one by one); a person with no application gets a direct
/// email whose replies go to the sender's own mailbox.
/// </summary>
public sealed record BulkEmailRequest(
    Guid[]? ApplicationIds,
    Guid[]? CandidateIds,
    string? Subject,
    string? Body,
    DateTimeOffset? ScheduledFor = null,
    // "Everyone matching" on the Candidates list: the list's query string, as POST /api/candidates/bulk takes it.
    string? Filter = null,
    Guid? PoolId = null
);

public static class BulkEmail
{
    public const int MaxRecipients = 500;

    /// <summary>Why someone is left out of a bulk email, or null when they can be emailed.</summary>
    public static string? SkipReason(Candidate candidate, Application? application) =>
        candidate.DoNotContact ? "Asked not to be contacted"
        : string.IsNullOrWhiteSpace(candidate.Email) ? "No email address"
        : candidate.EmailBounced ? "Emails to this address bounce"
        : application?.Status == ApplicationStatus.PendingVerification
            ? "Hasn't confirmed their email yet"
        : null;
}

public static partial class AtsEndpoints
{
    private sealed record BulkRecipient(
        Candidate Candidate,
        Application? Application,
        string? Skip
    );

    private static async Task<List<BulkRecipient>> BulkRecipientsAsync(
        AtsDbContext db,
        BulkEmailRequest request,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var applicationIds = (request.ApplicationIds ?? [])
            .Distinct()
            .Take(BulkEmail.MaxRecipients)
            .ToArray();
        // People the sender can see, picked by id, by the Candidates list's filter or by talent pool.
        var visible = FilterCandidates(
            new QueryCollection(new Dictionary<string, StringValues> { ["includeDnc"] = "true" }),
            principal,
            db
        ).People;
        var picked = (request.CandidateIds ?? []).ToHashSet();
        if (request.Filter is { } filter)
            picked.UnionWith(
                await FilterCandidates(
                    new QueryCollection(QueryHelpers.ParseQuery(filter)),
                    principal,
                    db
                )
                    .People.Select(x => x.Id)
                    .Take(BulkEmail.MaxRecipients + 1)
                    .ToListAsync(ct)
            );
        if (request.PoolId is { } poolId)
            picked.UnionWith(
                await visible
                    .Where(x =>
                        db.TalentPoolMembers.Any(m => m.PoolId == poolId && m.CandidateId == x.Id)
                    )
                    .Select(x => x.Id)
                    .Take(BulkEmail.MaxRecipients + 1)
                    .ToListAsync(ct)
            );
        var candidateIds = picked.Take(BulkEmail.MaxRecipients).ToArray();
        var applications = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .Where(x => applicationIds.Contains(x.Id))
            .ToListAsync(ct);
        var recipients = applications
            .Where(x => CanManage(x.Requisition!, principal))
            .Select(x => new BulkRecipient(x.Candidate!, x, null))
            .ToList();
        if (candidateIds.Length > 0)
        {
            // Each person's most recent application that the sender can manage carries the message.
            var latest = (
                await ManageableThreads(db, principal)
                    .Include(x => x.Candidate)
                    .Include(x => x.Requisition)
                    .Where(x =>
                        candidateIds.Contains(x.CandidateId)
                        && x.Status != ApplicationStatus.PendingVerification
                    )
                    .AsTracking()
                    .ToListAsync(ct)
            )
                .GroupBy(x => x.CandidateId)
                .ToDictionary(g => g.Key, g => g.OrderByDescending(x => x.LastActivityAt).First());
            // People with no job the sender manages (a talent pool prospect) get a direct email.
            var withThread = latest.Keys.ToArray();
            var loose = await visible
                .AsTracking()
                .Where(x => candidateIds.Contains(x.Id) && !withThread.Contains(x.Id))
                .ToListAsync(ct);
            recipients.AddRange(
                latest.Values.Select(x => new BulkRecipient(x.Candidate!, x, null))
            );
            recipients.AddRange(loose.Select(x => new BulkRecipient(x, null, null)));
        }
        // One email per person, even when two of their applications were selected.
        return recipients
            .GroupBy(x => x.Candidate.Id)
            .Select(g => g.First())
            .Select(x => x with { Skip = BulkEmail.SkipReason(x.Candidate, x.Application) })
            .OrderBy(x => x.Skip != null)
            .ThenBy(x => x.Candidate.FirstName)
            .ToList();
    }

    private static async Task<Dictionary<string, string>> BulkDetailsAsync(
        AtsDbContext db,
        BulkRecipient recipient,
        string me,
        CancellationToken ct
    )
    {
        if (recipient.Application is { } application)
            return await EmailThreads.DetailsAsync(db, application, me, ct);
        var sender = await db
            .Users.AsNoTracking()
            .Where(x => x.Email == me)
            .Select(x => x.DisplayName)
            .SingleOrDefaultAsync(ct);
        var candidate = recipient.Candidate;
        return await EmailTemplates.WithOrganizationAsync(
            db,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["lastName"] = candidate.LastName,
                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                ["senderName"] = sender ?? "",
            },
            ct
        );
    }

    private static void MapBulkEmail(RouteGroupBuilder api)
    {
        // Who gets it, who is skipped and why, and each person's message with details filled in.
        api.MapPost(
                "/messages/bulk/preview",
                async (
                    BulkEmailRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var recipients = await BulkRecipientsAsync(db, request, principal, ct);
                    var rows = new List<object>();
                    foreach (var recipient in recipients)
                    {
                        var details = await BulkDetailsAsync(db, recipient, me, ct);
                        var (subject, body) = EmailTemplates.Render(
                            request.Subject ?? "",
                            request.Body ?? "",
                            details
                        );
                        var missing = EmailTemplates.Missing(
                            (recipient.Application is null ? request.Subject + "\n" : "")
                                + request.Body,
                            details
                        );
                        rows.Add(
                            new
                            {
                                CandidateId = recipient.Candidate.Id,
                                ApplicationId = recipient.Application?.Id,
                                Name = $"{recipient.Candidate.FirstName} {recipient.Candidate.LastName}",
                                recipient.Candidate.Email,
                                JobTitle = recipient.Application?.Requisition?.Title,
                                Skip = recipient.Skip
                                    ?? (
                                        missing.Length > 0
                                            ? $"No {string.Join(" or ", missing.Select(EmailTemplates.DetailLabel)).ToLowerInvariant()} to fill in"
                                            : null
                                    ),
                                Subject = subject,
                                Body = body,
                            }
                        );
                    }
                    return Results.Ok(rows);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/messages/bulk",
                async (
                    BulkEmailRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IConfiguration configuration,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var body = request.Body?.Trim() ?? "";
                    if (body.Length is 0 or > MaxMessage)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] = ["Write a message of up to 10,000 characters."],
                            }
                        );
                    if (MediaEndpoints.HasImageWithoutAlt(body))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] = [MediaEndpoints.AltRequired],
                            }
                        );
                    var now = DateTimeOffset.UtcNow;
                    if (
                        request.ScheduledFor is { } at
                        && (at < now.AddMinutes(1) || at > now.AddYears(1))
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["scheduledFor"] =
                                [
                                    "Pick a time at least a minute from now and within a year.",
                                ],
                            }
                        );
                    var me = principal.Email();
                    var senderFormat = await db
                        .Organizations.Select(x => x.SenderNameFormat)
                        .SingleOrDefaultAsync(ct);
                    var recipients = await BulkRecipientsAsync(db, request, principal, ct);
                    var sent = 0;
                    var skipped = new List<object>();
                    var touched = new List<(Guid ApplicationId, Guid CandidateId)>();
                    foreach (var recipient in recipients)
                    {
                        var details = await BulkDetailsAsync(db, recipient, me, ct);
                        var (subject, filled) = EmailTemplates.Render(
                            request.Subject ?? "",
                            body,
                            details
                        );
                        var missing = EmailTemplates.Missing(
                            (recipient.Application is null ? request.Subject + "\n" : "") + body,
                            details
                        );
                        var reason =
                            recipient.Skip
                            ?? (
                                missing.Length > 0
                                    ? $"No {string.Join(" or ", missing.Select(EmailTemplates.DetailLabel)).ToLowerInvariant()} to fill in"
                                    : null
                            );
                        var name =
                            $"{recipient.Candidate.FirstName} {recipient.Candidate.LastName}";
                        if (reason is not null)
                        {
                            skipped.Add(new { Name = name, Reason = reason });
                            continue;
                        }
                        if (recipient.Application is { } application)
                        {
                            var message = new ApplicationMessage
                            {
                                ApplicationId = application.Id,
                                Body = filled,
                                AuthorEmail = me,
                                ScheduledFor = request.ScheduledFor,
                            };
                            db.ApplicationMessages.Add(message);
                            application.LastActivityAt = now;
                            await EmailThreads.QueueCandidateCopyAsync(
                                db,
                                configuration,
                                application,
                                message,
                                [],
                                ct
                            );
                            touched.Add((application.Id, application.CandidateId));
                        }
                        else
                        {
                            var company = details["company"];
                            db.EmailOutbox.Add(
                                new EmailOutboxItem
                                {
                                    Recipient = recipient.Candidate.Email,
                                    Subject = string.IsNullOrWhiteSpace(subject)
                                        ? $"A message from {company}"
                                        : subject,
                                    Body = filled,
                                    TemplateKey = "bulk",
                                    ReplyTo = me,
                                    FromName = EmailThreads.SenderName(
                                        senderFormat,
                                        details.GetValueOrDefault("senderName"),
                                        company
                                    ),
                                    NextAttemptAt = request.ScheduledFor ?? now,
                                }
                            );
                        }
                        sent++;
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Message",
                        "bulk",
                        "BulkEmailSent",
                        new
                        {
                            sent,
                            skipped = skipped.Count,
                            request.ScheduledFor,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    if (touched.Count > 0)
                        await hub
                            .Clients.Group(InboxHub.Staff)
                            .SendAsync("threadChanged", new { applicationId = (Guid?)null }, ct);
                    return Results.Ok(new { Sent = sent, Skipped = skipped });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
