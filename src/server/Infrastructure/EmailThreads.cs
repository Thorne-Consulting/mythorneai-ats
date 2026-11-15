using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// The emails around a message thread. Each application has one thread. The candidate's copy of a
/// team message carries a reply address with the thread's token, and the team's alert carries a
/// per-person token, so an emailed reply lands back in the thread as the right person.
/// </summary>
public static class EmailThreads
{
    public const string MessageTemplateKey = "message";
    public const string AlertTemplateKey = "message-alert";

    /// <summary>20 lowercase hex characters: safe in an email address and impossible to guess.</summary>
    public static string NewToken() =>
        Convert.ToHexString(RandomNumberGenerator.GetBytes(10)).ToLowerInvariant();

    /// <summary>The subdomain Resend receives replies on (for example reply.acme.com). Null turns reply by email off.</summary>
    public static string? InboundDomain(IConfiguration configuration) =>
        configuration["Resend:InboundDomain"] is { Length: > 0 } domain
            ? domain.Trim().TrimStart('@')
            : null;

    public static string? ReplyAddress(IConfiguration configuration, string token) =>
        InboundDomain(configuration) is { } domain ? $"reply+{token}@{domain}" : null;

    // A made-up Message-ID every email in the thread points at, so mail apps keep them together.
    private static string Reference(IConfiguration configuration, string kind, string token) =>
        $"<{kind}-{token}@{InboundDomain(configuration) ?? "mythorneai.local"}>";

    /// <summary>The plain address of the candidate's conversation (for text people keep, such as a message body).</summary>
    public static string? PortalLink(string? publicUrl, Guid applicationId) =>
        string.IsNullOrWhiteSpace(publicUrl)
            ? null
            : $"{publicUrl.TrimEnd('/')}{Api.CandidateLinks.ConversationPath(applicationId)}";

    public static string? InboxLink(string? publicUrl, Guid applicationId) =>
        string.IsNullOrWhiteSpace(publicUrl)
            ? null
            : $"{publicUrl.TrimEnd('/')}/messages?thread={applicationId}";

    /// <summary>
    /// Queue the candidate's email copy of a team message, worded by the "message" template (the
    /// subject stays the same for the thread, so mail apps group it). Needs the application with its
    /// candidate and job loaded. Files go along as real attachments. It goes out at the message's
    /// <c>ScheduledFor</c> time, or after <paramref name="undoWindow"/> so the sender can take it back.
    /// </summary>
    public const string PersonAtCompany = "PersonAtCompany";
    public const string CompanyTeam = "CompanyTeam";

    /// <summary>The name on the From line of an email a person sends: "Avery at Acme" or "Acme hiring team".</summary>
    public static string SenderName(string? format, string? person, string company) =>
        format == CompanyTeam ? $"{company} hiring team"
        : string.IsNullOrWhiteSpace(person) ? company
        : $"{person.Trim().Split(' ')[0]} at {company}";

    public static async Task QueueCandidateCopyAsync(
        AtsDbContext db,
        IConfiguration configuration,
        Application application,
        ApplicationMessage message,
        IReadOnlyList<Attachment> files,
        CancellationToken ct,
        TimeSpan? undoWindow = null
    )
    {
        application.ThreadToken ??= NewToken();
        var sender = message.AuthorEmail is null
            ? null
            : await db
                .Users.AsNoTracking()
                .Where(x => x.Email == message.AuthorEmail)
                .Select(x => x.DisplayName)
                .SingleOrDefaultAsync(ct);
        var attachedNames =
            files.Count == 0
                ? ""
                : $"\n\nFiles: {string.Join(", ", files.Select(x => x.OriginalFileName))}";
        var candidate = application.Candidate!;
        var rendered = await EmailTemplates.RenderAsync(
            db,
            MessageTemplateKey,
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["message"] = message.Body + attachedNames,
                ["firstName"] = candidate.FirstName,
                ["jobTitle"] = application.Requisition!.Title,
                ["senderName"] = sender ?? "",
                // A one-click, signed-in link to the conversation for this email only.
                ["portalLink"] =
                    await Api.CandidateLinks.CreateAsync(
                        db,
                        candidate.Id,
                        application.Id,
                        Api.CandidateLinks.ConversationPath(application.Id),
                        ct
                    ) ?? "",
            },
            ct
        );
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.SenderNameFormat })
            .SingleOrDefaultAsync(ct);
        var item = new EmailOutboxItem
        {
            ApplicationId = application.Id,
            Recipient = candidate.Email,
            Subject = rendered.Subject,
            Body = rendered.Body,
            TemplateKey = MessageTemplateKey,
            TemplateVersion = rendered.Version,
            FromName = SenderName(
                organization?.SenderNameFormat,
                sender,
                organization?.Name ?? "The hiring team"
            ),
            ReplyTo = ReplyAddress(configuration, application.ThreadToken),
            ThreadReference = Reference(configuration, "thread", application.ThreadToken),
            AttachmentIds = files.Select(x => x.Id).ToArray(),
            NextAttemptAt =
                message.ScheduledFor ?? DateTimeOffset.UtcNow + (undoWindow ?? TimeSpan.Zero),
        };
        db.EmailOutbox.Add(item);
        message.EmailOutboxItemId = item.Id;
    }

    /// <summary>
    /// The candidate wrote: the thread comes back to the inbox (Done and snooze end), and the person
    /// assigned to it (or the job's recruiter) gets a notification. Their email copy has their own
    /// reply address, so a reply from their mailbox posts in the thread as them. Needs candidate and
    /// job loaded.
    /// </summary>
    public static async Task AlertTeamAsync(
        AtsDbContext db,
        IConfiguration configuration,
        Application application,
        ApplicationMessage message,
        CancellationToken ct
    )
    {
        application.ThreadDoneAt = null;
        application.SnoozedUntil = null;
        application.SnoozedBy = null;
        var recipient = (
            application.AssigneeEmail
            ?? (await RecruitersAsync(db, application.Requisition!, ct)).First()
        ).ToLowerInvariant();
        var candidate = application.Candidate!;
        var name = $"{candidate.FirstName} {candidate.LastName}";
        var how =
            message.Channel == MessageChannel.Email
                ? "replied by email"
                : "wrote in the candidate portal";
        var wantsEmail = await Notify.AddAsync(
            db,
            [recipient],
            new NotificationDraft(
                NotificationKinds.CandidateMessage,
                $"{name} {how}",
                $"/messages?thread={application.Id}",
                Body: message.Body,
                ApplicationId: application.Id
            ),
            ct,
            queueEmail: false
        );
        await PipelineEvents.NotifyAsync(
            db,
            $"New message from {name} about {application.Requisition!.Title}.",
            ct,
            TeamChannel.CandidateMessage,
            $"/messages?thread={application.Id}"
        );
        if (wantsEmail.Length == 0)
            return;

        var state = await StateAsync(db, application.Id, recipient, ct);
        state.ReplyToken ??= NewToken();
        var publicUrl = await db
            .Organizations.AsNoTracking()
            .Select(x => x.PublicUrl)
            .SingleOrDefaultAsync(ct);
        var from = message.FromAddress is null ? "" : $" (from {message.FromAddress})";
        var rendered = await EmailTemplates.RenderAsync(
            db,
            AlertTemplateKey,
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["candidateName"] = name + from,
                ["firstName"] = candidate.FirstName,
                ["jobTitle"] = application.Requisition.Title,
                ["message"] = message.Body,
                ["inboxLink"] = InboxLink(publicUrl, application.Id) ?? "",
            },
            ct
        );
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = recipient,
                Subject = rendered.Subject,
                Body = rendered.Body,
                TemplateKey = AlertTemplateKey,
                TemplateVersion = rendered.Version,
                ReplyTo = ReplyAddress(configuration, state.ReplyToken),
                ThreadReference = Reference(configuration, "team", state.ReplyToken),
            }
        );
    }

    /// <summary>
    /// The details a saved reply can use, for this thread's candidate and the person sending. Needs
    /// the application with its candidate and job loaded.
    /// </summary>
    public static async Task<Dictionary<string, string>> DetailsAsync(
        AtsDbContext db,
        Application application,
        string? senderEmail,
        CancellationToken ct
    )
    {
        var candidate = application.Candidate!;
        // Candidates read the stage's candidate label, never the team's internal name.
        var stage = await db
            .PipelineStages.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == application.PipelineStageId, ct);
        var sender = senderEmail is null
            ? null
            : await db
                .Users.AsNoTracking()
                .Where(x => x.Email == senderEmail)
                .Select(x => x.DisplayName)
                .SingleOrDefaultAsync(ct);
        var publicUrl = await db
            .Organizations.AsNoTracking()
            .Select(x => x.PublicUrl)
            .SingleOrDefaultAsync(ct);
        return await EmailTemplates.WithOrganizationAsync(
            db,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["lastName"] = candidate.LastName,
                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                ["jobTitle"] = application.Requisition!.Title,
                ["stage"] = stage is null ? "" : StageRules.CandidateLabel(stage),
                ["senderName"] = sender ?? "",
                ["portalLink"] = PortalLink(publicUrl, application.Id) ?? "",
            },
            ct
        );
    }

    /// <summary>
    /// The job's recruiters from its hiring team (<c>RequisitionMember</c>), or its recruiter field
    /// when the team has none. Never empty.
    /// </summary>
    public static async Task<string[]> RecruitersAsync(
        AtsDbContext db,
        Requisition requisition,
        CancellationToken ct
    )
    {
        var members = await db
            .RequisitionMembers.AsNoTracking()
            .Where(x =>
                x.RequisitionId == requisition.Id
                && x.Role == RequisitionRole.Recruiter
                && x.User!.IsActive
            )
            .OrderBy(x => x.CreatedAt)
            .Select(x => x.User!.Email.ToLower())
            .ToArrayAsync(ct);
        return members.Length > 0 ? members : [requisition.RecruiterEmail.ToLowerInvariant()];
    }

    /// <summary>The person's state row for a thread, added (not saved) when missing.</summary>
    public static async Task<MessageThreadState> StateAsync(
        AtsDbContext db,
        Guid applicationId,
        string email,
        CancellationToken ct
    )
    {
        var state =
            db.MessageThreadStates.Local.FirstOrDefault(x =>
                x.ApplicationId == applicationId && x.UserEmail == email
            )
            ?? await db.MessageThreadStates.SingleOrDefaultAsync(
                x => x.ApplicationId == applicationId && x.UserEmail == email,
                ct
            );
        if (state is null)
        {
            state = new MessageThreadState { ApplicationId = applicationId, UserEmail = email };
            db.MessageThreadStates.Add(state);
        }
        return state;
    }
}
