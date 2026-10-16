namespace MyThorneAI.Ats.Api.Domain;

public sealed class AiCallLog
{
    public long Id { get; set; }
    public required string Purpose { get; set; }
    public required string Model { get; set; }
    public string? UserEmail { get; set; }
    public string? SubjectType { get; set; }
    public string? SubjectId { get; set; }
    public string Input { get; set; } = "";
    public string Output { get; set; } = "";
    public int PromptTokens { get; set; }
    public int CompletionTokens { get; set; }
    public int LatencyMs { get; set; }
    public string? Error { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Cached AI fit assessment of one candidate against one job's requirements.</summary>
public sealed class JobFit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Guid CandidateId { get; set; }
    public required string ResultJson { get; set; }
    public int Score { get; set; }
    // Hash of the resume text and requirements the result was produced from; a change makes it stale.
    public required string InputHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CandidateDismissal
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Guid CandidateId { get; set; }
    public required string Reason { get; set; }
    public required string DismissedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
