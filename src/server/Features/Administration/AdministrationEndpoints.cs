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
                "/admin/users",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Users.AsNoTracking()
                            .OrderBy(x => x.DisplayName)
                            .Select(x => new
                            {
                                x.Id,
                                x.Email,
                                x.DisplayName,
                                Role = x.Role.ToString(),
                                x.Department,
                                x.IsActive,
                                x.UpdatedAt,
                            })
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/users",
                async (
                    UpsertUserRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (
                        string.IsNullOrWhiteSpace(request.Email)
                        || string.IsNullOrWhiteSpace(request.DisplayName)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["user"] = ["Email and display name are required."],
                            }
                        );
                    var email = request.Email.Trim().ToLowerInvariant();
                    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email, ct);
                    if (user is null)
                    {
                        user = new AppUser
                        {
                            Email = email,
                            DisplayName = request.DisplayName.Trim(),
                            Role = request.Role,
                            Department = Clean(request.Department),
                            IsActive = request.IsActive,
                        };
                        db.Users.Add(user);
                        Audit.Add(
                            db,
                            principal,
                            "User",
                            user.Id,
                            "Created",
                            new { user.Email, user.Role }
                        );
                    }
                    else
                    {
                        user.DisplayName = request.DisplayName.Trim();
                        user.Role = request.Role;
                        user.Department = Clean(request.Department);
                        user.IsActive = request.IsActive;
                        user.UpdatedAt = DateTimeOffset.UtcNow;
                        Audit.Add(
                            db,
                            principal,
                            "User",
                            user.Id,
                            "Updated",
                            new { user.Role, user.IsActive }
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { user.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/audit",
                async (string? entityType, AtsDbContext db, CancellationToken ct) =>
                {
                    var query = db.AuditEvents.AsNoTracking();
                    if (!string.IsNullOrWhiteSpace(entityType))
                        query = query.Where(x => x.EntityType == entityType);
                    return Results.Ok(
                        await query.OrderByDescending(x => x.OccurredAt).Take(250).ToListAsync(ct)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }
}
