using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Interviews.Recording;

/// <summary>
/// Runs the recording pipeline off the request: finished and abandoned uploads are joined and
/// processed, then transcribed and summarized. One item at a time.
/// </summary>
// ponytail: one worker on one server, matching LocalFileStore; claim rows with a lock column before running several.
public sealed class RecordingWorker(
    IServiceScopeFactory scopes,
    MediaTools media,
    ILogger<RecordingWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var worked = false;
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                var files = scope.ServiceProvider.GetRequiredService<LocalFileStore>();
                var ai = scope.ServiceProvider.GetRequiredService<IAiAssistant>();
                await RecordingPipeline.FinishStaleUploadsAsync(
                    db,
                    DateTimeOffset.UtcNow,
                    stoppingToken
                );
                worked =
                    await RecordingPipeline.ProcessNextAsync(
                        db,
                        files,
                        media,
                        logger,
                        stoppingToken
                    )
                    || await RecordingPipeline.TranscribeNextAsync(
                        db,
                        files,
                        ai,
                        media,
                        logger,
                        stoppingToken
                    );
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "The recording worker failed and will try again.");
            }
            if (!worked)
                await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
        }
    }
}
