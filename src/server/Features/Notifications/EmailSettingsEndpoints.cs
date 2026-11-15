using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record EmailSenderRequest(string? SenderNameFormat);

/// <summary>
/// Settings, Email: whether sending is set up (from the server's settings), how a person's emails
/// are named, every email sent with retry and cancel, and the addresses we no longer email.
/// </summary>
public static partial class EmailSettingsEndpoints
{
    /// <summary>What the log shows for one email, in the words people use.</summary>
    public static string Status(EmailOutboxItem x, DateTimeOffset now) =>
        x.Status switch
        {
            EmailOutboxStatus.Failed => "Failed",
            EmailOutboxStatus.Succeeded => x.DeliveryStatus switch
            {
                "bounced" or "complained" or "suppressed" => "Bounced",
                "failed" => "Failed",
                "delivered" => "Delivered",
                "opened" or "clicked" => "Opened",
                _ => "Sent",
            },
            _ when x.Attempts == 0 && x.NextAttemptAt > now.AddSeconds(15) => "Scheduled",
            _ when x.Attempts > 0 => "Retrying",
            _ => "Sending",
        };

    private static readonly string[] BouncedStates = ["bounced", "complained", "suppressed"];

    /// <summary>The template's name, or a plain name for emails without one.</summary>
    private static string KindLabel(string? key) =>
        key is null ? "Email"
        : EmailTemplates.Defaults.TryGetValue(key, out var template) ? template.Label
        : key switch
        {
            "bulk" => "Bulk email",
            "verification" => "Confirm your email",
            _ => "Email",
        };

    /// <summary>One-click sign-in and approval links act for someone, so the log never shows them.</summary>
    public static string HideLinks(string text) =>
        ApproveLink().Replace(PortalLink().Replace(text, "$1…"), "$1…");

    [GeneratedRegex(@"(/candidate-portal/link#)[0-9A-Fa-f]{16,}")]
    private static partial Regex PortalLink();

    [GeneratedRegex(@"(/approve/)[^\s)\]]+")]
    private static partial Regex ApproveLink();

    public static RouteGroupBuilder MapEmailSettings(this RouteGroupBuilder api)
    {
        var email = api.MapGroup("/admin/email").RequireAuthorization(AtsPolicies.Admin);

        email.MapGet(
            "/status",
            async (IConfiguration configuration, AtsDbContext db, CancellationToken ct) =>
            {
                var organization = await db
                    .Organizations.AsNoTracking()
                    .Select(x => new
                    {
                        x.Name,
                        x.SenderNameFormat,
                        x.PublicUrl,
                    })
                    .SingleOrDefaultAsync(ct);
                var from = configuration["Resend:From"]?.Trim();
                var address =
                    from is null ? null
                    : Regex.Match(from, @"[^\s<>""]+@[^\s<>""]+") is { Success: true } match
                        ? match.Value
                    : null;
                var company = organization?.Name ?? "Your company";
                return Results.Ok(
                    new
                    {
                        Ready = !string.IsNullOrWhiteSpace(configuration["Resend:ApiKey"])
                            && address is not null,
                        From = string.IsNullOrWhiteSpace(from) ? null : from,
                        Address = address,
                        Domain = address?[(address.IndexOf('@') + 1)..],
                        Tracking = !string.IsNullOrWhiteSpace(
                            configuration["Resend:WebhookSecret"]
                        ),
                        ReplyDomain = EmailThreads.InboundDomain(configuration),
                        WebhookUrl = string.IsNullOrWhiteSpace(organization?.PublicUrl)
                            ? null
                            : $"{organization.PublicUrl.TrimEnd('/')}/public/webhooks/resend",
                        Managed = configuration.GetValue<bool>("Hosting:Managed"),
                        SenderNameFormat = organization?.SenderNameFormat
                        is EmailThreads.CompanyTeam
                            ? EmailThreads.CompanyTeam
                            : EmailThreads.PersonAtCompany,
                        Formats = new[]
                        {
                            new
                            {
                                Value = EmailThreads.PersonAtCompany,
                                Example = EmailThreads.SenderName(
                                    EmailThreads.PersonAtCompany,
                                    "Avery Stone",
                                    company
                                ),
                            },
                            new
                            {
                                Value = EmailThreads.CompanyTeam,
                                Example = EmailThreads.SenderName(
                                    EmailThreads.CompanyTeam,
                                    "Avery Stone",
                                    company
                                ),
                            },
                        },
                    }
                );
            }
        );

        email.MapPut(
            "/sender",
            async (
                EmailSenderRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    request.SenderNameFormat
                    is not (EmailThreads.PersonAtCompany or EmailThreads.CompanyTeam)
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["senderNameFormat"] = ["Choose how your emails are named."],
                        }
                    );
                var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                if (organization is null)
                    return Results.NotFound();
                organization.SenderNameFormat = request.SenderNameFormat;
                organization.UpdatedAt = DateTimeOffset.UtcNow;
                Audit.Add(
                    db,
                    principal,
                    "Organization",
                    organization.Id,
                    "EmailSenderChanged",
                    new { request.SenderNameFormat }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Every email, newest first. status: failed, bounced or scheduled. q: address or subject.
        email.MapGet(
            "/log",
            async (
                string? status,
                string? q,
                DateTimeOffset? before,
                int? limit,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var now = DateTimeOffset.UtcNow;
                var take = Math.Clamp(limit ?? 50, 1, 100);
                var query = db.EmailOutbox.AsNoTracking();
                query = status switch
                {
                    "failed" => query.Where(x =>
                        x.Status == EmailOutboxStatus.Failed || x.DeliveryStatus == "failed"
                    ),
                    "bounced" => query.Where(x => BouncedStates.Contains(x.DeliveryStatus!)),
                    "scheduled" => query.Where(x =>
                        x.Status == EmailOutboxStatus.Pending
                        && x.Attempts == 0
                        && x.NextAttemptAt > now.AddSeconds(15)
                    ),
                    _ => query,
                };
                if (!string.IsNullOrWhiteSpace(q))
                {
                    var term =
                        $"%{q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";
                    query = query.Where(x =>
                        EF.Functions.ILike(x.Recipient, term) || EF.Functions.ILike(x.Subject, term)
                    );
                }
                if (before is { } cursor)
                    query = query.Where(x => x.CreatedAt < cursor);
                var rows = await query
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(take + 1)
                    .ToListAsync(ct);
                var page = rows.Take(take).ToList();
                var applicationIds = page.Where(x => x.ApplicationId != null)
                    .Select(x => x.ApplicationId!.Value)
                    .Distinct()
                    .ToArray();
                var names = await db
                    .Applications.AsNoTracking()
                    .Where(x => applicationIds.Contains(x.Id))
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        x.Candidate.Email,
                        Job = x.Requisition!.Title,
                    })
                    .ToDictionaryAsync(x => x.Id, ct);
                return Results.Ok(
                    new
                    {
                        Items = page.Select(x => new
                        {
                            x.Id,
                            x.Recipient,
                            x.Subject,
                            x.TemplateKey,
                            Kind = KindLabel(x.TemplateKey),
                            Status = Status(x, now),
                            x.CreatedAt,
                            SentAt = x.CompletedAt,
                            ScheduledFor = x.NextAttemptAt,
                            x.LastError,
                            x.ApplicationId,
                            CandidateName = x.ApplicationId is { } id
                                ? names.GetValueOrDefault(id)?.Name
                                : null,
                            // Team emails about a candidate (alerts, interviewer updates) go to someone else.
                            ToCandidate = x.ApplicationId is { } to
                                && names.GetValueOrDefault(to)?.Email == x.Recipient,
                            JobTitle = x.ApplicationId is { } job
                                ? names.GetValueOrDefault(job)?.Job
                                : null,
                        }),
                        Next = rows.Count > take ? page[^1].CreatedAt : (DateTimeOffset?)null,
                    }
                );
            }
        );

        // One email as it went out. Sign-in codes are not shown; one-click links are hidden.
        email.MapGet(
            "/log/{id:guid}",
            async (Guid id, AtsDbContext db, CancellationToken ct) =>
            {
                var x = await db
                    .EmailOutbox.AsNoTracking()
                    .SingleOrDefaultAsync(e => e.Id == id, ct);
                if (x is null)
                    return Results.NotFound();
                var secret =
                    x.TemplateKey is not null
                    && ApplicationIntake.SecretKeys.Contains(x.TemplateKey);
                return Results.Ok(
                    new
                    {
                        x.Id,
                        x.Recipient,
                        x.Subject,
                        Body = secret ? null : HideLinks(x.Body),
                        Hidden = secret,
                        Kind = KindLabel(x.TemplateKey),
                        x.TemplateKey,
                        x.TemplateVersion,
                        Status = Status(x, DateTimeOffset.UtcNow),
                        x.DeliveryStatus,
                        x.DeliveryUpdatedAt,
                        x.Attempts,
                        x.LastError,
                        x.CreatedAt,
                        SentAt = x.CompletedAt,
                        ScheduledFor = x.NextAttemptAt,
                        x.FromName,
                        x.ReplyTo,
                        x.ApplicationId,
                        Files = x.AttachmentIds.Length + (x.InlineFileName is null ? 0 : 1),
                        x.InlineFileName,
                    }
                );
            }
        );

        email.MapPost(
            "/log/{id:guid}/retry",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var item = await db.EmailOutbox.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (item is null)
                    return Results.NotFound();
                if (item.Status != EmailOutboxStatus.Failed)
                    return Results.Conflict(
                        new { message = "Only a failed email can be sent again." }
                    );
                if (
                    await db.Candidates.AnyAsync(
                        x => x.Email == item.Recipient && x.EmailBounced,
                        ct
                    )
                )
                    return Results.Conflict(
                        new
                        {
                            message = "This address is blocked because an email to it bounced. Allow it again first.",
                        }
                    );
                item.Status = EmailOutboxStatus.Pending;
                item.Attempts = 0;
                item.NextAttemptAt = DateTimeOffset.UtcNow;
                item.LastError = null;
                item.DeliveryStatus = null;
                item.DeliveryUpdatedAt = null;
                Audit.Add(db, principal, "Email", item.Id, "Retried", new { item.Recipient });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Cancels a scheduled email. Conversation messages are cancelled in their conversation, so
        // the message and its email stay together.
        email.MapDelete(
            "/log/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var now = DateTimeOffset.UtcNow;
                var item = await db.EmailOutbox.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (item is null)
                    return Results.NotFound();
                if (Status(item, now) != "Scheduled")
                    return Results.Conflict(
                        new { message = "Only a scheduled email can be cancelled." }
                    );
                if (await db.ApplicationMessages.AnyAsync(x => x.EmailOutboxItemId == item.Id, ct))
                    return Results.Conflict(
                        new { message = "This is a message in a conversation. Cancel it there." }
                    );
                db.EmailOutbox.Remove(item);
                Audit.Add(
                    db,
                    principal,
                    "Email",
                    item.Id,
                    "Cancelled",
                    new { item.Recipient, item.Subject }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Candidates whose email bounced or was refused: we no longer send to them.
        email.MapGet(
            "/blocked",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var people = await db
                    .Candidates.AsNoTracking()
                    .Where(x => x.EmailBounced)
                    .OrderBy(x => x.Email)
                    .Select(x => new
                    {
                        x.Id,
                        x.Email,
                        Name = x.FirstName + " " + x.LastName,
                    })
                    .Take(500)
                    .ToListAsync(ct);
                var emails = people.Select(x => x.Email).ToArray();
                var last = await db
                    .EmailOutbox.AsNoTracking()
                    .Where(x =>
                        emails.Contains(x.Recipient) && BouncedStates.Contains(x.DeliveryStatus!)
                    )
                    .Select(x => new
                    {
                        x.Recipient,
                        x.DeliveryStatus,
                        x.DeliveryUpdatedAt,
                    })
                    .ToListAsync(ct);
                var latest = last.GroupBy(x => x.Recipient)
                    .ToDictionary(
                        g => g.Key,
                        g => g.OrderByDescending(x => x.DeliveryUpdatedAt).First()
                    );
                return Results.Ok(
                    people.Select(x => new
                    {
                        CandidateId = x.Id,
                        x.Email,
                        x.Name,
                        Reason = latest.GetValueOrDefault(x.Email)?.DeliveryStatus switch
                        {
                            "complained" => "Marked an email as spam",
                            "suppressed" => "Refused by the email service after an earlier bounce",
                            "bounced" => "Bounced",
                            _ => "Bounced",
                        },
                        BlockedAt = latest.GetValueOrDefault(x.Email)?.DeliveryUpdatedAt,
                    })
                );
            }
        );

        email.MapDelete(
            "/blocked/{email}",
            async (
                string email,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var address = email.Trim().ToLowerInvariant();
                var changed = await db
                    .Candidates.Where(x => x.Email == address && x.EmailBounced)
                    .ExecuteUpdateAsync(u => u.SetProperty(x => x.EmailBounced, false), ct);
                if (changed == 0)
                    return Results.NotFound();
                Audit.Add(db, principal, "Email", address, "Unblocked");
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
        return api;
    }
}
