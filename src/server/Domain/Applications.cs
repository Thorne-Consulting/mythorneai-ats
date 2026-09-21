namespace MyThorneAI.Ats.Api.Domain;

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
    public string? ResumeText { get; set; }
    public string? ResumeSummary { get; set; }
    public string[] ResumeSkills { get; set; } = [];
    public string[] ResumeJobTitles { get; set; } = [];
    public string[] ResumeEducation { get; set; } = [];
    public string[] ResumeCertifications { get; set; } = [];
    public string[] ResumeLanguages { get; set; } = [];
    public decimal? ResumeYearsExperience { get; set; }
    public DateTimeOffset? ResumeParsedAt { get; set; }
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
