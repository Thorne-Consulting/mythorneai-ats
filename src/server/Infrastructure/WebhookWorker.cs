using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

// Delivers outbound webhooks and Slack/Teams notifications queued by PipelineEvents and WebhookEvents.
// ponytail: one delivery at a time across all endpoints; claim batches with SKIP LOCKED and send a
// few in parallel (one in flight per endpoint) once a slow receiver starts delaying the others.
public sealed class WebhookWorker(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClients,
    ILogger<WebhookWorker> logger
) : BackgroundService
{
    private const int MaximumAttempts = 6;
    private const int ResponseBodyLimit = 2048;
    public static readonly TimeSpan PauseAfter = TimeSpan.FromDays(3);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                worked = await DeliverOneAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Webhook worker failed; retrying.");
            }
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(worked ? 0.2 : 3), stoppingToken);
            }
            catch (OperationCanceledException) { }
        }
    }

    private async Task<bool> DeliverOneAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var now = DateTimeOffset.UtcNow;
        // Deliveries for a paused endpoint wait; they go out if it is turned back on.
        var delivery = await db
            .WebhookDeliveries.Include(x => x.Endpoint)
            .Where(x =>
                (x.Status == "Pending" || (x.Status == "Processing" && x.LockedUntil <= now))
                && x.NextAttemptAt <= now
                && (x.Endpoint == null || x.Endpoint.IsActive)
            )
            .OrderBy(x => x.NextAttemptAt)
            .FirstOrDefaultAsync(ct);
        if (delivery is null)
            return false;
        delivery.Status = "Processing";
        delivery.Attempts++;
        delivery.LockedUntil = now.AddMinutes(2);
        await db.SaveChangesAsync(ct);

        var timer = Stopwatch.StartNew();
        int? statusCode = null;
        string? error = null;
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, delivery.Url)
            {
                Content = new StringContent(delivery.Payload, Encoding.UTF8, "application/json"),
            };
            var headers = Headers(delivery, DateTimeOffset.UtcNow);
            foreach (var (name, value) in headers)
                request.Headers.TryAddWithoutValidation(name, value);
            delivery.RequestHeaders = JsonSerializer.Serialize(headers);
            using var response = await httpClients.CreateClient("webhooks").SendAsync(request, ct);
            statusCode = (int)response.StatusCode;
            delivery.LastStatusCode = statusCode;
            delivery.ResponseBody = await ReadStartAsync(response, ct);
            if (!response.IsSuccessStatusCode)
                throw new HttpRequestException($"The receiver answered {statusCode}.");
            delivery.Status = "Succeeded";
            delivery.CompletedAt = DateTimeOffset.UtcNow;
            delivery.LastError = null;
            if (delivery.Endpoint is not null)
                delivery.Endpoint.FailingSince = null;
        }
        catch (Exception exception)
            when (exception is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            error = exception.Message[..Math.Min(exception.Message.Length, 1000)];
            var giveUp = delivery.Attempts >= MaximumAttempts;
            delivery.Status = giveUp ? "Failed" : "Pending";
            delivery.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(
                15 * Math.Pow(4, delivery.Attempts - 1)
            );
            delivery.LastError = error;
            if (giveUp)
                delivery.CompletedAt = DateTimeOffset.UtcNow;
            if (delivery.Endpoint is { } endpoint)
                await PauseIfFailingTooLongAsync(db, endpoint, DateTimeOffset.UtcNow, ct);
        }
        delivery.DurationMs = (int)timer.ElapsedMilliseconds;
        delivery.AttemptLog = AppendAttempt(
            delivery.AttemptLog,
            now,
            statusCode,
            delivery.DurationMs.Value,
            error
        );
        delivery.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return true;
    }

    /// <summary>
    /// Standard Webhooks headers (webhook-id, webhook-timestamp, webhook-signature) plus the older
    /// X-ATS-* headers existing receivers check. During a rotation both secrets sign.
    /// </summary>
    public static List<KeyValuePair<string, string>> Headers(
        WebhookDelivery delivery,
        DateTimeOffset now
    )
    {
        var headers = new List<KeyValuePair<string, string>>
        {
            new("X-ATS-Event", delivery.EventType),
            new("X-ATS-Delivery", delivery.Id.ToString()),
        };
        if (delivery.Endpoint is not { } endpoint)
            return headers;
        var id = $"msg_{delivery.Id:N}";
        var timestamp = now.ToUnixTimeSeconds();
        var signatures = new List<string>
        {
            WebhookEvents.Sign(endpoint.Secret, id, timestamp, delivery.Payload),
        };
        if (endpoint.PreviousSecret is not null && endpoint.PreviousSecretExpiresAt > now)
            signatures.Add(
                WebhookEvents.Sign(endpoint.PreviousSecret, id, timestamp, delivery.Payload)
            );
        headers.Add(new("webhook-id", id));
        headers.Add(new("webhook-timestamp", timestamp.ToString()));
        headers.Add(new("webhook-signature", string.Join(' ', signatures)));
        headers.Add(
            new(
                "X-ATS-Signature",
                "sha256="
                    + Convert
                        .ToHexString(
                            HMACSHA256.HashData(
                                Encoding.UTF8.GetBytes(endpoint.Secret),
                                Encoding.UTF8.GetBytes(delivery.Payload)
                            )
                        )
                        .ToLowerInvariant()
            )
        );
        return headers;
    }

    /// <summary>
    /// Remembers when an endpoint started failing; after three days of nothing but failures it is
    /// paused and the admins get an email.
    /// </summary>
    public static async Task PauseIfFailingTooLongAsync(
        AtsDbContext db,
        WebhookEndpoint endpoint,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        endpoint.FailingSince ??= now;
        if (!endpoint.IsActive || now - endpoint.FailingSince < PauseAfter)
            return;
        endpoint.IsActive = false;
        endpoint.DisabledReason = "We paused this webhook because every message failed for 3 days.";
        var admins = await db
            .Users.Where(x => x.IsActive && x.Role == UserRole.Admin)
            .Select(x => x.Email)
            .ToListAsync(ct);
        await Notify.AddAsync(
            db,
            admins,
            new NotificationDraft(
                NotificationKinds.WorkspaceAlert,
                "A webhook was paused",
                "/settings/webhooks",
                $"Every message to {endpoint.Url} failed for 3 days, so we paused it. Nothing more is sent until someone turns it back on."
            ),
            ct
        );
    }

    private static async Task<string?> ReadStartAsync(
        HttpResponseMessage response,
        CancellationToken ct
    )
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        var buffer = new byte[ResponseBodyLimit];
        var read = 0;
        while (read < buffer.Length)
        {
            var n = await stream.ReadAsync(buffer.AsMemory(read), ct);
            if (n == 0)
                break;
            read += n;
        }
        return read == 0 ? null : Encoding.UTF8.GetString(buffer, 0, read);
    }

    private static string AppendAttempt(
        string? log,
        DateTimeOffset at,
        int? status,
        int durationMs,
        string? error
    )
    {
        var attempts = string.IsNullOrEmpty(log)
            ? []
            : JsonSerializer.Deserialize<List<WebhookAttempt>>(log) ?? [];
        attempts.Add(new WebhookAttempt(at, status, durationMs, error));
        return JsonSerializer.Serialize(attempts.TakeLast(20));
    }
}

public sealed record WebhookAttempt(DateTimeOffset At, int? Status, int DurationMs, string? Error);
