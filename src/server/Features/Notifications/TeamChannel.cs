using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Something that can post to the team's Slack or Teams channel, and whether it does until an admin chooses.</summary>
public sealed record ChannelEvent(string Key, string Label, bool On);

public sealed record TeamChannelRequest(string? Url, string[]? Kinds);

/// <summary>
/// The team's Slack or Teams channel: which events post there, and each post's shape. Slack gets
/// blocks with a button, Teams (and Power Automate workflows) an Adaptive Card, anything else plain
/// text. Every post links back to the record when the app's address is saved.
/// </summary>
public static class TeamChannel
{
    public const string CandidateMessage = "candidate-message";
    public const string CandidateWithdrew = "candidate-withdrew";
    public const string InterviewBooked = "interview-booked";
    public const string OfferResponse = "offer-response";
    public const string EmailBounced = "email-bounced";
    public const string Stalled = "stalled";
    public const string ApprovalRequested = "approval-requested";
    public const string ApprovalStuck = "approval-stuck";

    public static readonly ChannelEvent[] Events =
    [
        new(OfferResponse, "A candidate accepts or turns down an offer", true),
        new(CandidateWithdrew, "A candidate withdraws", true),
        new(EmailBounced, "An email to a candidate bounces", true),
        new(InterviewBooked, "An interview is booked", false),
        new(CandidateMessage, "A candidate writes", false),
        new(Stalled, "Applications go quiet (one summary a day)", false),
        new(ApprovalRequested, "A job or an offer needs approval", true),
        new(ApprovalStuck, "An approval is stuck after every reminder", true),
    ];

    public static string[] Defaults => [.. Events.Where(x => x.On).Select(x => x.Key)];

    /// <summary>A post with no kind (approvals, workflow steps, the test message) always goes.</summary>
    public static bool Wants(string[]? chosen, string? kind) =>
        kind is null || (chosen ?? Defaults).Contains(kind);

    /// <summary>"slack", "teams" or "other", from the address the channel gave.</summary>
    public static string Format(string url)
    {
        var host = Uri.TryCreate(url, UriKind.Absolute, out var uri) ? uri.Host : "";
        if (host.Equals("hooks.slack.com", StringComparison.OrdinalIgnoreCase))
            return "slack";
        string[] teams =
        [
            ".webhook.office.com",
            ".logic.azure.com",
            ".powerautomate.com",
            ".powerplatform.com",
            "outlook.office.com",
        ];
        return teams.Any(x => host.EndsWith(x, StringComparison.OrdinalIgnoreCase))
            ? "teams"
            : "other";
    }

    private const string ButtonText = "Open in MyThorneAI";

    /// <summary>The JSON body for one post. <paramref name="link"/> is absolute, or null.</summary>
    public static string Payload(string url, string text, string? link) =>
        JsonSerializer.Serialize<object>(
            Format(url) switch
            {
                "slack" => new
                {
                    text = link is null ? text : $"{text} {link}",
                    blocks = new object[]
                    {
                        new
                        {
                            type = "section",
                            text = new { type = "mrkdwn", text = SlackEscape(text) },
                        },
                    }
                        .Concat(
                            link is null
                                ? []
                                :
                                [
                                    new
                                    {
                                        type = "actions",
                                        elements = new object[]
                                        {
                                            new
                                            {
                                                type = "button",
                                                text = new
                                                {
                                                    type = "plain_text",
                                                    text = ButtonText,
                                                },
                                                url = link,
                                            },
                                        },
                                    },
                                ]
                        )
                        .ToArray(),
                },
                // Teams and Power Automate "When a Teams webhook request is received" take an Adaptive Card.
                "teams" => new
                {
                    type = "message",
                    attachments = new object[]
                    {
                        new
                        {
                            contentType = "application/vnd.microsoft.card.adaptive",
                            content = new Dictionary<string, object>
                            {
                                ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
                                ["type"] = "AdaptiveCard",
                                ["version"] = "1.4",
                                ["body"] = new object[]
                                {
                                    new
                                    {
                                        type = "TextBlock",
                                        text,
                                        wrap = true,
                                    },
                                },
                                ["actions"] = link is null
                                    ? Array.Empty<object>()
                                    :
                                    [
                                        new
                                        {
                                            type = "Action.OpenUrl",
                                            title = ButtonText,
                                            url = link,
                                        },
                                    ],
                            },
                        },
                    },
                },
                _ => new { text = link is null ? text : $"{text}\n{link}" },
            }
        );

    private static string SlackEscape(string text) =>
        text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;");

    /// <summary>Queue one post when the channel is set and wants this kind. The caller saves.</summary>
    public static async Task PostAsync(
        AtsDbContext db,
        string text,
        string? kind,
        string? href,
        CancellationToken ct
    )
    {
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new
            {
                x.NotificationWebhookUrl,
                x.ChannelNotificationKinds,
                x.PublicUrl,
            })
            .SingleOrDefaultAsync(ct);
        var url = organization?.NotificationWebhookUrl;
        if (string.IsNullOrWhiteSpace(url) || !Wants(organization!.ChannelNotificationKinds, kind))
            return;
        var link =
            href is null || string.IsNullOrWhiteSpace(organization.PublicUrl)
                ? null
                : Notify.AbsoluteLink(organization.PublicUrl, href);
        db.WebhookDeliveries.Add(
            new WebhookDelivery
            {
                Url = url,
                EventType = "notification",
                Payload = Payload(url, text, link),
            }
        );
    }

    private static async Task<object> ShapeAsync(AtsDbContext db, CancellationToken ct)
    {
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.NotificationWebhookUrl, x.ChannelNotificationKinds })
            .SingleOrDefaultAsync(ct);
        var last = await db
            .WebhookDeliveries.AsNoTracking()
            .Where(x => x.EndpointId == null && x.EventType == "notification")
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new
            {
                x.Status,
                x.CreatedAt,
                x.CompletedAt,
                x.LastStatusCode,
                x.LastError,
                x.Attempts,
            })
            .FirstOrDefaultAsync(ct);
        var url = organization?.NotificationWebhookUrl;
        return new
        {
            Url = url,
            Format = string.IsNullOrWhiteSpace(url) ? null : Format(url),
            Kinds = organization?.ChannelNotificationKinds ?? Defaults,
            Events = Events.Select(x => new { x.Key, x.Label }),
            Last = last,
        };
    }

    public static RouteGroupBuilder MapTeamChannel(this RouteGroupBuilder api)
    {
        var channel = api.MapGroup("/admin/team-channel").RequireAuthorization(AtsPolicies.Admin);

        channel.MapGet(
            "",
            async (AtsDbContext db, CancellationToken ct) => Results.Ok(await ShapeAsync(db, ct))
        );

        channel.MapPut(
            "",
            async (
                TeamChannelRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var url = request.Url?.Trim() ?? "";
                if (
                    url.Length > 0
                    && (
                        url.Length > 1000
                        || !Uri.TryCreate(url, UriKind.Absolute, out var parsed)
                        || parsed.Scheme != Uri.UriSchemeHttps
                    )
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["url"] =
                            [
                                "Use the address Slack or Teams gave you. It starts with https://.",
                            ],
                        }
                    );
                var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                if (organization is null)
                    return Results.NotFound();
                organization.NotificationWebhookUrl = url.Length == 0 ? null : url;
                if (request.Kinds is { } kinds)
                    organization.ChannelNotificationKinds =
                    [
                        .. Events.Select(x => x.Key).Where(key => kinds.Contains(key)),
                    ];
                organization.UpdatedAt = DateTimeOffset.UtcNow;
                Audit.Add(
                    db,
                    principal,
                    "Organization",
                    organization.Id,
                    "TeamChannelUpdated",
                    new { on = url.Length > 0, kinds = organization.ChannelNotificationKinds }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(await ShapeAsync(db, ct));
            }
        );

        channel.MapPost(
            "/test",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (
                    string.IsNullOrWhiteSpace(
                        await db
                            .Organizations.Select(x => x.NotificationWebhookUrl)
                            .SingleOrDefaultAsync(ct)
                    )
                )
                    return Results.Conflict(
                        new { message = "Save a Slack or Teams address first." }
                    );
                await PostAsync(
                    db,
                    $"A test from MyThorneAI, sent by {principal.Email()}. Team notifications work.",
                    null,
                    "/settings/alerts",
                    ct
                );
                await db.SaveChangesAsync(ct);
                return Results.Accepted();
            }
        );
        return api;
    }
}
