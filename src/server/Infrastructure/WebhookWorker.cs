using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Infrastructure;

// Delivers outbound webhooks and Slack/Teams notifications queued by PipelineEvents.
public sealed class WebhookWorker(
    IServiceScopeFactory scopeFactory,
    IHttpClientFactory httpClients,
    ILogger<WebhookWorker> logger
) : BackgroundService
{
    private const int MaximumAttempts = 6;

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
        var delivery = await db
            .WebhookDeliveries.Include(x => x.Endpoint)
            .Where(x => (x.Status == "Pending" || (x.Status == "Processing" && x.LockedUntil <= now)) && x.NextAttemptAt <= now)
            .OrderBy(x => x.NextAttemptAt)
            .FirstOrDefaultAsync(ct);
        if (delivery is null)
            return false;
        delivery.Status = "Processing";
        delivery.Attempts++;
        delivery.LockedUntil = now.AddMinutes(2);
        await db.SaveChangesAsync(ct);
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, delivery.Url)
            {
                Content = new StringContent(delivery.Payload, Encoding.UTF8, "application/json"),
            };
            request.Headers.Add("X-ATS-Event", delivery.EventType);
            request.Headers.Add("X-ATS-Delivery", delivery.Id.ToString());
            if (delivery.Endpoint is not null)
                request.Headers.Add(
                    "X-ATS-Signature",
                    "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(delivery.Endpoint.Secret), Encoding.UTF8.GetBytes(delivery.Payload))).ToLowerInvariant()
                );
            using var response = await httpClients.CreateClient("webhooks").SendAsync(request, ct);
            delivery.LastStatusCode = (int)response.StatusCode;
            if (!response.IsSuccessStatusCode)
                throw new HttpRequestException($"The receiver answered {(int)response.StatusCode}.");
            delivery.Status = "Succeeded";
            delivery.CompletedAt = DateTimeOffset.UtcNow;
            delivery.LastError = null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            var giveUp = delivery.Attempts >= MaximumAttempts;
            delivery.Status = giveUp ? "Failed" : "Pending";
            delivery.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(15 * Math.Pow(4, delivery.Attempts - 1));
            delivery.LastError = exception.Message[..Math.Min(exception.Message.Length, 1000)];
            if (giveUp)
                delivery.CompletedAt = DateTimeOffset.UtcNow;
        }
        delivery.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return true;
    }
}
