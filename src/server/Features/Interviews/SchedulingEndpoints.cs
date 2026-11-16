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

/// <summary>
/// The scheduler: times that suit a panel (or a loop of panels), booking one or several sessions,
/// and self-scheduling links the candidate books from without signing in.
/// </summary>
public static partial class AtsEndpoints
{
    private static readonly TimeSpan SuggestionStep = TimeSpan.FromMinutes(15);

    private static void MapScheduling(RouteGroupBuilder api)
    {
        api.MapPost(
                "/scheduling/suggestions",
                async (
                    SchedulingSuggestionsRequest request,
                    AtsDbContext db,
                    AvailabilityService availability,
                    CancellationToken ct
                ) =>
                {
                    var errors = new Dictionary<string, string[]>();
                    if (request.Rounds is not { Length: > 0 and <= 6 })
                        errors["rounds"] = ["Choose between 1 and 6 rounds."];
                    else if (
                        request.Rounds.Any(x =>
                            x.DurationMinutes is < 15 or > 480 || x.DurationMinutes % 15 != 0
                        )
                    )
                        errors["rounds"] =
                        [
                            "Each round lasts 15 minutes to 8 hours, in steps of 15.",
                        ];
                    else if (
                        request.Rounds.Any(x =>
                            NormalizeEmails(x.InterviewerEmails).Length is 0 or > 12
                        )
                    )
                        errors["rounds"] = ["Each round needs 1 to 12 interviewers."];
                    if (
                        request.To <= request.From
                        || request.To - request.From > TimeSpan.FromDays(31)
                    )
                        errors["range"] = ["Choose an end after the start, at most 31 days later."];
                    if (request.BreakMinutes is < 0 or > 120 || request.BreakMinutes % 15 != 0)
                        errors["breakMinutes"] = ["A break is 0 to 120 minutes, in steps of 15."];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    var rounds = request
                        .Rounds.Select(x =>
                            x with
                            {
                                InterviewerEmails = NormalizeEmails(x.InterviewerEmails),
                            }
                        )
                        .ToArray();
                    var known = await availability.LoadPeopleAsync(
                        rounds.SelectMany(x => x.InterviewerEmails),
                        request.From,
                        request.To,
                        request.IgnoreInterviewId,
                        ct
                    );
                    var byEmail = known.People.ToDictionary(x => x.Email);
                    var panels = rounds
                        .Select(round =>
                            (IReadOnlyList<PersonSchedule>)
                                round.InterviewerEmails.Select(e => byEmail[e]).ToArray()
                        )
                        .ToArray();
                    var notBefore = DateTimeOffset.UtcNow + TimeSpan.FromMinutes(30);
                    var perRound = new List<IReadOnlyList<AvailableSlot>>();
                    var capped = false;
                    for (var i = 0; i < rounds.Length; i++)
                    {
                        var (slots, roundCapped) = AvailabilityService.FindSlots(
                            panels[i],
                            request.From,
                            request.To,
                            TimeSpan.FromMinutes(rounds[i].DurationMinutes),
                            SuggestionStep,
                            notBefore,
                            3000
                        );
                        perRound.Add(slots);
                        capped |= roundCapped;
                    }
                    var options =
                        rounds.Length == 1
                            ? perRound[0].Select(x => (IReadOnlyList<AvailableSlot>)[x]).ToList()
                            : SchedulingPlanner.Sequences(
                                perRound,
                                TimeSpan.FromMinutes(request.BreakMinutes)
                            );
                    var organizationZone = await db
                        .Organizations.Select(x => x.TimeZone)
                        .SingleOrDefaultAsync(ct);
                    var suggestions = SchedulingPlanner.Rank(
                        options,
                        panels,
                        TimeText.Zone(request.TimeZone, organizationZone)
                    );

                    var emails = known.People.Select(x => x.Email).ToArray();
                    var users = await db
                        .Users.AsNoTracking()
                        .Where(x => emails.Contains(x.Email))
                        .ToDictionaryAsync(x => x.Email, ct);
                    var providers = await db
                        .CalendarConnections.Where(x => emails.Contains(x.UserEmail))
                        .ToDictionaryAsync(x => x.UserEmail, x => x.Provider, ct);
                    var now = DateTimeOffset.UtcNow;
                    return Results.Ok(
                        new
                        {
                            People = known.People.Select(person =>
                            {
                                users.TryGetValue(person.Email, out var user);
                                var local = TimeZoneInfo.ConvertTime(now, person.Zone).Date;
                                var week = local.AddDays(-(((int)local.DayOfWeek + 6) % 7));
                                return new
                                {
                                    person.Email,
                                    Name = user?.DisplayName ?? person.Email,
                                    Member = user is not null,
                                    TimeZone = person.Zone.Id,
                                    Calendar = known.CheckedCalendars.Contains(person.Email)
                                        ? "Checked"
                                        : "Missing",
                                    CalendarProvider = providers.GetValueOrDefault(person.Email),
                                    InterviewsThisWeek = person.Booked.Count(at =>
                                    {
                                        var day = TimeZoneInfo.ConvertTime(at, person.Zone).Date;
                                        return day >= week && day < week.AddDays(7);
                                    }),
                                    person.MaxPerWeek,
                                    person.MaxPerDay,
                                    Working = AvailabilityService.WorkingWindows(
                                        person,
                                        request.From,
                                        request.To
                                    ),
                                    Busy = person
                                        .Busy.Where(x => x.Overlaps(request.From, request.To))
                                        .OrderBy(x => x.StartsAt),
                                };
                            }),
                            Slots = rounds
                                .Select(
                                    (round, i) =>
                                        new
                                        {
                                            round.Key,
                                            Starts = perRound[i].Select(x => x.StartsAt),
                                        }
                                )
                                .ToDictionary(x => x.Key, x => x.Starts),
                            Suggestions = suggestions.Select(x => new
                            {
                                Sessions = x.Sessions.Select(
                                    (slot, i) =>
                                        new
                                        {
                                            rounds[i].Key,
                                            slot.StartsAt,
                                            slot.EndsAt,
                                        }
                                ),
                                x.Load,
                            }),
                            known.CheckedCalendars,
                            known.MissingConnections,
                            Capped = capped,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/interviews/schedule",
                (
                    Guid id,
                    ScheduleInterviewsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) => ScheduleCoreAsync(id, request, principal, db, integration, mailer, ct)
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/scheduling-requests",
                async (
                    Guid id,
                    CreateSchedulingLinkRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var interviewers = NormalizeEmails(request.InterviewerEmails);
                    var errors = MeetingErrors(
                        request.MeetingType,
                        request.MeetingLink,
                        request.Location
                    );
                    if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 200)
                        errors["title"] = ["Give the interview a name."];
                    if (request.DurationMinutes is < 15 or > 480)
                        errors["durationMinutes"] = ["An interview lasts 15 minutes to 8 hours."];
                    if (interviewers.Length == 0)
                        errors["interviewerEmails"] = ["Add at least one interviewer."];
                    else if (interviewers.FirstOrDefault(x => !LooksLikeEmail(x)) is { } bad)
                        errors["interviewerEmails"] = [$"\"{bad}\" is not an email address."];
                    if (
                        string.IsNullOrWhiteSpace(request.TimeZone)
                        || !TimeZoneInfo.TryFindSystemTimeZoneById(request.TimeZone, out _)
                    )
                        errors["timeZone"] = ["Choose a time zone."];
                    if (request.MinimumNoticeHours is < 0 or > 168)
                        errors["minimumNoticeHours"] = ["Notice is between 0 hours and 7 days."];
                    if (request.ExpiresInDays is < 1 or > 30)
                        errors["expiresInDays"] = ["A link works for 1 to 30 days."];
                    if (request.MessageToCandidate?.Length > 2000)
                        errors["messageToCandidate"] = ["Keep the message under 2,000 characters."];
                    var now = DateTimeOffset.UtcNow;
                    var length = TimeSpan.FromMinutes(request.DurationMinutes);
                    var offered = (request.OfferedStarts ?? []).Distinct().Order().ToArray();
                    DateTimeOffset windowStart,
                        windowEnd;
                    if (offered.Length > 0)
                    {
                        if (offered.Length > 10)
                            errors["offeredStarts"] = ["Offer up to 10 times."];
                        if (offered[0] < now)
                            errors["offeredStarts"] =
                            [
                                "One of the times has passed. Choose times in the future.",
                            ];
                        windowStart = offered[0];
                        windowEnd = offered[^1] + length;
                    }
                    else
                    {
                        windowStart = request.WindowStart ?? now;
                        windowEnd = request.WindowEnd ?? now.AddDays(14);
                        if (windowStart < now)
                            windowStart = now;
                        if (
                            windowEnd <= windowStart + length
                            || windowEnd - windowStart > TimeSpan.FromDays(31)
                        )
                            errors["window"] =
                            [
                                "Choose dates that end after they start, at most 31 days apart.",
                            ];
                    }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    var application = await db
                        .Applications.Include(x => x.Requisition)
                        .Include(x => x.Candidate)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        request.InterviewKitId is not null
                        && !await db.InterviewKits.AnyAsync(
                            x =>
                                x.Id == request.InterviewKitId
                                && x.RequisitionId == application.RequisitionId
                                && x.VersionOfId == null
                                && x.ArchivedAt == null,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["interviewKitId"] =
                                [
                                    "Choose a current interview kit from this job.",
                                ],
                            }
                        );
                    var (type, link, location) = Meeting(
                        request.MeetingType,
                        request.MeetingLink,
                        request.Location
                    );
                    var scheduling = new SchedulingRequest
                    {
                        ApplicationId = id,
                        InterviewKitId = request.InterviewKitId,
                        Title = request.Title.Trim(),
                        DurationMinutes = request.DurationMinutes,
                        InterviewerEmails = interviewers,
                        OfferedStarts = offered,
                        WindowStart = windowStart,
                        WindowEnd = windowEnd,
                        MinimumNoticeHours = request.MinimumNoticeHours,
                        MeetingType = type,
                        MeetingLink = link,
                        Location = location,
                        MessageToCandidate = Clean(request.MessageToCandidate),
                        TimeZone = request.TimeZone.Trim(),
                        ExpiresAt = now.AddDays(request.ExpiresInDays),
                        CreatedBy = principal.Email(),
                    };
                    db.SchedulingRequests.Add(scheduling);
                    if (request.NotifyCandidate)
                        await mailer.QueueLinkAsync(scheduling, application, reminder: false, ct);
                    if (request.Preview)
                        return Results.Ok(
                            new { Emails = PendingEmails(db, application.Candidate!.Email) }
                        );
                    application.LastActivityAt = now;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "SchedulingLinkSent",
                        new { scheduling.Id, scheduling.Title }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/scheduling-requests/{scheduling.Id}",
                        new { scheduling.Id, Url = await mailer.BookingUrlAsync(scheduling.Id, ct) }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
                "/applications/{id:guid}/scheduling-requests",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    // A booking link is a key: only the people who run the job see these.
                    var requisition = await ScopeApplications(
                            db.Applications.AsNoTracking(),
                            principal
                        )
                        .Where(x => x.Id == id)
                        .Select(x => x.Requisition)
                        .SingleOrDefaultAsync(ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var rows = await db
                        .SchedulingRequests.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(20)
                        .ToListAsync(ct);
                    var result = new List<object>();
                    foreach (var row in rows)
                        result.Add(await LinkViewAsync(row, mailer, ct));
                    return Results.Ok(result);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/scheduling-requests/{id:guid}/cancel",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var row = await db
                        .SchedulingRequests.Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        row?.Application?.Requisition is null
                        || !CanManage(row.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (row.Status != SchedulingRequestStatus.Open)
                        return Results.Conflict(
                            new { message = "Only a link that has not been used can be cancelled." }
                        );
                    row.Status = SchedulingRequestStatus.Cancelled;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        row.ApplicationId,
                        "SchedulingLinkCancelled",
                        new { row.Id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/scheduling-requests/{id:guid}/remind",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var row = await db.SchedulingRequests.SingleOrDefaultAsync(x => x.Id == id, ct);
                    var application = row is null
                        ? null
                        : await db
                            .Applications.Include(x => x.Requisition)
                            .Include(x => x.Candidate)
                            .SingleOrDefaultAsync(x => x.Id == row.ApplicationId, ct);
                    if (
                        row is null
                        || application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        row.Status != SchedulingRequestStatus.Open
                        || row.ExpiresAt <= DateTimeOffset.UtcNow
                    )
                        return Results.Conflict(new { message = "This link is no longer open." });
                    await mailer.QueueLinkAsync(row, application, reminder: true, ct);
                    row.LastReminderAt = DateTimeOffset.UtcNow;
                    row.ReminderCount++;
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        row.ApplicationId,
                        "SchedulingLinkReminded",
                        new { row.Id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>A link as the team sees it, with the address to copy.</summary>
    private static async Task<object> LinkViewAsync(
        SchedulingRequest row,
        InterviewMailer mailer,
        CancellationToken ct
    ) =>
        new
        {
            row.Id,
            row.ApplicationId,
            row.Title,
            row.DurationMinutes,
            row.InterviewerEmails,
            OfferedStarts = row.OfferedStarts,
            row.WindowStart,
            row.WindowEnd,
            Status = row.Status == SchedulingRequestStatus.Open
            && row.ExpiresAt <= DateTimeOffset.UtcNow
                ? "Expired"
                : row.Status,
            row.ExpiresAt,
            row.CreatedAt,
            row.CreatedBy,
            row.InterviewId,
            row.ReminderCount,
            row.LastReminderAt,
            Url = await mailer.BookingUrlAsync(row.Id, ct),
        };

    /// <summary>The emails this request queued, candidate first: what each person would receive.</summary>
    private static object[] PendingEmails(AtsDbContext db, string candidateEmail) =>
        db
            .ChangeTracker.Entries<EmailOutboxItem>()
            .Where(x => x.State == EntityState.Added)
            .Select(x => x.Entity)
            .OrderBy(x => x.Recipient == candidateEmail ? 0 : 1)
            .Select(x =>
                (object)
                    new
                    {
                        To = x.Recipient,
                        x.Subject,
                        x.Body,
                        ToCandidate = x.Recipient == candidateEmail,
                    }
            )
            .ToArray();

    /// <summary>How people meet, cleaned: a fixed link only for "Link", an address or number only where it belongs.</summary>
    private static (string? Type, string? Link, string? Location) Meeting(
        string? type,
        string? link,
        string? location
    )
    {
        var kind = Clean(type);
        return kind switch
        {
            MeetingTypes.GoogleMeet or MeetingTypes.Teams => (kind, null, null),
            MeetingTypes.Phone or MeetingTypes.InPerson => (kind, null, Clean(location)),
            _ => (kind, Clean(link), null),
        };
    }

    private static Dictionary<string, string[]> MeetingErrors(
        string? type,
        string? link,
        string? location
    )
    {
        var errors = new Dictionary<string, string[]>();
        var kind = Clean(type);
        if (kind is not null && !MeetingTypes.All.Contains(kind))
            errors["meetingType"] = ["Choose how you will meet."];
        if (
            (kind == MeetingTypes.Link || (kind is null && Clean(link) is not null))
            && !(
                Uri.TryCreate(Clean(link), UriKind.Absolute, out var url)
                && (url.Scheme == Uri.UriSchemeHttps || url.Scheme == Uri.UriSchemeHttp)
                && link!.Length <= 500
            )
        )
            errors["meetingLink"] = ["Paste the meeting link. It starts with https://."];
        if (kind == MeetingTypes.InPerson && Clean(location) is null)
            errors["location"] = ["Add the address."];
        if (location?.Length > 300)
            errors["location"] = ["Keep this under 300 characters."];
        return errors;
    }

    /// <summary>
    /// Books one interview, or several back to back as one loop. One itinerary goes to the candidate
    /// for a loop; each interviewer hears about their own session. Preview returns those emails unsaved.
    /// </summary>
    private static async Task<IResult> ScheduleCoreAsync(
        Guid applicationId,
        ScheduleInterviewsRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        IWorkplaceIntegration integration,
        InterviewMailer mailer,
        CancellationToken ct
    )
    {
        if (request.Sessions is not { Length: > 0 and <= 6 })
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["sessions"] = ["Book between 1 and 6 sessions."],
                }
            );
        var sessions = request.Sessions.OrderBy(x => x.StartsAt).ToArray();
        foreach (var session in sessions)
            if (
                InvalidInterview(
                    session.Title,
                    session.StartsAt,
                    session.EndsAt,
                    request.TimeZone,
                    NormalizeEmails(session.InterviewerEmails)
                ) is
                { } invalid
            )
                return invalid;
        var errors = MeetingErrors(request.MeetingType, request.MeetingLink, request.Location);
        if (sessions.Zip(sessions.Skip(1)).Any(x => x.Second.StartsAt < x.First.EndsAt))
            errors["sessions"] = ["Sessions in a loop cannot overlap."];
        if (request.MessageToCandidate?.Length > 2000)
            errors["messageToCandidate"] = ["Keep the message under 2,000 characters."];
        if (errors.Count > 0)
            return Results.ValidationProblem(errors);
        var application = await db
            .Applications.Include(x => x.Requisition)
            .Include(x => x.Candidate)
            .SingleOrDefaultAsync(x => x.Id == applicationId, ct);
        if (application?.Requisition is null || !CanManage(application.Requisition, principal))
            return Results.NotFound();
        var kitIds = sessions
            .Where(x => x.InterviewKitId is not null)
            .Select(x => x.InterviewKitId!.Value)
            .Distinct()
            .ToArray();
        if (
            await db.InterviewKits.CountAsync(
                // New interviews use the kit as it is now: never an old version or an archived kit.
                x =>
                    kitIds.Contains(x.Id)
                    && x.RequisitionId == application.RequisitionId
                    && x.VersionOfId == null
                    && x.ArchivedAt == null,
                ct
            ) != kitIds.Length
        )
            return Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["interviewKitId"] = ["Choose a current interview kit from this job."],
                }
            );

        var (type, link, location) = Meeting(
            request.MeetingType,
            request.MeetingLink,
            request.Location
        );
        var loop = sessions.Length > 1 ? Guid.NewGuid() : (Guid?)null;
        var created = new List<Interview>();
        foreach (var session in sessions)
        {
            var interview = new Interview
            {
                ApplicationId = applicationId,
                Application = application,
                InterviewKitId = session.InterviewKitId,
                Title = session.Title.Trim(),
                StartsAt = session.StartsAt,
                EndsAt = session.EndsAt,
                TimeZone = request.TimeZone.Trim(),
                MeetingType = type,
                MeetingLink = link,
                Location = location,
                LoopId = loop,
                InterviewerEmails = NormalizeEmails(session.InterviewerEmails),
            };
            db.Interviews.Add(interview);
            await CalendarOutbox.QueueAsync(
                db,
                integration,
                interview,
                IntegrationOperation.CreateCalendarEvent,
                ct
            );
            created.Add(interview);
        }
        if (created.Count == 1)
            await mailer.QueueAsync(
                created[0],
                new InterviewMail(
                    InterviewChange.Scheduled,
                    MessageToCandidate: Clean(request.MessageToCandidate),
                    NotifyCandidate: request.NotifyCandidate,
                    NotifyInterviewers: request.NotifyInterviewers
                ),
                ct
            );
        else
            await mailer.QueueLoopAsync(
                created,
                Clean(request.MessageToCandidate),
                request.NotifyCandidate,
                request.NotifyInterviewers,
                ct
            );
        if (request.Preview)
            return Results.Ok(new { Emails = PendingEmails(db, application.Candidate!.Email) });

        application.LastActivityAt = DateTimeOffset.UtcNow;
        await InterviewStages.MoveOnBookingAsync(db, application, principal.Email(), ct);
        await PipelineEvents.NotifyAsync(
            db,
            created.Count == 1
                ? $"Interview booked: {created[0].Title} for {application.Requisition.Title} ({string.Join(", ", created[0].InterviewerEmails)})."
                : $"Interview loop booked: {created.Count} sessions for {application.Requisition.Title}.",
            ct,
            TeamChannel.InterviewBooked,
            $"/interviews/{created[0].Id}"
        );
        foreach (var interview in created)
            Audit.Add(
                db,
                principal,
                "Application",
                applicationId,
                "InterviewScheduled",
                new
                {
                    interview.Id,
                    interview.StartsAt,
                    interview.InterviewerEmails,
                    interview.LoopId,
                }
            );
        await db.SaveChangesAsync(ct);
        return Results.Created(
            $"/api/interviews/{created[0].Id}",
            new
            {
                created[0].Id,
                Ids = created.Select(x => x.Id),
                LoopId = loop,
            }
        );
    }
}
