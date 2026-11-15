using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

// Activity history: filtered on the server, paged with a cursor, rows described with names and links.
public static partial class AtsEndpoints
{
    private const int AuditExportLimit = 10_000;

    private static void MapAudit(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/admin/audit").RequireAuthorization(AtsPolicies.Admin);

        group.MapGet(
            "",
            async ([AsParameters] AuditQuery query, AtsDbContext db, CancellationToken ct) =>
            {
                var limit = Math.Clamp(query.Limit ?? 50, 1, 200);
                var rows = await FilterAudit(db, query).Take(limit + 1).ToListAsync(ct);
                var more = rows.Count > limit;
                if (more)
                    rows.RemoveAt(limit);
                var last = rows.LastOrDefault();
                return Results.Ok(
                    new
                    {
                        Items = await DescribeAuditAsync(db, rows, ct),
                        NextCursor = more && last is not null
                            ? $"{last.OccurredAt.UtcTicks}_{last.Id}"
                            : null,
                    }
                );
            }
        );

        // ponytail: DISTINCT over the whole table; keep a small lookup table if this gets slow.
        group.MapGet(
            "/facets",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var actors = await db
                    .AuditEvents.Select(x => x.ActorEmail)
                    .Distinct()
                    .ToListAsync(ct);
                var names = await db
                    .Users.Where(x => actors.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                return Results.Ok(
                    new
                    {
                        Types = await db
                            .AuditEvents.Select(x => x.EntityType)
                            .Distinct()
                            .OrderBy(x => x)
                            .ToListAsync(ct),
                        Actions = await db
                            .AuditEvents.Select(x => x.Action)
                            .Distinct()
                            .OrderBy(x => x)
                            .ToListAsync(ct),
                        Actors = actors
                            .Select(x => new { Email = x, Name = names.GetValueOrDefault(x) })
                            .OrderBy(x => x.Name ?? x.Email)
                            .ToList(),
                    }
                );
            }
        );

        group.MapGet(
            "/export",
            async ([AsParameters] AuditQuery query, AtsDbContext db, CancellationToken ct) =>
            {
                var rows = await FilterAudit(db, query with { Cursor = null })
                    .Take(AuditExportLimit)
                    .ToListAsync(ct);
                var described = await DescribeAuditAsync(db, rows, ct);
                var csv = new StringBuilder(
                    "When (UTC),Person,Email,Action,Record type,Record,Record ID,Details,Changes\n"
                );
                foreach (var row in described)
                    csv.AppendJoin(
                            ',',
                            new[]
                            {
                                row.OccurredAt.UtcDateTime.ToString("yyyy-MM-dd HH:mm:ss"),
                                row.ActorName ?? "",
                                row.ActorEmail,
                                Humanize(row.Action),
                                Humanize(row.EntityType),
                                row.Label ?? "",
                                row.EntityId,
                                row.Details ?? "",
                                row.Changes ?? "",
                            }.Select(Csv.Escape)
                        )
                        .Append('\n');
                return Results.File(
                    Encoding
                        .UTF8.GetPreamble()
                        .Concat(Encoding.UTF8.GetBytes(csv.ToString()))
                        .ToArray(),
                    "text/csv",
                    $"activity-history-{DateTime.UtcNow:yyyy-MM-dd}.csv"
                );
            }
        );
    }

    private static IQueryable<AuditEvent> FilterAudit(AtsDbContext db, AuditQuery query)
    {
        var events = db.AuditEvents.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(query.Actor))
            events = events.Where(x => x.ActorEmail == query.Actor.Trim().ToLower());
        if (!string.IsNullOrWhiteSpace(query.Type))
            events = events.Where(x => x.EntityType == query.Type);
        if (!string.IsNullOrWhiteSpace(query.Action))
            events = events.Where(x => x.Action == query.Action);
        if (!string.IsNullOrWhiteSpace(query.EntityId))
            events = events.Where(x => x.EntityId == query.EntityId);
        if (query.From is { } from)
            events = events.Where(x => x.OccurredAt >= from);
        if (query.To is { } to)
            events = events.Where(x => x.OccurredAt < to);
        if (
            query.Cursor?.Split('_') is [var ticks, var id]
            && long.TryParse(ticks, out var t)
            && long.TryParse(id, out var lastId)
        )
        {
            var at = new DateTimeOffset(t, TimeSpan.Zero);
            events = events.Where(x => x.OccurredAt < at || (x.OccurredAt == at && x.Id < lastId));
        }
        return events.OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.Id);
    }

    public sealed record AuditRow(
        long Id,
        string EntityType,
        string EntityId,
        string Action,
        string ActorEmail,
        string? ActorName,
        string? Label,
        string? Href,
        string? Job,
        string? JobHref,
        string? FromStage,
        string? ToStage,
        string? Details,
        string? Changes,
        DateTimeOffset OccurredAt
    );

    /// <summary>Names, labels and links for a page of events, a few batched lookups per page.</summary>
    private static async Task<List<AuditRow>> DescribeAuditAsync(
        AtsDbContext db,
        List<AuditEvent> rows,
        CancellationToken ct
    )
    {
        List<Guid> Ids(params string[] types) =>
            rows.Where(x => types.Contains(x.EntityType))
                .Select(x => Guid.TryParse(x.EntityId, out var id) ? id : (Guid?)null)
                .OfType<Guid>()
                .Distinct()
                .ToList();
        var details = rows.ToDictionary(x => x.Id, x => ParseDetails(x.Details));
        Guid? DetailId(long rowId, string key) =>
            details[rowId] is { } d
            && d.TryGetProperty(key, out var value)
            && value.ValueKind == JsonValueKind.String
            && Guid.TryParse(value.GetString(), out var id)
                ? id
                : null;

        var emails = rows.Select(x => x.ActorEmail).Distinct().ToList();
        var people = await db
            .Users.Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        var jobIds = Ids("Requisition");
        var jobs = await db
            .Requisitions.Where(x => jobIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Title, ct);
        var candidateIds = Ids("Candidate");
        var candidates = await db
            .Candidates.Where(x => candidateIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.FirstName + " " + x.LastName, ct);
        var applicationIds = Ids("Application");
        var applications = await db
            .Applications.Where(x => applicationIds.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                Name = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                x.RequisitionId,
                Job = x.Requisition!.Title,
            })
            .ToDictionaryAsync(x => x.Id, ct);
        var userIds = Ids("User");
        var users = await db
            .Users.Where(x => userIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.DisplayName, ct);
        var interviewIds = Ids("Interview");
        var interviews = await db
            .Interviews.Where(x => interviewIds.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.ApplicationId,
            })
            .ToDictionaryAsync(x => x.Id, ct);
        var webhookIds = Ids("Webhook");
        var webhooks = await db
            .WebhookEndpoints.Where(x => webhookIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Url, ct);
        var pipelineIds = Ids("PipelineTemplate");
        var pipelines = await db
            .PipelineTemplates.Where(x => pipelineIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var postingIds = Ids("PostingTemplate");
        var postings = await db
            .PostingTemplates.Where(x => postingIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var roleIds = Ids("Role");
        var customRoles = await db
            .CustomRoles.Where(x => roleIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var requestIds = Ids("AccessRequest");
        var requests = await db
            .AccessRequests.Where(x => requestIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);
        var stageIds = rows.SelectMany(x =>
                new[]
                {
                    DetailId(x.Id, "FromStageId"),
                    DetailId(x.Id, "ToStageId"),
                    DetailId(x.Id, "StageId"),
                }
            )
            .OfType<Guid>()
            .Distinct()
            .ToList();
        var stages = await db
            .PipelineStages.Where(x => stageIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name, ct);

        return rows.Select(row =>
            {
                var id = Guid.TryParse(row.EntityId, out var g) ? g : Guid.Empty;
                // Fallback label from the details, for records that have since been deleted.
                string? Remembered(params string[] keys) =>
                    details[row.Id] is { } d
                        ? keys.Select(k =>
                                d.TryGetProperty(k, out var v)
                                && v.ValueKind == JsonValueKind.String
                                    ? v.GetString()
                                    : null
                            )
                            .FirstOrDefault(x => x is not null)
                        : null;
                var application = applications.GetValueOrDefault(id);
                var interview = interviews.GetValueOrDefault(id);
                (string? Label, string? Href) record = row.EntityType switch
                {
                    "Requisition" => (
                        jobs.GetValueOrDefault(id),
                        jobs.ContainsKey(id) ? $"/jobs/{id}" : null
                    ),
                    "Candidate" => (
                        candidates.GetValueOrDefault(id),
                        candidates.ContainsKey(id) ? $"/candidates/{id}" : null
                    ),
                    "Application" => (
                        application?.Name,
                        application is null ? null : $"/applications/{id}"
                    ),
                    "Interview" => (
                        interview?.Title,
                        interview is null
                            ? null
                            : $"/applications/{interview.ApplicationId}/interviews"
                    ),
                    "User" => (
                        users.GetValueOrDefault(id) ?? Remembered("Email"),
                        users.ContainsKey(id) ? $"/settings/members?member={id}" : null
                    ),
                    "Webhook" => (
                        webhooks.GetValueOrDefault(id) ?? Remembered("Url"),
                        "/settings/webhooks"
                    ),
                    "Role" => (
                        customRoles.GetValueOrDefault(id) ?? Remembered("Name"),
                        customRoles.ContainsKey(id) ? $"/settings/roles/{id}" : null
                    ),
                    "PipelineTemplate" => (
                        pipelines.GetValueOrDefault(id) ?? Remembered("Name"),
                        "/settings/pipelines"
                    ),
                    "PostingTemplate" => (
                        postings.GetValueOrDefault(id) ?? Remembered("Name"),
                        "/settings/templates"
                    ),
                    "EmailTemplate" => (
                        EmailTemplates.Defaults.GetValueOrDefault(row.EntityId)?.Label
                            ?? row.EntityId,
                        "/settings/templates/email"
                    ),
                    "AccessRequest" => (
                        requests.GetValueOrDefault(id) ?? Remembered("Email"),
                        "/settings/members?tab=requests"
                    ),
                    "Organization" => ("workspace settings", "/settings/general"),
                    "SignIn" => (row.EntityId, null),
                    "Integration" => (row.EntityId, "/settings/calendar"),
                    _ => (null, null),
                };
                var jobId = application?.RequisitionId;
                return new AuditRow(
                    row.Id,
                    row.EntityType,
                    row.EntityId,
                    row.Action,
                    row.ActorEmail,
                    people.GetValueOrDefault(row.ActorEmail),
                    record.Label,
                    record.Href,
                    application?.Job,
                    jobId is null ? null : $"/jobs/{jobId}",
                    DetailId(row.Id, "FromStageId") is { } from
                        ? stages.GetValueOrDefault(from)
                        : null,
                    (DetailId(row.Id, "ToStageId") ?? DetailId(row.Id, "StageId")) is { } to
                        ? stages.GetValueOrDefault(to)
                        : null,
                    row.Details,
                    row.Changes,
                    row.OccurredAt
                );
            })
            .ToList();
    }

    // Older rows hold plain text in Details; only JSON objects are read for names and stages.
    private static JsonElement? ParseDetails(string? details)
    {
        if (string.IsNullOrWhiteSpace(details) || !details.TrimStart().StartsWith('{'))
            return null;
        try
        {
            return JsonDocument.Parse(details).RootElement;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    // "StageChanged" becomes "Stage changed".
    private static string Humanize(string value) =>
        Regex.Replace(value, "(?<=[a-z])(?=[A-Z])", " ") is var spaced && spaced.Length > 0
            ? spaced[0] + spaced[1..].ToLowerInvariant()
            : value;
}
