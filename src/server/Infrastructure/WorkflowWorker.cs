using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Features.Workflows;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// Runs workflows, in the outbox pattern of the email and webhook workers: pick the oldest due run,
/// claim it, move it until it waits, ends or fails. Once a minute it also starts runs for time
/// triggers and tells owners about failed runs (at most once a day per workflow).
/// </summary>
/// <remarks>ponytail: one run at a time; claim batches with SKIP LOCKED once runs pass about 100k a day.</remarks>
public sealed class WorkflowWorker(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    ILogger<WorkflowWorker> logger
) : BackgroundService
{
    /// <summary>
    /// The built-in reminder workflows (booking, scorecard, stuck applications, assessments) send
    /// every automatic reminder; the old loops in EmailOutboxWorker and AssessmentFlow are gone.
    /// Workflows:BuiltInReminders false turns them off.
    /// </summary>
    public static bool BuiltInRemindersOn(IConfiguration configuration) =>
        configuration.GetValue("Workflows:BuiltInReminders", true);

    private DateTimeOffset lastSweep = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            await BuiltInWorkflows.EnsureAsync(
                scope.ServiceProvider.GetRequiredService<AtsDbContext>(),
                stoppingToken
            );
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            logger.LogError(exception, "Could not add the built-in workflows.");
        }
        while (!stoppingToken.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                var now = DateTimeOffset.UtcNow;
                worked = await WorkflowEngine.RunDueAsync(db, now, stoppingToken);
                if (now - lastSweep > TimeSpan.FromMinutes(1))
                {
                    lastSweep = now;
                    db.ChangeTracker.Clear();
                    await WorkflowTriggers.SweepAsync(
                        db,
                        now,
                        BuiltInRemindersOn(configuration),
                        stoppingToken
                    );
                    await AlertFailuresAsync(db, now, stoppingToken);
                    await WorkflowEngine.CloseStaleApprovalsAsync(db, now, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Workflow worker failed; retrying.");
            }
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(worked ? 0.1 : 2), stoppingToken);
            }
            catch (OperationCanceledException) { }
        }
    }

    /// <summary>One email per workflow per day when runs failed, to its owner (admins for built-ins).</summary>
    public static async Task AlertFailuresAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var dayAgo = now.AddDays(-1);
        var failing = await db
            .Workflows.Where(w => w.FailureAlertedAt == null || w.FailureAlertedAt < dayAgo)
            .Select(w => new
            {
                Workflow = w,
                Failed = db.WorkflowRuns.Count(r =>
                    r.WorkflowId == w.Id
                    && r.Status == WorkflowRunStatus.Failed
                    && r.FinishedAt > (w.FailureAlertedAt ?? dayAgo)
                ),
            })
            .Where(x => x.Failed > 0)
            .ToListAsync(ct);
        if (failing.Count == 0)
            return;
        var admins = await db
            .Users.Where(x => x.IsActive && x.Role == UserRole.Admin)
            .Select(x => x.Email)
            .ToListAsync(ct);
        var site = await db.Organizations.Select(x => x.PublicUrl).FirstOrDefaultAsync(ct);
        foreach (var item in failing)
        {
            var w = item.Workflow;
            var link = string.IsNullOrWhiteSpace(site)
                ? "Open Settings, then Workflows, to see what went wrong."
                : $"See what went wrong: {site.TrimEnd('/')}/settings/workflows/{w.Id}?tab=runs";
            foreach (var to in w.CreatedBy.Contains('@') ? [w.CreatedBy] : admins)
                db.EmailOutbox.Add(
                    new EmailOutboxItem
                    {
                        Recipient = to,
                        Subject =
                            $"Workflow “{w.Name}”: {item.Failed} {(item.Failed == 1 ? "run" : "runs")} failed",
                        Body =
                            $"{item.Failed} {(item.Failed == 1 ? "run" : "runs")} of “{w.Name}” stopped after trying again 4 times. You can fix the cause and press Retry.\n\n{link}",
                    }
                );
            w.FailureAlertedAt = now;
        }
        await db.SaveChangesAsync(ct);
    }
}
