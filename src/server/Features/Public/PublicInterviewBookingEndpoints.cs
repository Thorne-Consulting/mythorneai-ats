using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    /// <summary>Candidates book or move a time at least this far ahead.</summary>
    private static readonly TimeSpan CandidateNotice = TimeSpan.FromHours(12);

    private static void MapPublicInterviewBooking(RouteGroupBuilder api)
    {
        MapPublicScheduling(api);

        api.MapGet(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/availability",
            async (
                Guid applicationId,
                Guid interviewId,
                [FromHeader(Name = "X-Candidate-Session")] string? token,
                AtsDbContext db,
                AvailabilityService availability,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateFromSessionAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var interview = await db
                    .Interviews.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == interviewId
                            && x.ApplicationId == applicationId
                            && x.Application!.CandidateId == candidateId
                            && (
                                x.Status == InterviewStatus.Proposed
                                || x.Status == InterviewStatus.Scheduled
                            ),
                        ct
                    );
                if (interview is null)
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                return Results.Ok(
                    await availability.FindAsync(
                        new AvailabilityRequest(
                            interview.InterviewerEmails,
                            now,
                            now.AddDays(14),
                            interview.EndsAt - interview.StartsAt,
                            TimeSpan.FromMinutes(30),
                            CandidateNotice,
                            interview.Id
                        ),
                        ct
                    )
                );
            }
        );

        api.MapPost(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/cancel",
            async (
                Guid applicationId,
                Guid interviewId,
                PublicBookingCancelRequest? request,
                [FromHeader(Name = "X-Candidate-Session")] string? token,
                AtsDbContext db,
                IWorkplaceIntegration integration,
                InterviewMailer mailer,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateFromSessionAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var interview = await LoadCandidateInterviewAsync(
                    db,
                    applicationId,
                    interviewId,
                    candidateId.Value,
                    InterviewStatus.Scheduled,
                    ct
                );
                if (interview is null)
                    return Results.NotFound();
                if (!interview.Application!.Requisition!.AllowCandidateReschedule)
                    return Results.Json(
                        new
                        {
                            message = "Changing this interview isn't available online. Message the hiring team.",
                        },
                        statusCode: StatusCodes.Status403Forbidden
                    );
                if (interview.StartsAt <= DateTimeOffset.UtcNow)
                    return Results.Json(
                        new
                        {
                            message = "This interview has already started, so it can't be cancelled here. Message the hiring team.",
                        },
                        statusCode: StatusCodes.Status409Conflict
                    );
                if (request?.Reason?.Length > 500)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["reason"] = ["Keep the reason under 500 characters."],
                        }
                    );
                interview.Status = InterviewStatus.Cancelled;
                interview.CancelReason = Clean(request?.Reason) ?? "The candidate cancelled";
                interview.CancelledBy = interview.Application.Candidate!.Email;
                interview.CancelledAt = DateTimeOffset.UtcNow;
                interview.IcsSequence++;
                interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
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
                        InterviewChange.CandidateCancelled,
                        Reason: interview.CancelReason,
                        ChangedBy: $"{interview.Application.Candidate.FirstName} {interview.Application.Candidate.LastName} (the candidate)"
                    ),
                    ct
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapPost(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/book",
            async (
                Guid applicationId,
                Guid interviewId,
                BookInterviewRequest? request,
                [FromHeader(Name = "X-Candidate-Session")] string? token,
                AtsDbContext db,
                IWorkplaceIntegration integration,
                AvailabilityService availability,
                InterviewMailer mailer,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateFromSessionAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Candidate)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                            .ThenInclude(x => x!.Stages)
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == interviewId
                            && x.ApplicationId == applicationId
                            && x.Application!.CandidateId == candidateId
                            && x.Status == InterviewStatus.Proposed,
                        ct
                    );
                if (interview is null)
                    return Results.NotFound();
                if (request?.StartsAt is not null || request?.EndsAt is not null)
                {
                    if (
                        request.StartsAt is null
                        || request.EndsAt is null
                        || request.EndsAt <= request.StartsAt
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["time"] = ["A valid start and end time are required."],
                            }
                        );
                    // The length is the interview's, never the request's.
                    var length = interview.EndsAt - interview.StartsAt;
                    if (request.EndsAt.Value - request.StartsAt.Value != length)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["time"] = ["That time is not the length of this interview."],
                            }
                        );
                    if (
                        !await FitsAsync(
                            availability,
                            interview,
                            request.StartsAt.Value,
                            request.EndsAt.Value,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new { message = "That time is no longer available." }
                        );
                    interview.StartsAt = request.StartsAt.Value;
                    interview.EndsAt = request.EndsAt.Value;
                }
                else if (interview.StartsAt <= DateTimeOffset.UtcNow)
                    return Results.Conflict(
                        new { message = "That time has passed. Choose another time." }
                    );
                var otherSlots = await db
                    .Interviews.Where(x =>
                        x.ApplicationId == applicationId
                        && x.Status == InterviewStatus.Proposed
                        && x.Id != interviewId
                        && x.Title == interview.Title
                    )
                    .ToListAsync(ct);
                foreach (var slot in otherSlots)
                {
                    slot.Status = InterviewStatus.Cancelled;
                    slot.CancelReason = "The candidate chose another time";
                    slot.CancelledAt = DateTimeOffset.UtcNow;
                }
                interview.Status = InterviewStatus.Scheduled;
                interview.IcsSequence++;
                interview.Application!.LastActivityAt = DateTimeOffset.UtcNow;
                await CalendarOutbox.QueueAsync(
                    db,
                    integration,
                    interview,
                    IntegrationOperation.CreateCalendarEvent,
                    ct
                );
                await InterviewStages.MoveOnBookingAsync(
                    db,
                    interview.Application,
                    interview.Application.Candidate!.Email,
                    ct
                );
                await mailer.QueueAsync(interview, new InterviewMail(InterviewChange.Booked), ct);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { interview.Id });
            }
        );

        api.MapPost(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/reschedule",
            async (
                Guid applicationId,
                Guid interviewId,
                BookInterviewRequest request,
                [FromHeader(Name = "X-Candidate-Session")] string? token,
                AtsDbContext db,
                IWorkplaceIntegration integration,
                AvailabilityService availability,
                InterviewMailer mailer,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateFromSessionAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                if (
                    request.StartsAt is null
                    || request.EndsAt is null
                    || request.EndsAt <= request.StartsAt
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["time"] = ["A valid start and end time are required."],
                        }
                    );
                var interview = await LoadCandidateInterviewAsync(
                    db,
                    applicationId,
                    interviewId,
                    candidateId.Value,
                    InterviewStatus.Scheduled,
                    ct
                );
                if (interview is null)
                    return Results.NotFound();
                if (!interview.Application!.Requisition!.AllowCandidateReschedule)
                    return Results.Json(
                        new
                        {
                            message = "Changing this interview isn't available online. Message the hiring team.",
                        },
                        statusCode: StatusCodes.Status403Forbidden
                    );
                if (interview.StartsAt <= DateTimeOffset.UtcNow)
                    return Results.Json(
                        new
                        {
                            message = "This interview has already started, so its time can't be changed here. Message the hiring team.",
                        },
                        statusCode: StatusCodes.Status409Conflict
                    );
                if (
                    request.EndsAt.Value - request.StartsAt.Value
                    != interview.EndsAt - interview.StartsAt
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["time"] = ["That time is not the length of this interview."],
                        }
                    );
                if (
                    !await FitsAsync(
                        availability,
                        interview,
                        request.StartsAt.Value,
                        request.EndsAt.Value,
                        ct
                    )
                )
                    return Results.Conflict(new { message = "That time is no longer available." });
                var previousStart = interview.StartsAt;
                var previousEnd = interview.EndsAt;
                interview.StartsAt = request.StartsAt.Value;
                interview.EndsAt = request.EndsAt.Value;
                interview.IcsSequence++;
                interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                // Updates the existing calendar event in place (one outbox row per interview).
                await CalendarOutbox.QueueAsync(
                    db,
                    integration,
                    interview,
                    IntegrationOperation.CreateCalendarEvent,
                    ct
                );
                await mailer.QueueAsync(
                    interview,
                    new InterviewMail(
                        InterviewChange.Rescheduled,
                        previousStart,
                        previousEnd,
                        ChangedBy: $"{interview.Application.Candidate!.FirstName} {interview.Application.Candidate.LastName} (the candidate)"
                    ),
                    ct
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // "Add to your calendar" from an interview email. The token names one interview and who it is
        // worded for; it is the only key, so the file says nothing a forwarded email would not.
        api.MapGet(
            "/interviews/{token}/invite.ics",
            async (string token, AtsDbContext db, InterviewMailer mailer, CancellationToken ct) =>
            {
                if (mailer.ReadFileToken(token) is not { } key)
                    return Results.NotFound();
                var interview = await db
                    .Interviews.AsNoTracking()
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Candidate)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleOrDefaultAsync(x => x.Id == key.InterviewId, ct);
                if (
                    interview?.Application?.Candidate is null
                    || interview.Status == InterviewStatus.Proposed
                )
                    return Results.NotFound();
                var company =
                    await db.Organizations.Select(x => x.Name).SingleOrDefaultAsync(ct)
                    ?? "Interview";
                var job = interview.Application.Requisition!.Title;
                var candidate =
                    $"{interview.Application.Candidate.FirstName} {interview.Application.Candidate.LastName}";
                var (summary, description) = InterviewMailer.FileText(
                    interview,
                    company,
                    job,
                    candidate,
                    key.ForCandidate
                );
                var file = InterviewMailer.CalendarFile(
                    interview,
                    summary,
                    description,
                    cancelled: interview.Status == InterviewStatus.Cancelled
                );
                return Results.File(
                    System.Text.Encoding.UTF8.GetBytes(file),
                    "text/calendar; charset=utf-8",
                    "interview.ics"
                );
            }
        );
    }

    private static async Task<Guid?> CandidateFromSessionAsync(
        AtsDbContext db,
        string? token,
        CancellationToken ct
    ) =>
        string.IsNullOrWhiteSpace(token)
            ? null
            : await db
                .CandidatePortalSessions.Where(x =>
                    x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow
                )
                .Select(x => (Guid?)x.CandidateId)
                .SingleOrDefaultAsync(ct);

    private static Task<Interview?> LoadCandidateInterviewAsync(
        AtsDbContext db,
        Guid applicationId,
        Guid interviewId,
        Guid candidateId,
        InterviewStatus status,
        CancellationToken ct
    ) =>
        db
            .Interviews.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .SingleOrDefaultAsync(
                x =>
                    x.Id == interviewId
                    && x.ApplicationId == applicationId
                    && x.Application!.CandidateId == candidateId
                    && x.Status == status,
                ct
            );

    /// <summary>True when that exact time fits every interviewer's hours, limits and known busy times.</summary>
    private static async Task<bool> FitsAsync(
        AvailabilityService availability,
        Interview interview,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt,
        CancellationToken ct
    )
    {
        var result = await availability.FindAsync(
            new AvailabilityRequest(
                interview.InterviewerEmails,
                startsAt,
                endsAt,
                endsAt - startsAt,
                TimeSpan.FromMinutes(1),
                CandidateNotice,
                interview.Id,
                MaxSlots: 1
            ),
            ct
        );
        return result.Slots.Any(slot => slot.StartsAt == startsAt && slot.EndsAt == endsAt);
    }

    // ---- Self-scheduling links: /book/{token} in the web app. No sign-in; the token is the key. ----

    private static void MapPublicScheduling(RouteGroupBuilder api)
    {
        // For the candidate portal: links waiting for this candidate to pick a time, each opening /book/{token}.
        api.MapGet(
            "/applications/{applicationId:guid}/scheduling-links",
            async (
                Guid applicationId,
                [FromHeader(Name = "X-Candidate-Session")] string? token,
                AtsDbContext db,
                InterviewMailer mailer,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateFromSessionAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var now = DateTimeOffset.UtcNow;
                var links = await db
                    .SchedulingRequests.AsNoTracking()
                    .Where(x =>
                        x.ApplicationId == applicationId
                        && x.Application!.CandidateId == candidateId
                        && (
                            (x.Status == SchedulingRequestStatus.Open && x.ExpiresAt > now)
                            || x.Status == SchedulingRequestStatus.Booked
                        )
                    )
                    .OrderBy(x => x.CreatedAt)
                    .Select(x => new
                    {
                        x.Id,
                        x.Title,
                        x.DurationMinutes,
                        x.ExpiresAt,
                        x.Status,
                        x.InterviewId,
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    links.Select(x => new
                    {
                        x.Title,
                        x.DurationMinutes,
                        x.ExpiresAt,
                        x.Status,
                        x.InterviewId,
                        Path = $"/book/{mailer.LinkToken(x.Id)}",
                    })
                );
            }
        );

        api.MapGet(
            "/scheduling/{token}",
            async (string token, AtsDbContext db, InterviewMailer mailer, CancellationToken ct) =>
            {
                var link = await LoadLinkAsync(db, mailer, token, ct);
                return link is null
                    ? Results.NotFound(new { message = LinkNotFound })
                    : Results.Ok(await LinkPageAsync(db, mailer, link, ct));
            }
        );

        api.MapGet(
            "/scheduling/{token}/slots",
            async (
                string token,
                DateTimeOffset? from,
                DateTimeOffset? to,
                AtsDbContext db,
                InterviewMailer mailer,
                AvailabilityService availability,
                CancellationToken ct
            ) =>
            {
                var link = await LoadLinkAsync(db, mailer, token, ct);
                if (link is null)
                    return Results.NotFound(new { message = LinkNotFound });
                if (LinkClosed(link) is { } closed)
                    return closed;
                return Results.Ok(
                    new { Slots = await OpenTimesAsync(availability, link, from, to, ct) }
                );
            }
        );

        api.MapPost(
            "/scheduling/{token}/book",
            async (
                string token,
                PublicBookingRequest request,
                AtsDbContext db,
                InterviewMailer mailer,
                AvailabilityService availability,
                IWorkplaceIntegration integration,
                CancellationToken ct
            ) =>
            {
                if (request.Note?.Length > 1000)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["note"] = ["Keep the note under 1,000 characters."],
                        }
                    );
                var link = await LoadLinkAsync(db, mailer, token, ct);
                if (link is null)
                    return Results.NotFound(new { message = LinkNotFound });
                var start = request.StartsAt.ToUniversalTime();
                var end = start.AddMinutes(link.DurationMinutes);
                var application = link.Application!;

                if (
                    link.Status == SchedulingRequestStatus.Booked
                    && link.InterviewId is { } bookedId
                )
                {
                    var booked = await db
                        .Interviews.Include(x => x.Application)
                            .ThenInclude(x => x!.Candidate)
                        .Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .SingleAsync(x => x.Id == bookedId, ct);
                    // The same answer twice (a double click, a retry) is not a change.
                    if (booked.StartsAt == start && booked.Status == InterviewStatus.Scheduled)
                        return Results.Ok(await LinkPageAsync(db, mailer, link, ct));
                    if (ChangeBlocked(link, booked) is { } blocked)
                        return Results.Json(
                            new { message = blocked },
                            statusCode: StatusCodes.Status409Conflict
                        );
                    if (!await LinkTimeFitsAsync(availability, link, start, end, booked.Id, ct))
                        return Results.Conflict(
                            new
                            {
                                message = "That time is no longer available. Choose another time.",
                            }
                        );
                    var previousStart = booked.StartsAt;
                    var previousEnd = booked.EndsAt;
                    booked.StartsAt = start;
                    booked.EndsAt = end;
                    booked.IcsSequence++;
                    booked.Application!.LastActivityAt = DateTimeOffset.UtcNow;
                    await CalendarOutbox.QueueAsync(
                        db,
                        integration,
                        booked,
                        IntegrationOperation.CreateCalendarEvent,
                        ct
                    );
                    await mailer.QueueAsync(
                        booked,
                        new InterviewMail(
                            InterviewChange.Rescheduled,
                            previousStart,
                            previousEnd,
                            ChangedBy: $"{application.Candidate!.FirstName} {application.Candidate.LastName} (the candidate)"
                        ),
                        ct
                    );
                    Audit.Add(
                        db,
                        application.Candidate.Email,
                        "Application",
                        application.Id,
                        "InterviewRescheduled",
                        new { InterviewId = booked.Id, booked.StartsAt }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(await LinkPageAsync(db, mailer, link, ct));
                }

                if (LinkClosed(link) is { } closed)
                    return closed;
                if (!await LinkTimeFitsAsync(availability, link, start, end, null, ct))
                    return Results.Conflict(
                        new { message = "That time is no longer available. Choose another time." }
                    );

                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                // Claim the link first: two quick clicks, or two tabs, book once.
                var claimed = await db
                    .SchedulingRequests.Where(x =>
                        x.Id == link.Id && x.Status == SchedulingRequestStatus.Open
                    )
                    .ExecuteUpdateAsync(
                        set => set.SetProperty(x => x.Status, SchedulingRequestStatus.Booked),
                        ct
                    );
                if (claimed == 0)
                {
                    await transaction.RollbackAsync(ct);
                    await db.Entry(link).ReloadAsync(ct);
                    return Results.Ok(await LinkPageAsync(db, mailer, link, ct));
                }
                var candidate = application.Candidate!;
                var zone = Clean(request.TimeZone);
                if (
                    candidate.TimeZone is null
                    && zone is not null
                    && TimeZoneInfo.TryFindSystemTimeZoneById(zone, out _)
                )
                    candidate.TimeZone = zone;
                var interview = new Interview
                {
                    ApplicationId = application.Id,
                    Application = application,
                    InterviewKitId = link.InterviewKitId,
                    Title = link.Title,
                    StartsAt = start,
                    EndsAt = end,
                    TimeZone = link.TimeZone,
                    MeetingType = link.MeetingType,
                    MeetingLink = link.MeetingLink,
                    Location = link.Location,
                    InterviewerEmails = link.InterviewerEmails,
                    SchedulingRequestId = link.Id,
                };
                db.Interviews.Add(interview);
                link.Status = SchedulingRequestStatus.Booked;
                link.InterviewId = interview.Id;
                link.BookedAt = DateTimeOffset.UtcNow;
                link.CandidateNote = Clean(request.Note);
                application.LastActivityAt = DateTimeOffset.UtcNow;
                await CalendarOutbox.QueueAsync(
                    db,
                    integration,
                    interview,
                    IntegrationOperation.CreateCalendarEvent,
                    ct
                );
                await mailer.QueueAsync(
                    interview,
                    new InterviewMail(
                        InterviewChange.Booked,
                        MessageToCandidate: link.MessageToCandidate
                    ),
                    ct
                );
                await PipelineEvents.NotifyAsync(
                    db,
                    $"Interview booked by the candidate: {interview.Title} for {application.Requisition!.Title}.",
                    ct,
                    TeamChannel.InterviewBooked,
                    $"/interviews/{interview.Id}"
                );
                await InterviewStages.MoveOnBookingAsync(db, application, candidate.Email, ct);
                Audit.Add(
                    db,
                    candidate.Email,
                    "Application",
                    application.Id,
                    "InterviewBookedByCandidate",
                    new
                    {
                        InterviewId = interview.Id,
                        interview.StartsAt,
                        link.CandidateNote,
                    }
                );
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return Results.Ok(await LinkPageAsync(db, mailer, link, ct));
            }
        );

        api.MapPost(
            "/scheduling/{token}/cancel",
            async (
                string token,
                PublicBookingCancelRequest? request,
                AtsDbContext db,
                InterviewMailer mailer,
                IWorkplaceIntegration integration,
                CancellationToken ct
            ) =>
            {
                if (request?.Reason?.Length > 500)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["reason"] = ["Keep the reason under 500 characters."],
                        }
                    );
                var link = await LoadLinkAsync(db, mailer, token, ct);
                if (
                    link?.InterviewId is not { } interviewId
                    || link.Status != SchedulingRequestStatus.Booked
                )
                    return Results.NotFound(
                        new { message = "There is no booked interview on this link." }
                    );
                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Candidate)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleAsync(x => x.Id == interviewId, ct);
                if (ChangeBlocked(link, interview) is { } blocked)
                    return Results.Json(
                        new { message = blocked },
                        statusCode: StatusCodes.Status409Conflict
                    );
                var candidate = interview.Application!.Candidate!;
                interview.Status = InterviewStatus.Cancelled;
                interview.CancelReason = Clean(request?.Reason) ?? "The candidate cancelled";
                interview.CancelledBy = candidate.Email;
                interview.CancelledAt = DateTimeOffset.UtcNow;
                interview.IcsSequence++;
                interview.Application.LastActivityAt = DateTimeOffset.UtcNow;
                link.Status = SchedulingRequestStatus.Cancelled;
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
                        InterviewChange.CandidateCancelled,
                        Reason: interview.CancelReason,
                        ChangedBy: $"{candidate.FirstName} {candidate.LastName} (the candidate)"
                    ),
                    ct
                );
                Audit.Add(
                    db,
                    candidate.Email,
                    "Application",
                    interview.ApplicationId,
                    "InterviewCancelled",
                    new { InterviewId = interview.Id, Reason = interview.CancelReason }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(await LinkPageAsync(db, mailer, link, ct));
            }
        );
    }

    private static readonly TimeSpan LinkStep = TimeSpan.FromMinutes(30);

    private const string LinkNotFound =
        "We could not find this scheduling link. Check that you copied the whole address, or message the hiring team.";

    private static async Task<SchedulingRequest?> LoadLinkAsync(
        AtsDbContext db,
        InterviewMailer mailer,
        string token,
        CancellationToken ct
    ) =>
        token.Length > 400 || mailer.ReadLinkToken(token) is not { } id
            ? null
            : await db
                .SchedulingRequests.Include(x => x.Application)
                    .ThenInclude(x => x!.Candidate)
                .Include(x => x.Application)
                    .ThenInclude(x => x!.Requisition)
                .SingleOrDefaultAsync(x => x.Id == id, ct);

    /// <summary>410 Gone with a plain reason when a link can no longer be used to pick a first time.</summary>
    private static IResult? LinkClosed(SchedulingRequest link) =>
        link.Status == SchedulingRequestStatus.Cancelled
            ? Results.Json(
                new
                {
                    message = "This link was cancelled. Message the hiring team if you still need a time.",
                },
                statusCode: StatusCodes.Status410Gone
            )
        : link.Status == SchedulingRequestStatus.Open && link.ExpiresAt <= DateTimeOffset.UtcNow
            ? Results.Json(
                new { message = "This link has expired. Message the hiring team for a new one." },
                statusCode: StatusCodes.Status410Gone
            )
        : null;

    /// <summary>Why the candidate cannot move or cancel a booked time here, or null when they can.</summary>
    private static string? ChangeBlocked(SchedulingRequest link, Interview interview) =>
        interview.Status != InterviewStatus.Scheduled
            ? "This interview is no longer booked, so it can't be changed here. Message the hiring team."
        : !interview.Application!.Requisition!.AllowCandidateReschedule
            ? "Changing this interview isn't available online. Message the hiring team."
        : interview.StartsAt <= DateTimeOffset.UtcNow.AddHours(link.MinimumNoticeHours)
            ? "This interview is too soon to change here. Message the hiring team."
        : null;

    /// <summary>The times the candidate may pick: the offered ones that still suit everyone, or the open times in the window.</summary>
    private static async Task<IReadOnlyList<AvailableSlot>> OpenTimesAsync(
        AvailabilityService availability,
        SchedulingRequest link,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken ct
    )
    {
        var length = TimeSpan.FromMinutes(link.DurationMinutes);
        var earliest = DateTimeOffset.UtcNow.AddHours(link.MinimumNoticeHours);
        var start = new[] { link.WindowStart, earliest, from ?? DateTimeOffset.MinValue }.Max();
        var end = new[] { link.WindowEnd, to ?? DateTimeOffset.MaxValue }.Min();
        if (end <= start)
            return [];
        if (link.OfferedStarts.Length > 0)
        {
            var known = await availability.LoadPeopleAsync(
                link.InterviewerEmails,
                start,
                end,
                link.InterviewId,
                ct
            );
            return link
                .OfferedStarts.Where(x => x >= start && x + length <= end)
                .Where(x => AvailabilityService.FitsAll(known.People, x, x + length))
                .Select(x => new AvailableSlot(x, x + length))
                .ToList();
        }
        var result = await availability.FindAsync(
            new AvailabilityRequest(
                link.InterviewerEmails,
                start,
                end,
                length,
                LinkStep,
                TimeSpan.FromHours(link.MinimumNoticeHours),
                link.InterviewId,
                MaxSlots: 600
            ),
            ct
        );
        return result.Slots;
    }

    private static async Task<bool> LinkTimeFitsAsync(
        AvailabilityService availability,
        SchedulingRequest link,
        DateTimeOffset start,
        DateTimeOffset end,
        Guid? ignoreInterviewId,
        CancellationToken ct
    )
    {
        if (link.OfferedStarts.Length > 0 && !link.OfferedStarts.Contains(start))
            return false;
        // "Any open time" means the times the page shows: every half hour.
        if (link.OfferedStarts.Length == 0 && start.UtcTicks % LinkStep.Ticks != 0)
            return false;
        if (
            start < link.WindowStart
            || end > link.WindowEnd
            || start < DateTimeOffset.UtcNow.AddHours(link.MinimumNoticeHours)
        )
            return false;
        var known = await availability.LoadPeopleAsync(
            link.InterviewerEmails,
            start,
            end,
            ignoreInterviewId,
            ct
        );
        return AvailabilityService.FitsAll(known.People, start, end);
    }

    /// <summary>What the booking page shows. Interviewers by name only; never anyone's email.</summary>
    private static async Task<object> LinkPageAsync(
        AtsDbContext db,
        InterviewMailer mailer,
        SchedulingRequest link,
        CancellationToken ct
    )
    {
        var application = link.Application!;
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.TimeZone })
            .SingleOrDefaultAsync(ct);
        var names = await db
            .Users.AsNoTracking()
            .Where(x => link.InterviewerEmails.Contains(x.Email))
            .Select(x => x.DisplayName)
            .ToListAsync(ct);
        var booked = link.InterviewId is null
            ? null
            : await db
                .Interviews.Include(x => x.Application)
                    .ThenInclude(x => x!.Requisition)
                .SingleOrDefaultAsync(x => x.Id == link.InterviewId, ct);
        var status =
            link.Status == SchedulingRequestStatus.Open && link.ExpiresAt <= DateTimeOffset.UtcNow
                ? "Expired"
                : link.Status;
        return new
        {
            Company = organization?.Name,
            JobTitle = application.Requisition!.Title,
            link.Title,
            link.DurationMinutes,
            link.MeetingType,
            Location = link.MeetingType == MeetingTypes.InPerson ? link.Location : null,
            Interviewers = names.Count > 0 ? names : ["the hiring team"],
            CandidateFirstName = application.Candidate!.FirstName,
            CandidateTimeZone = application.Candidate.TimeZone,
            OrganizationTimeZone = organization?.TimeZone,
            Status = status,
            link.ExpiresAt,
            Offered = link.OfferedStarts.Length > 0,
            link.WindowStart,
            link.WindowEnd,
            Message = link.MessageToCandidate,
            Booking = booked is null
                ? null
                : new
                {
                    booked.StartsAt,
                    booked.EndsAt,
                    Status = booked.Status.ToString(),
                    MeetingLink = booked.Status == InterviewStatus.Scheduled
                        ? booked.MeetingLink
                        : null,
                    Where = InterviewMailer.Where(booked),
                    CalendarFile = $"/public/interviews/{mailer.FileToken(booked.Id, true)}/invite.ics",
                    CanChange = ChangeBlocked(link, booked) is null,
                    ChangeBlockedReason = booked.Status == InterviewStatus.Scheduled
                        ? ChangeBlocked(link, booked)
                        : null,
                },
        };
    }
}
