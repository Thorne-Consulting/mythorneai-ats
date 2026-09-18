using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

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

public sealed record UpdateMeetingNotesRequest(string Notes, string? Source);

public sealed record SubmitScorecardRequest(
    Recommendation Recommendation,
    int Rating,
    string Evidence,
    string Strengths,
    string Concerns,
    ScorecardCriterionRatingRequest[]? Criteria
);

public sealed record ScorecardCriterionRatingRequest(Guid CriterionId, int Rating, string Evidence);
