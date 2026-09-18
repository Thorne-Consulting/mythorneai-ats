namespace MyThorneAI.Ats.Api.Domain;

public enum UserRole
{
    Admin,
    Recruiter,
    HiringManager,
    Interviewer,
}

public enum RequisitionStatus
{
    Draft,
    Open,
    OnHold,
    Filled,
    Closed,
    Cancelled,
}

public enum ApplicationStatus
{
    Active,
    Rejected,
    Withdrawn,
    Hired,
}

public enum InterviewStatus
{
    Scheduled,
    Completed,
    Cancelled,
    NoShow,
}

public enum Recommendation
{
    StrongNo,
    No,
    Mixed,
    Yes,
    StrongYes,
}

public enum IntegrationOperation
{
    CreateCalendarEvent,
    CancelCalendarEvent,
}

public enum IntegrationOutboxStatus
{
    Pending,
    Processing,
    Succeeded,
    Failed,
}
