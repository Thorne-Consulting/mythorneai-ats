namespace MyThorneAI.Ats.Api.Domain;

public enum AssessmentStatus
{
    Draft,
    Active,
    Archived,
}

/// <summary>Native: questions taken in the candidate portal. External: a link to another provider's test.</summary>
public enum AssessmentKind
{
    Native,
    External,
}

public enum AssessmentInviteStatus
{
    NotStarted,
    InProgress,
    Submitted,
    Expired,
    Revoked,
}

public enum AssessmentDecision
{
    Passed,
    Failed,
}

/// <summary>
/// A skills test the team sends to applicants. This row holds the editable copy; candidates always
/// take a frozen <see cref="AssessmentVersion"/>, so editing never changes anyone's score.
/// </summary>
public sealed class Assessment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }

    /// <summary>One of the job departments, for filtering the library.</summary>
    public string? Department { get; set; }
    public AssessmentKind Kind { get; set; }
    public AssessmentStatus Status { get; set; }

    /// <summary>How many days an invite link stays open.</summary>
    public int ExpiryDays { get; set; } = 7;

    /// <summary>
    /// Days after the invite to remind someone who has not finished; null turns it off.
    /// ponytail: one fixed reminder; the workflow engine's "Assessment not finished" workflow can take this over.
    /// </summary>
    public int? RemindAfterDays { get; set; } = 3;

    /// <summary>Reviewers see a code instead of the name and email until they record a decision.</summary>
    public bool BlindReview { get; set; }

    /// <summary>External only: who runs the test, and the link with optional {{email}}-style details.</summary>
    public string? ProviderName { get; set; }
    public string? ExternalUrl { get; set; }

    /// <summary>The draft: an <c>AssessmentContent</c> as JSON (instructions, timer, sections and questions).</summary>
    public string ContentJson { get; set; } = "{}";

    /// <summary>The latest published version; new invites use it.</summary>
    public Guid? CurrentVersionId { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A published copy of an assessment's content. It never changes after publishing.</summary>
public sealed class AssessmentVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssessmentId { get; set; }
    public Assessment? Assessment { get; set; }
    public int Number { get; set; }
    public string ContentJson { get; set; } = "{}";
    public required string PublishedBy { get; set; }
    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>One application's attempt at one assessment, from invite to decision.</summary>
public sealed class AssessmentInvite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AssessmentId { get; set; }
    public Assessment? Assessment { get; set; }

    /// <summary>The version sent; moved to the newest version when the candidate starts.</summary>
    public Guid VersionId { get; set; }
    public AssessmentVersion? Version { get; set; }
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }

    /// <summary>1 for the first invite, 2 and up for retakes.</summary>
    public int Attempt { get; set; } = 1;
    public AssessmentInviteStatus Status { get; set; }
    public required string InvitedBy { get; set; }
    public DateTimeOffset InvitedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? StartedAt { get; set; }

    /// <summary>Set on start for timed assessments: start plus the minutes plus any extra time.</summary>
    public DateTimeOffset? DeadlineAt { get; set; }

    /// <summary>Extra time given to this candidate, for example an accommodation.</summary>
    public int ExtraMinutes { get; set; }
    public DateTimeOffset? SubmittedAt { get; set; }

    /// <summary>The time ran out and the server submitted what was saved.</summary>
    public bool AutoSubmitted { get; set; }

    public decimal MaxPoints { get; set; }

    /// <summary>Points so far: automatic plus reviewer points.</summary>
    public decimal EarnedPoints { get; set; }

    /// <summary>Answered questions a person still has to score.</summary>
    public int PendingCount { get; set; }

    /// <summary>0 to 100 once nothing is pending (typed in by the reviewer for external tests).</summary>
    public int? Percent { get; set; }

    public AssessmentDecision? Decision { get; set; }
    public string? DecidedBy { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
    public string? Comment { get; set; }

    public int ReminderCount { get; set; }
    public DateTimeOffset? LastReminderAt { get; set; }

    /// <summary>Checks the candidate was told about: tab switches, full-screen exits, pastes. A JSON list.</summary>
    public string IntegrityJson { get; set; } = "[]";

    /// <summary>A retake took this attempt's place.</summary>
    public DateTimeOffset? ReplacedAt { get; set; }

    /// <summary>External tests: the provider's report, kept with the candidate's files.</summary>
    public Guid? ReportAttachmentId { get; set; }
}

/// <summary>A candidate's answer to one question, saved as they work.</summary>
public sealed class AssessmentAnswer
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InviteId { get; set; }
    public AssessmentInvite? Invite { get; set; }
    public required string QuestionId { get; set; }
    public string[] ChoiceIds { get; set; } = [];
    public string? Text { get; set; }

    /// <summary>File questions: the upload, kept with the candidate's files.</summary>
    public Guid? AttachmentId { get; set; }

    /// <summary>Time spent on the question, as the browser counted it.</summary>
    public int Seconds { get; set; }
    public DateTimeOffset SavedAt { get; set; } = DateTimeOffset.UtcNow;
    public decimal? AutoPoints { get; set; }
    public decimal? ReviewerPoints { get; set; }
    public string? ReviewerEmail { get; set; }
    public string? ReviewerNote { get; set; }
}

/// <summary>What a version freezes: everything that changes how the test is taken or scored.</summary>
public sealed class AssessmentContent
{
    public string Instructions { get; set; } = "";
    public int Minutes { get; set; } = 45;
    public bool Timed { get; set; } = true;
    public int PassMark { get; set; } = 70;
    public bool ShuffleQuestions { get; set; }
    public bool ShuffleOptions { get; set; }
    public bool TabSwitch { get; set; } = true;
    public bool Fullscreen { get; set; }
    public bool BlockPaste { get; set; }
    public List<AssessmentSection> Sections { get; set; } = [];
}

public sealed class AssessmentSection
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public List<AssessmentQuestion> Questions { get; set; } = [];
}

public static class QuestionTypes
{
    public const string Single = "single";
    public const string Multi = "multi";
    public const string Short = "short";
    public const string Long = "long";
    public const string Code = "code";
    public const string File = "file";
    public static readonly string[] All = [Single, Multi, Short, Long, Code, File];
}

public sealed class AssessmentQuestion
{
    public string Id { get; set; } = "";
    public string Type { get; set; } = QuestionTypes.Single;

    /// <summary>Markdown.</summary>
    public string Prompt { get; set; } = "";
    public int Points { get; set; } = 1;
    public List<AssessmentOption> Options { get; set; } = [];

    /// <summary>Several-answer questions: credit for each correct pick, minus each wrong pick.</summary>
    public bool PartialCredit { get; set; }

    /// <summary>What a full-marks answer includes, for people-scored questions.</summary>
    public string Rubric { get; set; } = "";
    public string Language { get; set; } = "";
    public string StarterCode { get; set; } = "";

    /// <summary>File types allowed for uploads, for example ".pdf,.zip".</summary>
    public string Accept { get; set; } = "";
}

public sealed class AssessmentOption
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public bool Correct { get; set; }
}
