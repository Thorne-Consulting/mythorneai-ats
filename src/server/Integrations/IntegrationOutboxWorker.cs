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

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!integration.IsEnabled)
        {
            logger.LogInformation("Workplace delivery is disabled; records remain internal only.");
            return;
        }

        logger.LogInformation(
            "Workplace delivery worker started for {Provider}.",
            integration.ProviderName
        );
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var processed = await TryProcessOneAsync(stoppingToken);
                if (!processed)
                    await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
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
                    await DeliverCalendarEventAsync(db, item, cancellationToken);
                    break;
                case IntegrationOperation.CancelCalendarEvent:
                    await CancelCalendarEventAsync(db, item, cancellationToken);
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

    private async Task DeliverCalendarEventAsync(
        AtsDbContext db,
        IntegrationOutboxItem item,
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
        var result = await integration.CreateCalendarEventAsync(
            new OutboundCalendarEvent(
                interview.Id,
                interview.ExternalEventId,
                interview.Title,
                $"Candidate: {candidate.FirstName} {candidate.LastName}\nRole: {requisition.Code} · {requisition.Title}\nApplication: {application.Id}",
                interview.StartsAt,
                interview.EndsAt,
                interview.TimeZone,
                interview.MeetingLink,
                attendees
            ),
            cancellationToken
        );
        interview.CalendarStatus = "Created";
        interview.CalendarProvider = integration.ProviderName;
        interview.ExternalEventId = result.ExternalId;
        interview.CalendarError = null;
        interview.MeetingLink = result.MeetingLink ?? interview.MeetingLink;
        AddAudit(db, "Application", interview.ApplicationId, "CalendarEventCreated");
    }

    private async Task CancelCalendarEventAsync(
        AtsDbContext db,
        IntegrationOutboxItem item,
        CancellationToken cancellationToken
    )
    {
        var interview = await db.Interviews.SingleAsync(
            x => x.Id == item.EntityId,
            cancellationToken
        );
        if (!string.IsNullOrWhiteSpace(interview.ExternalEventId))
            await integration.CancelCalendarEventAsync(
                interview.ExternalEventId,
                cancellationToken
            );
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
