namespace MyThorneAI.Ats.Api.Domain;

public sealed class Requisition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Title { get; set; }
    public required string Department { get; set; }

    // The location as people read it ("Chicago, Illinois"). Built from the parts below when they are set.
    public required string Location { get; set; }

    // Structured location for search engines (Google for Jobs) and filters. Country is an ISO code ("US").
    public string? LocationCity { get; set; }
    public string? LocationRegion { get; set; }
    public string? LocationCountry { get; set; }

    // For remote jobs: the countries people may work from (ISO codes). Empty means anywhere.
    public string[] RemoteCountries { get; set; } = [];
    public required string EmploymentType { get; set; }
    public required string WorkMode { get; set; }
    public int Openings { get; set; } = 1;

    // Pay range for the role. ShowSalary puts it on the careers page and in the search-engine data.
    public decimal? SalaryMin { get; set; }
    public decimal? SalaryMax { get; set; }
    public string SalaryCurrency { get; set; } = "USD";

    /// <summary>Year, Month or Hour.</summary>
    public string SalaryPeriod { get; set; } = "Year";
    public bool ShowSalary { get; set; }

    // Legacy mirrors of the hiring team (Members is the source). Kept in step by RequisitionTeam
    // until every area reads members: the first hiring manager, the first recruiter, and everyone else.
    public required string OwnerEmail { get; set; }
    public required string RecruiterEmail { get; set; }
    public string Description { get; set; } = "";

    // Legacy free-text questions. QuestionRules.BackfillAsync turns them into ApplicationQuestion rows and clears this.
    public string ApplicationQuestionsMarkdown { get; set; } = "";

    // AI-extracted, recruiter-confirmed requirements as JSON: { required, preferred, minYears, location }.
    public string RequirementsJson { get; set; } = "";
    public float[]? RequirementsEmbedding { get; set; }

    // First time the job was opened. With approval required, only a job that has been opened (approved) before can open.
    public DateTimeOffset? OpenedAt { get; set; }
    public bool IsConfidential { get; set; }
    public string[] ViewerEmails { get; set; } = []; // legacy mirror, see OwnerEmail
    public bool AllowCandidateReschedule { get; set; } = true;
    public bool AllowCandidateWithdraw { get; set; } = true;
    public Guid? PostingTemplateId { get; set; }
    public int? PostingTemplateVersion { get; set; }

    // The pipeline the job's stages were copied from, for "Used by N jobs".
    public Guid? PipelineTemplateId { get; set; }
    public RequisitionStatus Status { get; set; } = RequisitionStatus.Draft;

    // Why the job is on hold, filled, closed or cancelled. Cleared when it opens again.
    public string? StatusReason { get; set; }

    // When the job stopped hiring (filled, closed or cancelled). Cleared when it opens again.
    public DateTimeOffset? ClosedAt { get; set; }
    public DateOnly? TargetStartDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<PipelineStage> Stages { get; set; } = [];
    public List<RequisitionMember> Members { get; set; } = [];
    public List<InterviewKit> InterviewKits { get; set; } = [];
    public List<Application> Applications { get; set; } = [];
    public List<ApplicationQuestion> Questions { get; set; } = [];
}

/// <summary>
/// A reusable posting. Every save is a new version with the same name; only the latest version is
/// active. Archiving hides the whole template from the picker.
/// </summary>
public sealed class PostingTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }

    /// <summary>Company intro, above the role description.</summary>
    public required string HeaderMarkdown { get; set; }

    /// <summary>Role description starter, edited for each job.</summary>
    public required string DescriptionMarkdown { get; set; }
    public string BenefitsMarkdown { get; set; } = "";

    // Legacy free-text questions; QuestionRules.BackfillAsync moves them into QuestionsJson.
    public string ApplicationQuestionsMarkdown { get; set; } = "";

    /// <summary>Default application questions (a JSON list of <c>QuestionInput</c>), copied to each new job.</summary>
    public string QuestionsJson { get; set; } = "[]";
    public int Version { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? ArchivedAt { get; set; }
    public string? UpdatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum QuestionType
{
    ShortText,
    LongText,
    YesNo,
    SingleChoice,
    MultipleChoice,
    Number,
    Date,
    File,
    Url,
}

/// <summary>
/// A question on a job's application form, or (with no job) one in the organization's question bank.
/// Knockout answers flag an application for a person to review; nothing is rejected automatically.
/// </summary>
public sealed class ApplicationQuestion
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Null: a question in the bank.</summary>
    public Guid? RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public QuestionType Type { get; set; }
    public required string Label { get; set; }
    public string? HelpText { get; set; }
    public bool Required { get; set; }

    /// <summary>The choices for yes or no (Yes, No) and choice questions.</summary>
    public string[] Options { get; set; } = [];

    /// <summary>Answers that flag the application ("No" to "Can you work in the US?").</summary>
    public string[] KnockoutAnswers { get; set; } = [];
    public int SortOrder { get; set; }

    /// <summary>The bank question this one was copied from, if any.</summary>
    public Guid? BankQuestionId { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// One answer on an application. Label and type are kept as they were asked, so changing or
/// removing the question later does not change what the candidate answered.
/// </summary>
public sealed class ApplicationAnswer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public Guid? QuestionId { get; set; }
    public required string Label { get; set; }
    public QuestionType Type { get; set; }

    /// <summary>The answer; several values only for multiple choice. Empty when skipped.</summary>
    public string[] Values { get; set; } = [];

    /// <summary>The file a file question was answered with.</summary>
    public Guid? AttachmentId { get; set; }

    /// <summary>The answer is one of the question's knockout answers.</summary>
    public bool Flagged { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>What a stage means, whatever the company calls it. Colour, dashboards, booking and hiring read this, never the name.</summary>
public enum StageType
{
    Applied,
    Screen,
    Interview,
    Offer,
    Hired,
    Other,
}

/// <summary>Whether moving someone into a stage emails them: never, after asking the person who moves them, or always.</summary>
public enum StageEmail
{
    Off,
    Ask,
    Always,
}

public sealed class PipelineStage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public StageType Type { get; set; } = StageType.Other;

    // What candidates see in the portal and in emails. Internal names are never sent.
    // Empty only on rows from before stage types, until StageRules.BackfillAsync fills it.
    public string CandidateLabel { get; set; } = "";
    public StageEmail EmailOnEntry { get; set; } = StageEmail.Off;

    // Days someone should spend here; the board warns past it.
    public int? TargetDays { get; set; }

    // A tone (blue, violet, green, amber, red, gray) that overrides the type's colour. Null: from the type.
    public string? Color { get; set; }

    // Only the Hired stage is terminal (StageRules keeps the two in step).
    public bool IsTerminal { get; set; }

    // The assessment this stage uses: its score shows on cards here. Sending it on entry is a workflow.
    public Guid? AssessmentId { get; set; }
    public List<Application> Applications { get; set; } = [];
}

/// <summary>Someone on a job's hiring team, with their role on that job.</summary>
public sealed class RequisitionMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public Guid UserId { get; set; }
    public AppUser? User { get; set; }
    public RequisitionRole Role { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum RequisitionRole
{
    HiringManager,
    Recruiter,
    Interviewer,
    Viewer,
}

/// <summary>
/// A job someone started in the create-job wizard and has not created yet. The wizard saves its form
/// here as they go, so they can leave and pick it up later from the Jobs list.
/// </summary>
public sealed class JobDraft
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerEmail { get; set; }
    public string Title { get; set; } = "";

    /// <summary>The wizard's own state as JSON; the server only stores it.</summary>
    public string DataJson { get; set; } = "{}";
    public int Step { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
