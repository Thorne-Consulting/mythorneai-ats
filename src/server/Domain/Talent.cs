namespace MyThorneAI.Ats.Api.Domain;

/// <summary>A named group of people to come back to, for example "Silver medalists" or "Campus 2027".</summary>
public sealed class TalentPool
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public required string OwnerEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<TalentPoolMember> Members { get; set; } = [];
}

public sealed class TalentPoolMember
{
    public Guid PoolId { get; set; }
    public TalentPool? Pool { get; set; }
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string AddedBy { get; set; }
    public DateTimeOffset AddedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>Someone named with @ in a note. The notification feed reads these.</summary>
public sealed class NoteMention
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid NoteId { get; set; }
    public ApplicationNote? Note { get; set; }
    public required string UserEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>An AI fit check waiting to run in the background ("Check fit for the top 25").</summary>
public sealed class FitJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Guid CandidateId { get; set; }
    public required string RequestedBy { get; set; }
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}

/// <summary>One spreadsheet import, for the history and "Undo import" within a day.</summary>
public sealed class ImportBatch
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string FileName { get; set; }
    public required string CreatedBy { get; set; }
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Skipped { get; set; }

    /// <summary>The people this import added; undo deletes them.</summary>
    public Guid[] CandidateIds { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UndoneAt { get; set; }
    public string? UndoneBy { get; set; }
}

/// <summary>What kind of place a source is, for grouping in settings and reports.</summary>
public enum SourceCategory
{
    JobBoard,
    Referral,
    Agency,
    CareerSite,
    Sourced,
    Event,
    Other,
}

/// <summary>
/// Where people come from ("LinkedIn", "Employee referral"), managed in Settings. Candidates and
/// applications keep the name as text, so a rename or merge rewrites it on every row.
/// </summary>
public sealed class Source
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public SourceCategory Category { get; set; } = SourceCategory.Other;

    /// <summary>Turned off: kept on people who have it, not offered for new ones.</summary>
    public bool IsActive { get; set; } = true;

    /// <summary>Lower-case codes in careers links (<c>?src=</c> or <c>utm_source</c>) that mean this source.</summary>
    public string[] Codes { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
