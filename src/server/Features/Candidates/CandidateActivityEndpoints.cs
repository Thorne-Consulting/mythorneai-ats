using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// One thing that happened to a person. <see cref="Type"/> is one of <see cref="CandidateActivity.Types"/>;
/// <see cref="Data"/> carries what that type needs (a note's text and flags, an email's delivery).
/// </summary>
public sealed record ActivityItem(
    string Id,
    string Type,
    DateTimeOffset At,
    string? ActorEmail,
    Guid? ApplicationId,
    string? Job,
    string Title,
    string? Body,
    object? Data = null
)
{
    public string? ActorName { get; init; }
}

public static class CandidateActivity
{
    public static readonly string[] Types =
    [
        "note",
        "application",
        "stage",
        "message",
        "email",
        "interview",
        "feedback",
        "offer",
        "file",
        "dismissal",
        "profile",
    ];

    private static readonly Dictionary<string, string> Recommendations = new()
    {
        [nameof(Recommendation.StrongNo)] = "Strong no",
        [nameof(Recommendation.No)] = "No",
        [nameof(Recommendation.Mixed)] = "Mixed",
        [nameof(Recommendation.Yes)] = "Yes",
        [nameof(Recommendation.StrongYes)] = "Strong yes",
    };

    public static string RecommendationText(Recommendation value) =>
        Recommendations[value.ToString()];

    /// <summary>A value from an audit row's JSON details, whatever the property casing.</summary>
    public static string? Detail(string? json, string name)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return null;
            foreach (var property in document.RootElement.EnumerateObject())
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                    return property.Value.ValueKind == JsonValueKind.String
                        ? property.Value.GetString()
                        : property.Value.ToString();
        }
        catch (JsonException) { }
        return null;
    }
}

public static partial class AtsEndpoints
{
    private static void MapCandidateActivity(RouteGroupBuilder api)
    {
        // Everything that happened to this person across the applications you can see, newest first,
        // a page at a time (`before` is the previous page's `next`). Pinned notes come with the first page.
        api.MapGet(
            "/candidates/{id:guid}/activity",
            async (
                Guid id,
                string? types,
                string? before,
                int? limit,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await CanSeeCandidateAsync(db, principal, id, ct))
                    return Results.NotFound();
                var me = principal.Email();
                var details = CanSeeContact(principal);
                var wanted = (types ?? "")
                    .Split(
                        ',',
                        StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries
                    )
                    .Where(CandidateActivity.Types.Contains)
                    .ToHashSet();
                bool Want(string type) => wanted.Count == 0 || wanted.Contains(type);
                var cursor = DateTimeOffset.TryParse(
                    before,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal,
                    out var parsed
                )
                    ? parsed
                    : DateTimeOffset.MaxValue;
                var take = Math.Clamp(limit ?? 30, 5, 100);

                var candidate = await db
                    .Candidates.AsNoTracking()
                    .Where(x => x.Id == id)
                    .Select(x => new { x.FirstName, x.Email })
                    .SingleAsync(ct);
                var apps = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(a => a.CandidateId == id)
                    .Select(a => new
                    {
                        a.Id,
                        a.RequisitionId,
                        Job = a.Requisition!.Title,
                        a.AppliedAt,
                        a.Source,
                        a.Status,
                    })
                    .ToListAsync(ct);
                var appIds = apps.Select(a => a.Id).ToList();
                var jobOf = apps.ToDictionary(a => a.Id, a => a.Job);
                var items = new List<ActivityItem>();

                // ---- Notes (and pinned notes for the top of the feed) ----
                var notes = db
                    .Notes.AsNoTracking()
                    .Where(n =>
                        (
                            n.CandidateId == id
                            || (n.CandidateId == null && n.Application!.CandidateId == id)
                        )
                        && (n.ApplicationId == null || appIds.Contains(n.ApplicationId.Value))
                        && (details || !n.IsPrivate)
                    );
                ActivityItem NoteItem(ApplicationNote n) =>
                    new(
                        $"note-{n.Id}",
                        "note",
                        n.CreatedAt,
                        n.AuthorEmail,
                        n.ApplicationId,
                        n.ApplicationId is { } appId ? jobOf.GetValueOrDefault(appId) : null,
                        "Note",
                        n.Body,
                        new
                        {
                            NoteId = n.Id,
                            n.IsPrivate,
                            n.EditedAt,
                            n.PinnedAt,
                            Mine = n.AuthorEmail == me,
                        }
                    );
                if (Want("note"))
                    items.AddRange(
                        (
                            await notes
                                .Where(n => n.CreatedAt < cursor)
                                .OrderByDescending(n => n.CreatedAt)
                                .Take(take + 1)
                                .ToListAsync(ct)
                        ).Select(NoteItem)
                    );
                var pinned =
                    cursor == DateTimeOffset.MaxValue
                        ? (
                            await notes
                                .Where(n => n.PinnedAt != null)
                                .OrderByDescending(n => n.PinnedAt)
                                .Take(10)
                                .ToListAsync(ct)
                        )
                            .Select(NoteItem)
                            .ToList()
                        : [];

                // ---- Applications and stage moves ----
                if (Want("application"))
                {
                    var addedBy = await db
                        .StageTransitions.AsNoTracking()
                        .Where(t =>
                            appIds.Contains(t.ApplicationId)
                            && t.FromStageId == null
                            && t.FromStatus == null
                        )
                        .Select(t => new { t.ApplicationId, t.ActorEmail })
                        .ToListAsync(ct);
                    items.AddRange(
                        apps.Where(a => a.AppliedAt < cursor)
                            .Select(a =>
                            {
                                var actor = addedBy
                                    .FirstOrDefault(t => t.ApplicationId == a.Id)
                                    ?.ActorEmail;
                                var byTeam = actor is not null && actor != candidate.Email;
                                return new ActivityItem(
                                    $"application-{a.Id}",
                                    "application",
                                    a.AppliedAt,
                                    byTeam ? actor : null,
                                    a.Id,
                                    a.Job,
                                    byTeam ? $"Added to {a.Job}" : $"Applied to {a.Job}",
                                    string.IsNullOrWhiteSpace(a.Source)
                                        ? null
                                        : $"Source: {a.Source}"
                                );
                            })
                    );
                }
                if (Want("stage"))
                {
                    var moves = await db
                        .StageTransitions.AsNoTracking()
                        .Where(t =>
                            appIds.Contains(t.ApplicationId)
                            && (t.FromStageId != null || t.FromStatus != null)
                            && t.OccurredAt < cursor
                        )
                        .OrderByDescending(t => t.OccurredAt)
                        .Take(take + 1)
                        .ToListAsync(ct);
                    var stageIds = moves
                        .SelectMany(t => new[] { t.ToStageId, t.FromStageId ?? Guid.Empty })
                        .Distinct()
                        .ToList();
                    var stageNames = await db
                        .PipelineStages.AsNoTracking()
                        .Where(s => stageIds.Contains(s.Id))
                        .ToDictionaryAsync(s => s.Id, s => s.Name, ct);
                    string StageName(Guid? stageId) =>
                        stageId is { } value
                            ? stageNames.GetValueOrDefault(value, "a stage")
                            : "a stage";
                    foreach (var t in moves)
                    {
                        var job = jobOf.GetValueOrDefault(t.ApplicationId) ?? "a job";
                        var statusChanged = t.FromStatus is not null && t.FromStatus != t.ToStatus;
                        var title = statusChanged
                            ? t.ToStatus switch
                            {
                                ApplicationStatus.Rejected =>
                                    $"Rejected from {job} at {StageName(t.ToStageId)}",
                                ApplicationStatus.Withdrawn =>
                                    $"Withdrew from {job} at {StageName(t.ToStageId)}",
                                ApplicationStatus.Hired => $"Hired for {job}",
                                ApplicationStatus.Active =>
                                    $"Back in {job} at {StageName(t.ToStageId)}",
                                _ => $"{t.ToStatus} in {job}",
                            }
                            : $"Moved to {StageName(t.ToStageId)}";
                        items.Add(
                            new ActivityItem(
                                $"stage-{t.Id}",
                                "stage",
                                t.OccurredAt,
                                t.ActorEmail,
                                t.ApplicationId,
                                job,
                                title,
                                statusChanged || t.FromStageId is null
                                    ? null
                                    : $"From {StageName(t.FromStageId)}",
                                new { Status = statusChanged ? t.ToStatus.ToString() : null }
                            )
                        );
                    }
                }

                // ---- Messages and emails (recruiters and hiring managers) ----
                if (details && Want("message"))
                    items.AddRange(
                        (
                            await db
                                .ApplicationMessages.AsNoTracking()
                                .Where(m =>
                                    appIds.Contains(m.ApplicationId) && m.CreatedAt < cursor
                                )
                                .OrderByDescending(m => m.CreatedAt)
                                .Take(take + 1)
                                .Select(m => new
                                {
                                    m.Id,
                                    m.ApplicationId,
                                    m.FromCandidate,
                                    m.AuthorEmail,
                                    m.CreatedAt,
                                    m.Channel,
                                    Body = m.Body.Substring(0, Math.Min(m.Body.Length, 280)),
                                })
                                .ToListAsync(ct)
                        ).Select(m => new ActivityItem(
                            $"message-{m.Id}",
                            "message",
                            m.CreatedAt,
                            m.FromCandidate ? null : m.AuthorEmail,
                            m.ApplicationId,
                            jobOf.GetValueOrDefault(m.ApplicationId),
                            m.FromCandidate
                                ? $"{candidate.FirstName} wrote"
                                    + (m.Channel == MessageChannel.Email ? " by email" : "")
                                : "Message sent",
                            m.Body
                        ))
                    );
                if (details && Want("email"))
                    items.AddRange(
                        (
                            await db
                                .EmailOutbox.AsNoTracking()
                                .Where(e =>
                                    e.ApplicationId != null
                                    && appIds.Contains(e.ApplicationId.Value)
                                    && e.Recipient == candidate.Email
                                    && e.ThreadReference == null
                                    // The email copy of a thread message shows as the message.
                                    && !db.ApplicationMessages.Any(m => m.EmailOutboxItemId == e.Id)
                                    && e.CreatedAt < cursor
                                )
                                .OrderByDescending(e => e.CreatedAt)
                                .Take(take + 1)
                                .Select(e => new
                                {
                                    e.Id,
                                    e.ApplicationId,
                                    e.Subject,
                                    e.TemplateKey,
                                    e.CreatedAt,
                                    Status = e.Status.ToString(),
                                    e.DeliveryStatus,
                                })
                                .ToListAsync(ct)
                        ).Select(e => new ActivityItem(
                            $"email-{e.Id}",
                            "email",
                            e.CreatedAt,
                            null,
                            e.ApplicationId,
                            jobOf.GetValueOrDefault(e.ApplicationId!.Value),
                            $"Emailed: {e.Subject}",
                            null,
                            new
                            {
                                e.Status,
                                e.DeliveryStatus,
                                e.TemplateKey,
                            }
                        ))
                    );

                // ---- Interviews and feedback ----
                if (Want("interview"))
                {
                    var interviews = await db
                        .Interviews.AsNoTracking()
                        .Where(i =>
                            appIds.Contains(i.ApplicationId)
                            && (
                                i.CreatedAt < cursor
                                || (i.CancelledAt != null && i.CancelledAt < cursor)
                            )
                        )
                        .OrderByDescending(i => i.CreatedAt)
                        .Take(take + 1)
                        .Select(i => new
                        {
                            i.Id,
                            i.ApplicationId,
                            i.Title,
                            i.StartsAt,
                            i.CreatedAt,
                            i.CancelledAt,
                            i.CancelledBy,
                            i.CancelReason,
                            i.Status,
                        })
                        .ToListAsync(ct);
                    foreach (var i in interviews)
                    {
                        if (i.CreatedAt < cursor)
                            items.Add(
                                new ActivityItem(
                                    $"interview-{i.Id}",
                                    "interview",
                                    i.CreatedAt,
                                    null,
                                    i.ApplicationId,
                                    jobOf.GetValueOrDefault(i.ApplicationId),
                                    i.Status == InterviewStatus.Proposed
                                        ? $"Interview proposed: {i.Title}"
                                        : $"Interview scheduled: {i.Title}",
                                    null,
                                    new { InterviewId = i.Id, i.StartsAt }
                                )
                            );
                        if (i.CancelledAt is { } cancelledAt && cancelledAt < cursor)
                            items.Add(
                                new ActivityItem(
                                    $"interview-cancel-{i.Id}",
                                    "interview",
                                    cancelledAt,
                                    i.CancelledBy,
                                    i.ApplicationId,
                                    jobOf.GetValueOrDefault(i.ApplicationId),
                                    $"Interview cancelled: {i.Title}",
                                    i.CancelReason,
                                    new { InterviewId = i.Id, i.StartsAt }
                                )
                            );
                    }
                }
                if (Want("feedback"))
                {
                    // Blind review: while you owe a scorecard on one of their applications, others' calls stay hidden.
                    var blinded = await db
                        .Interviews.AsNoTracking()
                        .Where(i =>
                            appIds.Contains(i.ApplicationId)
                            && i.Status != InterviewStatus.Cancelled
                            && i.Status != InterviewStatus.NoShow
                            && i.InterviewerEmails.Contains(me)
                            && !i.Scorecards.Any(s => s.InterviewerEmail == me)
                        )
                        .Select(i => i.ApplicationId)
                        .Distinct()
                        .ToListAsync(ct);
                    items.AddRange(
                        (
                            await db
                                .Scorecards.AsNoTracking()
                                .Where(s =>
                                    appIds.Contains(s.Interview!.ApplicationId)
                                    && s.SubmittedAt < cursor
                                )
                                .OrderByDescending(s => s.SubmittedAt)
                                .Take(take + 1)
                                .Select(s => new
                                {
                                    s.Id,
                                    s.Interview!.ApplicationId,
                                    InterviewTitle = s.Interview.Title,
                                    s.InterviewerEmail,
                                    s.Recommendation,
                                    s.SubmittedAt,
                                })
                                .ToListAsync(ct)
                        ).Select(s =>
                        {
                            var hidden =
                                blinded.Contains(s.ApplicationId) && s.InterviewerEmail != me;
                            return new ActivityItem(
                                $"feedback-{s.Id}",
                                "feedback",
                                s.SubmittedAt,
                                s.InterviewerEmail,
                                s.ApplicationId,
                                jobOf.GetValueOrDefault(s.ApplicationId),
                                $"Feedback on {s.InterviewTitle}",
                                hidden ? "Submit your own feedback to see theirs." : null,
                                new
                                {
                                    Recommendation = hidden
                                        ? null
                                        : CandidateActivity.RecommendationText(s.Recommendation),
                                    Hidden = hidden,
                                }
                            );
                        })
                    );
                }

                // ---- Offers ----
                if (details && Want("offer"))
                {
                    var offers = await db
                        .Offers.AsNoTracking()
                        .Where(o => appIds.Contains(o.ApplicationId) && o.CreatedAt < cursor)
                        .OrderByDescending(o => o.CreatedAt)
                        .Take(take + 1)
                        .Select(o => new
                        {
                            o.Id,
                            o.ApplicationId,
                            o.CreatedBy,
                            o.CreatedAt,
                            o.SentAt,
                            o.RespondedAt,
                            o.RespondedBy,
                            o.Status,
                            o.DeclineReason,
                        })
                        .ToListAsync(ct);
                    foreach (var o in offers)
                    {
                        var job = jobOf.GetValueOrDefault(o.ApplicationId);
                        items.Add(
                            new(
                                $"offer-{o.Id}",
                                "offer",
                                o.CreatedAt,
                                o.CreatedBy,
                                o.ApplicationId,
                                job,
                                "Offer started",
                                null
                            )
                        );
                        if (o.SentAt is { } sent && sent < cursor)
                            items.Add(
                                new(
                                    $"offer-sent-{o.Id}",
                                    "offer",
                                    sent,
                                    null,
                                    o.ApplicationId,
                                    job,
                                    "Offer sent",
                                    null
                                )
                            );
                        if (
                            o.RespondedAt is { } answered
                            && answered < cursor
                            && o.Status is OfferStatus.Accepted or OfferStatus.Declined
                        )
                            items.Add(
                                new(
                                    $"offer-answer-{o.Id}",
                                    "offer",
                                    answered,
                                    o.RespondedBy,
                                    o.ApplicationId,
                                    job,
                                    o.Status == OfferStatus.Accepted
                                        ? "Offer accepted"
                                        : "Offer declined",
                                    o.DeclineReason
                                )
                            );
                    }
                }

                // ---- Files ----
                if (Want("file"))
                {
                    var files = await db
                        .Attachments.AsNoTracking()
                        .Where(a =>
                            a.CandidateId == id
                            && (
                                a.UploadedAt < cursor || (a.ParsedAt != null && a.ParsedAt < cursor)
                            )
                        )
                        .OrderByDescending(a => a.UploadedAt)
                        .Take(take + 1)
                        .Select(a => new
                        {
                            a.Id,
                            a.OriginalFileName,
                            a.Kind,
                            a.UploadedBy,
                            a.UploadedAt,
                            a.ParsedAt,
                            a.ParseStatus,
                        })
                        .ToListAsync(ct);
                    foreach (var a in files)
                    {
                        if (a.UploadedAt < cursor)
                            items.Add(
                                new(
                                    $"file-{a.Id}",
                                    "file",
                                    a.UploadedAt,
                                    a.UploadedBy.Contains('@') && a.UploadedBy != candidate.Email
                                        ? a.UploadedBy
                                        : null,
                                    null,
                                    null,
                                    $"Added {a.OriginalFileName}",
                                    null,
                                    new { AttachmentId = a.Id, a.Kind }
                                )
                            );
                        if (a.ParsedAt is { } read && read < cursor && a.ParseStatus == "Parsed")
                            items.Add(
                                new(
                                    $"file-read-{a.Id}",
                                    "file",
                                    read,
                                    null,
                                    null,
                                    null,
                                    $"Read the resume {a.OriginalFileName}",
                                    null,
                                    new { AttachmentId = a.Id, a.Kind }
                                )
                            );
                    }
                }

                // ---- Dismissals, profile changes and file deletions (from activity history) ----
                if (details && Want("dismissal"))
                    items.AddRange(
                        (
                            await db
                                .CandidateDismissals.AsNoTracking()
                                .Where(d => d.CandidateId == id && d.CreatedAt < cursor)
                                .OrderByDescending(d => d.CreatedAt)
                                .Take(take + 1)
                                .Join(
                                    db.Requisitions,
                                    d => d.RequisitionId,
                                    r => r.Id,
                                    (d, r) =>
                                        new
                                        {
                                            d.Id,
                                            d.Reason,
                                            d.DismissedBy,
                                            d.CreatedAt,
                                            Job = r.Title,
                                        }
                                )
                                .ToListAsync(ct)
                        ).Select(d => new ActivityItem(
                            $"dismissal-{d.Id}",
                            "dismissal",
                            d.CreatedAt,
                            d.DismissedBy,
                            null,
                            d.Job,
                            $"Not a fit for {d.Job}",
                            d.Reason
                        ))
                    );
                var auditActions = new List<string>();
                if (Want("profile"))
                    auditActions.AddRange([
                        "Created",
                        "Updated",
                        "TagsChanged",
                        "MarkedDoNotContact",
                        "ContactAllowed",
                        "CustomFieldsUpdated",
                        "AddedToPool",
                        "RemovedFromPool",
                    ]);
                if (Want("file"))
                    auditActions.Add("AttachmentDeleted");
                if (Want("note"))
                    auditActions.Add("NoteDeleted");
                if (details && auditActions.Count > 0)
                {
                    var key = id.ToString();
                    var audits = await db
                        .AuditEvents.AsNoTracking()
                        .Where(e =>
                            e.EntityType == "Candidate"
                            && e.EntityId == key
                            && auditActions.Contains(e.Action)
                            && e.OccurredAt < cursor
                        )
                        .OrderByDescending(e => e.OccurredAt)
                        .Take(take + 1)
                        .ToListAsync(ct);
                    foreach (var e in audits)
                    {
                        string? D(string name) => CandidateActivity.Detail(e.Details, name);
                        var (type, title, body) = e.Action switch
                        {
                            "Created" => (
                                "profile",
                                "Added to MyThorneAI",
                                D("Source") is { } source ? $"Source: {source}" : null
                            ),
                            "Updated" => ("profile", "Edited their details", null),
                            "TagsChanged" => (
                                "profile",
                                "Changed tags",
                                D("Tags")?.Trim('[', ']').Replace("\"", "").Replace(",", ", ")
                            ),
                            "MarkedDoNotContact" => (
                                "profile",
                                "Marked do not contact",
                                D("Reason")
                            ),
                            "ContactAllowed" => ("profile", "Allowed contact again", null),
                            "CustomFieldsUpdated" => ("profile", "Changed details", null),
                            "AddedToPool" => ("profile", $"Added to the pool {D("Pool")}", null),
                            "RemovedFromPool" => (
                                "profile",
                                $"Removed from the pool {D("Pool")}",
                                null
                            ),
                            "AttachmentDeleted" => (
                                "file",
                                $"Deleted {D("OriginalFileName") ?? "a file"}",
                                null
                            ),
                            _ => ("note", "Deleted a note", null),
                        };
                        items.Add(
                            new(
                                $"audit-{e.Id}",
                                type,
                                e.OccurredAt,
                                e.ActorEmail,
                                null,
                                null,
                                title,
                                body
                            )
                        );
                    }
                }
                await Features.Workflows.WorkflowActivity.MergeAsync(
                    db,
                    items,
                    appIds,
                    jobOf,
                    cursor,
                    take + 1,
                    Want,
                    details,
                    principal.IsInRole(nameof(UserRole.Admin)),
                    ct
                );

                var page = items
                    .OrderByDescending(x => x.At)
                    .ThenBy(x => x.Id)
                    .Take(take + 1)
                    .ToList();
                var more = page.Count > take;
                if (more)
                    page.RemoveAt(take);
                var emails = page.Concat(pinned)
                    .Select(x => x.ActorEmail)
                    .OfType<string>()
                    .Distinct()
                    .ToList();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(u => emails.Contains(u.Email.ToLower()))
                    .Select(u => new { Email = u.Email.ToLower(), u.DisplayName })
                    .ToDictionaryAsync(u => u.Email, u => u.DisplayName, ct);
                ActivityItem Named(ActivityItem item) =>
                    item with
                    {
                        ActorName = item.ActorEmail is { } email
                            ? names.GetValueOrDefault(email, email.Split('@')[0])
                            : null,
                    };
                return Results.Ok(
                    new
                    {
                        Items = page.Select(Named),
                        Pinned = pinned.Select(Named),
                        Next = more
                            ? page[^1].At.ToString("O", CultureInfo.InvariantCulture)
                            : null,
                    }
                );
            }
        );
    }
}
