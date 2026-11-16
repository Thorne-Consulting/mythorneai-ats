using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Integrations;

public sealed class IntegrationOutboxWorker(
    IServiceScopeFactory scopeFactory,
    IWorkplaceIntegration integration,
    ILogger<IntegrationOutboxWorker> logger
) : BackgroundService
{
    private const int MaximumAttempts = 5;
    private DateTimeOffset lastExternalSync = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation(
            "Calendar delivery worker started for global provider {Provider}; personal calendars are also supported.",
            integration.ProviderName
        );
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await TryProcessOneAsync(stoppingToken);
                if (!processed)
                {
                    if (DateTimeOffset.UtcNow - lastExternalSync > TimeSpan.FromMinutes(5))
                    {
                        await SyncExternalEventsAsync(stoppingToken);
                        lastExternalSync = DateTimeOffset.UtcNow;
                    }
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(
                    exception,
                    "The workplace delivery worker hit an unexpected error and will retry."
                );
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }
    }

    private async Task<bool> TryProcessOneAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var userCalendars = scope.ServiceProvider.GetRequiredService<IUserCalendarService>();
        var now = DateTimeOffset.UtcNow;
        var itemId = await db
            .IntegrationOutbox.AsNoTracking()
            .Where(x =>
                (
                    x.Status == IntegrationOutboxStatus.Pending
                    || (x.Status == IntegrationOutboxStatus.Processing && x.LockedUntil <= now)
                )
                && x.NextAttemptAt <= now
            )
            .OrderBy(x => x.NextAttemptAt)
            .ThenBy(x => x.CreatedAt)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (itemId is null)
            return false;

        var claimed = await db
            .IntegrationOutbox.Where(x =>
                x.Id == itemId
                && (
                    x.Status == IntegrationOutboxStatus.Pending
                    || (x.Status == IntegrationOutboxStatus.Processing && x.LockedUntil <= now)
                )
            )
            .ExecuteUpdateAsync(
                updates =>
                    updates
                        .SetProperty(x => x.Status, IntegrationOutboxStatus.Processing)
                        .SetProperty(x => x.LockedUntil, now.AddMinutes(5))
                        .SetProperty(x => x.Attempts, x => x.Attempts + 1),
                cancellationToken
            );
        if (claimed == 0)
            return true;

        db.ChangeTracker.Clear();
        var item = await db.IntegrationOutbox.SingleAsync(x => x.Id == itemId, cancellationToken);
        try
        {
            switch (item.Operation)
            {
                case IntegrationOperation.CreateCalendarEvent:
                    await DeliverCalendarEventAsync(db, item, userCalendars, cancellationToken);
                    break;
                case IntegrationOperation.CancelCalendarEvent:
                    await CancelCalendarEventAsync(db, item, userCalendars, cancellationToken);
                    break;
                default:
                    throw new InvalidOperationException(
                        $"Unsupported integration operation {item.Operation}."
                    );
            }

            item.Status = IntegrationOutboxStatus.Succeeded;
            item.CompletedAt = DateTimeOffset.UtcNow;
            item.LockedUntil = null;
            item.LastError = null;
        }
        catch (CalendarDisconnectedException exception)
        {
            // Retrying cannot help until someone reconnects; say so plainly instead of "failed".
            item.Status = IntegrationOutboxStatus.Failed;
            item.LockedUntil = null;
            item.LastError = Truncate(exception.Message, 2000);
            var interview = await db.Interviews.SingleAsync(
                x => x.Id == item.EntityId,
                cancellationToken
            );
            interview.CalendarStatus = "Disconnected";
            interview.CalendarError = item.LastError;
            logger.LogWarning(
                "{Operation} for {EntityId}: {Message}",
                item.Operation,
                item.EntityId,
                exception.Message
            );
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            var finalAttempt = item.Attempts >= MaximumAttempts;
            item.Status = finalAttempt
                ? IntegrationOutboxStatus.Failed
                : IntegrationOutboxStatus.Pending;
            item.LockedUntil = null;
            item.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(
                Math.Pow(2, Math.Min(item.Attempts, 4))
            );
            item.LastError = Truncate(exception.Message, 2000);
            await MarkEntityFailureAsync(db, item, finalAttempt, cancellationToken);
            logger.LogError(
                exception,
                "{Provider} {Operation} failed for {EntityId}; attempt {Attempt} of {MaximumAttempts}.",
                integration.ProviderName,
                item.Operation,
                item.EntityId,
                item.Attempts,
                MaximumAttempts
            );
        }

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private async Task SyncExternalEventsAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var calendars = scope.ServiceProvider.GetRequiredService<IUserCalendarService>();
        var mailer = scope.ServiceProvider.GetRequiredService<InterviewMailer>();
        var now = DateTimeOffset.UtcNow;
        // Upcoming interviews only, soonest first, so old ones never crowd out the ones that matter.
        var interviews = await db
            .Interviews.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Where(x =>
                x.Status == InterviewStatus.Scheduled
                && x.CalendarProvider == "Personal"
                && x.ExternalEventId != null
                && x.EndsAt > now
            )
            .OrderBy(x => x.StartsAt)
            .Take(100)
            .ToListAsync(cancellationToken);
        var connected = await db
            .CalendarConnections.Select(x => x.UserEmail)
            .ToListAsync(cancellationToken);
        foreach (var interview in interviews)
        {
            // Older rows have no organizer stored: the event lives with the first connected interviewer.
            var organizer =
                interview.OrganizerEmail
                ?? interview.InterviewerEmails.FirstOrDefault(email =>
                    connected.Contains(email, StringComparer.OrdinalIgnoreCase)
                );
            ExternalCalendarLookup lookup;
            try
            {
                lookup = organizer is null
                    ? new(ExternalLookupState.NoConnection)
                    : await calendars.GetEventAsync(
                        interview.ExternalEventId!,
                        organizer,
                        cancellationToken
                    );
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // One unreadable connection (a revoked or undecryptable token) must not stop the
                // sync for every other interview, and is never read as a cancellation.
                logger.LogWarning(
                    exception,
                    "Could not read the calendar event for interview {InterviewId}.",
                    interview.Id
                );
                continue;
            }
            switch (CalendarSync.Classify(lookup, interview.StartsAt, interview.EndsAt))
            {
                case ExternalChange.Disconnected:
                    if (interview.CalendarStatus != "Disconnected")
                    {
                        interview.CalendarStatus = "Disconnected";
                        interview.CalendarError =
                            "The person whose calendar holds this invite disconnected it. The interview is still booked.";
                    }
                    break;
                case ExternalChange.Cancelled:
                    interview.CalendarStatus = "ExternalCancelled";
                    interview.Status = InterviewStatus.Cancelled;
                    interview.CancelledAt = DateTimeOffset.UtcNow;
                    interview.CancelledBy = organizer;
                    interview.CancelReason = "Removed from the organizer's calendar";
                    interview.IcsSequence++;
                    interview.Application!.LastActivityAt = DateTimeOffset.UtcNow;
                    db.AuditEvents.Add(
                        new AuditEvent
                        {
                            EntityType = "Application",
                            EntityId = interview.ApplicationId.ToString(),
                            Action = "InterviewCancelledExternally",
                            ActorEmail = "system:calendar-sync",
                            Details = System.Text.Json.JsonSerializer.Serialize(
                                new { interviewId = interview.Id }
                            ),
                        }
                    );
                    await mailer.QueueAsync(
                        interview,
                        new InterviewMail(InterviewChange.CalendarCancelled, ChangedBy: organizer),
                        cancellationToken
                    );
                    break;
                case ExternalChange.Moved:
                    var previousStart = interview.StartsAt;
                    var previousEnd = interview.EndsAt;
                    interview.StartsAt = lookup.Event!.StartsAt!.Value;
                    interview.EndsAt = lookup.Event.EndsAt!.Value;
                    interview.CalendarStatus = "ExternalUpdated";
                    interview.IcsSequence++;
                    await mailer.QueueAsync(
                        interview,
                        new InterviewMail(
                            InterviewChange.CalendarMoved,
                            previousStart,
                            previousEnd,
                            ChangedBy: organizer
                        ),
                        cancellationToken
                    );
                    break;
            }
            if (
                lookup.Event is { MeetingLink: { Length: > 0 } link }
                && interview.Status == InterviewStatus.Scheduled
            )
                interview.MeetingLink = link;
            if (lookup.Event?.Responses is { Count: > 0 } responses)
            {
                var json = System.Text.Json.JsonSerializer.Serialize(
                    responses.OrderBy(x => x.Key).ToDictionary(x => x.Key, x => x.Value)
                );
                if (json != interview.AttendeeResponsesJson)
                    interview.AttendeeResponsesJson = json;
            }
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task DeliverCalendarEventAsync(
        AtsDbContext db,
        IntegrationOutboxItem item,
        IUserCalendarService userCalendars,
        CancellationToken cancellationToken
    )
    {
        var interview = await db
            .Interviews.Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .SingleAsync(x => x.Id == item.EntityId, cancellationToken);
        if (interview.Status is not (InterviewStatus.Scheduled or InterviewStatus.Completed))
            return; // Cancelled while it waited: nothing to put on a calendar.
        var application = interview.Application!;
        var candidate = application.Candidate!;
        var requisition = application.Requisition!;
        var attendees = interview
            .InterviewerEmails.Append(candidate.Email)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var site = await db
            .Organizations.Select(x => x.PublicUrl)
            .SingleOrDefaultAsync(cancellationToken);
        var calendarEvent = new OutboundCalendarEvent(
            interview.Id,
            interview.ExternalEventId,
            interview.Title,
            string.Join(
                "\n",
                new[]
                {
                    $"Candidate: {candidate.FirstName} {candidate.LastName}",
                    $"Job: {requisition.Title}",
                    string.IsNullOrWhiteSpace(site)
                        ? null
                        : $"For the hiring team: {site.TrimEnd('/')}/interviews/{interview.Id}",
                }.Where(line => line is not null)
            ),
            interview.StartsAt,
            interview.EndsAt,
            interview.TimeZone,
            interview.MeetingLink,
            attendees,
            interview.OrganizerEmail,
            interview.MeetingType,
            interview.Location
        );
        var hasPersonalConnection = await db.CalendarConnections.AnyAsync(
            x => interview.InterviewerEmails.Contains(x.UserEmail),
            cancellationToken
        );
        var result =
            hasPersonalConnection
                ? await userCalendars.UpsertEventAsync(
                    calendarEvent,
                    interview.InterviewerEmails,
                    cancellationToken
                )
            : integration.IsEnabled
                ? await integration.CreateCalendarEventAsync(calendarEvent, cancellationToken)
            : throw new CalendarDisconnectedException(
                "No interviewer has a connected calendar, and no workspace calendar is set up."
            );
        interview.CalendarStatus = "Created";
        interview.CalendarProvider = hasPersonalConnection ? "Personal" : integration.ProviderName;
        interview.ExternalEventId = result.ExternalId;
        interview.OrganizerEmail = result.OrganizerEmail;
        interview.CalendarError = null;
        interview.MeetingLink = result.MeetingLink ?? interview.MeetingLink;
        AddAudit(db, "Application", interview.ApplicationId, "CalendarEventCreated");
    }

    private async Task CancelCalendarEventAsync(
        AtsDbContext db,
        IntegrationOutboxItem item,
        IUserCalendarService userCalendars,
        CancellationToken cancellationToken
    )
    {
        var interview = await db.Interviews.SingleAsync(
            x => x.Id == item.EntityId,
            cancellationToken
        );
        if (!string.IsNullOrWhiteSpace(interview.ExternalEventId))
        {
            if (interview.CalendarProvider == "Personal")
            {
                // Through the person who holds the event, never "the first interviewer".
                var organizer =
                    interview.OrganizerEmail
                    ?? await db
                        .CalendarConnections.Where(x =>
                            interview.InterviewerEmails.Contains(x.UserEmail)
                        )
                        .Select(x => x.UserEmail)
                        .FirstOrDefaultAsync(cancellationToken)
                    ?? throw new CalendarDisconnectedException(
                        "The organizer disconnected their calendar, so the invite could not be removed."
                    );
                await userCalendars.CancelEventAsync(
                    interview.ExternalEventId,
                    organizer,
                    cancellationToken
                );
            }
            else
            {
                if (!integration.IsEnabled)
                    throw new CalendarDisconnectedException(
                        "The workspace calendar is no longer set up."
                    );
                await integration.CancelCalendarEventAsync(
                    interview.ExternalEventId,
                    cancellationToken
                );
            }
        }
        interview.CalendarStatus = "Cancelled";
        interview.CalendarError = null;
        interview.ExternalEventId = null;
        interview.OrganizerEmail = null;
        AddAudit(db, "Application", interview.ApplicationId, "CalendarEventCancelled");
    }

    private static async Task MarkEntityFailureAsync(
        AtsDbContext db,
        IntegrationOutboxItem item,
        bool finalAttempt,
        CancellationToken cancellationToken
    )
    {
        var status = finalAttempt ? "Failed" : "RetryScheduled";
        var interview = await db.Interviews.SingleAsync(
            x => x.Id == item.EntityId,
            cancellationToken
        );
        interview.CalendarStatus = status;
        interview.CalendarError = item.LastError;
    }

    private void AddAudit(AtsDbContext db, string entityType, Guid entityId, string action) =>
        db.AuditEvents.Add(
            new AuditEvent
            {
                EntityType = entityType,
                EntityId = entityId.ToString(),
                Action = action,
                ActorEmail = $"integration:{integration.ProviderName}",
            }
        );

    private static string Truncate(string value, int length) =>
        value.Length <= length ? value : value[..length];
}
