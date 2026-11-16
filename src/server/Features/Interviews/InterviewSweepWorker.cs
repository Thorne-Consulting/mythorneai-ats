using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Interviews;

/// <summary>
/// Moves interviews along with time. Nobody said how it went a day after the end: the interview
/// counts as Completed, and scorecard reminders carry on.
/// </summary>
public sealed class InterviewSweepWorker(
    IServiceScopeFactory scopes,
    ILogger<InterviewSweepWorker> logger
) : BackgroundService
{
    public static readonly TimeSpan OutcomeGrace = TimeSpan.FromHours(24);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                await CompleteEndedAsync(db, DateTimeOffset.UtcNow, stoppingToken);
                await RemindOpenLinksAsync(
                    db,
                    scope.ServiceProvider.GetRequiredService<InterviewMailer>(),
                    DateTimeOffset.UtcNow,
                    stoppingToken
                );
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                logger.LogError(exception, "The interview sweep failed and will run again.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    public static Task<int> CompleteEndedAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var cutoff = now - OutcomeGrace;
        return db
            .Interviews.Where(x => x.Status == InterviewStatus.Scheduled && x.EndsAt < cutoff)
            .ExecuteUpdateAsync(
                set =>
                    set.SetProperty(x => x.Status, InterviewStatus.Completed)
                        .SetProperty(x => x.OutcomeAt, now)
                        .SetProperty(x => x.OutcomeBy, "system:no-outcome-after-24-hours"),
                ct
            );
    }

    /// <summary>
    /// A scheduling link the candidate has not used gets a reminder every few days (the workspace's
    /// booking reminder setting), up to the reminder limit, while it still works.
    /// </summary>
    public static async Task<int> RemindOpenLinksAsync(
        AtsDbContext db,
        InterviewMailer mailer,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var settings = await db
            .Organizations.Select(x => new { x.BookReminderDays, x.MaxReminders })
            .SingleOrDefaultAsync(ct);
        if (settings is null || settings.BookReminderDays <= 0)
            return 0;
        var due = now.AddDays(-settings.BookReminderDays);
        var links = await db
            .SchedulingRequests.Where(x =>
                x.Status == SchedulingRequestStatus.Open
                && x.ExpiresAt > now
                && x.CreatedAt < due
                && x.ReminderCount < settings.MaxReminders
                && (x.LastReminderAt == null || x.LastReminderAt < due)
            )
            .Take(50)
            .ToListAsync(ct);
        foreach (var link in links)
        {
            var application = await db
                .Applications.Include(x => x.Candidate)
                .Include(x => x.Requisition)
                .SingleAsync(x => x.Id == link.ApplicationId, ct);
            if (!application.Candidate!.DoNotContact)
                await mailer.QueueLinkAsync(link, application, reminder: true, ct);
            link.ReminderCount++;
            link.LastReminderAt = now;
        }
        await db.SaveChangesAsync(ct);
        return links.Count;
    }
}
