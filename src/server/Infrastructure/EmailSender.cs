using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Infrastructure;

public interface IEmailSender
{
    // Returns the provider's message id when it gives one (used to match delivery webhooks).
    Task<string?> SendAsync(string recipient, string subject, string text, CancellationToken ct);
}

public static class EmailHtml
{
    // Plain text in, a simple branded HTML document out. Blank lines make paragraphs; URLs become links.
    public static string Wrap(string company, string text)
    {
        var paragraphs = text
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries)
            .Select(p => $"<p style=\"margin:0 0 16px;line-height:1.55\">{Linkify(WebUtility.HtmlEncode(p.Trim())).Replace("\n", "<br>")}</p>");
        var name = WebUtility.HtmlEncode(company);
        return new StringBuilder()
            .Append("<!doctype html><html><body style=\"margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917\">")
            .Append("<div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden\">")
            .Append($"<div style=\"padding:16px 24px;border-bottom:1px solid #e7e5e4;font-weight:600\">{name}</div>")
            .Append("<div style=\"padding:24px\">").Append(string.Concat(paragraphs)).Append("</div>")
            .Append("</div></body></html>")
            .ToString();
    }

    private static string Linkify(string encoded) =>
        System.Text.RegularExpressions.Regex.Replace(
            encoded,
            @"(https?://[^\s<]+)",
            "<a href=\"$1\" style=\"color:#2563eb\">$1</a>"
        );
}

public sealed class ResendEmailSender(
    HttpClient http,
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    ILogger<ResendEmailSender> logger
) : IEmailSender
{
    public async Task<string?> SendAsync(string recipient, string subject, string text, CancellationToken ct)
    {
        var key = configuration["Resend:ApiKey"];
        var from = configuration["Resend:From"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(from))
        {
            logger.LogWarning("Resend is not configured; email to {Recipient} was not sent.", recipient);
            return null;
        }

        string company;
        await using (var scope = scopes.CreateAsyncScope())
            company =
                await scope
                    .ServiceProvider.GetRequiredService<AtsDbContext>()
                    .Organizations.Select(x => x.Name)
                    .SingleOrDefaultAsync(ct) ?? "Hiring team";
        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new("Bearer", key);
        request.Content = JsonContent.Create(
            new { from, to = new[] { recipient }, subject, text, html = EmailHtml.Wrap(company, text) }
        );
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        return document.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null;
    }
}
