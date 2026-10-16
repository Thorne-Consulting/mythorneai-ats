namespace MyThorneAI.Ats.Api.Domain;

public enum OfferStatus
{
    Draft,
    PendingApproval,
    Approved,
    Sent,
    Withdrawn,
}

public enum ApprovalDecision
{
    Pending,
    Approved,
    Rejected,
}

/// <summary>Internal tracking of the "you've been accepted" step. Holds no letter or contract content.</summary>
public sealed class Offer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public string Note { get; set; } = "";
    public OfferStatus Status { get; set; } = OfferStatus.Draft;
    public required string CreatedBy { get; set; }
    public Guid? PreviousStageId { get; set; }
    public ApplicationStatus? PreviousStatus { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? SentAt { get; set; }
}

/// <summary>One approver's decision on an offer or on opening a requisition.</summary>
public sealed class Approval
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string SubjectType { get; set; }
    public Guid SubjectId { get; set; }
    public required string ApproverEmail { get; set; }
    // Approvers with the same sequence decide in parallel; a higher sequence waits for all lower ones.
    public int Sequence { get; set; }
    public ApprovalDecision Decision { get; set; } = ApprovalDecision.Pending;
    public string? Comment { get; set; }
    public required string RequestedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? DecidedAt { get; set; }
}
