using System.Runtime.CompilerServices;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>One kind of event, its words in settings, and what a person gets until they change it.</summary>
public sealed record NotificationKind(
    string Key,
    string Label,
    string Description,
    bool InApp,
    bool Email,
    bool Digest
);

public static class NotificationKinds
{
    public const string CandidateMessage = "candidate-message";
    public const string Mention = "mention";
    public const string Assigned = "assigned";
    public const string ApprovalRequested = "approval-requested";
    public const string ApprovalDecided = "approval-decided";
    public const string ApprovalStuck = "approval-stuck";
    public const string ScorecardDue = "scorecard-due";
    public const string InterviewSoon = "interview-soon";
    public const string OfferResponse = "offer-response";
    public const string ImportFinished = "import-finished";
    public const string Stalled = "stalled";
    public const string SnoozeEnded = "snooze-ended";
    public const string CandidateWithdrew = "candidate-withdrew";
    public const string WorkflowAlert = "workflow-alert";

    // Admins only: someone asks to join, or a webhook stopped working.
    public const string WorkspaceAlert = "workspace-alert";

    public static readonly NotificationKind[] All =
    [
        new(
            CandidateMessage,
            "A candidate writes",
            "On conversations assigned to you, or on your jobs when nobody is assigned.",
            true,
            true,
            false
        ),
        new(
            Mention,
            "Someone mentions you",
            "When a teammate names you with @ in a note.",
            true,
            true,
            false
        ),
        new(
            Assigned,
            "A conversation is assigned to you",
            "When a teammate makes you the owner of a conversation.",
            true,
            true,
            false
        ),
        new(
            ApprovalRequested,
            "Your approval is needed",
            "When a job or an offer waits for your sign-off.",
            true,
            true,
            false
        ),
        new(
            ApprovalDecided,
            "Your request is approved or turned down",
            "When approvers decide on a job or offer you asked about.",
            true,
            true,
            false
        ),
        new(
            ApprovalStuck,
            "An approval is stuck",
            "For whoever asked, and admins: when an approver has not answered after every reminder.",
            true,
            true,
            false
        ),
        new(
            ScorecardDue,
            "A scorecard is due",
            "After an interview, while your scorecard is missing.",
            true,
            true,
            false
        ),
        new(
            InterviewSoon,
            "An interview starts soon",
            "One hour before an interview you are on.",
            true,
            false,
            false
        ),
        new(
            OfferResponse,
            "Offer answers and deadlines",
            "When someone accepts or turns down an offer on your jobs, two days before an offer closes, and when it closes unanswered.",
            true,
            true,
            false
        ),
        new(
            CandidateWithdrew,
            "A candidate withdraws",
            "When someone withdraws from a job you recruit for.",
            true,
            true,
            false
        ),
        new(
            ImportFinished,
            "An import finishes",
            "When candidates you imported are ready.",
            true,
            false,
            false
        ),
        new(
            Stalled,
            "Applications have gone quiet",
            "Once a day, when applications on your jobs have had no activity for a while.",
            true,
            false,
            true
        ),
        new(
            SnoozeEnded,
            "A snoozed conversation is back",
            "When a conversation you snoozed returns to the inbox.",
            true,
            false,
            false
        ),
        new(
            WorkspaceAlert,
            "The workspace needs an admin",
            "For admins: when someone asks to join, or a webhook keeps failing and is paused.",
            true,
            true,
            false
        ),
        new(
            WorkflowAlert,
            "A workflow alerts you",
            "When an automated workflow has an Alert a teammate step that names you.",
            true,
            true,
            false
        ),
    ];

    public static NotificationKind? Find(string key) => All.FirstOrDefault(x => x.Key == key);
}

/// <summary>What happened, for <see cref="Notify.AddAsync"/>. <c>Href</c> is an app path such as <c>/messages?thread=…</c>.</summary>
public sealed record NotificationDraft(
    string Kind,
    string Title,
    string Href,
    string? Body = null,
    string? ActorEmail = null,
    string? GroupKey = null,
    Guid? ApplicationId = null
);

/// <summary>
/// The one way to tell people something happened. Adds a notification per person (not saved;
/// the caller saves), follows each person's settings, queues the email for those who want it
/// right away, and pushes the new count to their open tabs once the change is saved.
/// </summary>
public static class Notify
{
    /// <summary>
    /// Returns the people who want this kind by email. With <paramref name="queueEmail"/> false the
    /// caller sends its own, richer email to them (the candidate-message alert does).
    /// </summary>
    public static async Task<string[]> AddAsync(
        AtsDbContext db,
        IEnumerable<string?> recipients,
        NotificationDraft draft,
        CancellationToken ct,
        bool queueEmail = true
    )
    {
        var kind =
            NotificationKinds.Find(draft.Kind)
            ?? throw new ArgumentException(
                $"Unknown notification kind {draft.Kind}.",
                nameof(draft)
            );
        var actor = draft.ActorEmail?.ToLowerInvariant();
        var people = recipients
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim().ToLowerInvariant())
            .Where(x => x != actor)
            .Distinct()
            .ToArray();
        if (people.Length == 0)
            return [];
        var settings = await db
            .NotificationPreferences.AsNoTracking()
            .Where(x => x.Kind == kind.Key && people.Contains(x.UserEmail))
            .ToDictionaryAsync(x => x.UserEmail, ct);
        var wantsEmail = new List<string>();
        foreach (var email in people)
        {
            var (inApp, byEmail, digest) = settings.TryGetValue(email, out var p)
                ? (p.InApp, p.Email, p.Digest)
                : (kind.InApp, kind.Email, kind.Digest);
            // The row also feeds the daily summary, so keep it when either wants it.
            if (inApp || digest)
                db.Notifications.Add(
                    new Notification
                    {
                        UserEmail = email,
                        Kind = kind.Key,
                        Title = Clip(draft.Title, 300),
                        Body = draft.Body is null ? null : Clip(draft.Body, 1000),
                        Href = draft.Href,
                        ActorEmail = actor,
                        GroupKey = draft.GroupKey,
                    }
                );
            if (byEmail)
                wantsEmail.Add(email);
        }
        if (queueEmail && wantsEmail.Count > 0)
        {
            var site = await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct);
            foreach (var email in wantsEmail)
                await EmailTemplates.QueueAsync(
                    db,
                    "notification",
                    null,
                    email,
                    new Dictionary<string, string>
                    {
                        ["title"] = draft.Title,
                        ["body"] = draft.Body ?? "",
                        ["link"] = AbsoluteLink(site, draft.Href),
                    },
                    draft.ApplicationId,
                    ct
                );
        }
        PushAfterSave(db, people);
        return [.. wantsEmail];
    }

    /// <summary>
    /// The hook for @mentions in notes (called from <c>Mentions.RecordAsync</c> with the people
    /// newly named). Links to the note on the candidate's record.
    /// </summary>
    public static async Task MentionAsync(
        AtsDbContext db,
        IReadOnlyCollection<string> emails,
        ApplicationNote note,
        CancellationToken ct
    )
    {
        if (emails.Count == 0)
            return;
        var author = await db
            .Users.AsNoTracking()
            .Where(x => x.Email == note.AuthorEmail)
            .Select(x => x.DisplayName)
            .SingleOrDefaultAsync(ct);
        var candidate = await db
            .Candidates.AsNoTracking()
            .Where(x => x.Id == note.CandidateId)
            .Select(x => x.FirstName + " " + x.LastName)
            .SingleOrDefaultAsync(ct);
        await AddAsync(
            db,
            emails,
            new NotificationDraft(
                NotificationKinds.Mention,
                $"{author ?? note.AuthorEmail ?? "Someone"} mentioned you in a note about {candidate ?? "a candidate"}",
                $"/candidates/{note.CandidateId}#note-{note.Id}",
                Body: EmailTemplates.PlainNames(note.Body),
                ActorEmail: note.AuthorEmail,
                ApplicationId: note.ApplicationId
            ),
            ct
        );
    }

    /// <summary>"https://ats.acme.com/approvals?x=1" becomes "/approvals?x=1"; app paths stay as they are.</summary>
    public static string? AppPath(string? link) =>
        string.IsNullOrWhiteSpace(link) ? null
        : link.StartsWith('/') ? link
        : Uri.TryCreate(link, UriKind.Absolute, out var uri) ? uri.PathAndQuery
        : null;

    public static string AbsoluteLink(string? site, string href) =>
        string.IsNullOrWhiteSpace(site) ? "" : $"{site.TrimEnd('/')}{href}";

    private static string Clip(string text, int max) =>
        text.Length <= max ? text : text[..(max - 1)] + "…";

    // People to tell "your notifications changed" once this context saves. Pushes carry no data; the
    // bell refetches through the normal endpoint.
    private static readonly ConditionalWeakTable<AtsDbContext, HashSet<string>> Pending = new();

    private static void PushAfterSave(AtsDbContext db, IEnumerable<string> people)
    {
        if (!Pending.TryGetValue(db, out var set))
        {
            set = [];
            Pending.Add(db, set);
            db.SavedChanges += (_, _) =>
            {
                if (set.Count == 0)
                    return;
                var emails = set.Select(InboxHub.UserGroup).ToArray();
                set.Clear();
                var services = db.GetService<IDbContextOptions>()
                    .FindExtension<CoreOptionsExtension>()
                    ?.ApplicationServiceProvider;
                var hub = services?.GetService<IHubContext<InboxHub>>();
                _ = hub?.Clients.Groups(emails).SendAsync("notificationsChanged");
            };
        }
        set.UnionWith(people);
    }
}
