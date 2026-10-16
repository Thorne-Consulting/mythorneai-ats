using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed record EmailTemplateDefault(string Label, string Subject, string Body, string[] Variables);

public static partial class EmailTemplates
{
    public static readonly IReadOnlyDictionary<string, EmailTemplateDefault> Defaults =
        new Dictionary<string, EmailTemplateDefault>
        {
            ["acceptance"] = new(
                "Acceptance",
                "You've been accepted for {{jobTitle}}",
                "Hi {{firstName}},\n\nGreat news: you've been accepted for the {{jobTitle}} role at {{company}}. The team will contact you shortly with next steps.\n\nCongratulations, and thank you for your time.\n{{company}} hiring team",
                ["firstName", "jobTitle", "company"]
            ),
            ["stage-update"] = new(
                "Status update",
                "Update on your {{jobTitle}} application",
                "Hi {{firstName}},\n\nYour application for {{jobTitle}} has moved to: {{stage}}.\n\nFollow your application and message us here: {{portalLink}}\n\n{{company}} hiring team",
                ["firstName", "jobTitle", "company", "stage", "portalLink"]
            ),
            ["rejection"] = new(
                "Rejection",
                "Your {{jobTitle}} application",
                "Hi {{firstName}},\n\nThank you for your interest in the {{jobTitle}} role at {{company}} and for the time you put into the process. We've decided not to move forward with your application.\n\nWe wish you the best in your search.\n{{company}} hiring team",
                ["firstName", "jobTitle", "company"]
            ),
            ["booking-request"] = new(
                "Interview booking request",
                "Book your {{interviewTitle}} interview",
                "Hi {{firstName}},\n\n{{roundMessage}}\n\nPlease choose a time for your {{interviewTitle}} interview for {{jobTitle}}: {{portalLink}}\n\n{{company}} hiring team",
                ["firstName", "jobTitle", "company", "interviewTitle", "roundMessage", "portalLink"]
            ),
            ["booking-reminder"] = new(
                "Booking reminder",
                "Reminder: book your {{interviewTitle}} interview",
                "Hi {{firstName}},\n\nWe haven't heard back about a time for your {{interviewTitle}} interview for {{jobTitle}}. Please pick a time when you can: {{portalLink}}\n\n{{company}} hiring team",
                ["firstName", "jobTitle", "company", "interviewTitle", "portalLink"]
            ),
            ["stale-reminder"] = new(
                "Still reviewing",
                "Update on your {{jobTitle}} application",
                "Hi {{firstName}},\n\nYour application for {{jobTitle}} is still being reviewed. We'll share the next update as soon as there's progress. You can check on it any time: {{portalLink}}\n\n{{company}} hiring team",
                ["firstName", "jobTitle", "company", "portalLink"]
            ),
            ["scorecard-reminder"] = new(
                "Scorecard reminder",
                "Scorecard reminder: {{interviewTitle}}",
                "Please complete your scorecard for the {{jobTitle}} interview ({{interviewTitle}}) while it's fresh.",
                ["jobTitle", "interviewTitle", "company"]
            ),
            ["approval-request"] = new(
                "Approval request",
                "Approval needed: {{subject}}",
                "{{requestedBy}} asked for your approval: {{subject}}.\n\nOpen the ATS and review it under Approvals.",
                ["subject", "requestedBy", "company"]
            ),
        };

    public sealed record Rendered(string Key, int Version, string Subject, string Body);

    // A job-specific override wins over the organization template, which wins over the built-in default.
    public static async Task<Rendered> RenderAsync(
        AtsDbContext db,
        string key,
        Guid? requisitionId,
        IReadOnlyDictionary<string, string> variables,
        CancellationToken ct
    )
    {
        var fallback = Defaults[key];
        var stored = (
            await db
                .EmailTemplates.AsNoTracking()
                .Where(x => x.Key == key && (x.RequisitionId == null || x.RequisitionId == requisitionId))
                .ToListAsync(ct)
        )
            .OrderByDescending(x => x.RequisitionId != null)
            .FirstOrDefault();
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.PublicUrl })
            .SingleOrDefaultAsync(ct);
        var all = new Dictionary<string, string>(variables)
        {
            ["company"] = organization?.Name ?? "The hiring team",
            // Empty when the organization hasn't said where the app lives; Tidy then fixes the dangling colon.
            ["portalLink"] = string.IsNullOrWhiteSpace(organization?.PublicUrl) ? "" : $"{organization.PublicUrl}/candidate-portal",
        };
        return new(
            key,
            stored?.Version ?? 0,
            Tidy(Fill(stored?.Subject ?? fallback.Subject, all), all["portalLink"].Length == 0),
            Tidy(Fill(stored?.Body ?? fallback.Body, all), all["portalLink"].Length == 0)
        );
    }

    public static async Task QueueAsync(
        AtsDbContext db,
        string key,
        Guid? requisitionId,
        string recipient,
        IReadOnlyDictionary<string, string> variables,
        Guid? applicationId,
        CancellationToken ct,
        string? bodyOverride = null
    )
    {
        var rendered = await RenderAsync(db, key, requisitionId, variables, ct);
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                ApplicationId = applicationId,
                Recipient = recipient,
                Subject = rendered.Subject,
                Body = string.IsNullOrWhiteSpace(bodyOverride) ? rendered.Body : bodyOverride,
                TemplateKey = key,
                TemplateVersion = rendered.Version,
            }
        );
    }

    // With no link to give, "...pick a time: " becomes "...pick a time." and stray blank lines collapse.
    private static string Tidy(string text, bool linkMissing) =>
        Regex.Replace(linkMissing ? Regex.Replace(text, @"[ ]*:[ ]*$", ".", RegexOptions.Multiline) : text, @"\n{3,}", "\n\n").Trim();

    public static string Fill(string text, IReadOnlyDictionary<string, string> variables) =>
        Placeholder()
            .Replace(
                text,
                match => variables.TryGetValue(match.Groups[1].Value, out var value) ? value : match.Value
            );

    [GeneratedRegex(@"\{\{\s*(\w+)\s*\}\}")]
    private static partial Regex Placeholder();
}
