namespace MyThorneAI.Ats.Api.Domain;

public sealed class IntegrationOutboxItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public IntegrationOperation Operation { get; set; }
    public Guid EntityId { get; set; }
    public IntegrationOutboxStatus Status { get; set; } = IntegrationOutboxStatus.Pending;
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LockedUntil { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class ResumeParseJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AttachmentId { get; set; }
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LockedUntil { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public required string EntityType { get; set; }
    public required string EntityId { get; set; }
    public required string Action { get; set; }
    public required string ActorEmail { get; set; }
    public string? Details { get; set; }

    /// <summary>JSON of changed fields, {"Role":{"from":"Recruiter","to":"Admin"}}, filled on save from tracked entities.</summary>
    public string? Changes { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class EmailOutboxItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ApplicationId { get; set; }
    public string? TemplateKey { get; set; }
    public int? TemplateVersion { get; set; }
    public string? ProviderMessageId { get; set; }
    public string? DeliveryStatus { get; set; }
    public DateTimeOffset? DeliveryUpdatedAt { get; set; }
    public required string Recipient { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public EmailOutboxStatus Status { get; set; } = EmailOutboxStatus.Pending;
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LockedUntil { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }

    // Thread emails: who it is from, where replies go, the thread to join, and the files to attach.
    public string? FromName { get; set; }
    public string? ReplyTo { get; set; }
    public string? ThreadReference { get; set; }
    public Guid[] AttachmentIds { get; set; } = [];

    // One generated text file sent along, for example a calendar invite: "invite.ics",
    // "text/calendar; method=REQUEST" and the file's text.
    public string? InlineFileName { get; set; }
    public string? InlineFileContentType { get; set; }
    public string? InlineFileText { get; set; }
}
