using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Markdig;
using Markdig.Extensions.EmphasisExtras;
using Markdig.Renderers.Html;
using Markdig.Syntax;
using Markdig.Syntax.Inlines;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Infrastructure;

public interface IEmailSender
{
    // Returns the provider's message id when it gives one (used to match delivery webhooks).
    Task<string?> SendAsync(
        string recipient,
        string subject,
        string text,
        CancellationToken ct,
        EmailExtras? extras = null
    );
}

/// <summary>Thread emails: a person's name on the From line, a reply address, the thread to join, and files.</summary>
public sealed record EmailExtras(
    string? FromName = null,
    string? ReplyTo = null,
    string? ThreadReference = null,
    IReadOnlyList<EmailFile>? Files = null
);

public sealed record EmailFile(string FileName, byte[] Content, string? ContentType = null);

public static partial class EmailHtml
{
    // Markdown in (raw HTML is shown as text, never run), email-safe HTML out.
    private static readonly MarkdownPipeline Pipeline = new MarkdownPipelineBuilder()
        .DisableHtml()
        .UseAutoLinks()
        .UseEmphasisExtras(EmphasisExtraOptions.Inserted | EmphasisExtraOptions.Strikethrough)
        .UseSoftlineBreakAsHardlineBreak()
        .UsePipeTables()
        .UseTaskLists()
        .Build();

    /// <summary>
    /// A Markdown body in, a simple branded HTML email out. Links work only for http, https and
    /// mailto; <c>[Name](mention:…)</c> shows as the name. The brand (the careers site's icon and
    /// colour) is optional.
    /// </summary>
    public static string Wrap(
        string company,
        string markdown,
        Domain.EmailBrand? brand = null,
        string? root = null
    )
    {
        var color = brand?.Color ?? "#2563eb";
        var name = WebUtility.HtmlEncode(company);
        var icon = brand?.IconUrl is { } url
            ? $"<img src=\"{WebUtility.HtmlEncode(url)}\" width=\"28\" height=\"28\" alt=\"\" style=\"border-radius:6px;vertical-align:middle;margin-right:10px\">"
            : "";
        return new StringBuilder()
            .Append(
                "<!doctype html><html><body style=\"margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1917\">"
            )
            .Append(
                $"<div style=\"max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border-top:4px solid {color}\">"
            )
            .Append(
                $"<div style=\"padding:16px 24px;border-bottom:1px solid #e7e5e4;font-weight:600\">{icon}{name}</div>"
            )
            .Append("<div style=\"padding:24px;font-size:15px;line-height:1.55\">")
            .Append(Body(markdown, color, root))
            .Append("</div>")
            .Append("</div></body></html>")
            .ToString();
    }

    /// <summary>
    /// The Markdown as HTML with inline styles (mail apps ignore style sheets). Our own pictures
    /// (<c>/public/media/…</c>) get <paramref name="root"/>, the organization's public address, so
    /// mail apps can load them; without it they stay relative, which suits an in-app preview.
    /// </summary>
    public static string Body(string markdown, string color = "#2563eb", string? root = null)
    {
        var source = Underline()
            .Replace(EmailTemplates.PlainNames(markdown.Replace("\r\n", "\n")), "++$1++");
        var document = Markdown.Parse(source, Pipeline);
        foreach (var link in document.Descendants<LinkInline>())
        {
            if (link.IsImage && link.Url?.StartsWith(Api.MediaEndpoints.PublicPath) == true)
            {
                SizeImage(link);
                if (!string.IsNullOrWhiteSpace(root))
                    link.Url = root.TrimEnd('/') + link.Url;
                continue;
            }
            if (!SafeUrl(link.Url, link.IsImage))
                link.Url = "#";
        }
        var html = document.ToHtml(Pipeline);
        foreach (var (tag, style) in Styles(color))
            html = html.Replace(tag, tag[..^1] + $" style=\"{style}\">");
        return html.Replace("<a href=", $"<a style=\"color:{color}\" href=");
    }

    // The size saved in the address (?size=800x600), scaled to the email's 512px column, keeps Outlook from
    // showing a picture at full size and lets other apps reserve the space.
    private static void SizeImage(LinkInline image)
    {
        var at = image.Url!.IndexOf('?');
        var query = Microsoft.AspNetCore.WebUtilities.QueryHelpers.ParseQuery(
            at < 0 ? "" : image.Url[at..]
        );
        var style = "max-width:100%;height:auto;border-radius:6px";
        var size = query.GetValueOrDefault("size").ToString().Split('x');
        if (
            size.Length == 2
            && int.TryParse(size[0], out var width)
            && int.TryParse(size[1], out var height)
            && width > 0
            && height > 0
        )
        {
            var shown = Math.Min(width, 512);
            image.GetAttributes().AddProperty("width", shown.ToString());
            image
                .GetAttributes()
                .AddProperty(
                    "height",
                    ((int)Math.Round(height * (double)shown / width)).ToString()
                );
        }
        image.GetAttributes().AddProperty("style", style);
    }

    /// <summary>The text part of the email: the Markdown with mentions as names, pictures as their description and links spelled out.</summary>
    public static string PlainText(string markdown) =>
        MarkdownLink()
            .Replace(
                MarkdownImage().Replace(EmailTemplates.PlainNames(markdown), "$1"),
                m =>
                    m.Groups[1].Value == m.Groups[2].Value
                        ? m.Groups[2].Value
                        : $"{m.Groups[1].Value} ({m.Groups[2].Value})"
            )
            .Replace("<u>", "")
            .Replace("</u>", "");

    private static bool SafeUrl(string? url, bool image) =>
        url is not null
        && (
            url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || (!image && url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
            || (!image && url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
        );

    private static (string Tag, string Style)[] Styles(string color) =>
        [
            ("<p>", "margin:0 0 16px"),
            ("<ul>", "margin:0 0 16px;padding-left:22px"),
            ("<ol>", "margin:0 0 16px;padding-left:22px"),
            ("<li>", "margin:0 0 4px"),
            (
                "<blockquote>",
                "margin:0 0 16px;padding-left:12px;border-left:3px solid #e7e5e4;color:#57534e"
            ),
            ("<h1>", "font-size:22px;margin:0 0 12px"),
            ("<h2>", "font-size:19px;margin:0 0 12px"),
            ("<h3>", "font-size:16px;margin:0 0 10px"),
            ("<table>", "border-collapse:collapse;margin:0 0 16px"),
            ("<th>", "border:1px solid #e7e5e4;padding:6px 10px;text-align:left"),
            ("<td>", "border:1px solid #e7e5e4;padding:6px 10px"),
            ("<code>", "background:#f5f5f4;padding:1px 4px;border-radius:4px"),
            (
                "<pre>",
                "margin:0 0 16px;padding:12px 14px;background:#f5f5f4;border-radius:6px;overflow-x:auto;font-size:13px;line-height:1.5"
            ),
        ];

    [System.Text.RegularExpressions.GeneratedRegex(@"<u>(.*?)</u>")]
    private static partial System.Text.RegularExpressions.Regex Underline();

    [System.Text.RegularExpressions.GeneratedRegex(@"\[([^\]\n]+)\]\(([^)\s]+)\)")]
    private static partial System.Text.RegularExpressions.Regex MarkdownLink();

    [System.Text.RegularExpressions.GeneratedRegex(@"!\[([^\]\n]*)\]\([^)\s]*\)")]
    private static partial System.Text.RegularExpressions.Regex MarkdownImage();
}

public sealed class ResendEmailSender(
    HttpClient http,
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    IHostEnvironment environment,
    ILogger<ResendEmailSender> logger
) : IEmailSender
{
    public async Task<string?> SendAsync(
        string recipient,
        string subject,
        string text,
        CancellationToken ct,
        EmailExtras? extras = null
    )
    {
        var key = configuration["Resend:ApiKey"];
        var from = configuration["Resend:From"];
        if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(from))
        {
            // Development only: show the unsent email in the API log so local flows that depend on
            // an emailed code (candidate portal sign-in, application verification) can be finished.
            // Never in other environments, where the body may hold real candidate data.
            if (environment.IsDevelopment())
                logger.LogWarning(
                    "Resend is not configured; email to {Recipient} was not sent. Development copy:\nSubject: {Subject}\nReply-To: {ReplyTo}\n{Body}",
                    recipient,
                    subject,
                    extras?.ReplyTo ?? "(none)",
                    text
                );
            else
                logger.LogWarning(
                    "Resend is not configured; email to {Recipient} was not sent.",
                    recipient
                );
            return null;
        }

        string company;
        string? root;
        Domain.EmailBrand? brand;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var organization = await db
                .Organizations.Select(x => new { x.Name, x.PublicUrl })
                .SingleOrDefaultAsync(ct);
            company = organization?.Name ?? "Hiring team";
            root = organization?.PublicUrl;
            brand = await Api.CareerSites.EmailBrandAsync(db, ct);
        }
        using var request = new HttpRequestMessage(HttpMethod.Post, "emails");
        request.Headers.Authorization = new("Bearer", key);
        var payload = new Dictionary<string, object>
        {
            ["from"] = WithName(from, extras?.FromName),
            ["to"] = new[] { recipient },
            ["subject"] = subject,
            ["text"] = EmailHtml.PlainText(text),
            ["html"] = EmailHtml.Wrap(company, text, brand, root),
        };
        if (!string.IsNullOrWhiteSpace(extras?.ReplyTo))
            payload["reply_to"] = extras.ReplyTo;
        // Every email in a thread points at the same reference, so Gmail and Outlook group them.
        if (!string.IsNullOrWhiteSpace(extras?.ThreadReference))
            payload["headers"] = new Dictionary<string, string>
            {
                ["In-Reply-To"] = extras.ThreadReference,
                ["References"] = extras.ThreadReference,
            };
        if (extras?.Files is { Count: > 0 } files)
            payload["attachments"] = files
                .Select(f =>
                    f.ContentType is null
                        ? (object)
                            new
                            {
                                filename = f.FileName,
                                content = Convert.ToBase64String(f.Content),
                            }
                        : new
                        {
                            filename = f.FileName,
                            content = Convert.ToBase64String(f.Content),
                            content_type = f.ContentType,
                        }
                )
                .ToArray();
        request.Content = JsonContent.Create(payload);
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        return document.RootElement.TryGetProperty("id", out var id) ? id.GetString() : null;
    }

    // "hiring@acme.com" or "Acme <hiring@acme.com>" becomes "Avery at Acme <hiring@acme.com>".
    internal static string WithName(string from, string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return from;
        var start = from.LastIndexOf('<');
        var address = start >= 0 ? from[(start + 1)..].TrimEnd('>', ' ') : from.Trim();
        var clean = name.Replace("\"", "")
            .Replace("<", "")
            .Replace(">", "")
            .Replace("\r", "")
            .Replace("\n", "")
            .Trim();
        return $"\"{clean}\" <{address}>";
    }
}
