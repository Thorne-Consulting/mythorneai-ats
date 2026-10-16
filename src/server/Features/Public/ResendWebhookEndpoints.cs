using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static readonly Dictionary<string, int> DeliveryRank = new()
    {
        ["sent"] = 0, ["delivery_delayed"] = 1, ["delivered"] = 2, ["opened"] = 3, ["clicked"] = 4, ["bounced"] = 5, ["complained"] = 5,
    };

    // Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body" using the base64 secret.
    private static void MapResendWebhook(RouteGroupBuilder api)
    {
        api.MapPost("/webhooks/resend", async (HttpRequest request, AtsDbContext db, IConfiguration configuration, CancellationToken ct) =>
        {
            var secret = configuration["Resend:WebhookSecret"];
            if (string.IsNullOrWhiteSpace(secret)) return Results.NotFound();
            using var reader = new StreamReader(request.Body, Encoding.UTF8);
            var body = await reader.ReadToEndAsync(ct);
            if (!VerifySvix(secret, request.Headers["svix-id"].ToString(), request.Headers["svix-timestamp"].ToString(), request.Headers["svix-signature"].ToString(), body))
                return Results.Unauthorized();
            using var document = JsonDocument.Parse(body);
            var type = document.RootElement.GetProperty("type").GetString() ?? "";
            if (!type.StartsWith("email.") || !document.RootElement.TryGetProperty("data", out var data)
                || !data.TryGetProperty("email_id", out var idValue) || idValue.GetString() is not { } providerId)
                return Results.NoContent();
            var status = type["email.".Length..];
            if (!DeliveryRank.TryGetValue(status, out var rank)) return Results.NoContent();
            var item = await db.EmailOutbox.SingleOrDefaultAsync(x => x.ProviderMessageId == providerId, ct);
            if (item is null) return Results.NoContent();
            var current = item.DeliveryStatus is not null && DeliveryRank.TryGetValue(item.DeliveryStatus, out var existing) ? existing : -1;
            if (rank <= current) return Results.NoContent();
            item.DeliveryStatus = status;
            item.DeliveryUpdatedAt = DateTimeOffset.UtcNow;
            if (status is "bounced" or "complained")
            {
                await db.Candidates.Where(x => x.Email == item.Recipient).ExecuteUpdateAsync(u => u.SetProperty(x => x.EmailBounced, true), ct);
                await PipelineEvents.NotifyAsync(db, $"An email to {item.Recipient} {status}. We won't send to that address again.", ct);
            }
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }

    internal static bool VerifySvix(string secret, string id, string timestamp, string signatures, string body)
    {
        if (!long.TryParse(timestamp, out var seconds)
            || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - seconds) > 300)
            return false;
        byte[] key;
        try { key = Convert.FromBase64String(secret.StartsWith("whsec_") ? secret["whsec_".Length..] : secret); }
        catch (FormatException) { return false; }
        var expected = Convert.ToBase64String(HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}")));
        return signatures.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Split(',', 2))
            .Any(parts => parts.Length == 2 && parts[0] == "v1"
                && CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(parts[1]), Encoding.UTF8.GetBytes(expected)));
    }
}
