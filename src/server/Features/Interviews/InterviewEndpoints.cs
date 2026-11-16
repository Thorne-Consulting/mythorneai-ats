using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapInterviews(RouteGroupBuilder api)
    {
        api.MapGet(
                "/interviews",
                async (
                    DateTimeOffset from,
                    DateTimeOffset to,
                    string? status,
                    bool? mine,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (to <= from || to - from > TimeSpan.FromDays(120))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["range"] =
                                [
                                    "Choose an end date after the start date, at most 120 days later.",
                                ],
                            }
                        );
                    InterviewStatus? only = null;
                    if (!string.IsNullOrWhiteSpace(status))
                    {
                        if (!Enum.TryParse<InterviewStatus>(status, true, out var parsed))
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["status"] = ["Unknown interview status."],
                                }
                            );
                        only = parsed;
                    }
                    var query = InterviewsFor(db, principal, mine == true)
                        .Where(x => x.StartsAt < to && x.EndsAt > from);
                    if (only is not null)
                        query = query.Where(x => x.Status == only);
                    return Results.Ok(await ListAsync(db, query.OrderBy(x => x.StartsAt), ct));
                }
            )
            .RequireAuthorization();

        // What a recruiter has to act on: ended without an outcome, calendar problems, and times the
        // candidate has not confirmed yet.
        api.MapGet(
                "/interviews/attention",
                async (
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var now = DateTimeOffset.UtcNow;
                    var mine = InterviewsFor(db, principal, false);
                    var needsOutcome = await ListAsync(
                        db,
                        mine.Where(x =>
                                x.Status == InterviewStatus.Scheduled
                                && x.EndsAt < now
                                && x.EndsAt > now.AddDays(-30)
                            )
                            .OrderBy(x => x.EndsAt),
                        ct
                    );
                    var calendarProblems = await ListAsync(
                        db,
                        mine.Where(x =>
                                x.Status == InterviewStatus.Scheduled
                                && x.EndsAt > now
                                && (
                                    x.CalendarStatus == "Failed"
                                    || x.CalendarStatus == "Disconnected"
                                )
                            )
                            .OrderBy(x => x.StartsAt),
                        ct
                    );
                    var waiting = await ListAsync(
                        db,
                        mine.Where(x => x.Status == InterviewStatus.Proposed && x.EndsAt > now)
                            .OrderBy(x => x.StartsAt),
                        ct
                    );
                    var declined = await ListAsync(
                        db,
                        mine.Where(x =>
                                x.Status == InterviewStatus.Scheduled
                                && x.EndsAt > now
                                && x.AttendeeResponsesJson != null
                                && x.AttendeeResponsesJson.Contains("\"declined\"")
                            )
                            .OrderBy(x => x.StartsAt),
                        ct
                    );
                    var applicationIds = ScopeApplications(
                            db.Applications.AsNoTracking(),
                            principal
                        )
                        .Select(x => x.Id);
                    var links = await db
                        .SchedulingRequests.AsNoTracking()
                        .Where(x =>
                            x.Status == SchedulingRequestStatus.Open
                            && x.ExpiresAt > now
                            && applicationIds.Contains(x.ApplicationId)
                        )
                        .OrderBy(x => x.CreatedAt)
                        .Take(50)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.CreatedAt,
                            x.ExpiresAt,
                            x.ReminderCount,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            Requisition = x.Application.Requisition!,
                        })
                        .ToListAsync(ct);
                    // A booking link is a key: only the people who run the job get it.
                    var openLinks = new List<object>();
                    foreach (var link in links.Where(x => CanManage(x.Requisition, principal)))
                        openLinks.Add(
                            new
                            {
                                link.Id,
                                link.ApplicationId,
                                link.Title,
                                link.CreatedAt,
                                link.ExpiresAt,
                                link.ReminderCount,
                                link.CandidateName,
                                RequisitionTitle = link.Requisition.Title,
                                Url = await mailer.BookingUrlAsync(link.Id, ct),
                            }
                        );
                    return Results.Ok(
                        new
                        {
                            NeedsOutcome = needsOutcome,
                            CalendarProblems = calendarProblems,
                            WaitingForCandidate = waiting,
                            OpenLinks = openLinks,
                            Declined = declined,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
                "/interviews/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var email = principal.Email();
                    var canSeeHiringDetails =
                        principal.IsHiringStaff()
                        || principal.IsInRole(nameof(UserRole.HiringManager));
                    var applicationIds = ScopeApplications(
                            db.Applications.AsNoTracking(),
                            principal
                        )
                        .Select(x => x.Id);
                    var header = await db
                        .Interviews.AsNoTracking()
                        .Where(x => x.Id == id && applicationIds.Contains(x.ApplicationId))
                        .Select(x => new
                        {
                            x.ApplicationId,
                            x.Application!.CandidateId,
                            CandidateName = x.Application.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            CandidateTitle = x.Application.Candidate.CurrentTitle,
                            CandidateTimeZone = x.Application.Candidate.TimeZone,
                            x.Application.RequisitionId,
                            RequisitionTitle = x.Application.Requisition!.Title,
                            RequisitionCode = x.Application.Requisition.Code,
                            Stage = x.Application.PipelineStage!.Name,
                        })
                        .SingleOrDefaultAsync(ct);
                    if (header is null)
                        return Results.NotFound();
                    var blindedBy = await BlindingInterviewsAsync(
                        db,
                        header.ApplicationId,
                        email,
                        ct
                    );
                    var interview = await db
                        .Interviews.AsNoTracking()
                        .Where(x => x.Id == id)
                        .Select(
                            InterviewProjection.Detail(
                                email,
                                canSeeHiringDetails,
                                blindedBy.Length > 0
                            )
                        )
                        .SingleAsync(ct);
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .Include(x => x.InterviewKits)
                        .SingleAsync(x => x.Id == header.RequisitionId, ct);
                    var canManage = CanManage(requisition, principal);
                    var named = interview
                        .InterviewerEmails.Append(interview.CancelledBy ?? "")
                        .Append(interview.OutcomeBy ?? "")
                        .Append(email)
                        .Where(x => x.Contains('@'))
                        .Distinct()
                        .ToArray();
                    var people = await db
                        .Users.AsNoTracking()
                        .Where(x => named.Contains(x.Email))
                        .ToDictionaryAsync(
                            x => x.Email,
                            x => new
                            {
                                Name = x.DisplayName,
                                x.TimeZone,
                                x.Role,
                            },
                            ct
                        );
                    var key = id.ToString();
                    var activity = await db
                        .AuditEvents.AsNoTracking()
                        .Where(x =>
                            x.EntityType == "Application"
                            && x.EntityId == header.ApplicationId.ToString()
                            && x.Details != null
                            && x.Details.Contains(key)
                        )
                        .OrderByDescending(x => x.OccurredAt)
                        .Take(20)
                        .Select(x => new
                        {
                            x.Action,
                            x.ActorEmail,
                            x.OccurredAt,
                        })
                        .ToListAsync(ct);
                    var organizationTimeZone = await db
                        .Organizations.Select(x => x.TimeZone)
                        .SingleOrDefaultAsync(ct);
                    return Results.Ok(
                        new
                        {
                            Interview = interview,
                            Candidate = new
                            {
                                Id = header.CandidateId,
                                Name = header.CandidateName,
                                Title = header.CandidateTitle,
                                TimeZone = header.CandidateTimeZone,
                            },
                            Job = new
                            {
                                Id = header.RequisitionId,
                                Title = header.RequisitionTitle,
                                Code = header.RequisitionCode,
                            },
                            header.Stage,
                            CanManage = canManage,
                            BlindedBy = blindedBy,
                            People = people,
                            Activity = activity,
                            OrganizationTimeZone = organizationTimeZone,
                            // Current kits, plus the version this interview uses (kits are versioned).
                            InterviewKits = canManage
                                ? requisition
                                    .InterviewKits.Where(k =>
                                        (k.VersionOfId == null && k.ArchivedAt == null)
                                        || k.Id == interview.InterviewKitId
                                    )
                                    .OrderBy(k => k.SortOrder)
                                    .Select(k => new
                                    {
                                        k.Id,
                                        k.Name,
                                        k.DurationMinutes,
                                    })
                                : null,
                        }
                    );
                }
            )
            .RequireAuthorization();

        api.MapPost(
                "/applications/{id:guid}/interviews",
                (
                    Guid id,
                    ScheduleInterviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                    // Offering times now goes through a scheduling link: one email, one hold, one booking.
                    request.Status != InterviewStatus.Scheduled
                        ? Task.FromResult(
                            Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["status"] =
                                    [
                                        "To let the candidate choose, send a scheduling link from the scheduler.",
                                    ],
                                }
                            )
                        )
                        : ScheduleCoreAsync(
                            id,
                            new ScheduleInterviewsRequest(
                                [
                                    new ScheduleSession(
                                        request.Title ?? "",
                                        request.InterviewKitId,
                                        request.StartsAt,
                                        request.EndsAt,
                                        request.InterviewerEmails ?? []
                                    ),
                                ],
                                request.TimeZone ?? "",
                                request.MeetingType,
                                request.MeetingLink,
                                request.Location,
                                request.MessageToCandidate,
                                request.NotifyCandidate,
                                request.NotifyInterviewers
                            ),
                            principal,
                            db,
                            integration,
                            mailer,
                            ct
                        )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/interviews/{id:guid}",
                async (
                    Guid id,
                    UpdateInterviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var interviewers = NormalizeEmails(request.InterviewerEmails);
                    if (
                        InvalidInterview(
                            request.Title,
                            request.StartsAt,
                            request.EndsAt,
                            request.TimeZone,
                            interviewers
                        ) is
                        { } invalid
                    )
                        return invalid;
                    var interview = await LoadForChangeAsync(db, id, ct);
                    if (
                        interview?.Application?.Requisition is null
                        || !CanManage(interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    // A reschedule keeps the kit it has (even an older version); a new pick must be current.
                    if (
                        request.InterviewKitId is not null
                        && request.InterviewKitId != interview.InterviewKitId
                        && !await db.InterviewKits.AnyAsync(
                            x =>
                                x.Id == request.InterviewKitId
                                && x.RequisitionId == interview.Application.RequisitionId
                                && x.VersionOfId == null
                                && x.ArchivedAt == null,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKitId"] = ["That interview kit belongs to another job."],
                            }
                        );

                    if (
                        request.Status == InterviewStatus.Cancelled
                        && interview.Status != InterviewStatus.Cancelled
                    )
                    {
                        await CancelAsync(
                            db,
                            integration,
                            mailer,
                            principal,
                            interview,
                            Clean(request.Reason) ?? "Cancelled",
                            null,
                            request.Notify,
                            ct
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.NoContent();
                    }

                    if (
                        MeetingErrors(request.MeetingType, request.MeetingLink, request.Location) is
                        { Count: > 0 } meetingErrors
                    )
                        return Results.ValidationProblem(meetingErrors);
                    var (type, link, location) = Meeting(
                        request.MeetingType,
                        request.MeetingLink,
                        request.Location
                    );
                    // A video room made by the calendar stays while the type stays; a new type makes a new room.
                    if (type is MeetingTypes.GoogleMeet or MeetingTypes.Teams)
                        link = type == interview.MeetingType ? interview.MeetingLink : null;
                    var previousStart = interview.StartsAt;
                    var previousEnd = interview.EndsAt;
                    var previousStatus = interview.Status;
                    var added = interviewers.Except(interview.InterviewerEmails).ToArray();
                    var moved = previousStart != request.StartsAt || previousEnd != request.EndsAt;
                    var changed =
                        moved
                        || interview.Title != request.Title.Trim()
                        || interview.MeetingLink != link
                        || interview.MeetingType != type
                        || interview.Location != location
                        || added.Length > 0
                        || interviewers.Length != interview.InterviewerEmails.Length;
                    interview.Title = request.Title.Trim();
                    interview.InterviewKitId = request.InterviewKitId;
                    interview.StartsAt = request.StartsAt;
                    interview.EndsAt = request.EndsAt;
                    interview.TimeZone = request.TimeZone.Trim();
                    interview.MeetingLink = link;
                    interview.MeetingType = type;
                    interview.Location = location;
                    interview.InterviewerEmails = interviewers;
                    interview.Status = request.Status;
                    if (changed)
                        interview.IcsSequence++;
                    if (
                        request.Status is InterviewStatus.Completed or InterviewStatus.NoShow
                        && previousStatus != request.Status
                    )
                    {
                        interview.OutcomeAt = DateTimeOffset.UtcNow;
                        interview.OutcomeBy = principal.Email();
                    }
                    if (request.Status == InterviewStatus.Scheduled && changed)
                        await CalendarOutbox.QueueAsync(
                            db,
                            integration,
                            interview,
                            IntegrationOperation.CreateCalendarEvent,
                            ct
                        );
                    if (request.Notify && request.Status == InterviewStatus.Scheduled)
                    {
                        var who = await DisplayNameAsync(db, principal.Email(), ct);
                        if (moved || previousStatus != InterviewStatus.Scheduled)
                            await mailer.QueueAsync(
                                interview,
                                previousStatus == InterviewStatus.Scheduled
                                    ? new InterviewMail(
                                        InterviewChange.Rescheduled,
                                        previousStart,
                                        previousEnd,
                                        Clean(request.Reason),
                                        ChangedBy: who
                                    )
                                    : new InterviewMail(InterviewChange.Scheduled),
                                ct
                            );
                        else if (added.Length > 0)
                            await mailer.QueueAsync(
                                interview,
                                new InterviewMail(
                                    InterviewChange.Scheduled,
                                    NotifyCandidate: false,
                                    OnlyInterviewers: added
                                ),
                                ct
                            );
                    }
                    interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        moved ? "InterviewRescheduled" : "InterviewUpdated",
                        new
                        {
                            interview.Id,
                            interview.StartsAt,
                            interview.Status,
                            Reason = Clean(request.Reason),
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/interviews/{id:guid}/cancel",
                async (
                    Guid id,
                    CancelInterviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Length > 300)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["reason"] = ["Say why the interview is cancelled."],
                            }
                        );
                    if (request.MessageToCandidate?.Length > 2000)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["messageToCandidate"] =
                                [
                                    "Keep the message under 2,000 characters.",
                                ],
                            }
                        );
                    var interview = await LoadForChangeAsync(db, id, ct);
                    if (
                        interview?.Application?.Requisition is null
                        || !CanManage(interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        interview.Status
                        is not (InterviewStatus.Scheduled or InterviewStatus.Proposed)
                    )
                        return Results.Conflict(
                            new { message = "Only a booked or offered interview can be cancelled." }
                        );
                    if (interview.EndsAt <= DateTimeOffset.UtcNow)
                        return Results.Conflict(
                            new
                            {
                                message = "This interview has ended. Mark it completed or as a no-show instead.",
                            }
                        );
                    await CancelAsync(
                        db,
                        integration,
                        mailer,
                        principal,
                        interview,
                        request.Reason.Trim(),
                        Clean(request.MessageToCandidate),
                        request.NotifyCandidate,
                        ct
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/interviews/{id:guid}/outcome",
                async (
                    Guid id,
                    InterviewOutcomeRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    if (
                        !Enum.TryParse<InterviewStatus>(request.Outcome, true, out var outcome)
                        || outcome is not (InterviewStatus.Completed or InterviewStatus.NoShow)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["outcome"] = ["Choose Completed or No-show."],
                            }
                        );
                    var party = Clean(request.NoShowParty);
                    if (
                        outcome == InterviewStatus.NoShow
                        && party is not ("Candidate" or "Interviewer")
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["noShowParty"] = ["Say who did not attend."],
                            }
                        );
                    if (request.Note?.Length > 2000)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["note"] = ["Keep the note under 2,000 characters."],
                            }
                        );
                    var interview = await LoadForChangeAsync(db, id, ct);
                    if (
                        interview?.Application?.Requisition is null
                        || !CanManage(interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        interview.Status
                        is not (
                            InterviewStatus.Scheduled
                            or InterviewStatus.Completed
                            or InterviewStatus.NoShow
                        )
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "Only a booked interview can be marked completed or as a no-show.",
                            }
                        );
                    if (interview.StartsAt > DateTimeOffset.UtcNow)
                        return Results.Conflict(
                            new
                            {
                                message = "You can say how it went once the interview has started.",
                            }
                        );
                    interview.Status = outcome;
                    interview.OutcomeAt = DateTimeOffset.UtcNow;
                    interview.OutcomeBy = principal.Email();
                    interview.NoShowParty = outcome == InterviewStatus.NoShow ? party : null;
                    interview.OutcomeNote = Clean(request.Note);
                    interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                    if (
                        outcome == InterviewStatus.NoShow
                        && party == "Candidate"
                        && request.NotifyCandidate
                    )
                        await mailer.QueueAsync(
                            interview,
                            new InterviewMail(InterviewChange.NoShow, NotifyInterviewers: false),
                            ct
                        );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        outcome == InterviewStatus.NoShow
                            ? "InterviewNoShow"
                            : "InterviewCompleted",
                        new { interview.Id, NoShowParty = interview.NoShowParty }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
            "/interviews/{id:guid}/meeting-notes",
            async (
                Guid id,
                UpdateMeetingNotesRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (string.IsNullOrWhiteSpace(request.Notes) || request.Notes.Length > 100_000)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["notes"] =
                            [
                                "Meeting notes are required and may not exceed 100,000 characters.",
                            ],
                        }
                    );
                if (request.Source?.Length > 120)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["source"] = ["The notes source may not exceed 120 characters."],
                        }
                    );

                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (interview?.Application?.Requisition is null)
                    return Results.NotFound();

                // The shared notes are hidden from a panelist until their scorecard is in, so they
                // cannot overwrite what they cannot read either.
                var email = principal.Email();
                var isAssigned = interview.InterviewerEmails.Contains(
                    email,
                    StringComparer.OrdinalIgnoreCase
                );
                var submitted = await db.Scorecards.AnyAsync(
                    x => x.InterviewId == id && x.InterviewerEmail == email,
                    ct
                );
                if (
                    !CanManage(interview.Application.Requisition, principal)
                    && !(isAssigned && submitted)
                )
                    return Results.Forbid();

                interview.MeetingNotes = request.Notes.Trim();
                interview.MeetingNotesSource = Clean(request.Source) ?? "Manual import";
                interview.MeetingNotesUpdatedAt = DateTimeOffset.UtcNow;
                interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                Audit.Add(
                    db,
                    principal,
                    "Application",
                    interview.ApplicationId,
                    "MeetingNotesUpdated",
                    new { interview.Id, interview.MeetingNotesSource }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        MapInterviewRecordings(api);
        MapAvailability(api);
        MapScheduling(api);
        MapInterviewNotes(api);
        MapRecordingPipeline(api);
        MapInterviewerPools(api);
        MapTranscripts(api);

        // Scorecard submit, drafts and reminders live in Features/Applications/EvaluationEndpoints.cs.
    }

    /// <summary>Interviews this person may see: everything in scope for the hiring team, their own otherwise.</summary>
    private static IQueryable<Interview> InterviewsFor(
        AtsDbContext db,
        ClaimsPrincipal principal,
        bool mineOnly
    )
    {
        var applicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal)
            .Select(x => x.Id);
        var email = principal.Email();
        var team =
            !mineOnly
            && (principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager)));
        return db
            .Interviews.AsNoTracking()
            .Where(x =>
                applicationIds.Contains(x.ApplicationId)
                && (team || x.InterviewerEmails.Contains(email))
            );
    }

    /// <summary>The calendar's row shape, with interviewer names.</summary>
    private static async Task<IReadOnlyList<object>> ListAsync(
        AtsDbContext db,
        IQueryable<Interview> query,
        CancellationToken ct
    )
    {
        var rows = await query
            .Take(500)
            .Select(x => new
            {
                x.Id,
                x.ApplicationId,
                x.Application!.CandidateId,
                x.Title,
                x.StartsAt,
                x.EndsAt,
                x.TimeZone,
                Status = x.Status.ToString(),
                x.MeetingLink,
                x.MeetingType,
                x.Location,
                x.LoopId,
                KitName = x.InterviewKit == null ? null
                : x.InterviewKit.VersionOfId == null ? x.InterviewKit.Name
                : x.InterviewKit.Name + " (version " + x.InterviewKit.Version.ToString() + ")",
                x.CalendarStatus,
                CandidateName = x.Application.Candidate!.FirstName
                    + " "
                    + x.Application.Candidate.LastName,
                x.Application.RequisitionId,
                RequisitionTitle = x.Application.Requisition!.Title,
                x.InterviewerEmails,
                SubmittedEmails = x.Scorecards.Select(s => s.InterviewerEmail),
                x.CancelReason,
                x.NoShowParty,
                x.AttendeeResponsesJson,
            })
            .ToListAsync(ct);
        var emails = rows.SelectMany(x => x.InterviewerEmails).Distinct().ToArray();
        var names = await db
            .Users.AsNoTracking()
            .Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        return rows.Select(x =>
                (object)
                    new
                    {
                        x.Id,
                        x.ApplicationId,
                        x.CandidateId,
                        x.Title,
                        x.StartsAt,
                        x.EndsAt,
                        x.TimeZone,
                        x.Status,
                        x.MeetingLink,
                        x.MeetingType,
                        x.Location,
                        x.LoopId,
                        x.KitName,
                        x.CalendarStatus,
                        x.CandidateName,
                        x.RequisitionId,
                        x.RequisitionTitle,
                        x.InterviewerEmails,
                        Interviewers = x.InterviewerEmails.Select(email => new
                        {
                            Email = email,
                            Name = names.GetValueOrDefault(email) ?? email,
                            Submitted = x.SubmittedEmails.Contains(email),
                        }),
                        x.CancelReason,
                        x.NoShowParty,
                        x.AttendeeResponsesJson,
                    }
            )
            .ToList();
    }

    private static Task<Interview?> LoadForChangeAsync(
        AtsDbContext db,
        Guid id,
        CancellationToken ct
    ) =>
        db
            .Interviews.Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .SingleOrDefaultAsync(x => x.Id == id, ct);

    private static async Task CancelAsync(
        AtsDbContext db,
        IWorkplaceIntegration integration,
        InterviewMailer mailer,
        ClaimsPrincipal principal,
        Interview interview,
        string reason,
        string? messageToCandidate,
        bool notifyCandidate,
        CancellationToken ct
    )
    {
        interview.Status = InterviewStatus.Cancelled;
        interview.CancelReason = reason;
        interview.CancelledBy = principal.Email();
        interview.CancelledAt = DateTimeOffset.UtcNow;
        interview.IcsSequence++;
        interview.Application!.LastActivityAt = DateTimeOffset.UtcNow;
        await CalendarOutbox.QueueAsync(
            db,
            integration,
            interview,
            IntegrationOperation.CancelCalendarEvent,
            ct
        );
        await mailer.QueueAsync(
            interview,
            new InterviewMail(
                InterviewChange.Cancelled,
                Reason: reason,
                MessageToCandidate: messageToCandidate,
                ChangedBy: await DisplayNameAsync(db, principal.Email(), ct),
                NotifyCandidate: notifyCandidate
            ),
            ct
        );
        Audit.Add(
            db,
            principal,
            "Application",
            interview.ApplicationId,
            "InterviewCancelled",
            new { interview.Id, Reason = reason }
        );
    }

    private static async Task<string> DisplayNameAsync(
        AtsDbContext db,
        string email,
        CancellationToken ct
    ) =>
        await db
            .Users.Where(x => x.Email == email)
            .Select(x => x.DisplayName)
            .SingleOrDefaultAsync(ct)
        ?? email;

    private static string[] NormalizeEmails(IEnumerable<string>? emails) =>
        (emails ?? [])
            .Select(x => x.Trim().ToLowerInvariant())
            .Where(x => x.Length > 0)
            .Distinct()
            .ToArray();

    private static IResult? InvalidInterview(
        string? title,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        string? timeZone,
        string[] interviewers
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(title))
            errors["title"] = ["Give the interview a name."];
        if (endsAt <= startsAt || endsAt - startsAt > TimeSpan.FromHours(12))
            errors["endsAt"] = ["The interview must end after it starts, within 12 hours."];
        if (string.IsNullOrWhiteSpace(timeZone))
            errors["timeZone"] = ["A time zone is required."];
        if (interviewers.Length == 0)
            errors["interviewerEmails"] = ["Add at least one interviewer."];
        else if (interviewers.FirstOrDefault(x => !LooksLikeEmail(x)) is { } bad)
            errors["interviewerEmails"] = [$"\"{bad}\" is not an email address."];
        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }
}
