using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    // Outbound webhooks: endpoints, their secrets, and the history of what was sent.
    private static void MapWebhooks(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/admin/webhooks").RequireAuthorization(AtsPolicies.Admin);

        group.MapGet(
            "",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var endpoints = await db
                    .WebhookEndpoints.AsNoTracking()
                    .OrderBy(x => x.CreatedAt)
                    .ToListAsync(ct);
                var ids = endpoints.Select(x => x.Id).ToList();
                var failed = await db
                    .WebhookDeliveries.Where(x =>
                        x.EndpointId != null
                        && ids.Contains(x.EndpointId.Value)
                        && x.Status == "Failed"
                    )
                    .GroupBy(x => x.EndpointId)
                    .Select(x => new { Id = x.Key, Count = x.Count() })
                    .ToDictionaryAsync(x => x.Id!.Value, x => x.Count, ct);
                var result = new List<object>();
                foreach (var endpoint in endpoints)
                {
                    var recent = await db
                        .WebhookDeliveries.AsNoTracking()
                        .Where(x => x.EndpointId == endpoint.Id)
                        .OrderByDescending(x => x.CreatedAt)
                        .FirstOrDefaultAsync(ct);
                    result.Add(
                        new
                        {
                            endpoint.Id,
                            endpoint.Url,
                            // The full secret is shown once, when created or rotated; revealing it again is audited.
                            Secret = WebhookEvents.Mask(endpoint.Secret),
                            endpoint.Events,
                            endpoint.IsActive,
                            endpoint.DisabledReason,
                            endpoint.FailingSince,
                            RotationEndsAt = endpoint.PreviousSecretExpiresAt
                            > DateTimeOffset.UtcNow
                                ? endpoint.PreviousSecretExpiresAt
                                : null,
                            LastStatus = recent?.Status,
                            LastAt = recent?.CreatedAt,
                            LastError = recent?.LastError,
                            Failed = failed.GetValueOrDefault(endpoint.Id),
                        }
                    );
                }
                return Results.Ok(new { Events = WebhookEvents.Catalog, Endpoints = result });
            }
        );

        group.MapPost(
            "",
            async (
                SaveWebhookRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                IHostEnvironment environment,
                CancellationToken ct
            ) =>
            {
                var error = ValidateWebhook(request, environment);
                if (error is not null)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["url"] = [error] }
                    );
                var endpoint = new WebhookEndpoint
                {
                    Url = request.Url.Trim(),
                    Secret = WebhookEvents.NewSecret(),
                    Events = (request.Events ?? [])
                        .Where(WebhookEvents.Types.Contains)
                        .Distinct()
                        .ToArray(),
                    IsActive = request.IsActive,
                };
                db.WebhookEndpoints.Add(endpoint);
                Audit.Add(
                    db,
                    principal,
                    "Webhook",
                    endpoint.Id,
                    "Created",
                    new { endpoint.Url, endpoint.Events }
                );
                await db.SaveChangesAsync(ct);
                return Results.Created(
                    $"/api/admin/webhooks/{endpoint.Id}",
                    new { endpoint.Id, endpoint.Secret }
                );
            }
        );

        group.MapPut(
            "/{id:guid}",
            async (
                Guid id,
                SaveWebhookRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                IHostEnvironment environment,
                CancellationToken ct
            ) =>
            {
                var endpoint = await db.WebhookEndpoints.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (endpoint is null)
                    return Results.NotFound();
                var error = ValidateWebhook(request, environment);
                if (error is not null)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["url"] = [error] }
                    );
                endpoint.Url = request.Url.Trim();
                endpoint.Events = (request.Events ?? [])
                    .Where(WebhookEvents.Types.Contains)
                    .Distinct()
                    .ToArray();
                if (request.IsActive && !endpoint.IsActive)
                {
                    // Turned back on: start counting failures afresh.
                    endpoint.DisabledReason = null;
                    endpoint.FailingSince = null;
                }
                endpoint.IsActive = request.IsActive;
                Audit.Add(db, principal, "Webhook", id, "Updated");
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        group.MapDelete(
            "/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var endpoint = await db.WebhookEndpoints.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (endpoint is null)
                    return Results.NotFound();
                db.WebhookEndpoints.Remove(endpoint);
                Audit.Add(db, principal, "Webhook", id, "Deleted", new { endpoint.Url });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        group.MapPost(
            "/{id:guid}/test",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var endpoint = await db
                    .WebhookEndpoints.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (endpoint is null)
                    return Results.NotFound();
                db.WebhookDeliveries.Add(
                    new WebhookDelivery
                    {
                        EndpointId = id,
                        Url = endpoint.Url,
                        EventType = "ping",
                        Payload = WebhookEvents.Envelope(
                            "ping",
                            new { message = "Test message from MyThorneAI." }
                        ),
                    }
                );
                Audit.Add(db, principal, "Webhook", id, "TestSent");
                await db.SaveChangesAsync(ct);
                return Results.Accepted();
            }
        );

        group.MapPost(
            "/{id:guid}/secret",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var secret = await db
                    .WebhookEndpoints.Where(x => x.Id == id)
                    .Select(x => x.Secret)
                    .SingleOrDefaultAsync(ct);
                if (secret is null)
                    return Results.NotFound();
                Audit.Add(db, principal, "Webhook", id, "SecretRevealed");
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { secret });
            }
        );

        group.MapPost(
            "/{id:guid}/rotate",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var endpoint = await db.WebhookEndpoints.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (endpoint is null)
                    return Results.NotFound();
                // The old secret keeps signing for a day, so the receiver can switch without missing anything.
                endpoint.PreviousSecret = endpoint.Secret;
                endpoint.PreviousSecretExpiresAt = DateTimeOffset.UtcNow.AddHours(24);
                endpoint.Secret = WebhookEvents.NewSecret();
                Audit.Add(db, principal, "Webhook", id, "SecretRotated");
                await db.SaveChangesAsync(ct);
                return Results.Ok(
                    new { endpoint.Secret, RotationEndsAt = endpoint.PreviousSecretExpiresAt }
                );
            }
        );

        group.MapGet(
            "/{id:guid}/deliveries",
            async (Guid id, AtsDbContext db, CancellationToken ct) =>
                Results.Ok(
                    await db
                        .WebhookDeliveries.AsNoTracking()
                        .Where(x => x.EndpointId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(100)
                        .Select(x => new
                        {
                            x.Id,
                            x.EventType,
                            x.Status,
                            x.Attempts,
                            x.LastStatusCode,
                            x.LastError,
                            x.DurationMs,
                            x.CreatedAt,
                            x.CompletedAt,
                        })
                        .ToListAsync(ct)
                )
        );

        group.MapGet(
            "/deliveries/{id:guid}",
            async (Guid id, AtsDbContext db, CancellationToken ct) =>
            {
                var delivery = await db
                    .WebhookDeliveries.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id && x.EndpointId != null, ct);
                if (delivery is null)
                    return Results.NotFound();
                return Results.Ok(
                    new
                    {
                        delivery.Id,
                        delivery.EventType,
                        delivery.Url,
                        delivery.Status,
                        delivery.Attempts,
                        delivery.LastStatusCode,
                        delivery.LastError,
                        delivery.DurationMs,
                        delivery.CreatedAt,
                        delivery.CompletedAt,
                        delivery.NextAttemptAt,
                        delivery.Payload,
                        RequestHeaders = delivery.RequestHeaders is null
                            ? []
                            : JsonSerializer.Deserialize<List<KeyValuePair<string, string>>>(
                                delivery.RequestHeaders
                            ) ?? [],
                        delivery.ResponseBody,
                        Timeline = delivery.AttemptLog is null
                            ? []
                            : JsonSerializer.Deserialize<List<WebhookAttempt>>(delivery.AttemptLog)
                                ?? [],
                    }
                );
            }
        );

        group.MapPost(
            "/deliveries/{id:guid}/retry",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var delivery = await db.WebhookDeliveries.SingleOrDefaultAsync(
                    x => x.Id == id && x.EndpointId != null,
                    ct
                );
                if (delivery is null)
                    return Results.NotFound();
                Requeue(delivery);
                Audit.Add(
                    db,
                    principal,
                    "Webhook",
                    delivery.EndpointId!,
                    "DeliveryRetried",
                    new { delivery.EventType }
                );
                await db.SaveChangesAsync(ct);
                return Results.Accepted();
            }
        );

        group.MapPost(
            "/{id:guid}/deliveries/retry-failed",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var failed = await db
                    .WebhookDeliveries.Where(x => x.EndpointId == id && x.Status == "Failed")
                    .ToListAsync(ct);
                failed.ForEach(Requeue);
                if (failed.Count > 0)
                    Audit.Add(
                        db,
                        principal,
                        "Webhook",
                        id,
                        "FailedDeliveriesRetried",
                        new { failed.Count }
                    );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { failed.Count });
            }
        );
    }

    private static void Requeue(WebhookDelivery delivery)
    {
        delivery.Status = "Pending";
        delivery.Attempts = 0;
        delivery.NextAttemptAt = DateTimeOffset.UtcNow;
        delivery.LockedUntil = null;
        delivery.CompletedAt = null;
    }
}
