using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapAdministration(RouteGroupBuilder api)
    {
        // Admin only: it holds the Slack or Teams channel address, approvers and company domains.
        api.MapGet(
                "/organization",
                async (
                    AtsDbContext db,
                    IConfiguration configuration,
                    IHostEnvironment environment,
                    CancellationToken ct
                ) =>
                {
                    var organization = await db
                        .Organizations.AsNoTracking()
                        .SingleOrDefaultAsync(ct);
                    if (organization is null)
                        return Results.NotFound();
                    var ownerName = await db
                        .Users.Where(x => x.Email == organization.OwnerEmail)
                        .Select(x => x.DisplayName)
                        .FirstOrDefaultAsync(ct);
                    return Results.Ok(
                        new
                        {
                            organization.Id,
                            organization.Name,
                            organization.OwnerEmail,
                            OwnerName = ownerName,
                            organization.TimeZone,
                            organization.AllowedEmailDomains,
                            organization.AllowGoogleLogin,
                            organization.AllowMicrosoftLogin,
                            organization.StaleReminderDays,
                            organization.SetupCompleted,
                            organization.RequireOfferApproval,
                            organization.RequireRequisitionApproval,
                            organization.ApprovalsSequential,
                            organization.DefaultApproverEmails,
                            organization.BookReminderDays,
                            organization.ScorecardReminderDays,
                            organization.MaxReminders,
                            organization.QuietHoursStart,
                            organization.QuietHoursEnd,
                            organization.NotificationWebhookUrl,
                            organization.PublicUrl,
                            organization.AiEnabled,
                            organization.AiModel,
                            // How people sign in here: WorkOS, Oidc or Development. The sign-in method switches only apply to WorkOS.
                            AuthMode = configuration["Auth:Mode"]
                                ?? (environment.IsDevelopment() ? "Development" : "WorkOS"),
                            EmailReady = !string.IsNullOrWhiteSpace(configuration["Resend:ApiKey"])
                                && !string.IsNullOrWhiteSpace(configuration["Resend:From"]),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/organization",
                async (
                    UpdateOrganizationRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHostEnvironment environment,
                    CancellationToken ct
                ) =>
                {
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    if (organization is null)
                        return Results.NotFound();
                    if (
                        !principal.IsInRole(nameof(UserRole.Admin))
                        && !string.Equals(
                            organization.OwnerEmail,
                            principal.Email(),
                            StringComparison.OrdinalIgnoreCase
                        )
                    )
                        return Results.Forbid();
                    if (request.Name is { } name)
                    {
                        if (string.IsNullOrWhiteSpace(name))
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["name"] = ["Give the workspace a name."],
                                }
                            );
                        organization.Name = name.Trim();
                    }
                    if (!string.IsNullOrWhiteSpace(request.TimeZone))
                        organization.TimeZone = request.TimeZone.Trim();
                    if (request.AllowedEmailDomains is { } domains)
                        organization.AllowedEmailDomains = domains
                            .Select(x => x.Trim().TrimStart('@').ToLowerInvariant())
                            .Where(x => x.Length > 0)
                            .Distinct()
                            .Take(20)
                            .ToArray();
                    if (request.AllowGoogleLogin is { } google)
                        organization.AllowGoogleLogin = google;
                    if (request.AllowMicrosoftLogin is { } microsoft)
                        organization.AllowMicrosoftLogin = microsoft;
                    if (request.RequireSso is { } requireSso)
                        organization.RequireSso = requireSso;
                    if (request.StaleReminderDays is { } staleDays)
                        organization.StaleReminderDays = Math.Clamp(staleDays, 1, 30);
                    if (request.RequireOfferApproval is { } offerApproval)
                        organization.RequireOfferApproval = offerApproval;
                    if (request.RequireRequisitionApproval is { } jobApproval)
                        organization.RequireRequisitionApproval = jobApproval;
                    if (request.ApprovalsSequential is { } sequential)
                        organization.ApprovalsSequential = sequential;
                    if (request.DefaultApproverEmails is { } approvers)
                        organization.DefaultApproverEmails = approvers
                            .Select(x => x.Trim().ToLowerInvariant())
                            .Where(x => x.Contains('@'))
                            .Distinct()
                            .Take(20)
                            .ToArray();
                    if (request.BookReminderDays is { } bookDays)
                        organization.BookReminderDays = Math.Clamp(bookDays, 1, 30);
                    if (request.ScorecardReminderDays is { } scorecardDays)
                        organization.ScorecardReminderDays = Math.Clamp(scorecardDays, 1, 30);
                    if (request.MaxReminders is { } maxReminders)
                        organization.MaxReminders = Math.Clamp(maxReminders, 0, 10);
                    if (request.QuietHoursStart is { } quietStart)
                        organization.QuietHoursStart = Math.Clamp(quietStart, 0, 23);
                    if (request.QuietHoursEnd is { } quietEnd)
                        organization.QuietHoursEnd = Math.Clamp(quietEnd, 0, 23);
                    if (request.NotificationWebhookUrl is { } webhookUrl)
                    {
                        var trimmed = webhookUrl.Trim();
                        if (trimmed.Length > 0 && !WebhookUrlAllowed(trimmed, environment))
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["notificationWebhookUrl"] =
                                    [
                                        "Use the https address Slack or Teams gave you.",
                                    ],
                                }
                            );
                        organization.NotificationWebhookUrl = trimmed.Length == 0 ? null : trimmed;
                    }
                    if (request.PublicUrl is { } publicUrl)
                    {
                        var trimmed = publicUrl.Trim().TrimEnd('/');
                        if (
                            trimmed.Length > 0
                            && !(
                                Uri.TryCreate(trimmed, UriKind.Absolute, out var parsed)
                                && parsed.Scheme is "http" or "https"
                            )
                        )
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["publicUrl"] =
                                    [
                                        "Use the full address, like https://ats.yourcompany.com.",
                                    ],
                                }
                            );
                        organization.PublicUrl = trimmed.Length == 0 ? null : trimmed;
                    }
                    if (request.AiEnabled is { } aiEnabled)
                        organization.AiEnabled = aiEnabled;
                    if (request.AiModel is { } aiModel)
                        organization.AiModel = string.IsNullOrWhiteSpace(aiModel)
                            ? null
                            : aiModel.Trim();
                    organization.SetupCompleted = true;
                    organization.UpdatedAt = DateTimeOffset.UtcNow;
                    // The interceptor adds the before and after of every field that changed.
                    Audit.Add(db, principal, "Organization", organization.Id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // Only the owner can hand the workspace to another active admin.
        api.MapPost(
                "/organization/transfer-ownership",
                async (
                    TransferOwnershipRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    if (organization is null)
                        return Results.NotFound();
                    if (
                        !string.Equals(
                            organization.OwnerEmail,
                            principal.Email(),
                            StringComparison.OrdinalIgnoreCase
                        )
                    )
                        return Results.Json(
                            new { message = "Only the workspace owner can hand over ownership." },
                            statusCode: StatusCodes.Status403Forbidden
                        );
                    var target = await db.Users.SingleOrDefaultAsync(
                        x => x.Id == request.UserId && x.IsActive && x.Role == UserRole.Admin,
                        ct
                    );
                    if (target is null)
                        return Results.Conflict(
                            new
                            {
                                message = "Pick an active admin. Make them an admin under Members first.",
                            }
                        );
                    var from = organization.OwnerEmail;
                    organization.OwnerEmail = target.Email;
                    organization.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "User",
                        target.Id,
                        "OwnershipTransferred",
                        new { From = from, To = target.Email }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/integrations",
                async (IWorkplaceIntegration integration, AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        new
                        {
                            Provider = integration.ProviderName,
                            Enabled = integration.IsEnabled,
                            Calendar = integration.IsEnabled
                                ? "Configured"
                                : "Internal scheduling only",
                            Pending = await db.IntegrationOutbox.CountAsync(
                                x =>
                                    x.Status == IntegrationOutboxStatus.Pending
                                    || x.Status == IntegrationOutboxStatus.Processing,
                                ct
                            ),
                            Failed = await db.IntegrationOutbox.CountAsync(
                                x => x.Status == IntegrationOutboxStatus.Failed,
                                ct
                            ),
                        }
                    )
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/integrations/retry-failed",
                async (
                    ClaimsPrincipal principal,
                    IWorkplaceIntegration integration,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!integration.IsEnabled)
                        return Results.Conflict(
                            new
                            {
                                message = "Configure a workplace provider before retrying delivery.",
                            }
                        );
                    var failed = await db
                        .IntegrationOutbox.Where(x => x.Status == IntegrationOutboxStatus.Failed)
                        .ToListAsync(ct);
                    foreach (var item in failed)
                    {
                        item.Status = IntegrationOutboxStatus.Pending;
                        item.Attempts = 0;
                        item.NextAttemptAt = DateTimeOffset.UtcNow;
                        item.LockedUntil = null;
                        item.LastError = null;
                        item.CompletedAt = null;
                    }
                    var entityIds = failed.Select(x => x.EntityId).ToArray();
                    await db
                        .Interviews.Where(x => entityIds.Contains(x.Id))
                        .ExecuteUpdateAsync(
                            update =>
                                update
                                    .SetProperty(x => x.CalendarStatus, "Queued")
                                    .SetProperty(x => x.CalendarError, (string?)null),
                            ct
                        );
                    Audit.Add(
                        db,
                        principal,
                        "Integration",
                        integration.ProviderName,
                        "FailedDeliveryRetried",
                        new { Count = failed.Count }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Count = failed.Count });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/directory/users",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Users.AsNoTracking()
                            .Where(x =>
                                x.IsActive
                                && (
                                    x.Role == UserRole.Admin
                                    || x.Role == UserRole.Recruiter
                                    || x.Role == UserRole.HiringManager
                                )
                            )
                            .OrderBy(x => x.DisplayName)
                            .Select(x => new
                            {
                                x.Email,
                                x.DisplayName,
                                Role = x.Role.ToString(),
                            })
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.Read);

        MapPeople(api);
        MapRoles(api);
        MapMe(api);
        MapSso(api);
        MapAudit(api);
    }
}
