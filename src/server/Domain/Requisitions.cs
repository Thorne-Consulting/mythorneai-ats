namespace MyThorneAI.Ats.Api.Domain;

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
    public string ApplicationQuestionsMarkdown { get; set; } = "";
    // AI-extracted, recruiter-confirmed requirements as JSON: { required, preferred, minYears, location }.
    public string RequirementsJson { get; set; } = "";
    public float[]? RequirementsEmbedding { get; set; }
    // First time the job was opened. With approval required, only a job that has been opened (approved) before can open.
    public DateTimeOffset? OpenedAt { get; set; }
    public bool IsConfidential { get; set; }
    public string[] ViewerEmails { get; set; } = [];
    public bool AllowCandidateReschedule { get; set; } = true;
    public bool AllowCandidateWithdraw { get; set; } = true;
    public Guid? PostingTemplateId { get; set; }
    public int? PostingTemplateVersion { get; set; }
    public RequisitionStatus Status { get; set; } = RequisitionStatus.Draft;
    public DateOnly? TargetStartDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<PipelineStage> Stages { get; set; } = [];
    public List<InterviewKit> InterviewKits { get; set; } = [];
    public List<Application> Applications { get; set; } = [];
}

public sealed class PostingTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string HeaderMarkdown { get; set; }
    public required string DescriptionMarkdown { get; set; }
    public string BenefitsMarkdown { get; set; } = "";
    public string ApplicationQuestionsMarkdown { get; set; } = "";
    public string InterviewStagesMarkdown { get; set; } = "";
    public int Version { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
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
