using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record TestInboundEmailRequest(
    string From,
    string To,
    string? Subject,
    string Text,
    string? InReplyTo
);

public static partial class PublicEndpoints
{
    // Status only moves forward. Failed, suppressed, bounced and complained are final.
    private static readonly Dictionary<string, int> DeliveryRank = new()
    {
        ["sent"] = 0,
        ["delivery_delayed"] = 1,
        ["delivered"] = 2,
        ["opened"] = 3,
        ["clicked"] = 4,
        ["bounced"] = 5,
        ["complained"] = 5,
        ["failed"] = 5,
        ["suppressed"] = 5,
    };

    // Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body" using the base64 secret.
    private static void MapResendWebhook(RouteGroupBuilder api)
    {
        api.MapPost(
            "/webhooks/resend",
            async (
                HttpRequest request,
                AtsDbContext db,
                IConfiguration configuration,
                IHttpClientFactory httpFactory,
                LocalFileStore store,
                IHubContext<InboxHub> hub,
                ILoggerFactory loggers,
                CancellationToken ct
            ) =>
            {
                var secret = configuration["Resend:WebhookSecret"];
                if (string.IsNullOrWhiteSpace(secret))
                    return Results.NotFound();
                using var reader = new StreamReader(request.Body, Encoding.UTF8);
                var body = await reader.ReadToEndAsync(ct);
                if (
                    !VerifySvix(
                        secret,
                        request.Headers["svix-id"].ToString(),
                        request.Headers["svix-timestamp"].ToString(),
                        request.Headers["svix-signature"].ToString(),
                        body
                    )
                )
                    return Results.Unauthorized();
                using var document = JsonDocument.Parse(body);
                var type = document.RootElement.GetProperty("type").GetString() ?? "";
                if (
                    !type.StartsWith("email.")
                    || !document.RootElement.TryGetProperty("data", out var data)
                    || !data.TryGetProperty("email_id", out var idValue)
                    || idValue.GetString() is not { } providerId
                )
                    return Results.NoContent();

                if (type == "email.received")
                {
                    var email = await FetchReceivedAsync(
                        httpFactory.CreateClient(),
                        configuration["Resend:ApiKey"],
                        providerId,
                        ct
                    );
                    if (email is null)
                    {
                        loggers
                            .CreateLogger("Resend")
                            .LogWarning(
                                "Could not fetch received email {EmailId} from Resend.",
                                providerId
                            );
                        // A 5xx makes Resend retry later; the provider id keeps the retry from posting twice.
                        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
                    }
                    var result = await EmailInbound.ReceiveAsync(
                        db,
                        configuration,
                        store,
                        email,
                        ct
                    );
                    if (result.ApplicationId is { } applicationId)
                        await hub.ThreadChangedAsync(applicationId, result.CandidateId);
                    return Results.NoContent();
                }

                var status = type["email.".Length..];
                if (!DeliveryRank.TryGetValue(status, out var rank))
                    return Results.NoContent();
                var item = await db.EmailOutbox.SingleOrDefaultAsync(
                    x => x.ProviderMessageId == providerId,
                    ct
                );
                if (item is null)
                    return Results.NoContent();
                var current =
                    item.DeliveryStatus is not null
                    && DeliveryRank.TryGetValue(item.DeliveryStatus, out var existing)
                        ? existing
                        : -1;
                if (rank <= current)
                    return Results.NoContent();
                item.DeliveryStatus = status;
                item.DeliveryUpdatedAt = DateTimeOffset.UtcNow;
                if (status is "bounced" or "complained" or "suppressed")
                {
                    await db
                        .Candidates.Where(x => x.Email == item.Recipient)
                        .ExecuteUpdateAsync(u => u.SetProperty(x => x.EmailBounced, true), ct);
                    await PipelineEvents.NotifyAsync(
                        db,
                        $"An email to {item.Recipient} {(status == "suppressed" ? "was blocked because the address bounced before" : status)}. We won't send to that address again.",
                        ct,
                        TeamChannel.EmailBounced,
                        "/settings/email/blocked"
                    );
                }
                await db.SaveChangesAsync(ct);
                if (item.ApplicationId is { } thread)
                    await hub.ThreadChangedAsync(thread);
                return Results.NoContent();
            }
        );

        // Development only: there is no inbound mail locally, so this posts a reply as if Resend had
        // received it. Send the reply address from the API log's "Reply-To" line as "to".
        if (
            api is IEndpointRouteBuilder endpoints
            && endpoints.ServiceProvider.GetRequiredService<IHostEnvironment>().IsDevelopment()
        )
            api.MapPost(
                "/webhooks/resend/test-inbound",
                async (
                    TestInboundEmailRequest request,
                    AtsDbContext db,
                    IConfiguration configuration,
                    LocalFileStore store,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var result = await EmailInbound.ReceiveAsync(
                        db,
                        configuration,
                        store,
                        new InboundEmail(
                            $"test-{Guid.NewGuid():N}",
                            request.From,
                            [request.To],
                            request.Subject ?? "Re: your application",
                            request.Text,
                            null,
                            request.InReplyTo,
                            request.InReplyTo
                        ),
                        ct
                    );
                    if (result.ApplicationId is { } applicationId)
                        await hub.ThreadChangedAsync(applicationId, result.CandidateId);
                    return Results.Ok(
                        new { outcome = result.Outcome.ToString(), result.ApplicationId }
                    );
                }
            );
    }

    // Received-email webhooks carry metadata only; the text, headers and files come from the Receiving API.
    private static async Task<InboundEmail?> FetchReceivedAsync(
        HttpClient http,
        string? apiKey,
        string emailId,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(apiKey))
            return null;
        async Task<JsonDocument?> GetAsync(string path)
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Get,
                $"https://api.resend.com/{path}"
            );
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
            using var response = await http.SendAsync(request, ct);
            return response.IsSuccessStatusCode
                ? await JsonDocument.ParseAsync(
                    await response.Content.ReadAsStreamAsync(ct),
                    cancellationToken: ct
                )
                : null;
        }
        using var email = await GetAsync($"emails/receiving/{Uri.EscapeDataString(emailId)}");
        if (email is null)
            return null;
        using var attachments = await GetAsync(
            $"emails/receiving/{Uri.EscapeDataString(emailId)}/attachments"
        );
        var root = email.RootElement;
        string? Text(JsonElement element, string name) =>
            element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        string? Header(string name) =>
            root.TryGetProperty("headers", out var headers)
            && headers.ValueKind == JsonValueKind.Object
                ? headers
                    .EnumerateObject()
                    .Where(x => x.Name.Equals(name, StringComparison.OrdinalIgnoreCase))
                    .Select(x => x.Value.ToString())
                    .FirstOrDefault()
                : null;
        IEnumerable<string> Addresses(string name) =>
            root.TryGetProperty(name, out var value)
                ? value.ValueKind == JsonValueKind.Array
                    ? value.EnumerateArray().Select(x => x.ToString())
                    : [value.ToString()]
                : [];
        var files = new List<InboundFile>();
        if (
            attachments?.RootElement.TryGetProperty("data", out var list) == true
            && list.ValueKind == JsonValueKind.Array
        )
            foreach (var file in list.EnumerateArray())
            {
                var url = Text(file, "download_url");
                if (url is null)
                    continue;
                files.Add(
                    new InboundFile(
                        Text(file, "filename") ?? "file",
                        file.TryGetProperty("size", out var size) && size.TryGetInt64(out var bytes)
                            ? bytes
                            : 0,
                        Text(file, "content_disposition") == "inline",
                        token => http.GetStreamAsync(url, token)
                    )
                );
            }
        return new InboundEmail(
            emailId,
            Text(root, "from") ?? "",
            Addresses("to").Concat(Addresses("cc")).Concat(Addresses("received_for")).ToList(),
            Text(root, "subject") ?? "",
            Text(root, "text"),
            Text(root, "html"),
            Header("in-reply-to"),
            Header("references"),
            files
        );
    }

    internal static bool VerifySvix(
        string secret,
        string id,
        string timestamp,
        string signatures,
        string body
    )
    {
        if (
            !long.TryParse(timestamp, out var seconds)
            || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - seconds) > 300
        )
            return false;
        byte[] key;
        try
        {
            key = Convert.FromBase64String(
                secret.StartsWith("whsec_") ? secret["whsec_".Length..] : secret
            );
        }
        catch (FormatException)
        {
            return false;
        }
        var expected = Convert.ToBase64String(
            HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}"))
        );
        return signatures
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.Split(',', 2))
            .Any(parts =>
                parts.Length == 2
                && parts[0] == "v1"
                && CryptographicOperations.FixedTimeEquals(
                    Encoding.UTF8.GetBytes(parts[1]),
                    Encoding.UTF8.GetBytes(expected)
                )
            );
    }
}
