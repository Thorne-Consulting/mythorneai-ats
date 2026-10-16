namespace MyThorneAI.Ats.Api.Domain;

public sealed class StageTransition
{
    public long Id { get; set; }
    public Guid ApplicationId { get; set; }
    public Guid RequisitionId { get; set; }
    public Guid? FromStageId { get; set; }
    public Guid ToStageId { get; set; }
    public ApplicationStatus? FromStatus { get; set; }
    public ApplicationStatus ToStatus { get; set; }
    public string? ActorEmail { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class SavedView
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string OwnerEmail { get; set; }
    public required string Area { get; set; }
    public required string Name { get; set; }
    public required string ParamsJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
