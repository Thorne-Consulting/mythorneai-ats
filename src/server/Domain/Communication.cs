namespace MyThorneAI.Ats.Api.Domain;

public sealed class EmailTemplate
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Key { get; set; }
    // Null means the organization-wide template; set means an override for one job.
    public Guid? RequisitionId { get; set; }
    public required string Subject { get; set; }
    public required string Body { get; set; }
    public int Version { get; set; } = 1;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class ApplicationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public bool FromCandidate { get; set; }
    public required string Body { get; set; }
    public string? AuthorEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ReadAt { get; set; }
}
