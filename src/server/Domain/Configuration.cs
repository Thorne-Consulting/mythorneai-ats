namespace MyThorneAI.Ats.Api.Domain;

public sealed class PipelineTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    // Comma-free ordered list of stage names. The last stage named Hired is terminal.
    public string[] StageNames { get; set; } = [];
    public bool IsDefault { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
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
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
