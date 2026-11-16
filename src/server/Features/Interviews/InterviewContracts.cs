using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record ScheduleInterviewRequest(
    string Title,
    Guid? InterviewKitId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? MeetingLink,
    string[] InterviewerEmails,
    InterviewStatus Status = InterviewStatus.Scheduled,
    string? MeetingType = null,
    string? Location = null,
    string? MessageToCandidate = null,
    bool NotifyCandidate = true,
    bool NotifyInterviewers = true
);

public sealed record UpdateInterviewRequest(
    string Title,
    Guid? InterviewKitId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? MeetingLink,
    string[] InterviewerEmails,
    InterviewStatus Status,
    string? Reason = null,
    bool Notify = true,
    string? MeetingType = null,
    string? Location = null
);

/// <summary>Cancel from the team side. The reason is required; the message goes to the candidate.</summary>
public sealed record CancelInterviewRequest(
    string Reason,
    string? MessageToCandidate = null,
    bool NotifyCandidate = true
);

/// <summary>How an interview that has started went: "Completed" or "NoShow".</summary>
public sealed record InterviewOutcomeRequest(
    string Outcome,
    string? NoShowParty = null,
    string? Note = null,
    bool NotifyCandidate = false
);

/// <summary>Weekly hours are weekday number (0 = Sunday) to ranges like ["09:00", "17:00"].</summary>
public sealed record UpdateAvailabilityRequest(
    string? TimeZone,
    Dictionary<string, string[][]>? Hours,
    int BufferMinutes,
    int? MaxInterviewsPerDay,
    int? MaxInterviewsPerWeek
);

public sealed record BookInterviewRequest(DateTimeOffset? StartsAt, DateTimeOffset? EndsAt);

public sealed record UpdateMeetingNotesRequest(string Notes, string? Source);

public sealed record ScorecardCriterionRatingRequest(Guid CriterionId, int Rating, string Evidence);

/// <summary>One round to find times for: its panel and length. Key ties the answer back to the round.</summary>
public sealed record SuggestionRound(string Key, string[] InterviewerEmails, int DurationMinutes);

/// <summary>Several rounds are searched as a loop: back to back on one day, with the break between.</summary>
public sealed record SchedulingSuggestionsRequest(
    SuggestionRound[] Rounds,
    DateTimeOffset From,
    DateTimeOffset To,
    string? TimeZone = null,
    int BreakMinutes = 0,
    Guid? IgnoreInterviewId = null
);

public sealed record ScheduleSession(
    string Title,
    Guid? InterviewKitId,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string[] InterviewerEmails
);

/// <summary>Book one interview, or several back to back (a loop). Preview returns the emails without saving.</summary>
public sealed record ScheduleInterviewsRequest(
    ScheduleSession[] Sessions,
    string TimeZone,
    string? MeetingType = null,
    string? MeetingLink = null,
    string? Location = null,
    string? MessageToCandidate = null,
    bool NotifyCandidate = true,
    bool NotifyInterviewers = true,
    bool Preview = false
);

/// <summary>
/// A self-scheduling link. With OfferedStarts the candidate picks one of them; without, any free time
/// between WindowStart and WindowEnd.
/// </summary>
public sealed record CreateSchedulingLinkRequest(
    string Title,
    Guid? InterviewKitId,
    int DurationMinutes,
    string[] InterviewerEmails,
    string TimeZone,
    DateTimeOffset[]? OfferedStarts = null,
    DateTimeOffset? WindowStart = null,
    DateTimeOffset? WindowEnd = null,
    int MinimumNoticeHours = 12,
    int ExpiresInDays = 7,
    string? MeetingType = null,
    string? MeetingLink = null,
    string? Location = null,
    string? MessageToCandidate = null,
    bool NotifyCandidate = true,
    bool Preview = false
);

public sealed record PublicBookingRequest(DateTimeOffset StartsAt, string? TimeZone, string? Note);

public sealed record PublicBookingCancelRequest(string? Reason);

/// <summary>One of my notes: general (no criterion, no question), on a kit question, or on a question I added.</summary>
public sealed record InterviewNoteItem(
    Guid? CriterionId,
    string? Question,
    string? Body,
    bool Covered
);

public sealed record SaveInterviewNotesRequest(InterviewNoteItem[] Items);

public sealed record StartRecordingRequest(
    bool ConsentConfirmed,
    string? FileName,
    string? ContentType,
    string? Source
);

public sealed record CompleteRecordingRequest(int? DurationSeconds);

public sealed record RegenerateSummaryRequest(string? Reason);

public sealed record UpdateSummaryRequest(string Body);
