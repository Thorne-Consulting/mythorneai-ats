namespace MyThorneAI.Ats.Api.Domain;

public sealed class Interview
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public Guid? InterviewKitId { get; set; }
    public InterviewKit? InterviewKit { get; set; }
    public required string Title { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public required string TimeZone { get; set; }
    public string? MeetingLink { get; set; }
    public string[] InterviewerEmails { get; set; } = [];
    public InterviewStatus Status { get; set; } = InterviewStatus.Scheduled;
    public string CalendarStatus { get; set; } = "NotConfigured";
    public string? CalendarProvider { get; set; }
    public string? ExternalEventId { get; set; }
    public string? CalendarError { get; set; }
    public string? MeetingNotes { get; set; }
    public string? MeetingNotesSource { get; set; }
    public DateTimeOffset? MeetingNotesUpdatedAt { get; set; }
    public List<Scorecard> Scorecards { get; set; } = [];
    public List<InterviewRecording> Recordings { get; set; } = [];
}

public sealed class InterviewKit
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RequisitionId { get; set; }
    public Requisition? Requisition { get; set; }
    public required string Name { get; set; }
    public string Instructions { get; set; } = "";
    public int DurationMinutes { get; set; } = 60;
    public int SortOrder { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<InterviewCriterion> Criteria { get; set; } = [];
    public List<Interview> Interviews { get; set; } = [];
}

public sealed class InterviewCriterion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewKitId { get; set; }
    public InterviewKit? InterviewKit { get; set; }
    public required string Name { get; set; }
    public required string Question { get; set; }
    public string Description { get; set; } = "";
    public int Weight { get; set; } = 1;
    public int SortOrder { get; set; }
    public List<ScorecardCriterionRating> Ratings { get; set; } = [];
}

public sealed class Scorecard
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string InterviewerEmail { get; set; }
    public Recommendation Recommendation { get; set; }
    public int Rating { get; set; }
    public required string Evidence { get; set; }
    public required string Strengths { get; set; }
    public required string Concerns { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<ScorecardCriterionRating> CriterionRatings { get; set; } = [];
}

public sealed class ScorecardCriterionRating
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ScorecardId { get; set; }
    public Scorecard? Scorecard { get; set; }
    public Guid InterviewCriterionId { get; set; }
    public InterviewCriterion? InterviewCriterion { get; set; }
    public int Rating { get; set; }
    public required string Evidence { get; set; }
}

public sealed class InterviewRecording
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StoredFileName { get; set; }
    public required string ContentType { get; set; }
    public long Length { get; set; }
    public required string UploadedBy { get; set; }
    public bool ConsentConfirmed { get; set; }
    public DateTimeOffset RecordedAt { get; set; } = DateTimeOffset.UtcNow;
}
