namespace MyThorneAI.Ats.Api.Domain;

public sealed class Requisition
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Title { get; set; }
    public required string Department { get; set; }
    public required string Location { get; set; }
    public required string EmploymentType { get; set; }
    public required string WorkMode { get; set; }
    public int Openings { get; set; } = 1;
    public required string OwnerEmail { get; set; }
    public required string RecruiterEmail { get; set; }
    public string Description { get; set; } = "";
    public RequisitionStatus Status { get; set; } = RequisitionStatus.Draft;
    public DateOnly? TargetStartDate { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<PipelineStage> Stages { get; set; } = [];
    public List<InterviewKit> InterviewKits { get; set; } = [];
    public List<Application> Applications { get; set; } = [];
}

public sealed class PipelineStage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public required string Name { get; set; }
    public int SortOrder { get; set; }
    public required string Color { get; set; }
    public bool IsTerminal { get; set; }
    public List<Application> Applications { get; set; } = [];
}
