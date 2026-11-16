namespace MyThorneAI.Ats.Api.Domain;

public sealed class StageTransition
{
    public long Id { get; set; }
    public Guid ApplicationId { get; set; }
    public Guid RequisitionId { get; set; }
    public Guid? FromStageId { get; set; }
    public Guid ToStageId { get; set; }
    public ApplicationStatus? FromStatus { get; set; }
    public ApplicationStatus ToStatus { get; set; }
    public string? ActorEmail { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SavedView
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerEmail { get; set; }
    public required string Area { get; set; }
    public required string Name { get; set; }
    public required string ParamsJson { get; set; }

    /// <summary>Everyone with access to the area sees it, not only the owner.</summary>
    public bool Shared { get; set; }

    /// <summary>People who pinned it to their reports overview.</summary>
    public string[] PinnedBy { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum ReportFrequency
{
    Weekly,
    Monthly,
}

/// <summary>
/// Emails a saved report view on a schedule, in the organization's time zone. Each recipient gets the
/// numbers they are allowed to see, never the owner's.
/// </summary>
public sealed class ReportSubscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SavedViewId { get; set; }
    public SavedView? SavedView { get; set; }
    public required string OwnerEmail { get; set; }
    public string[] Recipients { get; set; } = [];
    public ReportFrequency Frequency { get; set; }

    /// <summary>0 is Sunday. Used by weekly emails.</summary>
    public int DayOfWeek { get; set; } = 1;

    /// <summary>1 to 28. Used by monthly emails.</summary>
    public int DayOfMonth { get; set; } = 1;

    /// <summary>Local hour, 0 to 23.</summary>
    public int Hour { get; set; } = 8;
    public DateTimeOffset NextSendAt { get; set; }
    public DateTimeOffset? LastSentAt { get; set; }
    public bool Paused { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
