using System.Net.Http.Json;

namespace MyThorneAI.Ats.Api.Infrastructure;

public interface IEmailSender
{
    Task SendAsync(string recipient, string subject, string text, CancellationToken ct);
}

public sealed class ResendEmailSender(
    HttpClient http,
    IConfiguration configuration,
    ILogger<ResendEmailSender> logger
) : IEmailSender
{
    public async Task SendAsync(string recipient, string subject, string text, CancellationToken ct)
    {
        var key = configuration["Resend:ApiKey"];
        var from = configuration["Resend:From"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(from))
        {
            logger.LogWarning("Resend is not configured; email to {Recipient} was not sent.", recipient);
            return;
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new("Bearer", key);
        request.Content = JsonContent.Create(new { from, to = new[] { recipient }, subject, text });
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
    }
}
