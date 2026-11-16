namespace MyThorneAI.Ats.Api.Domain;

/// <summary>Automatic emails are the fixed list the app sends; saved replies are text people reuse in messages.</summary>
public enum TemplateKind
{
    Automatic,
    Saved,

    /// <summary>An offer letter: Name and Body, filled from the offer's terms (the evaluation area).</summary>
    OfferLetter,
}

/// <summary>
/// One template. An automatic email's row exists only once someone changes it (the wording in
/// <c>EmailTemplates.Defaults</c> applies until then). Bodies are Markdown with <c>{{detail}}</c> chips.
/// </summary>
public sealed class EmailTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public TemplateKind Kind { get; set; } = TemplateKind.Automatic;

    /// <summary>The automatic email this changes (for example "rejection"). Null for saved replies.</summary>
    public string? Key { get; set; }

    // Null means the organization-wide template; set means an override for one job.
    public Guid? RequisitionId { get; set; }

    /// <summary>A saved reply's name and category.</summary>
    public string? Name { get; set; }
    public string? Category { get; set; }

    /// <summary>Who a personal saved reply belongs to. Null means shared with the team.</summary>
    public string? OwnerEmail { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? UpdatedBy { get; set; }
}

/// <summary>Every saved wording of a template, so an older one can be read and restored.</summary>
public sealed class EmailTemplateVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The automatic email's key, or a saved reply's id.</summary>
    public required string TemplateRef { get; set; }
    public Guid? RequisitionId { get; set; }
    public int Version { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }

    /// <summary>Saved, Restored or Reset (back to the standard wording).</summary>
    public required string Action { get; set; }
    public string? EditedBy { get; set; }
    public DateTimeOffset EditedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>How a message reached the thread: written in the app or portal, or sent as an email reply.</summary>
public enum MessageChannel
{
    Portal,
    Email,
}

public sealed class ApplicationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public bool FromCandidate { get; set; }
    public required string Body { get; set; }
    public string? AuthorEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>When the other side first read it: the team for candidate messages, the candidate for team messages.</summary>
    public DateTimeOffset? ReadAt { get; set; }
    public MessageChannel Channel { get; set; } = MessageChannel.Portal;

    /// <summary>The email copy of a team message, for its delivery status.</summary>
    public Guid? EmailOutboxItemId { get; set; }

    /// <summary>Provider id of an inbound email, so a retried webhook never posts twice.</summary>
    public string? ExternalMessageId { get; set; }

    /// <summary>Set when an emailed reply came from an address other than the candidate's.</summary>
    public string? FromAddress { get; set; }

    /// <summary>The whole inbound email when quoted history or a signature was cut from <see cref="Body"/>.</summary>
    public string? OriginalBody { get; set; }

    /// <summary>
    /// When a team message goes out. Every send waits a few seconds (so it can be undone), and a
    /// scheduled one waits until its time. The candidate sees it only after this time.
    /// </summary>
    public DateTimeOffset? ScheduledFor { get; set; }
}

/// <summary>One person's view of one thread: what they have read, and their star.</summary>
public sealed class MessageThreadState
{
    public Guid ApplicationId { get; set; }
    public required string UserEmail { get; set; }
    public DateTimeOffset? LastReadAt { get; set; }
    public bool MarkedUnread { get; set; }
    public bool Starred { get; set; }

    /// <summary>Random part of this person's reply address for the thread, so their emailed replies post as them.</summary>
    public string? ReplyToken { get; set; }
}

/// <summary>An inbound email we could not tie to a thread. A recruiter attaches it to one or discards it.</summary>
public sealed class UnmatchedInboundEmail
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string ExternalMessageId { get; set; }
    public required string FromAddress { get; set; }
    public string? FromName { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public DateTimeOffset ReceivedAt { get; set; } = DateTimeOffset.UtcNow;
}
