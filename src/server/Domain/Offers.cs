namespace MyThorneAI.Ats.Api.Domain;

public enum OfferStatus
{
    Draft,
    PendingApproval,
    Approved,
    Sent,
    Withdrawn,
    Accepted,
    Declined,

    /// <summary>The candidate did not answer before the offer closed.</summary>
    Expired,
}

public enum ApprovalDecision
{
    Pending,
    Approved,
    Rejected,

    /// <summary>The round ended before this person decided: someone rejected, the request was withdrawn or the terms changed, or (any one) someone else approved.</summary>
    Cancelled,
}

/// <summary>How a round's approvers decide: one after another, all at once, or the first one to answer.</summary>
public enum ApprovalMode
{
    Sequential,
    Parallel,
    AnyOne,
}

/// <summary>
/// The terms the team offers, the approvals they need, and the candidate's answer. Sending it does
/// not hire anyone: hire happens when the candidate accepts (recorded by the recruiter for now).
/// </summary>
public sealed class Offer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }

    /// <summary>Why this person and anything else the approvers should know.</summary>
    public string Note { get; set; } = "";
    public decimal? BaseSalary { get; set; }
    public string Currency { get; set; } = "USD";

    /// <summary>Year, Month or Hour.</summary>
    public string PayPeriod { get; set; } = "Year";
    public string Bonus { get; set; } = "";
    public string Equity { get; set; } = "";
    public DateOnly? StartDate { get; set; }
    public string EmploymentType { get; set; } = "";
    public string WorkMode { get; set; } = "";
    public string Location { get; set; } = "";

    /// <summary>The last day the candidate can accept.</summary>
    public DateOnly? ExpiresOn { get; set; }

    /// <summary>When it closes: the end of <see cref="ExpiresOn"/> in the organization's time zone. Set on send.</summary>
    public DateTimeOffset? ExpiresAt { get; set; }

    /// <summary>When the candidate was reminded that the offer closes in two days. Once per offer.</summary>
    public DateTimeOffset? ReminderSentAt { get; set; }

    /// <summary>The offer letter template this one started from.</summary>
    public Guid? LetterTemplateId { get; set; }

    /// <summary>That template's version when the letter started from it (its history keeps the wording).</summary>
    public int? LetterTemplateVersion { get; set; }

    /// <summary>This candidate's letter, Markdown with <c>{{detail}}</c> chips. Editable until sent.</summary>
    public string? LetterMarkdown { get; set; }

    /// <summary>The letter as sent, details filled in. Frozen on send and never changed after.</summary>
    public string? LetterSent { get; set; }

    /// <summary>The declined or withdrawn offer this one revises, if any.</summary>
    public Guid? ReplacesOfferId { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }

    /// <summary>Who recorded the candidate's answer.</summary>
    public string? RespondedBy { get; set; }

    /// <summary>The full name the candidate typed to accept in the portal. Null when the team recorded it.</summary>
    public string? RespondedName { get; set; }

    /// <summary>The decline reason's key (see <c>OfferDeclines</c>), so reports can group them.</summary>
    public string? DeclineReason { get; set; }

    /// <summary>What the candidate (or recruiter) added about the decline.</summary>
    public string? DeclineNote { get; set; }
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

    // Each submit starts a new round; earlier rounds stay as history and only the latest is live.
    public int Round { get; set; } = 1;

    // Any one: the first approval settles the round (the others are cancelled).
    public bool AnyOne { get; set; }

    /// <summary>The requester's note to the approvers, the same on every row of the round.</summary>
    public string? Note { get; set; }

    /// <summary>
    /// The organization's chain named this person (not the requester). Only an admin or the person
    /// can hand the step to someone else, and with "any one", only these steps settle the round.
    /// </summary>
    public bool FromPolicy { get; set; }

    /// <summary>Who had this step before it was given to someone else, and who gave it.</summary>
    public string? ReassignedFromEmail { get; set; }
    public string? ReassignedBy { get; set; }
    public int RemindersSent { get; set; }
    public DateTimeOffset? LastRemindedAt { get; set; }

    /// <summary>Set when the last reminder went unanswered and the requester and admins were told.</summary>
    public DateTimeOffset? EscalatedAt { get; set; }
}

/// <summary>
/// Who signs off on one kind of request (opening a job, or an offer), in order. Approver keys are
/// emails, or <c>hiring-manager</c> for the job's hiring manager. Whether approval is required at
/// all stays on the organization (RequireRequisitionApproval, RequireOfferApproval).
/// </summary>
public sealed class ApprovalPolicy
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string SubjectType { get; set; }

    /// <summary>
    /// Empty: the organization's chain for this kind. Otherwise the chain for jobs in these teams
    /// (a job's Department); the most specific chain that matches wins.
    /// </summary>
    public string[] Departments { get; set; } = [];
    public ApprovalMode Mode { get; set; } = ApprovalMode.Parallel;
    public string[] Approvers { get; set; } = [];

    /// <summary>Remind an approver after this many days without an answer, then again every this many days (up to the organization's MaxReminders). 0 turns reminders off.</summary>
    public int ReminderDays { get; set; } = 2;
    public string? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
