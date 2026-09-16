namespace MyThorneAI.Ats.Api.Domain;

public enum UserRole
{
    Admin,
    Recruiter,
    HiringManager,
    Interviewer,
    Hr
}

public enum RequisitionStatus
{
    Draft,
    Open,
    OnHold,
    Filled,
    Closed,
    Cancelled
}

public enum ApplicationStatus
{
    Active,
    Rejected,
    Withdrawn,
    Hired
}

public enum InterviewStatus
{
    Scheduled,
    Completed,
    Cancelled,
    NoShow
}

public enum Recommendation
{
    StrongNo,
    No,
    Mixed,
    Yes,
    StrongYes
}

public enum OfferStatus
{
    Draft,
    Approved,
    Sent,
    Accepted,
    Declined,
    Withdrawn
}

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public UserRole Role { get; set; }
    public string? Department { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Requisition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Title { get; set; }
    public required string Department { get; set; }
    public required string Location { get; set; }
    public required string EmploymentType { get; set; }
    public required string WorkMode { get; set; }
    public int Openings { get; set; } = 1;
    public required string OwnerEmail { get; set; }
    public required string RecruiterEmail { get; set; }
    public string Description { get; set; } = "";
    public RequisitionStatus Status { get; set; } = RequisitionStatus.Draft;
    public DateOnly? TargetStartDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<PipelineStage> Stages { get; set; } = [];
    public List<Application> Applications { get; set; } = [];
}

public sealed class PipelineStage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public required string Color { get; set; }
    public bool IsTerminal { get; set; }
    public List<Application> Applications { get; set; } = [];
}

public sealed class Candidate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string FirstName { get; set; }
    public required string LastName { get; set; }
    public required string Email { get; set; }
    public string? Phone { get; set; }
    public string? Location { get; set; }
    public string? CurrentTitle { get; set; }
    public string? LinkedInUrl { get; set; }
    public required string Source { get; set; }
    public string[] Tags { get; set; } = [];
    public bool DoNotContact { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Application> Applications { get; set; } = [];
    public List<Attachment> Attachments { get; set; } = [];
}

public sealed class Application
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public Guid PipelineStageId { get; set; }
    public PipelineStage? PipelineStage { get; set; }
    public ApplicationStatus Status { get; set; } = ApplicationStatus.Active;
    public required string Source { get; set; }
    public string? DispositionReason { get; set; }
    public int? Rating { get; set; }
    public DateTimeOffset AppliedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastActivityAt { get; set; } = DateTimeOffset.UtcNow;
    public List<ApplicationNote> Notes { get; set; } = [];
    public List<Interview> Interviews { get; set; } = [];
    public List<TaskItem> Tasks { get; set; } = [];
    public List<Offer> Offers { get; set; } = [];
    public List<Communication> Communications { get; set; } = [];
}

public sealed class ApplicationNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public required string Body { get; set; }
    public required string AuthorEmail { get; set; }
    public bool IsPrivate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class TaskItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ApplicationId { get; set; }
    public Application? Application { get; set; }
    public required string Title { get; set; }
    public required string AssigneeEmail { get; set; }
    public DateOnly? DueDate { get; set; }
    public bool IsCompleted { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Interview
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public required string Title { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public required string TimeZone { get; set; }
    public string? MeetingLink { get; set; }
    public string[] InterviewerEmails { get; set; } = [];
    public InterviewStatus Status { get; set; } = InterviewStatus.Scheduled;
    public List<Scorecard> Scorecards { get; set; } = [];
}

public sealed class Scorecard
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string InterviewerEmail { get; set; }
    public Recommendation Recommendation { get; set; }
    public int Rating { get; set; }
    public required string Evidence { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Offer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public decimal BaseSalary { get; set; }
    public required string Currency { get; set; }
    public DateOnly StartDate { get; set; }
    public OfferStatus Status { get; set; } = OfferStatus.Draft;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Communication
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public required string Recipient { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public required string SenderEmail { get; set; }
    public string Status { get; set; } = "Logged";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StoredFileName { get; set; }
    public required string ContentType { get; set; }
    public long Length { get; set; }
    public required string UploadedBy { get; set; }
    public string ScanStatus { get; set; } = "Pending";
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class AuditEvent
{
    public long Id { get; set; }
    public required string EntityType { get; set; }
    public required string EntityId { get; set; }
    public required string Action { get; set; }
    public required string ActorEmail { get; set; }
    public string? Details { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
}
