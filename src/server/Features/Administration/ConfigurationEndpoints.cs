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

public sealed record SaveEmailTemplateRequest(string Subject, string Body, Guid? RequisitionId);

public sealed record PreviewEmailTemplateRequest(string Subject, string Body);

public sealed record SavePipelineTemplateRequest(string Name, string[] StageNames, bool IsDefault);

public sealed record CustomFieldInput(string Key, string Label, string Type, string[]? Options);

public sealed record SaveCustomFieldsRequest(CustomFieldInput[] Fields);

public sealed record SaveCustomValuesRequest(Dictionary<string, string?> Values);

public sealed record SaveRolePermissionsRequest(Dictionary<string, string[]> Permissions);

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
    public static readonly string[] WebhookEvents =
        ["application.created", "application.stage_changed", "application.hired"];

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
        // ---- Email templates -------------------------------------------------------------------
        api.MapGet(
                "/email-templates",
                async (Guid? requisitionId, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    if (requisitionId is not null)
                    {
                        var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == requisitionId, ct);
                        if (requisition is null || !CanManage(requisition, principal))
                            return Results.NotFound();
                    }
                    var stored = await db.EmailTemplates.AsNoTracking().Where(x => x.RequisitionId == null || x.RequisitionId == requisitionId).ToListAsync(ct);
                    return Results.Ok(
                        EmailTemplates.Defaults.Select(entry =>
                        {
                            var org = stored.SingleOrDefault(x => x.Key == entry.Key && x.RequisitionId == null);
                            var job = stored.SingleOrDefault(x => x.Key == entry.Key && x.RequisitionId == requisitionId && requisitionId != null);
                            var effective = job ?? org;
                            return new
                            {
                                Key = entry.Key,
                                entry.Value.Label,
                                entry.Value.Variables,
                                DefaultSubject = entry.Value.Subject,
                                DefaultBody = entry.Value.Body,
                                Subject = effective?.Subject ?? entry.Value.Subject,
                                Body = effective?.Body ?? entry.Value.Body,
                                Source = job is not null ? "job" : org is not null ? "organization" : "default",
                                Version = effective?.Version ?? 0,
                            };
                        })
                    );
                }
            );

        api.MapPut(
            "/email-templates/{key}",
            async (string key, SaveEmailTemplateRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!EmailTemplates.Defaults.TryGetValue(key, out var template))
                    return Results.NotFound();
                if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                    return Results.Forbid();
                if (request.RequisitionId is not null)
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                }
                if (string.IsNullOrWhiteSpace(request.Subject) || string.IsNullOrWhiteSpace(request.Body))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["body"] = ["A subject and a message are both required."] });
                var unknown = Regex.Matches(request.Subject + request.Body, @"\{\{\s*(\w+)\s*\}\}")
                    .Select(m => m.Groups[1].Value)
                    .Where(v => v != "company" && !template.Variables.Contains(v))
                    .Distinct()
                    .ToArray();
                if (unknown.Length > 0)
                    return Results.ValidationProblem(new Dictionary<string, string[]>
                    {
                        ["body"] = [$"This message can't use {string.Join(", ", unknown.Select(x => "{{" + x + "}}"))}. Available: {string.Join(", ", template.Variables.Select(x => "{{" + x + "}}"))}."],
                    });
                var existing = await db.EmailTemplates.SingleOrDefaultAsync(x => x.Key == key && x.RequisitionId == request.RequisitionId, ct);
                if (existing is null)
                    db.EmailTemplates.Add(new EmailTemplate { Key = key, RequisitionId = request.RequisitionId, Subject = request.Subject.Trim(), Body = request.Body.Trim() });
                else
                {
                    existing.Subject = request.Subject.Trim();
                    existing.Body = request.Body.Trim();
                    existing.Version++;
                    existing.UpdatedAt = DateTimeOffset.UtcNow;
                }
                Audit.Add(db, principal, "EmailTemplate", key, "Updated", new { request.RequisitionId });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapDelete(
            "/email-templates/{key}",
            async (string key, Guid? requisitionId, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                    return Results.Forbid();
                if (requisitionId is not null)
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == requisitionId, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                }
                await db.EmailTemplates.Where(x => x.Key == key && x.RequisitionId == requisitionId).ExecuteDeleteAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/email-templates/{key}/preview",
            async (string key, PreviewEmailTemplateRequest request, AtsDbContext db, CancellationToken ct) =>
            {
                if (!EmailTemplates.Defaults.TryGetValue(key, out var template))
                    return Results.NotFound();
                var sample = new Dictionary<string, string>
                {
                    ["firstName"] = "Alex", ["jobTitle"] = "Senior Engineer", ["stage"] = "Interview",
                    ["interviewTitle"] = "Technical interview", ["subject"] = "accept Alex Rivera for Senior Engineer",
                    ["requestedBy"] = "Sam Recruiter",
                    ["company"] = await db.Organizations.Select(x => x.Name).SingleOrDefaultAsync(ct) ?? "Your company",
                };
                var text = EmailTemplates.Fill(request.Body, sample);
                return Results.Ok(new { Subject = EmailTemplates.Fill(request.Subject, sample), Body = text, Html = EmailHtml.Wrap(sample["company"], text) });
            }
        );

        // ---- Pipeline templates ----------------------------------------------------------------
        api.MapGet(
            "/pipeline-templates",
            async (AtsDbContext db, CancellationToken ct) =>
                Results.Ok(await db.PipelineTemplates.AsNoTracking().OrderByDescending(x => x.IsDefault).ThenBy(x => x.Name)
                    .Select(x => new { x.Id, x.Name, x.StageNames, x.IsDefault }).ToListAsync(ct))
        );

        api.MapPut(
                "/admin/pipeline-templates/{id:guid}",
                async (Guid id, SavePipelineTemplateRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    await SavePipelineTemplateAsync(db, principal, id, request, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/pipeline-templates",
                async (SavePipelineTemplateRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    await SavePipelineTemplateAsync(db, principal, null, request, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapDelete(
                "/admin/pipeline-templates/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var deleted = await db.PipelineTemplates.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
                    if (deleted > 0)
                    {
                        Audit.Add(db, principal, "PipelineTemplate", id, "Deleted");
                        await db.SaveChangesAsync(ct);
                    }
                    return deleted > 0 ? Results.NoContent() : Results.NotFound();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // ---- Custom candidate fields -----------------------------------------------------------
        api.MapGet(
            "/custom-fields",
            async (AtsDbContext db, CancellationToken ct) =>
                Results.Ok(await db.CustomFieldDefinitions.AsNoTracking().OrderBy(x => x.SortOrder)
                    .Select(x => new { x.Key, x.Label, x.Type, x.Options }).ToListAsync(ct))
        );

        api.MapPut(
                "/admin/custom-fields",
                async (SaveCustomFieldsRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var fields = request.Fields ?? [];
                    var errors = new List<string>();
                    if (fields.Length > 30) errors.Add("Thirty fields is the most.");
                    if (fields.Select(x => x.Key).Distinct().Count() != fields.Length) errors.Add("Field keys must be unique.");
                    foreach (var field in fields)
                    {
                        if (!FieldKey.IsMatch(field.Key ?? "")) errors.Add($"\"{field.Key}\" isn't a valid key. Use lowercase letters, digits, - or _.");
                        if (string.IsNullOrWhiteSpace(field.Label)) errors.Add($"Give \"{field.Key}\" a label.");
                        if (field.Type is not ("text" or "number" or "date" or "select")) errors.Add($"\"{field.Key}\" has an unknown type.");
                        if (field.Type == "select" && (field.Options is null || field.Options.Count(o => !string.IsNullOrWhiteSpace(o)) == 0)) errors.Add($"\"{field.Label}\" needs at least one option.");
                    }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["fields"] = [.. errors] });
                    db.CustomFieldDefinitions.RemoveRange(db.CustomFieldDefinitions);
                    await db.SaveChangesAsync(ct);
                    db.CustomFieldDefinitions.AddRange(fields.Select((x, i) => new CustomFieldDefinition
                    {
                        Key = x.Key, Label = x.Label.Trim(), Type = x.Type, SortOrder = i,
                        Options = (x.Options ?? []).Select(o => o.Trim()).Where(o => o.Length > 0).Distinct().ToArray(),
                    }));
                    Audit.Add(db, principal, "Organization", "custom-fields", "CustomFieldsUpdated", new { count = fields.Length });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/candidates/{id:guid}/custom-fields",
                async (Guid id, SaveCustomValuesRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null) return Results.NotFound();
                    var definitions = await db.CustomFieldDefinitions.AsNoTracking().ToListAsync(ct);
                    var clean = new Dictionary<string, string>();
                    var errors = new List<string>();
                    foreach (var (key, raw) in request.Values ?? [])
                    {
                        var definition = definitions.SingleOrDefault(x => x.Key == key);
                        if (definition is null) { errors.Add($"There's no field called {key}."); continue; }
                        var value = raw?.Trim() ?? "";
                        if (value.Length == 0) continue;
                        if (value.Length > 500) errors.Add($"{definition.Label} is too long.");
                        else if (definition.Type == "number" && !decimal.TryParse(value, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out _)) errors.Add($"{definition.Label} must be a number.");
                        else if (definition.Type == "date" && !DateOnly.TryParse(value, out _)) errors.Add($"{definition.Label} must be a date.");
                        else if (definition.Type == "select" && !definition.Options.Contains(value)) errors.Add($"{definition.Label} must be one of the listed options.");
                        else clean[key] = value;
                    }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = [.. errors] });
                    candidate.CustomFieldsJson = JsonSerializer.Serialize(clean);
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "CustomFieldsUpdated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // ---- Role permissions ------------------------------------------------------------------
        api.MapGet(
                "/admin/role-permissions",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(new
                    {
                        Available = Permissions.All,
                        Roles = Permissions.Parse(await db.Organizations.Select(x => x.RolePermissionsJson).SingleOrDefaultAsync(ct)),
                    })
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/admin/role-permissions",
                async (SaveRolePermissionsRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    if (organization is null) return Results.NotFound();
                    var current = Permissions.Parse(organization.RolePermissionsJson);
                    foreach (var (role, list) in request.Permissions ?? [])
                        if (current.ContainsKey(role))
                            current[role] = list.Where(Permissions.All.Contains).Distinct().ToArray();
                    organization.RolePermissionsJson = JsonSerializer.Serialize(current);
                    organization.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Organization", organization.Id, "RolePermissionsUpdated", current);
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // ---- Per-job settings ------------------------------------------------------------------
        api.MapPut(
                "/requisitions/{id:guid}/settings",
                async (Guid id, SaveRequisitionSettingsRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal)) return Results.NotFound();
                    requisition.IsConfidential = request.IsConfidential;
                    requisition.ViewerEmails = (request.ViewerEmails ?? []).Select(x => x.Trim().ToLowerInvariant()).Where(x => x.Contains('@')).Distinct().Take(30).ToArray();
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
                        new { Key = "organization", Title = "Name your company", Detail = "Set the company name, time zone and who can sign in.", Done = organization?.SetupCompleted == true, Href = "/admin" },
                        new { Key = "team", Title = "Invite your team", Detail = "Add the recruiters, hiring managers and interviewers.", Done = await db.Users.CountAsync(x => x.IsActive, ct) > 1, Href = "/admin" },
                        new { Key = "approvers", Title = "Pick who signs off on hires", Detail = "Choose default approvers, so nobody is hired without a second person checking.", Done = organization?.DefaultApproverEmails.Length > 0 || organization?.RequireOfferApproval == false, Href = "/admin/approvals" },
                        new { Key = "template", Title = "Write a job template", Detail = "Save the company intro and benefits once, and reuse them on every job.", Done = await db.PostingTemplates.AnyAsync(ct), Href = "/admin/templates" },
                        new { Key = "job", Title = "Open your first job", Detail = "Start from a template and open it for applications.", Done = await db.Requisitions.AnyAsync(ct), Href = "/requisitions/new" },
                        new { Key = "email", Title = "Turn on candidate emails", Detail = emailReady ? "Emails are on." : "Add the email sending key and sender address to the server.", Done = emailReady, Href = "/admin/email" },
                        new { Key = "calendar", Title = "Connect a calendar", Detail = "Interviewers connect their Google or Microsoft calendar, so bookings check real availability.", Done = integration.IsEnabled || await db.CalendarConnections.AnyAsync(ct), Href = "/admin/integrations" },
                        new { Key = "ai", Title = "Turn on AI help", Detail = ai.IsConfigured ? "AI help is on." : "Add the OpenAI key to the server.", Done = ai.IsConfigured && organization?.AiEnabled != false, Href = "/admin/ai-settings" },
                    };
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
        api.MapGet(
                "/admin/webhooks",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var endpoints = await db.WebhookEndpoints.AsNoTracking().OrderBy(x => x.CreatedAt).ToListAsync(ct);
                    var result = new List<object>();
                    foreach (var endpoint in endpoints)
                    {
                        var recent = await db.WebhookDeliveries.AsNoTracking().Where(x => x.EndpointId == endpoint.Id).OrderByDescending(x => x.CreatedAt).Take(1).FirstOrDefaultAsync(ct);
                        result.Add(new
                        {
                            endpoint.Id, endpoint.Url, endpoint.Secret, endpoint.Events, endpoint.IsActive,
                            LastStatus = recent?.Status, LastAt = recent?.CreatedAt, LastError = recent?.LastError,
                            Failed = await db.WebhookDeliveries.CountAsync(x => x.EndpointId == endpoint.Id && x.Status == "Failed", ct),
                        });
                    }
                    return Results.Ok(new { Available = WebhookEvents, Endpoints = result });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/webhooks",
                async (SaveWebhookRequest request, ClaimsPrincipal principal, AtsDbContext db, IHostEnvironment environment, CancellationToken ct) =>
                {
                    var error = ValidateWebhook(request, environment);
                    if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["url"] = [error] });
                    var endpoint = new WebhookEndpoint
                    {
                        Url = request.Url.Trim(),
                        Secret = "whsec_" + Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant(),
                        Events = (request.Events ?? []).Where(WebhookEvents.Contains).Distinct().ToArray(),
                        IsActive = request.IsActive,
                    };
                    db.WebhookEndpoints.Add(endpoint);
                    Audit.Add(db, principal, "Webhook", endpoint.Id, "Created", new { endpoint.Url, endpoint.Events });
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/admin/webhooks/{endpoint.Id}", new { endpoint.Id, endpoint.Secret });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/admin/webhooks/{id:guid}",
                async (Guid id, SaveWebhookRequest request, ClaimsPrincipal principal, AtsDbContext db, IHostEnvironment environment, CancellationToken ct) =>
                {
                    var endpoint = await db.WebhookEndpoints.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (endpoint is null) return Results.NotFound();
                    var error = ValidateWebhook(request, environment);
                    if (error is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["url"] = [error] });
                    endpoint.Url = request.Url.Trim();
                    endpoint.Events = (request.Events ?? []).Where(WebhookEvents.Contains).Distinct().ToArray();
                    endpoint.IsActive = request.IsActive;
                    Audit.Add(db, principal, "Webhook", id, "Updated", new { endpoint.Url, endpoint.Events, endpoint.IsActive });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapDelete(
                "/admin/webhooks/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var deleted = await db.WebhookEndpoints.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
                    if (deleted == 0) return Results.NotFound();
                    Audit.Add(db, principal, "Webhook", id, "Deleted");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/webhooks/{id:guid}/test",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var endpoint = await db.WebhookEndpoints.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (endpoint is null) return Results.NotFound();
                    db.WebhookDeliveries.Add(new WebhookDelivery
                    {
                        EndpointId = id, Url = endpoint.Url, EventType = "ping",
                        Payload = JsonSerializer.Serialize(new { id = Guid.NewGuid(), type = "ping", occurredAt = DateTimeOffset.UtcNow, data = new { message = "Test delivery from the ATS." } }),
                    });
                    await db.SaveChangesAsync(ct);
                    return Results.Accepted();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/webhooks/{id:guid}/deliveries",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(await db.WebhookDeliveries.AsNoTracking().Where(x => x.EndpointId == id).OrderByDescending(x => x.CreatedAt).Take(50)
                        .Select(x => new { x.Id, x.EventType, x.Status, x.Attempts, x.LastStatusCode, x.LastError, x.CreatedAt, x.CompletedAt }).ToListAsync(ct))
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/webhooks/deliveries/{id:guid}/retry",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var delivery = await db.WebhookDeliveries.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (delivery is null) return Results.NotFound();
                    delivery.Status = "Pending";
                    delivery.Attempts = 0;
                    delivery.NextAttemptAt = DateTimeOffset.UtcNow;
                    delivery.LockedUntil = null;
                    delivery.CompletedAt = null;
                    await db.SaveChangesAsync(ct);
                    return Results.Accepted();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // ---- Saved views -----------------------------------------------------------------------
        api.MapGet(
            "/saved-views",
            async (string area, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                return Results.Ok(await db.SavedViews.AsNoTracking().Where(x => x.OwnerEmail == me && x.Area == area).OrderBy(x => x.Name)
                    .Select(x => new { x.Id, x.Name, x.ParamsJson }).ToListAsync(ct));
            }
        );

        api.MapPost(
            "/saved-views",
            async (SaveViewRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(request.Name) || request.Area is not ("reports" or "talent"))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["name"] = ["Give the view a name."] });
                try { JsonDocument.Parse(request.ParamsJson).Dispose(); }
                catch (JsonException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["paramsJson"] = ["That view couldn't be read."] }); }
                var me = principal.Email();
                var existing = await db.SavedViews.SingleOrDefaultAsync(x => x.OwnerEmail == me && x.Area == request.Area && x.Name == request.Name.Trim(), ct);
                if (existing is null)
                    db.SavedViews.Add(new SavedView { OwnerEmail = me, Area = request.Area, Name = request.Name.Trim(), ParamsJson = request.ParamsJson });
                else
                    existing.ParamsJson = request.ParamsJson;
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapDelete(
            "/saved-views/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var deleted = await db.SavedViews.Where(x => x.Id == id && x.OwnerEmail == me).ExecuteDeleteAsync(ct);
                return deleted > 0 ? Results.NoContent() : Results.NotFound();
            }
        );

        // ---- Bulk candidate import -------------------------------------------------------------
        api.MapPost(
                "/candidates/import",
                async (HttpRequest request, bool? dryRun, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Import, ct))
                        return Results.Forbid();
                    var form = await request.ReadFormAsync(ct);
                    var file = form.Files.GetFile("file");
                    if (file is null || file.Length == 0)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Choose a CSV file."] });
                    if (file.Length > 5 * 1024 * 1024)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["That file is over 5 MB."] });
                    string text;
                    using (var reader = new StreamReader(file.OpenReadStream(), Encoding.UTF8, true))
                        text = await reader.ReadToEndAsync(ct);
                    var rows = Csv.Parse(text);
                    if (rows.Count < 2)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["The file needs a header row and at least one candidate."] });
                    var header = rows[0].Select(x => x.Trim().ToLowerInvariant().Replace(" ", "").Replace("_", "")).ToList();
                    int Col(params string[] names) => header.FindIndex(h => names.Contains(h));
                    var firstCol = Col("firstname", "first"); var lastCol = Col("lastname", "last", "surname");
                    var emailCol = Col("email", "emailaddress"); var phoneCol = Col("phone", "phonenumber");
                    var locationCol = Col("location", "city"); var titleCol = Col("currenttitle", "title", "jobtitle");
                    var linkedInCol = Col("linkedin", "linkedinurl"); var sourceCol = Col("source"); var tagsCol = Col("tags", "skills");
                    if (firstCol < 0 || lastCol < 0 || emailCol < 0)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["The header row needs firstName, lastName and email columns."] });
                    if (rows.Count - 1 > 2000)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["Import 2,000 candidates or fewer at a time."] });
                    string Cell(List<string> row, int col) => col >= 0 && col < row.Count ? row[col].Trim() : "";

                    var emails = rows.Skip(1).Select(r => Cell(r, emailCol).ToLowerInvariant()).Where(e => e.Length > 0).Distinct().ToArray();
                    var existingEmails = (await db.Candidates.AsNoTracking().Where(c => emails.Contains(c.Email)).Select(c => c.Email).ToListAsync(ct)).ToHashSet();
                    var existingLinkedIn = (await db.Candidates.AsNoTracking().Where(c => c.LinkedInUrl != null).Select(c => c.LinkedInUrl!).ToListAsync(ct)).Select(NormalizeLink).Where(x => x != null).ToHashSet();
                    var seen = new HashSet<string>();
                    var outcomes = new List<object>();
                    var toCreate = new List<Candidate>();
                    var duplicates = 0; var invalid = 0;
                    for (var i = 1; i < rows.Count; i++)
                    {
                        var row = rows[i];
                        if (row.All(string.IsNullOrWhiteSpace)) continue;
                        var email = Cell(row, emailCol).ToLowerInvariant();
                        var first = Cell(row, firstCol); var last = Cell(row, lastCol);
                        var linkedIn = Clean(Cell(row, linkedInCol));
                        string status; string message;
                        if (first.Length == 0 || last.Length == 0 || !LooksLikeEmail(email)) { status = "invalid"; message = "Needs a first name, last name and a valid email."; invalid++; }
                        else if (existingEmails.Contains(email) || !seen.Add(email)) { status = "duplicate"; message = existingEmails.Contains(email) ? "Already in the ATS (same email)." : "Repeated earlier in this file."; duplicates++; }
                        else if (linkedIn is not null && NormalizeLink(linkedIn) is { } link && existingLinkedIn.Contains(link)) { status = "duplicate"; message = "Already in the ATS (same LinkedIn)."; duplicates++; }
                        else
                        {
                            status = "create"; message = "";
                            toCreate.Add(new Candidate
                            {
                                FirstName = first, LastName = last, Email = email,
                                Phone = Clean(Cell(row, phoneCol)), Location = Clean(Cell(row, locationCol)), CurrentTitle = Clean(Cell(row, titleCol)),
                                LinkedInUrl = linkedIn, Source = Clean(Cell(row, sourceCol)) ?? "Import",
                                Tags = Cell(row, tagsCol).Split([';', ','], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Select(t => t.ToLowerInvariant()).Distinct().Take(20).ToArray(),
                            });
                        }
                        if (outcomes.Count < 300) outcomes.Add(new { Line = i + 1, Email = email, Status = status, Message = message });
                    }
                    if (dryRun != true && toCreate.Count > 0)
                    {
                        db.Candidates.AddRange(toCreate);
                        Audit.Add(db, principal, "Candidate", "import", "BulkImported", new { created = toCreate.Count, duplicates, invalid });
                        await db.SaveChangesAsync(ct);
                    }
                    return Results.Ok(new { DryRun = dryRun == true, Created = dryRun == true ? 0 : toCreate.Count, WouldCreate = toCreate.Count, Duplicates = duplicates, Invalid = invalid, Rows = outcomes });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }

    private static string? ValidateWebhook(SaveWebhookRequest request, IHostEnvironment environment) =>
        string.IsNullOrWhiteSpace(request.Url) || !WebhookUrlAllowed(request.Url.Trim(), environment)
            ? "Use a public https address."
            : null;

    private static async Task<IResult> SavePipelineTemplateAsync(
        AtsDbContext db, ClaimsPrincipal principal, Guid? id, SavePipelineTemplateRequest request, CancellationToken ct)
    {
        var stages = (request.StageNames ?? []).Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
        stages.RemoveAll(x => x.Equals("Hired", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(request.Name) || stages.Count < 1 || stages.Count > 12 || stages.Distinct(StringComparer.OrdinalIgnoreCase).Count() != stages.Count || stages.Any(x => x.Length > 80))
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["pipeline"] = ["Give it a name and one to twelve unique stage names. \"Hired\" is added at the end automatically."],
            });
        var template = id is null ? new PipelineTemplate { Name = request.Name.Trim() } : await db.PipelineTemplates.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (template is null) return Results.NotFound();
        if (await db.PipelineTemplates.AnyAsync(x => x.Name == request.Name.Trim() && x.Id != template.Id, ct))
            return Results.Conflict(new { message = "A pipeline with that name already exists." });
        template.Name = request.Name.Trim();
        template.StageNames = [.. stages];
        template.IsDefault = request.IsDefault;
        if (request.IsDefault)
            await db.PipelineTemplates.Where(x => x.Id != template.Id).ExecuteUpdateAsync(u => u.SetProperty(x => x.IsDefault, false), ct);
        if (id is null) db.PipelineTemplates.Add(template);
        Audit.Add(db, principal, "PipelineTemplate", template.Id, id is null ? "Created" : "Updated", new { template.Name });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { template.Id });
    }
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
