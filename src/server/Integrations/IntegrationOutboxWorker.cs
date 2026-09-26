using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

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
        var interviews = await db.Interviews
            .Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Where(x =>
                x.Status == InterviewStatus.Scheduled
                && x.CalendarProvider == "Personal"
                && x.ExternalEventId != null
            )
            .Take(100)
            .ToListAsync(cancellationToken);
        foreach (var interview in interviews)
        {
            var organizer = interview.InterviewerEmails.FirstOrDefault();
            if (organizer is null)
                continue;
            var external = await calendars.GetEventAsync(
                interview.ExternalEventId!,
                organizer,
                cancellationToken
            );
            if (external is null || external.Cancelled)
            {
                if (interview.CalendarStatus == "ExternalCancelled")
                    continue;
                interview.CalendarStatus = "ExternalCancelled";
                QueueExternalChangeEmail(
                    db,
                    interview,
                    "Your interview was cancelled on the connected calendar. The hiring team will contact you about next steps."
                );
                continue;
            }
            if (external.StartsAt is null || external.EndsAt is null)
                continue;
            if (external.StartsAt != interview.StartsAt || external.EndsAt != interview.EndsAt)
            {
                interview.StartsAt = external.StartsAt.Value;
                interview.EndsAt = external.EndsAt.Value;
                interview.CalendarStatus = "ExternalUpdated";
                QueueExternalChangeEmail(
                    db,
                    interview,
                    $"Your interview time changed to {interview.StartsAt:u} on the connected calendar."
                );
            }
            if (!string.IsNullOrWhiteSpace(external.MeetingLink))
                interview.MeetingLink = external.MeetingLink;
        }
        await db.SaveChangesAsync(cancellationToken);
    }

    private static void QueueExternalChangeEmail(
        AtsDbContext db,
        Interview interview,
        string body
    )
    {
        if (interview.Application?.Candidate is null)
            return;
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                ApplicationId = interview.ApplicationId,
                Recipient = interview.Application.Candidate.Email,
                Subject = $"Calendar update: {interview.Title}",
                Body = body,
            }
        );
        foreach (var interviewer in interview.InterviewerEmails)
            db.EmailOutbox.Add(
                new EmailOutboxItem
                {
                    ApplicationId = interview.ApplicationId,
                    Recipient = interviewer,
                    Subject = $"Calendar update: {interview.Title}",
                    Body = body,
                }
            );
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
        var application = interview.Application!;
        var candidate = application.Candidate!;
        var requisition = application.Requisition!;
        var attendees = interview
            .InterviewerEmails.Append(candidate.Email)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var calendarEvent = new OutboundCalendarEvent(
            interview.Id,
            interview.ExternalEventId,
            interview.Title,
            $"Candidate: {candidate.FirstName} {candidate.LastName}\nRole: {requisition.Code} · {requisition.Title}\nApplication: {application.Id}",
            interview.StartsAt,
            interview.EndsAt,
            interview.TimeZone,
            interview.MeetingLink,
            attendees
        );
        var hasPersonalConnection = await db.CalendarConnections.AnyAsync(
            x => interview.InterviewerEmails.Contains(x.UserEmail),
            cancellationToken
        );
        var result = hasPersonalConnection
            ? await userCalendars.CreateEventAsync(
                calendarEvent,
                interview.InterviewerEmails,
                cancellationToken
            )
            : integration.IsEnabled
                ? await integration.CreateCalendarEventAsync(calendarEvent, cancellationToken)
                : throw new InvalidOperationException(
                    "No connected interviewer calendar or global calendar provider is configured."
                );
        interview.CalendarStatus = "Created";
        interview.CalendarProvider = hasPersonalConnection ? "Personal" : integration.ProviderName;
        interview.ExternalEventId = result.ExternalId;
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
            var personalEmail = interview.CalendarProvider == "Personal"
                ? interview.InterviewerEmails.FirstOrDefault()
                : null;
            if (personalEmail is not null)
                await userCalendars.CancelEventAsync(
                    interview.ExternalEventId,
                    personalEmail,
                    cancellationToken
                );
            else
            {
                if (!integration.IsEnabled)
                    throw new InvalidOperationException("No global calendar provider is configured.");
                await integration.CancelCalendarEventAsync(interview.ExternalEventId, cancellationToken);
            }
        }
        interview.CalendarStatus = "Cancelled";
        interview.CalendarError = null;
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
