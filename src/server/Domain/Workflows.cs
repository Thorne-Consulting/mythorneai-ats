namespace MyThorneAI.Ats.Api.Domain;

public enum WorkflowStatus
{
    Draft,
    Active,
    Paused,
    Archived,
}

public enum WorkflowRunStatus
{
    Running,
    Waiting,
    Completed,
    Failed,
    Cancelled,
}

/// <summary>
/// An automation: when something happens to an application, run these steps. The steps are a graph
/// in JSON (see Features/Workflows/WorkflowGraph.cs). People edit the draft; runs use a published version.
/// </summary>
public sealed class Workflow
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public WorkflowStatus Status { get; set; } = WorkflowStatus.Draft;

    /// <summary>Set on the reminders we ship ("booking-reminder"). They can be edited and switched off, not deleted.</summary>
    public string? BuiltInKey { get; set; }
    public string DraftGraphJson { get; set; } = """{"nodes":[],"edges":[]}""";
    public Guid? PublishedVersionId { get; set; }
    public WorkflowVersion? PublishedVersion { get; set; }

    /// <summary>The published graph's trigger kind, so matching an event needs no JSON.</summary>
    public string? TriggerKind { get; set; }

    // Entry rules. "Once" means one run per application ever; otherwise every matching event
    // starts a run, up to MaxRunsPerApplication (time triggers also wait their day count between runs).
    public bool RunsOncePerApplication { get; set; } = true;
    public int? MaxRunsPerApplication { get; set; }

    /// <summary>A run stops when its application is rejected, withdrawn or hired.</summary>
    public bool StopWhenClosed { get; set; } = true;

    /// <summary>Emails and alerts wait for the organization's quiet hours to end.</summary>
    public bool RespectQuietHours { get; set; } = true;

    /// <summary>When the owner was last told about failed runs; they hear at most once a day.</summary>
    public DateTimeOffset? FailureAlertedAt { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? UpdatedBy { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A published graph. Never changes once written; runs keep the version they started on.</summary>
public sealed class WorkflowVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkflowId { get; set; }
    public int Number { get; set; }
    public required string GraphJson { get; set; }
    public string? Note { get; set; }

    /// <summary>What changed since the version before, for example "Added Wait. Changed Send email."</summary>
    public string Summary { get; set; } = "";
    public required string PublishedBy { get; set; }
    public DateTimeOffset PublishedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>One application going through one workflow. The worker moves it step by step.</summary>
public sealed class WorkflowRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkflowId { get; set; }
    public Workflow? Workflow { get; set; }
    public Guid VersionId { get; set; }
    public WorkflowVersion? Version { get; set; }
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public required string TriggerKind { get; set; }

    /// <summary>What a time trigger was about ("interview:{id}"), so its repeats are counted per thing.</summary>
    public string Subject { get; set; } = "";

    /// <summary>Unique per workflow and application when set: "once", or a time trigger's repeat number.</summary>
    public string? DedupeKey { get; set; }

    /// <summary>Details from the event as JSON, for example {"interviewId":"…"}.</summary>
    public string? ContextJson { get; set; }

    /// <summary>How many workflows led to this one (0 for a person's action). Stops two workflows feeding each other.</summary>
    public int Depth { get; set; }
    public WorkflowRunStatus Status { get; set; } = WorkflowRunStatus.Running;
    public string? CurrentNodeId { get; set; }
    public DateTimeOffset NextRunAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LockedUntil { get; set; }

    /// <summary>Failed tries of the current step; reset when a step succeeds.</summary>
    public int Attempts { get; set; }
    public string? LastError { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; set; }
    public List<WorkflowStepRun> Steps { get; set; } = [];
}

/// <summary>What one step did in one run. One row per step: a retry updates it.</summary>
public sealed class WorkflowStepRun
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RunId { get; set; }
    public WorkflowRun? Run { get; set; }
    public required string NodeId { get; set; }
    public required string Kind { get; set; }

    /// <summary>Done, Skipped, Waiting or Failed.</summary>
    public string Status { get; set; } = "Done";

    /// <summary>The path a check or split took ("yes", "no", "v:Sales", "other").</summary>
    public string? Branch { get; set; }

    /// <summary>One plain sentence: "Emailed jordan@example.com: “Your interview”".</summary>
    public string? Output { get; set; }

    /// <summary>What was written, as JSON: emails (outbox id, recipient, subject), webhook delivery id.</summary>
    public string? DetailJson { get; set; }
    public string? Error { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset StartedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? FinishedAt { get; set; }
}
