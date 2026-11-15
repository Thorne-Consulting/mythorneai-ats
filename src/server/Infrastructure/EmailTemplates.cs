using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Who an automatic email goes to.</summary>
public enum TemplateAudience
{
    Candidate,
    Team,
}

/// <summary>
/// The standard wording of one automatic email, and where it is sent from. <c>Notification</c> is
/// the notification kind a team email also creates (its email then follows the person's settings).
/// </summary>
public sealed record EmailTemplateDefault(
    string Label,
    string Subject,
    string Body,
    string[] Variables,
    TemplateAudience Audience = TemplateAudience.Candidate,
    string SentWhen = "",
    string? Notification = null
);

/// <summary>A detail a template can drop in, shown in the editor as a chip with this label.</summary>
public sealed record TemplateDetail(string Key, string Label, string Example);

public static partial class EmailTemplates
{
    /// <summary>Every detail any template can use. One style everywhere: <c>{{camelCase}}</c>.</summary>
    public static readonly TemplateDetail[] Details =
    [
        new("firstName", "First name", "Alex"),
        new("lastName", "Last name", "Rivera"),
        new("candidateName", "Full name", "Alex Rivera"),
        new("jobTitle", "Job title", "Senior Engineer"),
        new("stage", "Stage", "Interview"),
        new("company", "Company", "Acme"),
        new("senderName", "Your name", "Sam Recruiter"),
        new("portalLink", "Candidate portal link", "https://example.com/candidate-portal"),
        new("interviewTitle", "Interview name", "Technical interview"),
        new(
            "interviewTime",
            "Interview time",
            "Friday, November 14, 2026, 10:00 – 10:45 AM Eastern Standard Time"
        ),
        new(
            "interviewDetails",
            "Interview details",
            "When: Friday, November 14 at 10:00 AM\nWith: Sam Recruiter"
        ),
        new("bookingLink", "Booking link", "https://example.com/book/abc"),
        new(
            "roundMessage",
            "Note about the next round",
            "Thanks for your time so far. We'd like to invite you to the next round."
        ),
        new("message", "Message", "Could you send your portfolio?"),
        new("code", "Code", "482913"),
        new("confirmLink", "Confirm link", "https://example.com/candidate-portal/link"),
        new("documentName", "Document", "references"),
        new("note", "Note", "Two references from your last role, please."),
        new("subject", "What needs approval", "the offer for Alex Rivera (Senior Engineer)"),
        new("requestedBy", "Who asked", "Sam Recruiter"),
        new("approvalLink", "Approval link", "https://example.com/approvals"),
        new("approveLink", "One-click approve link", "https://example.com/approve/abc"),
        new("rejectLink", "One-click reject link", "https://example.com/approve/def"),
        new("scorecardLink", "Scorecard link", "https://example.com/interviews"),
        new("inboxLink", "Conversation link", "https://example.com/messages"),
        new("inviterName", "Who invited them", "Sam Recruiter"),
        new("role", "Role", "Recruiter"),
        new("signInLink", "Sign-in link", "https://example.com/login"),
        new("title", "Title", "Karen Dela Cruz replied"),
        new("body", "Details", "Thursday works for me."),
        new("link", "Link", "https://example.com/notifications"),
        new("items", "Summary", "- Karen Dela Cruz replied\n- You were assigned a conversation"),
        new("count", "Count", "3 updates"),
        new("assessmentName", "Assessment name", "Coding exercise"),
        new("dueDate", "Due date", "Friday, November 21, 2026 at 5:00 PM Eastern Standard Time"),
        new("timeNote", "Time limit", "You have 45 minutes once you start."),
    ];

    /// <summary>Details every saved reply can use; they are filled in for the thread's candidate when sent.</summary>
    public static readonly string[] SavedReplyDetails =
    [
        "firstName",
        "lastName",
        "candidateName",
        "jobTitle",
        "stage",
        "company",
        "senderName",
        "portalLink",
    ];

    private const string Signoff = "\n\n{{company}} hiring team";

    public static readonly IReadOnlyDictionary<string, EmailTemplateDefault> Defaults =
        new Dictionary<string, EmailTemplateDefault>
        {
            // ---- To candidates -----------------------------------------------------------------
            ["acceptance"] = new(
                "Offer",
                "Your offer for {{jobTitle}} at {{company}}",
                "Hi {{firstName}},\n\nWe're delighted to offer you the {{jobTitle}} role at {{company}}. Read your offer letter and give us your answer here: {{portalLink}}\n\nIf you have any questions, reply to this email."
                    + Signoff,
                ["firstName", "jobTitle", "company", "portalLink"],
                SentWhen: "When you send an offer from the application's Offer tab. The link opens the offer in their portal."
            ),
            ["offer-reminder"] = new(
                "Offer reminder",
                "Your offer for {{jobTitle}} closes soon",
                "Hi {{firstName}},\n\nA reminder that your offer for the {{jobTitle}} role at {{company}} is open until {{dueDate}}. Read it and give us your answer here: {{portalLink}}\n\nIf you need more time or have a question, reply to this email."
                    + Signoff,
                ["firstName", "jobTitle", "company", "dueDate", "portalLink"],
                SentWhen: "Two days before an offer closes, when the candidate has not answered yet"
            ),
            ["stage-update"] = new(
                "Status update",
                "Update on your {{jobTitle}} application",
                "Hi {{firstName}},\n\nYour application for {{jobTitle}} has moved to: {{stage}}.\n\nFollow your application and message us here: {{portalLink}}"
                    + Signoff,
                ["firstName", "jobTitle", "company", "stage", "portalLink"],
                SentWhen: "When you move someone to a stage that emails on entry"
            ),
            ["rejection"] = new(
                "Rejection",
                "Your {{jobTitle}} application",
                "Hi {{firstName}},\n\nThank you for your interest in the {{jobTitle}} role at {{company}} and for the time you put into the process. We've decided not to move forward with your application.\n\nWe wish you the best in your search.\n{{company}} hiring team",
                ["firstName", "jobTitle", "company"],
                SentWhen: "When you reject an applicant and choose to email them"
            ),
            ["booking-request"] = new(
                "Interview booking request",
                "Book your {{interviewTitle}} interview",
                "Hi {{firstName}},\n\n{{roundMessage}}\n\nPlease choose a time for your {{interviewTitle}} interview for {{jobTitle}}: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "roundMessage",
                    "portalLink",
                ],
                SentWhen: "When you ask a candidate to pick an interview time"
            ),
            ["booking-reminder"] = new(
                "Booking reminder",
                "Reminder: book your {{interviewTitle}} interview",
                "Hi {{firstName}},\n\nWe haven't heard back about a time for your {{interviewTitle}} interview for {{jobTitle}}. Please pick a time when you can: {{portalLink}}"
                    + Signoff,
                ["firstName", "jobTitle", "company", "interviewTitle", "portalLink"],
                SentWhen: "A few days after a booking request, while no time is picked"
            ),
            ["stale-reminder"] = new(
                "Still reviewing",
                "Update on your {{jobTitle}} application",
                "Hi {{firstName}},\n\nYour application for {{jobTitle}} is still being reviewed. We'll share the next update as soon as there's progress. You can check on it any time: {{portalLink}}"
                    + Signoff,
                ["firstName", "jobTitle", "company", "portalLink"],
                SentWhen: "When an application has had no activity for a few days"
            ),
            ["message"] = new(
                "Message from the team",
                "Your {{jobTitle}} application at {{company}}",
                "{{message}}\n\n---\n\nReply to this email, or read all your messages here: {{portalLink}}",
                ["firstName", "jobTitle", "company", "message", "senderName", "portalLink"],
                SentWhen: "When someone on your team sends a message in a conversation"
            ),
            ["withdrawal-confirmed"] = new(
                "Withdrawal confirmed",
                "Your {{jobTitle}} application was withdrawn",
                "Hi {{firstName}},\n\nWe've withdrawn your application for {{jobTitle}} as you asked. Thank you for your time, and you're welcome to apply again in the future."
                    + Signoff,
                ["firstName", "jobTitle", "company"],
                SentWhen: "When a candidate withdraws in their portal"
            ),
            ["application-received"] = new(
                "Application received",
                "We received your application for {{jobTitle}}",
                "Hi {{firstName}},\n\nThanks for applying for {{jobTitle}} at {{company}}. Please confirm your email so we can review your application: {{confirmLink}}\n\nOr enter this code: **{{code}}**. The link and the code work for 7 days.\n\nAfter that, you can follow your application, message us and book interviews in your candidate portal."
                    + Signoff,
                ["firstName", "jobTitle", "company", "confirmLink", "code"],
                SentWhen: "When someone applies on your careers site"
            ),
            ["application-already-applied"] = new(
                "Already applied",
                "Your application for {{jobTitle}}",
                "Hi {{firstName}},\n\nSomeone, probably you, tried to apply for {{jobTitle}} with this email. You've already applied, so there's nothing more to do. Open your application here: {{confirmLink}}\n\nOr enter this code: **{{code}}**."
                    + Signoff,
                ["firstName", "jobTitle", "company", "confirmLink", "code"],
                SentWhen: "When someone applies again for a job they already applied to"
            ),
            ["application-confirm-reminder"] = new(
                "Confirm your email reminder",
                "Please confirm your application for {{jobTitle}}",
                "Hi {{firstName}},\n\nWe can't review your application for {{jobTitle}} until you confirm your email: {{confirmLink}}\n\nOr enter this code: **{{code}}**. If you didn't apply, you can ignore this email."
                    + Signoff,
                ["firstName", "jobTitle", "company", "confirmLink", "code"],
                SentWhen: "One day after applying, while the email is not confirmed"
            ),
            ["portal-code"] = new(
                "Portal sign-in code",
                "Your candidate portal sign-in code",
                "Your sign-in code is **{{code}}**. It works for 15 minutes.\n\nOr sign in with one click: {{signInLink}}\n\nIf you didn't ask for this, you can ignore this email.",
                ["code", "signInLink", "company"],
                SentWhen: "When a candidate asks for a code to sign in to their portal"
            ),
            ["document-request"] = new(
                "Document request",
                "Please add your {{documentName}}",
                "Hi {{firstName}},\n\nThe hiring team for {{jobTitle}} at {{company}} asked you to add your {{documentName}}.\n\n{{note}}\n\nAdd it here: {{portalLink}}"
                    + Signoff,
                ["firstName", "jobTitle", "company", "documentName", "note", "portalLink"],
                SentWhen: "When someone asks a candidate for a document"
            ),
            ["interview-booked"] = new(
                "Interview booked",
                "Your interview for {{jobTitle}} is booked",
                "Hi {{firstName}},\n\nYour {{interviewTitle}} is booked.\n\n{{interviewDetails}}\n\n{{message}}\n\nSee your interviews here: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "interviewTime",
                    "interviewDetails",
                    "message",
                    "portalLink",
                ],
                SentWhen: "When an interview is scheduled or the candidate books a time"
            ),
            ["interview-rescheduled"] = new(
                "Interview moved",
                "New time for your {{interviewTitle}}",
                "Hi {{firstName}},\n\nYour {{interviewTitle}} for {{jobTitle}} has a new time.\n\n{{interviewDetails}}\n\n{{message}}\n\nSee your interviews here: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "interviewTime",
                    "interviewDetails",
                    "message",
                    "portalLink",
                ],
                SentWhen: "When an interview moves to a new time"
            ),
            ["interview-cancelled"] = new(
                "Interview cancelled",
                "Your {{interviewTitle}} is cancelled",
                "Hi {{firstName}},\n\nYour {{interviewTitle}} for {{jobTitle}} on {{interviewTime}} is cancelled. We will be in touch about what happens next.\n\n{{message}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "interviewTime",
                    "message",
                    "portalLink",
                ],
                SentWhen: "When an interview is cancelled"
            ),
            ["interview-no-show"] = new(
                "Missed interview",
                "We missed you at your {{interviewTitle}}",
                "Hi {{firstName}},\n\nWe missed you at your {{interviewTitle}} for {{jobTitle}} on {{interviewTime}}. If something came up, reply to this email or message us here: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "interviewTime",
                    "portalLink",
                ],
                SentWhen: "When you mark that the candidate did not join an interview"
            ),
            ["interview-choose-time"] = new(
                "Choose an interview time",
                "Choose a time for your {{interviewTitle}}",
                "Hi {{firstName}},\n\nPlease pick a time for your {{interviewTitle}} for {{jobTitle}}: {{bookingLink}}\n\n{{interviewDetails}}\n\n{{message}}\n\nTimes show in your time zone."
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "interviewTitle",
                    "interviewDetails",
                    "bookingLink",
                    "message",
                ],
                SentWhen: "When you send a candidate a link to book their own interview time, and its reminders"
            ),
            ["assessment-invite"] = new(
                "Assessment invitation",
                "{{assessmentName}} for your {{jobTitle}} application",
                "Hi {{firstName}},\n\nThe {{company}} hiring team would like you to complete {{assessmentName}} for the {{jobTitle}} role. {{timeNote}}\n\n{{note}}\n\nPlease finish it by {{dueDate}}. Start when you are ready: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "assessmentName",
                    "dueDate",
                    "timeNote",
                    "note",
                    "portalLink",
                ],
                SentWhen: "When you send a candidate an assessment"
            ),
            ["assessment-reminder"] = new(
                "Assessment reminder",
                "Reminder: {{assessmentName}} for {{jobTitle}}",
                "Hi {{firstName}},\n\nA reminder to complete {{assessmentName}} for the {{jobTitle}} role. Your link closes {{dueDate}}.\n\nPick up where you left off: {{portalLink}}"
                    + Signoff,
                [
                    "firstName",
                    "jobTitle",
                    "company",
                    "assessmentName",
                    "dueDate",
                    "timeNote",
                    "note",
                    "portalLink",
                ],
                SentWhen: "Once, a few days after the invitation, while the assessment is not finished"
            ),

            // ---- To your team ------------------------------------------------------------------
            ["scorecard-reminder"] = new(
                "Scorecard reminder",
                "Scorecard reminder: {{candidateName}}",
                "Please write your scorecard for {{candidateName}} ({{interviewTitle}}, {{jobTitle}}) while it's fresh: {{scorecardLink}}",
                ["jobTitle", "interviewTitle", "candidateName", "scorecardLink", "company"],
                TemplateAudience.Team,
                "After an interview, while the interviewer's scorecard is missing",
                "scorecard-due"
            ),
            ["approval-request"] = new(
                "Approval request",
                "Approval needed: {{subject}}",
                "{{requestedBy}} asked for your approval: {{subject}}.\n\nApprove it: {{approveLink}}\n\nReject it: {{rejectLink}}\n\nOr see the details first: {{approvalLink}}",
                ["subject", "requestedBy", "approvalLink", "approveLink", "rejectLink", "company"],
                TemplateAudience.Team,
                "When a job or an offer needs someone's sign-off",
                "approval-requested"
            ),
            ["message-alert"] = new(
                "New candidate message",
                "Messages with {{candidateName}} about {{jobTitle}}",
                "{{candidateName}} wrote:\n\n{{message}}\n\n---\n\nReply to this email to answer {{firstName}}, or open the conversation: {{inboxLink}}",
                ["candidateName", "firstName", "jobTitle", "message", "inboxLink", "company"],
                TemplateAudience.Team,
                "When a candidate writes, to the person assigned to the conversation (or the job's recruiter)"
            ),
            ["interview-team-update"] = new(
                "Interview update for interviewers",
                "{{title}}: {{candidateName}} for {{jobTitle}}",
                "{{interviewDetails}}\n\nOpen the interview: {{link}}",
                ["title", "candidateName", "jobTitle", "interviewDetails", "link", "company"],
                TemplateAudience.Team,
                "When an interview is scheduled, moved or cancelled, to each interviewer"
            ),
            ["member-invited"] = new(
                "Team invitation",
                "{{inviterName}} invited you to {{company}}",
                "Hi,\n\n{{inviterName}} invited you to join {{company}} on MyThorneAI. Your role: {{role}}.\n\n{{note}}\n\nSign in here: {{signInLink}}",
                ["inviterName", "company", "role", "note", "signInLink"],
                TemplateAudience.Team,
                "When an admin invites someone to your workspace"
            ),
            ["notification"] = new(
                "Notification",
                "{{title}}",
                "{{body}}\n\nOpen it here: {{link}}",
                ["title", "body", "link", "company"],
                TemplateAudience.Team,
                "For each notification a person chose to get by email"
            ),
            ["digest"] = new(
                "Daily summary",
                "Your daily summary: {{count}}",
                "Here is what happened since your last summary:\n\n{{items}}\n\nSee everything here: {{link}}",
                ["count", "items", "link", "company"],
                TemplateAudience.Team,
                "Once a day, for the notifications a person chose to get in a summary"
            ),
        };

    /// <summary>Plain-text subject and Markdown body, both filled in.</summary>
    public sealed record Rendered(string Key, int Version, string Subject, string Body);

    /// <summary>The wording in use for a key: a job override, then the organization's, then the standard.</summary>
    public static async Task<(string Subject, string Body, int Version)> WordingAsync(
        AtsDbContext db,
        string key,
        Guid? requisitionId,
        CancellationToken ct
    )
    {
        var fallback = Defaults[key];
        var stored = (
            await db
                .EmailTemplates.AsNoTracking()
                .Where(x =>
                    x.Kind == TemplateKind.Automatic
                    && x.Key == key
                    && (x.RequisitionId == null || x.RequisitionId == requisitionId)
                )
                .ToListAsync(ct)
        )
            .OrderByDescending(x => x.RequisitionId != null)
            .FirstOrDefault();
        return (
            stored?.Subject ?? fallback.Subject,
            stored?.Body ?? fallback.Body,
            stored?.Version ?? 0
        );
    }

    /// <summary>
    /// Render an automatic email: the right wording, details filled in, and <c>company</c> and
    /// <c>portalLink</c> added. The body is Markdown; <see cref="EmailHtml"/> turns it into the email.
    /// Other areas call this (or <see cref="QueueAsync"/>) instead of writing email text in code.
    /// </summary>
    public static async Task<Rendered> RenderAsync(
        AtsDbContext db,
        string key,
        Guid? requisitionId,
        IReadOnlyDictionary<string, string> variables,
        CancellationToken ct
    )
    {
        var (subject, body, version) = await WordingAsync(db, key, requisitionId, ct);
        var all = await WithOrganizationAsync(db, variables, ct);
        var (filledSubject, filledBody) = Render(subject, body, all);
        return new(key, version, filledSubject, filledBody);
    }

    /// <summary>Adds <c>company</c> and a default <c>portalLink</c> to the details given.</summary>
    public static async Task<Dictionary<string, string>> WithOrganizationAsync(
        AtsDbContext db,
        IReadOnlyDictionary<string, string> variables,
        CancellationToken ct
    )
    {
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.PublicUrl })
            .SingleOrDefaultAsync(ct);
        return new Dictionary<string, string>(variables)
        {
            ["company"] = organization?.Name ?? "The hiring team",
            // Empty when the organization hasn't said where the app lives; Tidy then fixes the dangling colon.
            ["portalLink"] =
                variables.TryGetValue("portalLink", out var given) ? given
                : string.IsNullOrWhiteSpace(organization?.PublicUrl) ? ""
                : $"{organization.PublicUrl.TrimEnd('/')}/candidate-portal",
        };
    }

    /// <summary>Fill a subject and a Markdown body. Mentions become plain names. Pure, so tests run it directly.</summary>
    public static (string Subject, string Body) Render(
        string subject,
        string body,
        IReadOnlyDictionary<string, string> values
    )
    {
        var linkMissing = !values.TryGetValue("portalLink", out var link) || link.Length == 0;
        var filledSubject = Tidy(PlainNames(Fill(Camel(subject), values)), linkMissing)
            .Replace('\n', ' ');
        return (filledSubject, Tidy(PlainNames(Fill(Camel(body), values)), linkMissing));
    }

    /// <summary>
    /// Queue an automatic email, now or at <paramref name="sendAt"/>. A team email that maps to a
    /// notification kind also creates that notification, and its email follows the recipient's
    /// notification settings. Returns the queued email's id, or null when no email was queued.
    /// </summary>
    public static async Task<Guid?> QueueAsync(
        AtsDbContext db,
        string key,
        Guid? requisitionId,
        string recipient,
        IReadOnlyDictionary<string, string> variables,
        Guid? applicationId,
        CancellationToken ct,
        string? bodyOverride = null,
        DateTimeOffset? sendAt = null
    )
    {
        // A one-click, signed-in link to the application when this goes to its candidate.
        variables = await Api.CandidateLinks.WithPortalLinkAsync(
            db,
            key,
            recipient,
            applicationId,
            variables,
            ct
        );
        var rendered = await RenderAsync(db, key, requisitionId, variables, ct);
        if (Defaults[key].Notification is { } kind)
        {
            var wantsEmail = await Notify.AddAsync(
                db,
                [recipient],
                new NotificationDraft(
                    kind,
                    rendered.Subject,
                    Notify.AppPath(FirstLink(variables)) ?? "/notifications"
                ),
                ct,
                queueEmail: false
            );
            if (wantsEmail.Length == 0)
                return null;
        }
        var item = new EmailOutboxItem
        {
            ApplicationId = applicationId,
            Recipient = recipient,
            Subject = rendered.Subject,
            Body = string.IsNullOrWhiteSpace(bodyOverride) ? rendered.Body : bodyOverride,
            TemplateKey = key,
            TemplateVersion = rendered.Version,
        };
        if (sendAt is { } at)
            item.NextAttemptAt = at;
        db.EmailOutbox.Add(item);
        return item.Id;
    }

    private static string? FirstLink(IReadOnlyDictionary<string, string> variables) =>
        new[] { "approvalLink", "scorecardLink", "link", "inboxLink" }
            .Select(name => variables.GetValueOrDefault(name))
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    /// <summary>"firstName" becomes "First name"; an unknown key reads as written.</summary>
    public static string DetailLabel(string key) =>
        Details.FirstOrDefault(x => x.Key == key)?.Label ?? key;

    /// <summary>Details used in a text that have no value (or are unknown). Keys in order of first use.</summary>
    public static string[] Missing(string text, IReadOnlyDictionary<string, string> values) =>
        Placeholder()
            .Matches(Camel(text))
            .Select(m => m.Groups[1].Value)
            .Where(key => !values.TryGetValue(key, out var value) || value.Length == 0)
            .Distinct()
            .ToArray();

    /// <summary>Details used in a text that no template may use.</summary>
    public static string[] Unknown(string text, IEnumerable<string> allowed) =>
        Placeholder()
            .Matches(Camel(text))
            .Select(m => m.Groups[1].Value)
            .Where(key => key != "company" && !allowed.Contains(key))
            .Distinct()
            .ToArray();

    // With no link to give, "...pick a time: " becomes "...pick a time." and stray blank lines collapse.
    public static string Tidy(string text, bool linkMissing) =>
        Regex
            .Replace(
                linkMissing
                    ? Regex.Replace(text, @"[ ]*:[ ]*$", ".", RegexOptions.Multiline)
                    : text,
                @"\n{3,}",
                "\n\n"
            )
            .Trim();

    public static string Fill(string text, IReadOnlyDictionary<string, string> variables) =>
        Placeholder()
            .Replace(
                text,
                match =>
                    variables.TryGetValue(match.Groups[1].Value, out var value)
                        ? value
                        : match.Value
            );

    /// <summary>The old saved-reply style <c>{{first_name}}</c> reads as <c>{{firstName}}</c>.</summary>
    public static string Camel(string text) =>
        SnakePlaceholder()
            .Replace(
                text,
                match =>
                {
                    var parts = match.Groups[1].Value.Split('_');
                    return "{{"
                        + parts[0]
                        + string.Concat(
                            parts.Skip(1).Select(p => char.ToUpperInvariant(p[0]) + p[1..])
                        )
                        + "}}";
                }
            );

    /// <summary><c>[Avery](mention:avery@acme.com)</c> becomes "Avery".</summary>
    public static string PlainNames(string markdown) => MentionLink().Replace(markdown, "$1");

    [GeneratedRegex(@"\{\{\s*(\w+)\s*\}\}")]
    private static partial Regex Placeholder();

    [GeneratedRegex(@"\{\{\s*([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*\}\}")]
    private static partial Regex SnakePlaceholder();

    [GeneratedRegex(@"\[([^\]\n]{1,160})\]\(mention:[^)\s]+\)")]
    private static partial Regex MentionLink();
}
