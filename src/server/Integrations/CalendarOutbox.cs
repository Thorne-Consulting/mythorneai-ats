using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Integrations;

/// <summary>
/// The one way to send an interview change to calendars. There is one outbox row per operation and
/// interview (a unique index), so a later change resets that row instead of adding a second one.
/// </summary>
public static class CalendarOutbox
{
    /// <summary>
    /// Queues the change when a calendar is involved and sets the interview's calendar status.
    /// Returns false when nothing is queued (no calendar set up, or nothing on a calendar to cancel).
    /// </summary>
    public static async Task<bool> QueueAsync(
        AtsDbContext db,
        IWorkplaceIntegration integration,
        Interview interview,
        IntegrationOperation operation,
        CancellationToken ct
    )
    {
        if (operation == IntegrationOperation.CancelCalendarEvent)
        {
            if (string.IsNullOrWhiteSpace(interview.ExternalEventId))
            {
                // Never reached a calendar: stop a create that is still waiting, and say so.
                await ResetAsync(
                    db,
                    IntegrationOperation.CreateCalendarEvent,
                    interview.Id,
                    cancel: true,
                    ct
                );
                interview.CalendarStatus =
                    interview.CalendarStatus == "NotConfigured" ? "NotConfigured" : "Cancelled";
                return false;
            }
            await ResetAsync(db, operation, interview.Id, cancel: false, ct);
            interview.CalendarStatus = "CancellationQueued";
            return true;
        }

        var personal = await db.CalendarConnections.AnyAsync(
            x => interview.InterviewerEmails.Contains(x.UserEmail),
            ct
        );
        if (
            !integration.IsEnabled
            && !personal
            && string.IsNullOrWhiteSpace(interview.ExternalEventId)
        )
        {
            interview.CalendarStatus = "NotConfigured";
            interview.CalendarProvider = null;
            return false;
        }
        await ResetAsync(db, operation, interview.Id, cancel: false, ct);
        interview.CalendarStatus = "Queued";
        interview.CalendarProvider ??= personal ? "Personal" : integration.ProviderName;
        return true;
    }

    private static async Task ResetAsync(
        AtsDbContext db,
        IntegrationOperation operation,
        Guid interviewId,
        bool cancel,
        CancellationToken ct
    )
    {
        var row =
            db.IntegrationOutbox.Local.SingleOrDefault(x =>
                x.Operation == operation && x.EntityId == interviewId
            )
            ?? await db.IntegrationOutbox.SingleOrDefaultAsync(
                x => x.Operation == operation && x.EntityId == interviewId,
                ct
            );
        if (cancel)
        {
            if (row is { Status: IntegrationOutboxStatus.Pending })
            {
                row.Status = IntegrationOutboxStatus.Succeeded;
                row.CompletedAt = DateTimeOffset.UtcNow;
            }
            return;
        }
        if (row is null)
        {
            db.IntegrationOutbox.Add(
                new IntegrationOutboxItem { Operation = operation, EntityId = interviewId }
            );
            return;
        }
        row.Status = IntegrationOutboxStatus.Pending;
        row.Attempts = 0;
        row.NextAttemptAt = DateTimeOffset.UtcNow;
        row.LockedUntil = null;
        row.LastError = null;
        row.CompletedAt = null;
    }
}
