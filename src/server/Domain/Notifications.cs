namespace MyThorneAI.Ats.Api.Domain;

/// <summary>Something that happened for one person: shown in the bell and on /notifications.</summary>
public sealed class Notification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string UserEmail { get; set; }

    /// <summary>One of <c>NotificationKinds</c>, for example "candidate-message".</summary>
    public required string Kind { get; set; }
    public required string Title { get; set; }
    public string? Body { get; set; }

    /// <summary>Where it opens, as an app path (for example /messages?thread=…).</summary>
    public required string Href { get; set; }
    public string? ActorEmail { get; set; }

    /// <summary>Keeps one-off events from repeating, for example "interview-soon:{id}".</summary>
    public string? GroupKey { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAt { get; set; }

    /// <summary>When it went out in a daily summary email.</summary>
    public DateTimeOffset? DigestedAt { get; set; }
}

/// <summary>How one person hears about one kind of event. No row means the kind's defaults.</summary>
public sealed class NotificationPreference
{
    public required string UserEmail { get; set; }
    public required string Kind { get; set; }
    public bool InApp { get; set; }
    public bool Email { get; set; }
    public bool Digest { get; set; }
}
