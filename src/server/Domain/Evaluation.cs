namespace MyThorneAI.Ats.Api.Domain;

/// <summary>An interviewer's unfinished scorecard, saved as they type so it survives a closed tab or a new device.</summary>
public sealed class ScorecardDraft
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string InterviewerEmail { get; set; }

    /// <summary>The form as the web app holds it. Never read by the server.</summary>
    public string Json { get; set; } = "{}";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum HiringDecisionKind
{
    Advance,
    Offer,
    Reject,
}

/// <summary>What the team decided after the interviews, who decided it and why.</summary>
public sealed class HiringDecision
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public HiringDecisionKind Decision { get; set; }
    public Guid? ToStageId { get; set; }
    public required string Rationale { get; set; }
    public required string DecidedBy { get; set; }
    public DateTimeOffset DecidedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A dated correction to a submitted scorecard. The scorecard itself never changes.</summary>
public sealed class ScorecardAddendum
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ScorecardId { get; set; }
    public Scorecard? Scorecard { get; set; }
    public required string Body { get; set; }
    public required string AuthorEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A whole interview kit kept in the interview library, to start new kits from.</summary>
public sealed class KitTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }

    /// <summary>One line on what the round covers.</summary>
    public string Summary { get; set; } = "";
    public int DurationMinutes { get; set; } = 45;
    public string Instructions { get; set; } = "";

    /// <summary>The competencies, as a JSON list of KitTemplateCompetency.</summary>
    public string CompetenciesJson { get; set; } = "[]";
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }
}

public sealed record KitTemplateCompetency(
    string Name,
    string Question,
    string FollowUps,
    string Description,
    int Weight
);

/// <summary>One competency and its question, saved once and reused in any kit.</summary>
public sealed class QuestionBankItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>The competency it measures, for example "Problem solving".</summary>
    public required string Name { get; set; }
    public required string Question { get; set; }

    /// <summary>Follow-ups and guidance for the interviewer.</summary>
    public string FollowUps { get; set; } = "";

    /// <summary>What a good answer shows.</summary>
    public string GoodLooksLike { get; set; } = "";
    public int Weight { get; set; } = 3;
    public string[] Tags { get; set; } = [];
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }
}

/// <summary>
/// A reason an application closes, managed in Settings. Applications keep the label as text
/// (<see cref="Application.DispositionReason"/>), so renaming a reason renames it there too.
/// </summary>
public sealed class RejectionReason
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Label { get; set; }

    /// <summary>Rejected: we decided. Withdrawn: they decided.</summary>
    public ApplicationStatus Kind { get; set; } = ApplicationStatus.Rejected;

    /// <summary>Closing with this reason needs a note saying why (Other, for example).</summary>
    public bool NeedsNote { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ArchivedAt { get; set; }
}
