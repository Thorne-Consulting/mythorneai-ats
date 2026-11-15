namespace MyThorneAI.Ats.Api.Domain;

public sealed class PipelineTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }

    // Legacy: stage names from before template stages, kept as a copy of Stages' names. A pipeline
    // with names and no Stages rows is converted by StageRules.BackfillAsync. Drop it next wave.
    public string[] StageNames { get; set; } = [];

    // The stages before Hired, which every job gets at the end.
    public List<PipelineTemplateStage> Stages { get; set; } = [];
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class PipelineTemplateStage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PipelineTemplateId { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public StageType Type { get; set; } = StageType.Other;
    public required string CandidateLabel { get; set; }
    public StageEmail EmailOnEntry { get; set; } = StageEmail.Off;
    public int? TargetDays { get; set; }

    // Copied to each job's stage (PipelineStage.AssessmentId).
    public Guid? AssessmentId { get; set; }
}

public sealed class CustomFieldDefinition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Key { get; set; }
    public required string Label { get; set; }
    // text, number, date, or select
    public string Type { get; set; } = "text";
    public string[] Options { get; set; } = [];
    public int SortOrder { get; set; }
}

public sealed class WebhookEndpoint
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Url { get; set; }
    public required string Secret { get; set; }
    public string[] Events { get; set; } = [];
    public bool IsActive { get; set; } = true;

    // After a rotation the old secret still signs (as a second signature) until it expires.
    public string? PreviousSecret { get; set; }
    public DateTimeOffset? PreviousSecretExpiresAt { get; set; }

    // Set at the first failure after a success; three days of only failures pauses the endpoint.
    public DateTimeOffset? FailingSince { get; set; }
    public string? DisabledReason { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class WebhookDelivery
{
    public Guid Id { get; set; } = Guid.NewGuid();
    // Null for team notifications (Slack or Teams), which are plain unsigned posts.
    public Guid? EndpointId { get; set; }
    public WebhookEndpoint? Endpoint { get; set; }
    public required string Url { get; set; }
    public required string EventType { get; set; }
    public required string Payload { get; set; }
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LockedUntil { get; set; }
    public int? LastStatusCode { get; set; }
    public string? LastError { get; set; }

    // What the last attempt sent and got back, for the delivery drawer.
    public string? RequestHeaders { get; set; }
    public string? ResponseBody { get; set; }
    public int? DurationMs { get; set; }

    // JSON array of every attempt: [{"at":"...","status":200,"durationMs":120,"error":null}].
    public string? AttemptLog { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
