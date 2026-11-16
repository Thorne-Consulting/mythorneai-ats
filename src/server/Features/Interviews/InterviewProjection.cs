using System.Linq.Expressions;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Interviews;

public sealed class InterviewCriterionView
{
    public Guid Id { get; init; }
    public required string Name { get; init; }
    public required string Question { get; init; }
    public required string Description { get; init; }
    public int Weight { get; init; }
    public int SortOrder { get; init; }
}

public sealed class InterviewScorecardView
{
    public Guid Id { get; init; }
    public required string InterviewerEmail { get; init; }
    public string? SubmittedBy { get; init; }
    public required string Recommendation { get; init; }
    public int Rating { get; init; }
    public required string Evidence { get; init; }
    public required string Strengths { get; init; }
    public required string Concerns { get; init; }
    public DateTimeOffset SubmittedAt { get; init; }
    public required IEnumerable<InterviewCriterionRatingView> Criteria { get; init; }
}

public sealed class InterviewCriterionRatingView
{
    public Guid CriterionId { get; init; }
    public required string CriterionName { get; init; }
    public int Rating { get; init; }
    public required string Evidence { get; init; }
}

public sealed class InterviewRecordingView
{
    public Guid Id { get; init; }
    public required string OriginalFileName { get; init; }
    public required string ContentType { get; init; }
    public long Length { get; init; }
    public required string UploadedBy { get; init; }
    public bool ConsentConfirmed { get; init; }
    public string? Transcript { get; init; }
    public DateTimeOffset RecordedAt { get; init; }
    public required string Status { get; init; }
    public required string Source { get; init; }
    public int? DurationSeconds { get; init; }
    public string? ProcessingError { get; init; }

    /// <summary>Null while the reader may not see the transcript (blinded).</summary>
    public string? TranscriptStatus { get; init; }
    public string? TranscriptError { get; init; }
}

/// <summary>One interview as the application record and the interview page both show it.</summary>
public sealed class InterviewDetailView
{
    public Guid Id { get; init; }
    public Guid ApplicationId { get; init; }
    public required string Title { get; init; }
    public Guid? InterviewKitId { get; init; }
    public string? InterviewKitName { get; init; }
    public string? InterviewKitInstructions { get; init; }
    public required IEnumerable<InterviewCriterionView> Criteria { get; init; }
    public DateTimeOffset StartsAt { get; init; }
    public DateTimeOffset EndsAt { get; init; }
    public required string TimeZone { get; init; }
    public string? MeetingLink { get; init; }
    public string? MeetingType { get; init; }
    public string? Location { get; init; }
    public Guid? LoopId { get; init; }
    public Guid? SchedulingRequestId { get; init; }

    /// <summary>{"email":"accepted"|"declined"|"tentative"|"needsAction"} from the calendar invite.</summary>
    public string? AttendeeResponsesJson { get; init; }
    public required string[] InterviewerEmails { get; init; }
    public required string CalendarStatus { get; init; }
    public string? CalendarProvider { get; init; }
    public string? CalendarError { get; init; }
    public required string Status { get; init; }
    public string? CancelReason { get; init; }
    public string? CancelledBy { get; init; }
    public DateTimeOffset? CancelledAt { get; init; }
    public DateTimeOffset? OutcomeAt { get; init; }
    public string? OutcomeBy { get; init; }
    public string? NoShowParty { get; init; }
    public string? OutcomeNote { get; init; }

    /// <summary>False when you are on the panel and have not sent your scorecard yet.</summary>
    public bool NotesVisible { get; init; }
    public string? MeetingNotes { get; init; }
    public string? MeetingNotesSource { get; init; }
    public DateTimeOffset? MeetingNotesUpdatedAt { get; init; }
    public int SubmittedScorecards { get; init; }
    public required IEnumerable<string> SubmittedEmails { get; init; }
    public bool ScorecardsVisible { get; init; }
    public DateTimeOffset CreatedAt { get; init; }
    public required IEnumerable<InterviewScorecardView> Scorecards { get; init; }
    public required IEnumerable<InterviewRecordingView> Recordings { get; init; }
}

public static class InterviewProjection
{
    /// <summary>
    /// The interview for one reader. While the reader owes a scorecard on this application
    /// (<paramref name="blinded"/>, from BlindingInterviewsAsync) they see nobody else's scorecard,
    /// and no shared notes or transcripts, so nothing anchors their own view. Same rule as the
    /// application record.
    /// </summary>
    public static Expression<Func<Interview, InterviewDetailView>> Detail(
        string email,
        bool canSeeHiringDetails,
        bool blinded
    ) =>
        i => new InterviewDetailView
        {
            Id = i.Id,
            ApplicationId = i.ApplicationId,
            Title = i.Title,
            InterviewKitId = i.InterviewKitId,
            InterviewKitName =
                i.InterviewKit == null ? null
                : i.InterviewKit.VersionOfId == null ? i.InterviewKit.Name
                : i.InterviewKit.Name + " (version " + i.InterviewKit.Version.ToString() + ")",
            InterviewKitInstructions = i.InterviewKit == null ? null : i.InterviewKit.Instructions,
            Criteria = i.InterviewKit!.Criteria.OrderBy(c => c.SortOrder)
                .Select(c => new InterviewCriterionView
                {
                    Id = c.Id,
                    Name = c.Name,
                    Question = c.Question,
                    Description = c.Description,
                    Weight = c.Weight,
                    SortOrder = c.SortOrder,
                }),
            StartsAt = i.StartsAt,
            EndsAt = i.EndsAt,
            TimeZone = i.TimeZone,
            MeetingLink = i.MeetingLink,
            MeetingType = i.MeetingType,
            Location = i.Location,
            LoopId = i.LoopId,
            SchedulingRequestId = i.SchedulingRequestId,
            AttendeeResponsesJson = i.AttendeeResponsesJson,
            InterviewerEmails = i.InterviewerEmails,
            CalendarStatus = i.CalendarStatus,
            CalendarProvider = i.CalendarProvider,
            CalendarError = canSeeHiringDetails ? i.CalendarError : null,
            Status = i.Status.ToString(),
            CancelReason = i.CancelReason,
            CancelledBy = i.CancelledBy,
            CancelledAt = i.CancelledAt,
            OutcomeAt = i.OutcomeAt,
            OutcomeBy = i.OutcomeBy,
            NoShowParty = i.NoShowParty,
            OutcomeNote = canSeeHiringDetails ? i.OutcomeNote : null,
            NotesVisible = !blinded,
            MeetingNotes = blinded ? null : i.MeetingNotes,
            MeetingNotesSource = blinded ? null : i.MeetingNotesSource,
            MeetingNotesUpdatedAt = i.MeetingNotesUpdatedAt,
            SubmittedScorecards = i.Scorecards.Count,
            SubmittedEmails = i.Scorecards.Select(s => s.InterviewerEmail),
            ScorecardsVisible = !blinded,
            CreatedAt = i.CreatedAt,
            Scorecards = i
                .Scorecards.Where(s => !blinded || s.InterviewerEmail == email)
                .OrderBy(s => s.SubmittedAt)
                .Select(s => new InterviewScorecardView
                {
                    Id = s.Id,
                    InterviewerEmail = s.InterviewerEmail,
                    SubmittedBy = s.SubmittedBy,
                    Recommendation = s.Recommendation.ToString(),
                    Rating = s.Rating,
                    Evidence = s.Evidence,
                    Strengths = s.Strengths,
                    Concerns = s.Concerns,
                    SubmittedAt = s.SubmittedAt,
                    Criteria = s
                        .CriterionRatings.OrderBy(r => r.InterviewCriterion!.SortOrder)
                        .Select(r => new InterviewCriterionRatingView
                        {
                            CriterionId = r.InterviewCriterionId,
                            CriterionName = r.InterviewCriterion!.Name,
                            Rating = r.Rating,
                            Evidence = r.Evidence,
                        }),
                }),
            Recordings = i
                .Recordings.OrderByDescending(r => r.RecordedAt)
                .Select(r => new InterviewRecordingView
                {
                    Id = r.Id,
                    OriginalFileName = r.OriginalFileName,
                    ContentType = r.ContentType,
                    Length = r.Length,
                    UploadedBy = r.UploadedBy,
                    ConsentConfirmed = r.ConsentConfirmed,
                    Transcript = blinded ? null : r.Transcript,
                    RecordedAt = r.RecordedAt,
                    Status = r.Status,
                    Source = r.Source,
                    DurationSeconds = r.DurationSeconds,
                    ProcessingError = r.ProcessingError,
                    TranscriptStatus = blinded ? null : r.TranscriptStatus,
                    TranscriptError = blinded ? null : r.TranscriptError,
                }),
        };
}
