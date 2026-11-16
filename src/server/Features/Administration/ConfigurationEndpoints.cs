using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;




public sealed record SaveRequisitionSettingsRequest(
    bool IsConfidential,
    string[]? ViewerEmails,
    bool AllowCandidateReschedule,
    bool AllowCandidateWithdraw
);

public sealed record SaveWebhookRequest(string Url, string[]? Events, bool IsActive = true);

public sealed record SaveViewRequest(string Area, string Name, string ParamsJson);

public static partial class AtsEndpoints
{
    private static readonly Regex FieldKey = new("^[a-z0-9][a-z0-9_-]{0,39}$");

    private static bool WebhookUrlAllowed(string value, IHostEnvironment environment)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri))
            return false;
        if (environment.IsDevelopment() && uri.IsLoopback)
            return uri.Scheme is "http" or "https";
        if (uri.Scheme != "https" || uri.IsLoopback || uri.Host == "localhost")
            return false;
        if (IPAddress.TryParse(uri.Host, out var ip))
        {
            var bytes = ip.GetAddressBytes();
            var isPrivate =
                bytes.Length == 4
                && (bytes[0] is 10 or 127 || (bytes[0] == 172 && bytes[1] is >= 16 and <= 31) || (bytes[0] == 192 && bytes[1] == 168) || (bytes[0] == 169 && bytes[1] == 254));
            return !isPrivate && !ip.IsIPv6LinkLocal && !ip.IsIPv6SiteLocal;
        }
        return true;
    }

    private static void MapConfiguration(RouteGroupBuilder api)
    {
        // Email templates moved to Features/Templates/TemplateEndpoints.cs (/api/templates).

        // Pipeline templates moved to Features/Requisitions/PipelineTemplateEndpoints.cs.

        // Custom candidate fields live in Features/Candidates/CustomFieldEndpoints.cs.

        // Roles and what they may do live in Features/Administration/RoleEndpoints.cs.

        // ---- Per-job settings ------------------------------------------------------------------
        api.MapPut(
                "/requisitions/{id:guid}/settings",
                async (Guid id, SaveRequisitionSettingsRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal)) return Results.NotFound();
                    requisition.IsConfidential = request.IsConfidential;
                    if (request.ViewerEmails is { } viewerEmails)
                        await SyncViewersAsync(db, requisition, viewerEmails, ct);
                    requisition.AllowCandidateReschedule = request.AllowCandidateReschedule;
                    requisition.AllowCandidateWithdraw = request.AllowCandidateWithdraw;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Requisition", id, "SettingsUpdated", new { request.IsConfidential, request.AllowCandidateReschedule, request.AllowCandidateWithdraw });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // ---- First-run checklist ---------------------------------------------------------------
        api.MapGet(
                "/admin/setup-checklist",
                async (IWorkplaceIntegration integration, IAiAssistant ai, IConfiguration configuration, AtsDbContext db, CancellationToken ct) =>
                {
                    var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                    var emailReady = !string.IsNullOrWhiteSpace(configuration["Resend:ApiKey"]) && !string.IsNullOrWhiteSpace(configuration["Resend:From"]);
                    var items = new[]
                    {
                        new { Key = "organization", Title = "Name your company", Detail = "Set the company name, time zone and who can sign in.", Done = organization?.SetupCompleted == true, Href = "/settings/general" },
                        new { Key = "team", Title = "Invite your team", Detail = "Add the recruiters, hiring managers and interviewers.", Done = await db.Users.CountAsync(x => x.IsActive, ct) > 1, Href = "/settings/members" },
                        new { Key = "approvers", Title = "Pick who signs off on hires", Detail = "Choose default approvers, so nobody is hired without a second person checking.", Done = organization?.DefaultApproverEmails.Length > 0 || organization?.RequireOfferApproval == false, Href = "/settings/approvals" },
                        new { Key = "template", Title = "Write a job template", Detail = "Save the company intro and benefits once, and reuse them on every job.", Done = await db.PostingTemplates.AnyAsync(ct), Href = "/settings/templates" },
                        new { Key = "job", Title = "Open your first job", Detail = "Start from a template and open it for applications.", Done = await db.Requisitions.AnyAsync(ct), Href = "/jobs/new" },
                        new { Key = "email", Title = "Turn on candidate emails", Detail = emailReady ? "Candidate emails are on." : "Candidate emails are off until whoever runs MyThorneAI for you turns them on.", Done = emailReady, Href = "/settings/email" },
                        new { Key = "calendar", Title = "Connect a calendar", Detail = "Interviewers connect their Google or Microsoft calendar, so bookings check real availability.", Done = integration.IsEnabled || await db.CalendarConnections.AnyAsync(ct), Href = "/settings/calendar" },
                        new { Key = "ai", Title = "Turn on AI help", Detail = ai.IsConfigured ? "AI help is on." : "AI help is off until whoever runs MyThorneAI for you turns it on.", Done = ai.IsConfigured && organization?.AiEnabled != false, Href = "/settings/ai" },
                    }
                        // A hosted workspace never asks the customer about server set-up we handle.
                        .Where(x => !(configuration.GetValue<bool>("Hosting:Managed") && x.Key is "email" or "ai"))
                        .ToArray();
                    return Results.Ok(items);
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/notifications/test",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    if (string.IsNullOrWhiteSpace(await db.Organizations.Select(x => x.NotificationWebhookUrl).SingleOrDefaultAsync(ct)))
                        return Results.Conflict(new { message = "Save a Slack or Teams webhook address first." });
                    await PipelineEvents.NotifyAsync(db, $"Test from the ATS, sent by {principal.Email()}. Notifications are working.", ct);
                    await db.SaveChangesAsync(ct);
                    return Results.Accepted();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // ---- Webhooks (outbound) ---------------------------------------------------------------
        MapWebhooks(api);

        // Saved views live in Features/Candidates/SavedViewEndpoints.cs.
    }

    /// <summary>
    /// Named viewers are hiring-team members with the Viewer role (access comes from members).
    /// Addresses already on the team keep their role; viewers left out of the list are removed.
    /// </summary>
    private static async Task SyncViewersAsync(AtsDbContext db, Requisition requisition, string[] emails, CancellationToken ct)
    {
        var wanted = emails.Select(x => x.Trim().ToLowerInvariant()).Where(x => x.Contains('@')).Distinct().Take(30).ToHashSet();
        foreach (var gone in requisition.Members.Where(m => m.Role == RequisitionRole.Viewer && !wanted.Contains(m.User!.Email)).ToList())
        {
            requisition.Members.Remove(gone);
            db.RequisitionMembers.Remove(gone);
        }
        var onTeam = requisition.Members.Select(m => m.User!.Email).ToHashSet();
        var team = requisition.Members.Select(m => (m.Role, m.User!.Email)).ToList();
        foreach (var user in await db.Users.Where(u => wanted.Contains(u.Email) && !onTeam.Contains(u.Email)).ToListAsync(ct))
        {
            // Added through the set: a new row with its id already set must be inserted, not updated.
            db.RequisitionMembers.Add(new RequisitionMember { RequisitionId = requisition.Id, UserId = user.Id, Role = RequisitionRole.Viewer });
            team.Add((RequisitionRole.Viewer, user.Email));
        }
        RequisitionTeam.Mirror(requisition, team);
    }

    private static string? ValidateWebhook(SaveWebhookRequest request, IHostEnvironment environment) =>
        string.IsNullOrWhiteSpace(request.Url) || !WebhookUrlAllowed(request.Url.Trim(), environment)
            ? "Use a public https address."
            : null;
}

// Minimal RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes.
public static class Csv
{
    public static List<List<string>> Parse(string text)
    {
        var rows = new List<List<string>>();
        var row = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c == '"' && i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else if (c == '"') quoted = false;
                else field.Append(c);
            }
            else if (c == '"' && field.Length == 0) quoted = true;
            else if (c == ',') { row.Add(field.ToString()); field.Clear(); }
            else if (c is '\n' or '\r')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                row.Add(field.ToString()); field.Clear();
                rows.Add(row); row = [];
            }
            else field.Append(c);
        }
        if (field.Length > 0 || row.Count > 0) { row.Add(field.ToString()); rows.Add(row); }
        return rows;
    }

    public static string Escape(string? value)
    {
        var text = value ?? "";
        // Leading =, +, - or @ would run as a formula when a spreadsheet opens the file.
        if (text.Length > 0 && "=+-@".Contains(text[0])) text = "'" + text;
        return text.Contains(',') || text.Contains('"') || text.Contains('\n') ? $"\"{text.Replace("\"", "\"\"")}\"" : text;
    }
}
