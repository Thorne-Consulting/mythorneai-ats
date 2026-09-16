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
    DateOnly? TargetStartDate);

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
    DateOnly? TargetStartDate);

public sealed record ChangeRequisitionStatusRequest(RequisitionStatus Status, string? Reason);

public sealed record CreateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags);

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
    bool DoNotContact);

public sealed record CreateApplicationRequest(Guid CandidateId, Guid RequisitionId, string Source);
public sealed record MoveApplicationRequest(Guid StageId, ApplicationStatus Status, string? DispositionReason);
public sealed record AddNoteRequest(string Body, bool IsPrivate);
public sealed record CreateTaskRequest(Guid? ApplicationId, string Title, string AssigneeEmail, DateOnly? DueDate);
public sealed record CompleteTaskRequest(bool IsCompleted);

public sealed record ScheduleInterviewRequest(
    string Title,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? MeetingLink,
    string[] InterviewerEmails);

public sealed record SubmitScorecardRequest(Recommendation Recommendation, int Rating, string Evidence);
public sealed record CreateOfferRequest(decimal BaseSalary, string Currency, DateOnly StartDate);
public sealed record ChangeOfferStatusRequest(OfferStatus Status);
public sealed record LogCommunicationRequest(string Subject, string Body);
public sealed record UpsertUserRequest(string Email, string DisplayName, UserRole Role, string? Department, bool IsActive);
