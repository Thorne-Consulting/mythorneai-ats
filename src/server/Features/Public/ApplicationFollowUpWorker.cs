using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Every 15 minutes: remind people who have not confirmed their application, close the ones left
/// unconfirmed for 30 days, and clear expired links and unused resume uploads. See <see cref="ApplicationIntake.FollowUpAsync"/>.
/// </summary>
public sealed class ApplicationFollowUpWorker(
    IServiceScopeFactory scopeFactory,
    LocalFileStore files,
    IHostEnvironment environment,
    ILogger<ApplicationFollowUpWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                var organization = await db
                    .Organizations.AsNoTracking()
                    .SingleOrDefaultAsync(stoppingToken);
                var now = DateTimeOffset.UtcNow;
                // Reminders wait for the organization's daytime; clean-up does not.
                var quiet =
                    organization is null || EmailOutboxWorker.InQuietHours(organization, now);
                await ApplicationIntake.FollowUpAsync(
                    db,
                    files,
                    environment,
                    now,
                    sendReminders: !quiet,
                    stoppingToken
                );
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Application follow-up failed; trying again later.");
            }
            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken).ContinueWith(_ => { });
        }
    }
}
