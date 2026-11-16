using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Runs queued fit checks one at a time, so "Check fit for the top 25" never waits on the page.</summary>
public sealed class FitWorker(IServiceScopeFactory scopeFactory, ILogger<FitWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                worked = await RunOneAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Fit check sweep failed");
            }
            if (!worked)
                await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken).ContinueWith(_ => { });
        }
    }

    private async Task<bool> RunOneAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var ai = scope.ServiceProvider.GetRequiredService<IAiAssistant>();
        var job = await db
            .FitJobs.Where(x => x.Status == "Pending")
            .OrderBy(x => x.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (job is null)
            return false;
        job.Status = "Running";
        job.Attempts++;
        await db.SaveChangesAsync(ct);
        try
        {
            var requisition = await db
                .Requisitions.AsNoTracking()
                .SingleAsync(x => x.Id == job.RequisitionId, ct);
            var candidate = await db
                .Candidates.AsNoTracking()
                .SingleAsync(x => x.Id == job.CandidateId, ct);
            var (_, _, problem) = await AtsEndpoints.CheckFitAsync(
                db,
                ai,
                requisition,
                candidate,
                job.RequestedBy,
                false,
                ct
            );
            job.Status = problem is null ? "Done" : "Failed";
            job.LastError = problem;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Two tries, then it stays failed; the person can run the check by hand.
            job.Status = job.Attempts < 2 ? "Pending" : "Failed";
            job.LastError = exception.Message;
            logger.LogWarning(exception, "Fit check {JobId} failed", job.Id);
        }
        job.CompletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return true;
    }
}
