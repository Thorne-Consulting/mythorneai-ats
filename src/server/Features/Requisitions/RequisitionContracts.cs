using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record CreateRequisitionRequest(
    string Code,
    string Title,
    string Department,
    string Location,
    string EmploymentType,
    string WorkMode,
    int Openings,
    string OwnerEmail,
    string RecruiterEmail,
    string Description,
    DateOnly? TargetStartDate
);

public sealed record UpdateRequisitionRequest(
    string Title,
    string Department,
    string Location,
    string EmploymentType,
    string WorkMode,
    int Openings,
    string OwnerEmail,
    string RecruiterEmail,
    string Description,
    DateOnly? TargetStartDate
);

public sealed record ChangeRequisitionStatusRequest(RequisitionStatus Status, string? Reason);

public sealed record CreateInterviewKitRequest(
    string Name,
    string Instructions,
    int DurationMinutes,
    InterviewCriterionRequest[]? Criteria
);

public sealed record InterviewCriterionRequest(
    string Name,
    string Question,
    string Description,
    int Weight
);
