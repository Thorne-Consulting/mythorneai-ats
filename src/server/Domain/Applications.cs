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
    public string? City { get; set; }
    public string? Region { get; set; }
    public string? Country { get; set; }
    public bool? WillingToRelocate { get; set; }
    public bool? OpenToRemote { get; set; }
    public string? GitHubUrl { get; set; }
    public string? PortfolioUrl { get; set; }
    public string[] OtherUrls { get; set; } = [];
    public Guid? CurrentEmployerId { get; set; }
    public Company? CurrentEmployer { get; set; }
    public Seniority Seniority { get; set; }
    public decimal? YearsManagement { get; set; }
    public DegreeLevel HighestDegreeLevel { get; set; }
    public string? ResumeText { get; set; }
    public string? ResumeTextHash { get; set; }
    public string? ResumeProfileJson { get; set; }
    public string? ResumeModel { get; set; }
    public string? ResumePromptVersion { get; set; }
    public string? ResumeSummary { get; set; }
    // Flat copies of the rows below, kept for the list filters and the in-memory ranking.
    public string[] ResumeSkills { get; set; } = [];
    public string[] ResumeJobTitles { get; set; } = [];
    public string[] ResumeEducation { get; set; } = [];
    public string[] ResumeCertifications { get; set; } = [];
    public string[] ResumeLanguages { get; set; } = [];
    public decimal? ResumeYearsExperience { get; set; }
    public DateTimeOffset? ResumeParsedAt { get; set; }
    public List<WorkExperience> WorkExperiences { get; set; } = [];
    public List<Education> Educations { get; set; } = [];
    public List<CandidateSkill> Skills { get; set; } = [];
    public List<Certification> Certifications { get; set; } = [];
    public List<CandidateLanguage> Languages { get; set; } = [];
    public List<Project> Projects { get; set; } = [];
    public List<Publication> Publications { get; set; } = [];
    public List<Award> Awards { get; set; } = [];
    public bool DoNotContact { get; set; }
    public bool EmailBounced { get; set; }
    public float[]? ResumeEmbedding { get; set; }
    public DateTimeOffset? ResumeEmbeddingAt { get; set; }
    public string CustomFieldsJson { get; set; } = "{}";
    public string? PortalCodeHash { get; set; }
    public DateTimeOffset? PortalCodeExpiresAt { get; set; }
    public int PortalCodeAttempts { get; set; }
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
    public string ApplicationAnswersMarkdown { get; set; } = "";
    public int? Rating { get; set; }
    public DateTimeOffset AppliedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastActivityAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastReminderAt { get; set; }
    public int ReminderCount { get; set; }
    public string? VerificationCodeHash { get; set; }
    public DateTimeOffset? VerificationExpiresAt { get; set; }
    public int VerificationAttempts { get; set; }
    public DateTimeOffset? VerifiedAt { get; set; }
    public List<ApplicationNote> Notes { get; set; } = [];
    public List<ApplicationMessage> Messages { get; set; } = [];
    public List<Interview> Interviews { get; set; } = [];
}

public sealed class CandidatePortalSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string TokenHash { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
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
