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

public sealed record CreateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags
);

public sealed record UpdateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags,
    bool DoNotContact
);

public sealed record CreateApplicationRequest(Guid CandidateId, Guid RequisitionId, string Source);

public sealed record MoveApplicationRequest(
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason
);

public sealed record BulkMoveApplicationsRequest(
    Guid[] ApplicationIds,
    Guid StageId,
    ApplicationStatus Status,
    string? DispositionReason
);

public sealed record AddNoteRequest(string Body, bool IsPrivate);

public sealed record ScheduleInterviewRequest(
    string Title,
    Guid? InterviewKitId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? MeetingLink,
    string[] InterviewerEmails
);

public sealed record UpdateInterviewRequest(
    string Title,
    Guid? InterviewKitId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? MeetingLink,
    string[] InterviewerEmails,
    InterviewStatus Status
);

public sealed record SubmitScorecardRequest(
    Recommendation Recommendation,
    int Rating,
    string Evidence,
    string Strengths,
    string Concerns,
    ScorecardCriterionRatingRequest[]? Criteria
);

public sealed record ScorecardCriterionRatingRequest(Guid CriterionId, int Rating, string Evidence);

public sealed record UpsertUserRequest(
    string Email,
    string DisplayName,
    UserRole Role,
    string? Department,
    bool IsActive
);
