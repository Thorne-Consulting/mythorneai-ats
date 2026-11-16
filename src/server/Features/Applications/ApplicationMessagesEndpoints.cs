using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using NpgsqlTypes;

namespace MyThorneAI.Ats.Api.Api;

public sealed record StaffMessageRequest(
    string? Body,
    Guid[]? AttachmentIds = null,
    DateTimeOffset? ScheduledFor = null
);

/// <summary>Assignee: an email to assign, "" to unassign. SnoozeUntil snoozes; Unsnooze ends it.</summary>
public sealed record ThreadStateRequest(
    bool? Starred,
    bool? Done,
    bool? Unread,
    string? Assignee = null,
    DateTimeOffset? SnoozeUntil = null,
    bool? Unsnooze = null
);

public sealed record InboxBulkRequest(
    Guid[] ApplicationIds,
    string Action,
    string? Assignee = null
);

public sealed record DraftReplyRequest(string? Instructions);

public sealed record AttachUnmatchedRequest(Guid ApplicationId);

/// <summary>One row of the team inbox: an application's message thread.</summary>
public sealed class InboxRow
{
    public Guid ApplicationId { get; init; }
    public Guid CandidateId { get; init; }
    public string CandidateName { get; init; } = "";
    public string CandidateEmail { get; init; } = "";
    public Guid RequisitionId { get; init; }
    public string JobTitle { get; init; } = "";
    public string Stage { get; init; } = "";
    public ApplicationStatus Status { get; init; }
    public DateTimeOffset LastAt { get; init; }
    public string Preview { get; init; } = "";
    public bool LastFromCandidate { get; init; }
    public MessageChannel LastChannel { get; init; }
    public string? LastAuthorEmail { get; init; }
    public bool Unread { get; init; }
    public bool Starred { get; init; }
    public bool Done { get; init; }
    public bool HasFiles { get; init; }
    public string? AssigneeEmail { get; init; }
    public string? AssigneeName { get; init; }
    public DateTimeOffset? SnoozedUntil { get; init; }

    /// <summary>A team message is waiting to go out at a set time.</summary>
    public DateTimeOffset? ScheduledFor { get; init; }

    /// <summary>With a search: the newest matching message, with the matched words in &lt;mark&gt;.</summary>
    public Guid? MatchMessageId { get; set; }
    public string? Snippet { get; set; }
}

public static partial class AtsEndpoints
{
    private const int MaxMessage = EmailInbound.MaxBody;
    private const int MaxFilesPerMessage = 10;

    private static readonly string[] InboxFolders =
    [
        "inbox",
        "assigned",
        "unassigned",
        "unread",
        "starred",
        "awaiting-reply",
        "scheduled",
        "snoozed",
        "done",
    ];

    /// <summary>Every send waits this long before its email goes, so "Undo" can take it back.</summary>
    public static readonly TimeSpan UndoWindow = TimeSpan.FromSeconds(10);

    // The CanManage rule as a query: admins see every thread; recruiters every job that is not
    // confidential plus their own; hiring managers their own jobs. Interviewers have no inbox.
    private static IQueryable<Application> ManageableThreads(
        AtsDbContext db,
        ClaimsPrincipal principal
    )
    {
        var query = db.Applications.AsNoTracking();
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return query;
        // Mirrors CanManage: hiring managers and recruiters on the job's team (RequisitionMember)
        // manage its threads. Change both together.
        var email = principal.Email();
        var teams = principal.Departments();
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return query.Where(x =>
                x.Requisition!.Members.Any(m =>
                    (m.Role == RequisitionRole.HiringManager || m.Role == RequisitionRole.Recruiter)
                    && m.User!.Email == email
                )
                || (
                    !x.Requisition.IsConfidential
                    && (teams.Length == 0 || teams.Contains(x.Requisition.Department))
                )
            );
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x =>
                x.Requisition!.Members.Any(m =>
                    (m.Role == RequisitionRole.HiringManager || m.Role == RequisitionRole.Recruiter)
                    && m.User!.Email == email
                )
            );
        return query.Where(_ => false);
    }

    // Unread for me: I marked it unread, or the candidate wrote after I last read it (or I never
    // have). Each person has their own; "Mark all as read" clears the backlog.
    private static IQueryable<InboxRow> InboxRows(
        AtsDbContext db,
        IQueryable<Application> applications,
        string me
    ) =>
        applications.Select(a => new InboxRow
        {
            ApplicationId = a.Id,
            CandidateId = a.CandidateId,
            CandidateName = a.Candidate!.FirstName + " " + a.Candidate.LastName,
            CandidateEmail = a.Candidate.Email,
            RequisitionId = a.RequisitionId,
            JobTitle = a.Requisition!.Title,
            Stage = a.PipelineStage!.Name,
            Status = a.Status,
            LastAt = a.Messages.Max(m => m.CreatedAt),
            Preview = a
                .Messages.OrderByDescending(m => m.CreatedAt)
                .Select(m => m.Body.Substring(0, 200))
                .First(),
            LastFromCandidate = a
                .Messages.OrderByDescending(m => m.CreatedAt)
                .Select(m => m.FromCandidate)
                .First(),
            LastChannel = a
                .Messages.OrderByDescending(m => m.CreatedAt)
                .Select(m => m.Channel)
                .First(),
            LastAuthorEmail = a
                .Messages.OrderByDescending(m => m.CreatedAt)
                .Select(m => m.AuthorEmail)
                .First(),
            Unread =
                db.MessageThreadStates.Any(s =>
                    s.ApplicationId == a.Id && s.UserEmail == me && s.MarkedUnread
                )
                || a.Messages.Any(m =>
                    m.FromCandidate
                    && !db.MessageThreadStates.Any(s =>
                        s.ApplicationId == a.Id
                        && s.UserEmail == me
                        && s.LastReadAt != null
                        && m.CreatedAt <= s.LastReadAt
                    )
                ),
            Starred = db.MessageThreadStates.Any(s =>
                s.ApplicationId == a.Id && s.UserEmail == me && s.Starred
            ),
            Done = a.ThreadDoneAt != null,
            HasFiles = db.Attachments.Any(f =>
                f.MessageId != null && a.Messages.Any(m => m.Id == f.MessageId)
            ),
            AssigneeEmail = a.AssigneeEmail,
            AssigneeName = db
                .Users.Where(u => u.Email == a.AssigneeEmail)
                .Select(u => u.DisplayName)
                .FirstOrDefault(),
            SnoozedUntil = a.SnoozedUntil,
            ScheduledFor = a
                .Messages.Where(m => m.ScheduledFor > DateTimeOffset.UtcNow.AddSeconds(30))
                .Min(m => m.ScheduledFor),
        });

    // Inbox is what needs someone: open and not snoozed. Snoozed threads return on their own.
    private static IQueryable<InboxRow> InFolder(
        IQueryable<InboxRow> rows,
        string folder,
        string me
    ) =>
        folder switch
        {
            "assigned" => rows.Where(x =>
                !x.Done
                && x.AssigneeEmail == me
                && (x.SnoozedUntil == null || x.SnoozedUntil <= DateTimeOffset.UtcNow)
            ),
            "unassigned" => rows.Where(x =>
                !x.Done
                && x.AssigneeEmail == null
                && (x.SnoozedUntil == null || x.SnoozedUntil <= DateTimeOffset.UtcNow)
            ),
            "unread" => rows.Where(x => x.Unread),
            "starred" => rows.Where(x => x.Starred),
            "awaiting-reply" => rows.Where(x => !x.Done && !x.LastFromCandidate),
            "scheduled" => rows.Where(x => x.ScheduledFor != null),
            "snoozed" => rows.Where(x => x.SnoozedUntil > DateTimeOffset.UtcNow),
            "done" => rows.Where(x => x.Done),
            _ => rows.Where(x =>
                !x.Done && (x.SnoozedUntil == null || x.SnoozedUntil <= DateTimeOffset.UtcNow)
            ),
        };

    /// <summary>Fills in the newest matching message and a highlighted snippet for each row found by its words.</summary>
    private static async Task AddSnippetsAsync(
        AtsDbContext db,
        List<InboxRow> rows,
        string q,
        CancellationToken ct
    )
    {
        var ids = rows.Select(x => x.ApplicationId).ToArray();
        var matches = await db
            .ApplicationMessages.AsNoTracking()
            .Where(m =>
                ids.Contains(m.ApplicationId)
                && EF.Property<NpgsqlTsVector>(
                        m,
                        ApplicationMessageThreadConfiguration.SearchVector
                    )
                    .Matches(EF.Functions.WebSearchToTsQuery("english", q))
            )
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.ApplicationId,
                m.Id,
                Snippet = EF
                    .Functions.WebSearchToTsQuery("english", q)
                    .GetResultHeadline(
                        m.Body,
                        "StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=10, MaxFragments=1"
                    ),
            })
            .Take(500)
            .ToListAsync(ct);
        foreach (var row in rows)
            if (matches.FirstOrDefault(x => x.ApplicationId == row.ApplicationId) is { } match)
            {
                row.MatchMessageId = match.Id;
                row.Snippet = match.Snippet;
            }
    }

    /// <summary>Whether this person could manage the job, so they may own its conversation.</summary>
    private static async Task<bool> CanBeAssignedAsync(
        AtsDbContext db,
        string email,
        Requisition requisition,
        CancellationToken ct
    )
    {
        var user = await db
            .Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Email == email && x.IsActive, ct);
        if (user is null)
            return false;
        var principal = new ClaimsPrincipal(
            new ClaimsIdentity(
                new[]
                {
                    new Claim(ClaimTypes.Email, user.Email),
                    new Claim(ClaimTypes.Role, user.Role.ToString()),
                }.Concat(
                    user.Departments.Select(x => new Claim(Auth.PrincipalExtensions.DepartmentClaim, x))
                ),
                "assignee"
            )
        );
        return CanManage(requisition, principal);
    }

    /// <summary>Make someone the owner of a thread and tell them (unless they did it themselves).</summary>
    private static async Task AssignAsync(
        AtsDbContext db,
        Application application,
        string? assignee,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var me = principal.Email();
        application.AssigneeEmail = assignee;
        Audit.Add(
            db,
            principal,
            "Application",
            application.Id,
            assignee is null ? "ThreadUnassigned" : "ThreadAssigned",
            new { assignee }
        );
        if (assignee is null)
            return;
        var by = await db
            .Users.AsNoTracking()
            .Where(x => x.Email == me)
            .Select(x => x.DisplayName)
            .SingleOrDefaultAsync(ct);
        await Notify.AddAsync(
            db,
            [assignee],
            new NotificationDraft(
                NotificationKinds.Assigned,
                $"{by ?? me} assigned you the conversation with {application.Candidate!.FirstName} {application.Candidate.LastName}",
                $"/messages?thread={application.Id}",
                Body: application.Requisition!.Title,
                ActorEmail: me,
                ApplicationId: application.Id
            ),
            ct
        );
    }

    private static string LikePattern(string q) =>
        $"%{q.Trim().Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_")}%";

    // One word for the email copy of a team message, for the status line under the bubble.
    private static string? Delivery(EmailOutboxStatus? status, string? provider) =>
        status switch
        {
            null => null,
            EmailOutboxStatus.Failed => "failed",
            EmailOutboxStatus.Succeeded => provider switch
            {
                "delivered" => "delivered",
                "opened" or "clicked" => "opened",
                "bounced" => "bounced",
                "complained" or "failed" or "suppressed" => "failed",
                _ => "sent",
            },
            _ => "sending",
        };

    private static async Task<Application?> ManagedApplicationAsync(
        AtsDbContext db,
        Guid id,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var application = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        return application?.Requisition is null || !CanManage(application.Requisition, principal)
            ? null
            : application;
    }

    private static void MapApplicationMessages(RouteGroupBuilder api)
    {
        MapBulkEmail(api);

        // ---- Team inbox ------------------------------------------------------------------------
        api.MapGet(
                "/inbox",
                async (
                    string? folder,
                    string? q,
                    int? cursor,
                    int? limit,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    folder = InboxFolders.Contains(folder) ? folder! : "inbox";
                    var me = principal.Email();
                    var applications = ManageableThreads(db, principal)
                        .Where(x => x.Messages.Any());
                    q = q?.Trim();
                    if (!string.IsNullOrEmpty(q))
                    {
                        // Names, emails, jobs and file names by text; message bodies by their words.
                        var pattern = LikePattern(q);
                        applications = applications.Where(x =>
                            EF.Functions.ILike(
                                x.Candidate!.FirstName + " " + x.Candidate.LastName,
                                pattern
                            )
                            || EF.Functions.ILike(x.Candidate.Email, pattern)
                            || EF.Functions.ILike(x.Requisition!.Title, pattern)
                            || x.Messages.Any(m =>
                                EF.Property<NpgsqlTsVector>(
                                        m,
                                        ApplicationMessageThreadConfiguration.SearchVector
                                    )
                                    .Matches(EF.Functions.WebSearchToTsQuery("english", q))
                            )
                            || db.Attachments.Any(f =>
                                f.MessageId != null
                                && x.Messages.Any(m => m.Id == f.MessageId)
                                && EF.Functions.ILike(f.OriginalFileName, pattern)
                            )
                        );
                    }
                    var take = Math.Clamp(limit ?? 30, 1, 100);
                    var skip = Math.Max(cursor ?? 0, 0);
                    var page = await InFolder(InboxRows(db, applications, me), folder, me)
                        .OrderByDescending(x => x.LastAt)
                        .ThenBy(x => x.ApplicationId)
                        .Skip(skip)
                        .Take(take + 1)
                        .ToListAsync(ct);
                    if (!string.IsNullOrEmpty(q) && page.Count > 0)
                        await AddSnippetsAsync(db, page, q, ct);
                    // ponytail: offset cursor; a thread that jumps to the top can repeat once, and the client drops repeats.
                    return Results.Ok(
                        new
                        {
                            Items = page.Take(take),
                            NextCursor = page.Count > take ? skip + take : (int?)null,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
                "/inbox/counts",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var rows = InboxRows(
                        db,
                        ManageableThreads(db, principal).Where(x => x.Messages.Any()),
                        principal.Email()
                    );
                    var unmatched = principal.IsHiringStaff()
                        ? await db.UnmatchedInboundEmails.CountAsync(ct)
                        : 0;
                    var me = principal.Email();
                    return Results.Ok(
                        new
                        {
                            Unread = await rows.CountAsync(x => !x.Done && x.Unread, ct),
                            Assigned = await InFolder(rows, "assigned", me).CountAsync(ct),
                            Unmatched = unmatched,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Clears the unread mark on every conversation in the inbox, for me only.
        api.MapPost(
                "/inbox/read-all",
                async (
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var ids = await InboxRows(
                            db,
                            ManageableThreads(db, principal).Where(x => x.Messages.Any()),
                            me
                        )
                        .Where(x => x.Unread)
                        .Select(x => x.ApplicationId)
                        .ToListAsync(ct);
                    var states = await db
                        .MessageThreadStates.Where(x =>
                            x.UserEmail == me && ids.Contains(x.ApplicationId)
                        )
                        .ToDictionaryAsync(x => x.ApplicationId, ct);
                    var now = DateTimeOffset.UtcNow;
                    foreach (var id in ids)
                    {
                        if (!states.TryGetValue(id, out var state))
                            db.MessageThreadStates.Add(
                                state = new MessageThreadState
                                {
                                    ApplicationId = id,
                                    UserEmail = me,
                                }
                            );
                        state.LastReadAt = now;
                        state.MarkedUnread = false;
                    }
                    await db.SaveChangesAsync(ct);
                    if (ids.Count > 0)
                        await hub
                            .Clients.Group(InboxHub.Staff)
                            .SendAsync("threadChanged", new { applicationId = (Guid?)null }, ct);
                    return Results.Ok(new { Marked = ids.Count });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // People to start a conversation with: open applications the user can manage.
        api.MapGet(
                "/inbox/recipients",
                async (
                    string? q,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var applications = ManageableThreads(db, principal)
                        .Where(x =>
                            x.Status == ApplicationStatus.Active
                            || x.Status == ApplicationStatus.Hired
                        );
                    if (!string.IsNullOrWhiteSpace(q))
                    {
                        var pattern = LikePattern(q);
                        applications = applications.Where(x =>
                            EF.Functions.ILike(
                                x.Candidate!.FirstName + " " + x.Candidate.LastName,
                                pattern
                            )
                            || EF.Functions.ILike(x.Candidate.Email, pattern)
                            || EF.Functions.ILike(x.Requisition!.Title, pattern)
                        );
                    }
                    return Results.Ok(
                        await applications
                            .OrderByDescending(x => x.LastActivityAt)
                            .Take(200)
                            .Select(x => new
                            {
                                ApplicationId = x.Id,
                                CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                                CandidateEmail = x.Candidate.Email,
                                JobTitle = x.Requisition!.Title,
                                Stage = x.PipelineStage!.Name,
                            })
                            .ToListAsync(ct)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // ---- Unmatched inbound email -----------------------------------------------------------
        api.MapGet(
                "/inbox/unmatched",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    !principal.IsHiringStaff()
                        ? Results.Ok(Array.Empty<object>())
                        : Results.Ok(
                            await db
                                .UnmatchedInboundEmails.AsNoTracking()
                                .OrderByDescending(x => x.ReceivedAt)
                                .Take(100)
                                .Select(x => new
                                {
                                    x.Id,
                                    x.FromAddress,
                                    x.FromName,
                                    x.Subject,
                                    x.Body,
                                    x.ReceivedAt,
                                })
                                .ToListAsync(ct)
                        )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/inbox/unmatched/{id:guid}/attach",
                async (
                    Guid id,
                    AttachUnmatchedRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.NotFound();
                    var email = await db.UnmatchedInboundEmails.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    var application = await ManagedApplicationAsync(
                        db,
                        request.ApplicationId,
                        principal,
                        ct
                    );
                    if (email is null || application is null)
                        return Results.NotFound();
                    await EmailInbound.AttachUnmatchedAsync(db, email, application, ct);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        application.Id,
                        "UnmatchedEmailAttached",
                        new { email.FromAddress }
                    );
                    await db.SaveChangesAsync(ct);
                    await hub.ThreadChangedAsync(application.Id, application.CandidateId);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapDelete(
                "/inbox/unmatched/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.NotFound();
                    await db.UnmatchedInboundEmails.Where(x => x.Id == id).ExecuteDeleteAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // ---- One thread ------------------------------------------------------------------------
        api.MapGet(
                "/applications/{id:guid}/messages",
                async (
                    Guid id,
                    DateTimeOffset? before,
                    int? limit,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IConfiguration configuration,
                    CancellationToken ct
                ) =>
                {
                    var application = await db
                        .Applications.AsNoTracking()
                        .Include(x => x.Candidate)
                        .Include(x => x.Requisition)
                        .Include(x => x.PipelineStage)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    var me = principal.Email();
                    var take = Math.Clamp(limit ?? 50, 1, 200);
                    var page = await db
                        .ApplicationMessages.AsNoTracking()
                        .Where(x =>
                            x.ApplicationId == id && (before == null || x.CreatedAt < before)
                        )
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(take + 1)
                        .Select(x => new
                        {
                            x.Id,
                            x.FromCandidate,
                            x.Body,
                            x.OriginalBody,
                            x.Channel,
                            x.AuthorEmail,
                            AuthorName = db
                                .Users.Where(u => u.Email == x.AuthorEmail)
                                .Select(u => u.DisplayName)
                                .FirstOrDefault(),
                            x.FromAddress,
                            x.CreatedAt,
                            x.ReadAt,
                            x.ScheduledFor,
                            Outbox = db
                                .EmailOutbox.Where(o => o.Id == x.EmailOutboxItemId)
                                .Select(o => new
                                {
                                    o.Status,
                                    o.DeliveryStatus,
                                    o.LastError,
                                })
                                .FirstOrDefault(),
                            Attachments = db
                                .Attachments.Where(f => f.MessageId == x.Id)
                                .Select(f => new
                                {
                                    f.Id,
                                    Name = f.OriginalFileName,
                                    Size = f.Length,
                                    f.ContentType,
                                })
                                .ToList(),
                        })
                        .ToListAsync(ct);
                    var state = await db
                        .MessageThreadStates.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.ApplicationId == id && x.UserEmail == me, ct);
                    var candidateMessages = db.ApplicationMessages.Where(x =>
                        x.ApplicationId == id && x.FromCandidate
                    );
                    var readUntil = state?.LastReadAt;
                    var unread =
                        state?.MarkedUnread == true
                        || await candidateMessages.AnyAsync(
                            x => readUntil == null || x.CreatedAt > readUntil,
                            ct
                        );
                    var candidate = application.Candidate!;
                    var others = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                        .Where(x => x.CandidateId == candidate.Id && x.Id != id)
                        .OrderByDescending(x => x.LastActivityAt)
                        .Select(x => new
                        {
                            ApplicationId = x.Id,
                            JobTitle = x.Requisition!.Title,
                            Stage = x.PipelineStage!.Name,
                            StageType = x.PipelineStage.Type.ToString(),
                            StageColor = x.PipelineStage.Color,
                            Status = x.Status.ToString(),
                        })
                        .ToListAsync(ct);
                    return Results.Ok(
                        new
                        {
                            Thread = new
                            {
                                ApplicationId = application.Id,
                                CandidateId = candidate.Id,
                                CandidateName = $"{candidate.FirstName} {candidate.LastName}",
                                CandidateFirstName = candidate.FirstName,
                                CandidateEmail = candidate.Email,
                                application.RequisitionId,
                                JobTitle = application.Requisition.Title,
                                Stage = application.PipelineStage?.Name,
                                Status = application.Status.ToString(),
                                Starred = state?.Starred ?? false,
                                Done = application.ThreadDoneAt != null,
                                Unread = unread,
                                application.AssigneeEmail,
                                AssigneeName = application.AssigneeEmail is null
                                    ? null
                                    : await db
                                        .Users.AsNoTracking()
                                        .Where(u => u.Email == application.AssigneeEmail)
                                        .Select(u => u.DisplayName)
                                        .SingleOrDefaultAsync(ct),
                                application.SnoozedUntil,
                                BlockedReason = application.Status
                                == ApplicationStatus.PendingVerification
                                    ? "This candidate hasn't confirmed their email yet, so you can't message them."
                                : candidate.DoNotContact
                                    ? "This candidate asked not to be contacted, so you can't message them."
                                : null,
                                EmailBounced = candidate.EmailBounced,
                                ReplyByEmail = EmailThreads.InboundDomain(configuration)
                                    is not null,
                                OtherApplications = others,
                            },
                            Messages = page.Take(take)
                                .Reverse()
                                .Select(x => new
                                {
                                    x.Id,
                                    x.FromCandidate,
                                    x.Body,
                                    x.OriginalBody,
                                    Channel = x.Channel.ToString(),
                                    x.AuthorEmail,
                                    x.AuthorName,
                                    x.FromAddress,
                                    x.CreatedAt,
                                    x.ReadAt,
                                    // Still waiting to go: the composer offers Undo, Send now or Cancel.
                                    ScheduledFor = x.Outbox?.Status == EmailOutboxStatus.Pending
                                    && x.ScheduledFor > DateTimeOffset.UtcNow
                                        ? x.ScheduledFor
                                        : null,
                                    Delivery = Delivery(x.Outbox?.Status, x.Outbox?.DeliveryStatus),
                                    DeliveryError = x.Outbox?.Status == EmailOutboxStatus.Failed
                                        ? x.Outbox.LastError
                                        : null,
                                    x.Attachments,
                                }),
                            HasMore = page.Count > take,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/messages",
                async (
                    Guid id,
                    StaffMessageRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IConfiguration configuration,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var body = request.Body?.Trim() ?? "";
                    var fileIds = (request.AttachmentIds ?? []).Distinct().ToArray();
                    if (body.Length > MaxMessage || (body.Length == 0 && fileIds.Length == 0))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] = ["Write a message of up to 10,000 characters."],
                            }
                        );
                    if (fileIds.Length > MaxFilesPerMessage)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["attachmentIds"] = ["Send up to 10 files at a time."],
                            }
                        );
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    if (application.Status == ApplicationStatus.PendingVerification)
                        return Results.Conflict(
                            new { message = "This candidate hasn't confirmed their email yet." }
                        );
                    if (application.Candidate!.DoNotContact)
                        return Results.Conflict(
                            new { message = "This candidate is marked do not contact." }
                        );
                    var me = principal.Email();
                    var files =
                        fileIds.Length == 0
                            ? []
                            : await db
                                .Attachments.Where(x =>
                                    fileIds.Contains(x.Id)
                                    && x.CandidateId == application.CandidateId
                                    && x.MessageId == null
                                    && x.UploadedBy == me
                                )
                                .ToListAsync(ct);
                    if (files.Count != fileIds.Length)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["attachmentIds"] = ["Some files are missing. Attach them again."],
                            }
                        );
                    var now = DateTimeOffset.UtcNow;
                    if (
                        request.ScheduledFor is { } at
                        && (at < now.AddMinutes(1) || at > now.AddYears(1))
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["scheduledFor"] =
                                [
                                    "Pick a time at least a minute from now and within a year.",
                                ],
                            }
                        );
                    // Details from a saved reply ({{firstName}}) are filled in for this candidate.
                    var details = await EmailThreads.DetailsAsync(db, application, me, ct);
                    body = EmailTemplates.Fill(EmailTemplates.Camel(body), details);
                    var unfilled = EmailTemplates.Missing(body, details);
                    if (unfilled.Length > 0)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] =
                                [
                                    $"Fill in or remove {string.Join(", ", unfilled.Select(EmailTemplates.DetailLabel))} before sending.",
                                ],
                            }
                        );
                    var message = new ApplicationMessage
                    {
                        ApplicationId = id,
                        FromCandidate = false,
                        Body = body,
                        AuthorEmail = me,
                        ScheduledFor = request.ScheduledFor,
                    };
                    db.ApplicationMessages.Add(message);
                    foreach (var file in files)
                        file.MessageId = message.Id;
                    application.LastActivityAt = now;
                    // Front's "assign on reply": the first teammate to answer owns the conversation.
                    if (application.AssigneeEmail is null)
                        application.AssigneeEmail = me;
                    var state = await EmailThreads.StateAsync(db, id, me, ct);
                    state.LastReadAt = DateTimeOffset.UtcNow;
                    state.MarkedUnread = false;
                    await EmailThreads.QueueCandidateCopyAsync(
                        db,
                        configuration,
                        application,
                        message,
                        files,
                        ct,
                        UndoWindow
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        request.ScheduledFor is null ? "MessageSent" : "MessageScheduled"
                    );
                    await db.SaveChangesAsync(ct);
                    await hub.ThreadChangedAsync(
                        id,
                        request.ScheduledFor is null ? application.CandidateId : null
                    );
                    return Results.Ok(new { message.Id, message.ScheduledFor });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/messages/read",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    var state = await EmailThreads.StateAsync(db, id, principal.Email(), ct);
                    state.LastReadAt = DateTimeOffset.UtcNow;
                    state.MarkedUnread = false;
                    await db.SaveChangesAsync(ct);
                    // The shared mark is what the candidate sees as "Seen".
                    var seen = await db
                        .ApplicationMessages.Where(x =>
                            x.ApplicationId == id && x.FromCandidate && x.ReadAt == null
                        )
                        .ExecuteUpdateAsync(
                            u => u.SetProperty(x => x.ReadAt, DateTimeOffset.UtcNow),
                            ct
                        );
                    await hub.ThreadChangedAsync(id, seen > 0 ? application.CandidateId : null);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/applications/{id:guid}/thread",
                async (
                    Guid id,
                    ThreadStateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    var state = await EmailThreads.StateAsync(db, id, principal.Email(), ct);
                    if (request.Starred is { } starred)
                        state.Starred = starred;
                    if (request.Unread is { } unread)
                    {
                        state.MarkedUnread = unread;
                        if (!unread)
                            state.LastReadAt = DateTimeOffset.UtcNow;
                    }
                    if (request.Done is { } done)
                    {
                        application.ThreadDoneAt = done ? DateTimeOffset.UtcNow : null;
                        Audit.Add(
                            db,
                            principal,
                            "Application",
                            id,
                            done ? "ThreadDone" : "ThreadReopened"
                        );
                    }
                    if (request.Assignee is { } assignee)
                    {
                        var email = assignee.Trim().ToLowerInvariant();
                        if (
                            email.Length > 0
                            && !await CanBeAssignedAsync(db, email, application.Requisition!, ct)
                        )
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["assignee"] = ["Choose someone who works on this job."],
                                }
                            );
                        if ((application.AssigneeEmail ?? "") != email)
                            await AssignAsync(
                                db,
                                application,
                                email.Length == 0 ? null : email,
                                principal,
                                ct
                            );
                    }
                    if (request.SnoozeUntil is { } until)
                    {
                        if (
                            until <= DateTimeOffset.UtcNow
                            || until > DateTimeOffset.UtcNow.AddYears(1)
                        )
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["snoozeUntil"] = ["Pick a time in the future, within a year."],
                                }
                            );
                        application.SnoozedUntil = until;
                        application.SnoozedBy = principal.Email();
                    }
                    if (request.Unsnooze == true)
                    {
                        application.SnoozedUntil = null;
                        application.SnoozedBy = null;
                    }
                    await db.SaveChangesAsync(ct);
                    await hub.ThreadChangedAsync(id);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Undo send, or cancel a scheduled message, while its email has not gone. Returns the text
        // and files so the composer can put them back.
        api.MapDelete(
                "/messages/{id:guid}",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var message = await db.ApplicationMessages.SingleOrDefaultAsync(
                        x => x.Id == id && !x.FromCandidate && x.AuthorEmail == me,
                        ct
                    );
                    var outbox = message?.EmailOutboxItemId is { } outboxId
                        ? await db.EmailOutbox.SingleOrDefaultAsync(x => x.Id == outboxId, ct)
                        : null;
                    if (message is null || outbox is null)
                        return Results.NotFound();
                    if (outbox.Status != EmailOutboxStatus.Pending || outbox.Attempts > 0)
                        return Results.Conflict(
                            new { message = "This message has already been sent." }
                        );
                    var files = await db.Attachments.Where(x => x.MessageId == id).ToListAsync(ct);
                    foreach (var file in files)
                        file.MessageId = null;
                    db.EmailOutbox.Remove(outbox);
                    db.ApplicationMessages.Remove(message);
                    Audit.Add(db, principal, "Application", message.ApplicationId, "MessageUnsent");
                    await db.SaveChangesAsync(ct);
                    var candidateId = await db
                        .Applications.Where(x => x.Id == message.ApplicationId)
                        .Select(x => x.CandidateId)
                        .SingleAsync(ct);
                    await hub.ThreadChangedAsync(message.ApplicationId, candidateId);
                    return Results.Ok(
                        new
                        {
                            message.Body,
                            Attachments = files.Select(f => new
                            {
                                f.Id,
                                Name = f.OriginalFileName,
                                Size = f.Length,
                                f.ContentType,
                            }),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/messages/{id:guid}/send-now",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var message = await db.ApplicationMessages.SingleOrDefaultAsync(
                        x => x.Id == id && !x.FromCandidate && x.AuthorEmail == me,
                        ct
                    );
                    var outbox = message?.EmailOutboxItemId is { } outboxId
                        ? await db.EmailOutbox.SingleOrDefaultAsync(x => x.Id == outboxId, ct)
                        : null;
                    if (message is null || outbox is null)
                        return Results.NotFound();
                    if (outbox.Status != EmailOutboxStatus.Pending || outbox.Attempts > 0)
                        return Results.Conflict(
                            new { message = "This message has already been sent." }
                        );
                    var now = DateTimeOffset.UtcNow;
                    message.ScheduledFor = null;
                    message.CreatedAt = now;
                    outbox.NextAttemptAt = now;
                    await db.SaveChangesAsync(ct);
                    await hub.ThreadChangedAsync(message.ApplicationId);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // People who may own a conversation: active teammates who can manage its job.
        api.MapGet(
                "/applications/{id:guid}/thread/assignees",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    var people = await db
                        .Users.AsNoTracking()
                        .Where(x =>
                            x.IsActive
                            && (
                                x.Role == UserRole.Admin
                                || x.Role == UserRole.Recruiter
                                || x.Role == UserRole.HiringManager
                            )
                        )
                        .OrderBy(x => x.DisplayName)
                        .Select(x => new
                        {
                            x.Email,
                            x.DisplayName,
                            x.Role,
                        })
                        .ToListAsync(ct);
                    var allowed = new List<object>();
                    foreach (var person in people)
                        if (
                            await CanBeAssignedAsync(db, person.Email, application.Requisition!, ct)
                        )
                            allowed.Add(new { person.Email, Name = person.DisplayName });
                    return Results.Ok(allowed);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Done, reopen, read, unread or assign for many conversations at once.
        api.MapPost(
                "/inbox/bulk",
                async (
                    InboxBulkRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var ids = (request.ApplicationIds ?? []).Distinct().Take(500).ToArray();
                    if (
                        ids.Length == 0
                        || request.Action
                            is not ("done" or "reopen" or "read" or "unread" or "assign")
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["action"] = ["Choose conversations and what to do with them."],
                            }
                        );
                    var me = principal.Email();
                    var applications = await db
                        .Applications.Include(x => x.Candidate)
                        .Include(x => x.Requisition)
                        .Where(x => ids.Contains(x.Id))
                        .ToListAsync(ct);
                    applications = applications
                        .Where(x => CanManage(x.Requisition!, principal))
                        .ToList();
                    var assignee = request.Assignee?.Trim().ToLowerInvariant();
                    var now = DateTimeOffset.UtcNow;
                    var changed = 0;
                    foreach (var application in applications)
                    {
                        switch (request.Action)
                        {
                            case "done":
                                application.ThreadDoneAt ??= now;
                                break;
                            case "reopen":
                                application.ThreadDoneAt = null;
                                break;
                            case "read":
                            case "unread":
                                var state = await EmailThreads.StateAsync(
                                    db,
                                    application.Id,
                                    me,
                                    ct
                                );
                                state.MarkedUnread = request.Action == "unread";
                                if (request.Action == "read")
                                    state.LastReadAt = now;
                                break;
                            case "assign":
                                var target = string.IsNullOrEmpty(assignee) ? null : assignee;
                                if (
                                    target is not null
                                    && !await CanBeAssignedAsync(
                                        db,
                                        target,
                                        application.Requisition!,
                                        ct
                                    )
                                )
                                    continue;
                                if (application.AssigneeEmail != target)
                                    await AssignAsync(db, application, target, principal, ct);
                                break;
                        }
                        changed++;
                    }
                    await db.SaveChangesAsync(ct);
                    if (changed > 0)
                        await hub
                            .Clients.Group(InboxHub.Staff)
                            .SendAsync("threadChanged", new { applicationId = (Guid?)null }, ct);
                    return Results.Ok(new { Changed = changed });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Draft with AI: a reply based on the last few messages, never sent on its own.
        api.MapPost(
                "/applications/{id:guid}/messages/draft",
                async (
                    Guid id,
                    DraftReplyRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant assistant,
                    CancellationToken ct
                ) =>
                {
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    if (!await db.Organizations.Select(x => x.AiEnabled).SingleOrDefaultAsync(ct))
                        return Results.Problem(
                            "AI help is turned off for this workspace.",
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );
                    var recent = await db
                        .ApplicationMessages.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(5)
                        .Select(x => new { x.FromCandidate, x.Body })
                        .ToListAsync(ct);
                    var thread = string.Join(
                        "\n\n",
                        recent
                            .AsEnumerable()
                            .Reverse()
                            .Select(m =>
                                $"{(m.FromCandidate ? application.Candidate!.FirstName : "Hiring team")}: {m.Body[..Math.Min(m.Body.Length, 1500)]}"
                            )
                    );
                    try
                    {
                        var draft = await assistant.CompleteAsync(
                            "Draft a concise, warm reply from the hiring team to the candidate. Never make a hiring decision, invent facts, promise dates, or mention internal notes. Use plain Markdown paragraphs. Return only the message body, without a subject or signature.",
                            $"Job: {application.Requisition!.Title}\nCandidate first name: {application.Candidate!.FirstName}\nWhat the reply should say: {request.Instructions?.Trim() ?? "Answer their last message."}\n\nConversation so far (oldest first):\n{thread}",
                            ct,
                            new AiContext(
                                "draft-reply",
                                principal.Email(),
                                "Application",
                                id.ToString()
                            )
                        );
                        return Results.Ok(new { Draft = draft.Trim() });
                    }
                    catch (AiUnavailableException exception)
                    {
                        return Results.Problem(
                            exception.Message,
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Files are uploaded first, then sent with the message. Until then only the uploader can use them.
        api.MapPost(
                "/applications/{id:guid}/messages/attachments",
                async (
                    Guid id,
                    IFormFile file,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var application = await ManagedApplicationAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    try
                    {
                        var stored = await files.SaveValidatedAsync(file, ct);
                        var attachment = new Attachment
                        {
                            CandidateId = application.CandidateId,
                            OriginalFileName = Path.GetFileName(file.FileName),
                            StoredFileName = stored.StoredName,
                            ContentType = stored.ContentType,
                            Length = file.Length,
                            UploadedBy = principal.Email(),
                            ScanStatus = "ValidationOnly",
                            Kind = AttachmentKinds.Other,
                        };
                        db.Attachments.Add(attachment);
                        await db.SaveChangesAsync(ct);
                        return Results.Ok(
                            new
                            {
                                attachment.Id,
                                Name = attachment.OriginalFileName,
                                Size = attachment.Length,
                                attachment.ContentType,
                            }
                        );
                    }
                    catch (InvalidDataException exception)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Removing a file from the composer before sending deletes it, so it never shows in the candidate's files.
        // ponytail: a file attached and then abandoned (tab closed) stays in the candidate's files; sweep unsent ones if that matters.
        api.MapDelete(
                "/messages/attachments/{id:guid}",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var recent = DateTimeOffset.UtcNow.AddDays(-1);
                    var attachment = await db.Attachments.SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && x.MessageId == null
                            && x.UploadedBy == me
                            && x.Kind == AttachmentKinds.Other
                            && x.UploadedAt > recent,
                        ct
                    );
                    if (attachment is null)
                        return Results.NotFound();
                    db.Attachments.Remove(attachment);
                    await db.SaveChangesAsync(ct);
                    files.Delete(attachment.StoredFileName);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
