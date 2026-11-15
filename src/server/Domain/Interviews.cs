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

    /// <summary>How people meet (see <see cref="MeetingTypes"/>). Null on older rows: a link if there is one.</summary>
    public string? MeetingType { get; set; }

    /// <summary>The address for an on-site interview, or the number to call for a phone one.</summary>
    public string? Location { get; set; }

    /// <summary>Sessions booked together for one candidate on one day (a panel loop) share this.</summary>
    public Guid? LoopId { get; set; }

    /// <summary>The scheduling link the candidate booked this through, if any.</summary>
    public Guid? SchedulingRequestId { get; set; }

    /// <summary>What each invited person answered on the calendar invite, as JSON: {"email":"accepted"}.</summary>
    public string? AttendeeResponsesJson { get; set; }
    public string[] InterviewerEmails { get; set; } = [];
    public InterviewStatus Status { get; set; } = InterviewStatus.Scheduled;
    public string CalendarStatus { get; set; } = "NotConfigured";
    public string? CalendarProvider { get; set; }
    public string? ExternalEventId { get; set; }

    /// <summary>Whose connected calendar holds the event. Updates and cancels go through them.</summary>
    public string? OrganizerEmail { get; set; }
    public string? CalendarError { get; set; }

    /// <summary>Raised on every change so calendar apps update one entry instead of adding another.</summary>
    public int IcsSequence { get; set; }
    public string? CancelReason { get; set; }
    public string? CancelledBy { get; set; }
    public DateTimeOffset? CancelledAt { get; set; }

    /// <summary>When someone (or the sweep, a day after the end) said how it went.</summary>
    public DateTimeOffset? OutcomeAt { get; set; }
    public string? OutcomeBy { get; set; }

    /// <summary>"Candidate" or "Interviewer" when the interview is a no-show.</summary>
    public string? NoShowParty { get; set; }
    public string? OutcomeNote { get; set; }
    public string? MeetingNotes { get; set; }
    public string? MeetingNotesSource { get; set; }
    public DateTimeOffset? MeetingNotesUpdatedAt { get; set; }
    public DateTimeOffset? LastScorecardReminderAt { get; set; }
    public int ScorecardReminderCount { get; set; }
    public DateTimeOffset? LastBookingReminderAt { get; set; }
    public int BookingReminderCount { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
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

    /// <summary>Goes up on every saved change. Interviews keep the version they were scheduled with.</summary>
    public int Version { get; set; } = 1;

    /// <summary>
    /// Set on a frozen earlier version: the kit it is a version of. The kit itself has null. When a kit
    /// that interviews use is edited, its old content and those interviews move to a frozen row.
    /// </summary>
    public Guid? VersionOfId { get; set; }

    /// <summary>The stage this kit is for, so scheduling can pick it.</summary>
    public Guid? PipelineStageId { get; set; }

    /// <summary>
    /// People who can run this round. The scheduler suggests <see cref="PoolPick"/> of them, taking
    /// turns fairly and preferring people who are free and lightly booked. Not versioned: who
    /// interviews is not part of what is asked.
    /// </summary>
    public string[] PoolEmails { get; set; } = [];
    public int PoolPick { get; set; } = 1;
    public DateTimeOffset? ArchivedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? UpdatedBy { get; set; }
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

    /// <summary>Follow-up prompts for the interviewer.</summary>
    public string FollowUps { get; set; } = "";
    public int Weight { get; set; } = 1;
    public int SortOrder { get; set; }

    /// <summary>
    /// The same in every version of the kit, so a renamed competency is still the same one. Empty on
    /// rows from before versions, which use their Id (see InterviewKits.CompetencyOf).
    /// </summary>
    public Guid CompetencyId { get; set; }
    public List<ScorecardCriterionRating> Ratings { get; set; } = [];
}

public sealed class Scorecard
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string InterviewerEmail { get; set; }

    /// <summary>Set when a recruiter submitted this for the interviewer (for example, feedback sent by email).</summary>
    public string? SubmittedBy { get; set; }
    public Recommendation Recommendation { get; set; }

    /// <summary>The weighted competency score, rounded; the recommendation's value when the kit has none.</summary>
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
    public string? Transcript { get; set; }
    public DateTimeOffset RecordedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Uploading (chunks arriving), Processing, Ready or Failed. Older rows are Ready.</summary>
    public string Status { get; set; } = RecordingStatus.Ready;

    /// <summary>Browser (recorded here) or Upload (a file from Zoom, Teams or Meet).</summary>
    public string Source { get; set; } = "Browser";
    public int? DurationSeconds { get; set; }
    public int ChunksReceived { get; set; }
    public DateTimeOffset? LastChunkAt { get; set; }

    /// <summary>A small audio-only copy for transcription, when ffmpeg is installed.</summary>
    public string? AudioStoredFileName { get; set; }
    public string? ProcessingError { get; set; }

    /// <summary>None, Queued, Running, Ready, Failed or TooLong.</summary>
    public string TranscriptStatus { get; set; } = RecordingStatus.TranscriptNone;
    public string? TranscriptError { get; set; }

    /// <summary>[{"start":1.2,"end":4.5,"speaker":"A","text":"..."}], seconds from the start.</summary>
    public string? SegmentsJson { get; set; }

    /// <summary>Who each speaker label is, as JSON: {"A":"Jordan Lee","B":"Sam Ortiz (candidate)"}.</summary>
    public string? SpeakerNamesJson { get; set; }
    public string? TranscriptModel { get; set; }
    public DateTimeOffset? TranscribedAt { get; set; }
}

public static class RecordingStatus
{
    public const string Uploading = "Uploading";
    public const string Processing = "Processing";
    public const string Ready = "Ready";
    public const string Failed = "Failed";
    public const string TranscriptNone = "None";
    public const string TranscriptQueued = "Queued";
    public const string TranscriptRunning = "Running";
    public const string TranscriptTooLong = "TooLong";

    /// <summary>Source of a transcript imported from a file, with no recording behind it.</summary>
    public const string TranscriptSource = "Transcript";
}

public static class MeetingTypes
{
    public const string GoogleMeet = "GoogleMeet";
    public const string Teams = "Teams";
    public const string Link = "Link";
    public const string Phone = "Phone";
    public const string InPerson = "InPerson";
    public static readonly string[] All = [GoogleMeet, Teams, Link, Phone, InPerson];
}

/// <summary>
/// One interviewer's private notes for one interview: a general note (no criterion, no question),
/// a note per kit question, or a question they added (for example from "Suggest questions").
/// Only the author reads them.
/// </summary>
public sealed class InterviewNote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string AuthorEmail { get; set; }
    public Guid? CriterionId { get; set; }
    public string? Question { get; set; }
    public string Body { get; set; } = "";
    public bool Covered { get; set; }
    public int SortOrder { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>An AI summary of one interview. Each regeneration adds a row; the newest is shown.</summary>
public sealed class InterviewSummary
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid InterviewId { get; set; }
    public Interview? Interview { get; set; }
    public required string Body { get; set; }
    public required string Model { get; set; }

    /// <summary>What it was written from, in plain words ("transcript, 2 scorecards").</summary>
    public string Sources { get; set; } = "";
    public string? Reason { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? EditedBy { get; set; }
    public DateTimeOffset? EditedAt { get; set; }
}

/// <summary>
/// A self-scheduling link: the candidate picks one of the offered times, or any free time in a
/// window, with no sign-in. Booking creates the interview; the same link then moves or cancels it.
/// </summary>
public sealed class SchedulingRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }
    public Guid? InterviewKitId { get; set; }
    public required string Title { get; set; }
    public int DurationMinutes { get; set; }
    public string[] InterviewerEmails { get; set; } = [];

    /// <summary>Specific start times offered. Empty means "any free time between WindowStart and WindowEnd".</summary>
    public DateTimeOffset[] OfferedStarts { get; set; } = [];
    public DateTimeOffset WindowStart { get; set; }
    public DateTimeOffset WindowEnd { get; set; }
    public int MinimumNoticeHours { get; set; } = 12;
    public string? MeetingType { get; set; }
    public string? MeetingLink { get; set; }
    public string? Location { get; set; }
    public string? MessageToCandidate { get; set; }

    /// <summary>The zone the team scheduled in; the booked interview keeps it.</summary>
    public required string TimeZone { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }

    /// <summary>Open, Booked or Cancelled. Expiry is read from ExpiresAt.</summary>
    public string Status { get; set; } = SchedulingRequestStatus.Open;
    public Guid? InterviewId { get; set; }
    public string? CandidateNote { get; set; }
    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? BookedAt { get; set; }
    public DateTimeOffset? LastReminderAt { get; set; }
    public int ReminderCount { get; set; }
}

public static class SchedulingRequestStatus
{
    public const string Open = "Open";
    public const string Booked = "Booked";
    public const string Cancelled = "Cancelled";
}
