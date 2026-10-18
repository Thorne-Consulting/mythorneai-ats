using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Runs the parse pipeline (docs/resume-parsing.md) for every queued attachment, one at a time.</summary>
public sealed class ResumeParseWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<ResumeParseWorker> logger
) : BackgroundService
{
    private const int MaximumAttempts = 3;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Resume parsing worker started.");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!await TryProcessOneAsync(stoppingToken))
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Resume parsing worker failed unexpectedly.");
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
            }
        }
    }

    private async Task<bool> TryProcessOneAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var now = DateTimeOffset.UtcNow;
        var jobId = await db.ResumeParseJobs.AsNoTracking()
            .Where(x => (x.Status == "Pending" || (x.Status == "Processing" && x.LockedUntil <= now))
                && x.NextAttemptAt <= now)
            .OrderBy(x => x.NextAttemptAt)
            .ThenBy(x => x.CreatedAt)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (jobId is null)
            return false;

        var claimed = await db.ResumeParseJobs.Where(x => x.Id == jobId
                && (x.Status == "Pending" || (x.Status == "Processing" && x.LockedUntil <= now)))
            .ExecuteUpdateAsync(updates => updates
                .SetProperty(x => x.Status, "Processing")
                .SetProperty(x => x.LockedUntil, now.AddMinutes(5))
                .SetProperty(x => x.Attempts, x => x.Attempts + 1), cancellationToken);
        if (claimed == 0)
            return true;

        db.ChangeTracker.Clear();
        var job = await db.ResumeParseJobs.SingleAsync(x => x.Id == jobId, cancellationToken);
        var attachment = await db.Attachments.SingleOrDefaultAsync(x => x.Id == job.AttachmentId, cancellationToken);
        if (attachment is null)
        {
            job.Status = "Failed";
            job.LastError = "The uploaded file no longer exists.";
            job.CompletedAt = now;
            await db.SaveChangesAsync(cancellationToken);
            return true;
        }

        try
        {
            var candidate = await db.Candidates.WithProfile().SingleAsync(x => x.Id == attachment.CandidateId, cancellationToken);
            var files = scope.ServiceProvider.GetRequiredService<LocalFileStore>();
            var textExtractor = scope.ServiceProvider.GetRequiredService<ResumeTextExtractor>();
            var extractor = scope.ServiceProvider.GetRequiredService<ResumeExtractor>();
            string text;
            await using (var stream = files.OpenRead(attachment.StoredFileName))
                text = await textExtractor.ExtractAsync(stream, attachment.OriginalFileName, cancellationToken);

            var extraction = await extractor.ExtractAsync(
                text,
                new AiContext("parse-resume", null, "Candidate", candidate.Id.ToString()),
                cancellationToken
            );
            await ResumeProfileWriter.ApplyAsync(db, candidate, extraction, text, cancellationToken);
            attachment.ParseStatus = "Parsed";
            attachment.ParseError = null;
            attachment.ParsedAt = DateTimeOffset.UtcNow;
            job.Status = "Succeeded";
            job.LockedUntil = null;
            job.LastError = null;
            job.CompletedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent
            {
                EntityType = "Candidate",
                EntityId = candidate.Id.ToString(),
                Action = "ResumeParsed",
                ActorEmail = "system:resume-parser",
                Details = System.Text.Json.JsonSerializer.Serialize(new
                {
                    attachment.Id,
                    extraction.Model,
                    extraction.PromptVersion,
                    Jobs = candidate.WorkExperiences.Count,
                    Unverified = candidate.WorkExperiences.Count(x => !x.Verified) + candidate.Educations.Count(x => !x.Verified),
                }),
            });
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // No text layer and no model are not going to fix themselves by retrying.
            var finalAttempt = job.Attempts >= MaximumAttempts
                || exception is ResumeNeedsOcrException or AiUnavailableException or InvalidDataException;
            job.Status = finalAttempt ? "Failed" : "Pending";
            job.LockedUntil = null;
            job.LastError = Truncate(exception is DbUpdateConcurrencyException concurrency
                ? exception.Message + " Entries: " + string.Join(", ", concurrency.Entries.Select(x => $"{x.Metadata.ClrType.Name}:{x.State}"))
                : exception.Message, 2000);
            job.NextAttemptAt = DateTimeOffset.UtcNow.AddSeconds(5 * Math.Pow(2, job.Attempts - 1));
            if (finalAttempt)
            {
                attachment.ParseStatus = exception is ResumeNeedsOcrException ? "NeedsOcr" : "Failed";
                attachment.ParseError = job.LastError;
                attachment.ParsedAt = null;
                job.CompletedAt = DateTimeOffset.UtcNow;
            }
            logger.LogWarning(exception, "Resume parsing failed for {AttachmentId}; attempt {Attempt}: {Error}", attachment.Id, job.Attempts, job.LastError);
        }

        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
