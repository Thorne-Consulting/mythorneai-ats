using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed class EmailOutboxWorker(
    IServiceScopeFactory scopeFactory,
    IEmailSender sender,
    ILogger<EmailOutboxWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                while (await ProcessOneAsync(stoppingToken)) { }
                await SendStaleRemindersAsync(stoppingToken);
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Email worker failed; retrying.");
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
        }
    }

    private async Task<bool> ProcessOneAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var now = DateTimeOffset.UtcNow;
        var item = await db.EmailOutbox.Where(x =>
                (x.Status == EmailOutboxStatus.Pending || (x.Status == EmailOutboxStatus.Processing && x.LockedUntil <= now))
                && x.NextAttemptAt <= now)
            .OrderBy(x => x.NextAttemptAt).FirstOrDefaultAsync(ct);
        if (item is null) return false;
        item.Status = EmailOutboxStatus.Processing;
        item.Attempts++;
        item.LockedUntil = now.AddMinutes(5);
        await db.SaveChangesAsync(ct);
        try
        {
            await sender.SendAsync(item.Recipient, item.Subject, item.Body, ct);
            item.Status = EmailOutboxStatus.Succeeded;
            item.CompletedAt = DateTimeOffset.UtcNow;
            item.LastError = null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            item.Status = item.Attempts >= 5 ? EmailOutboxStatus.Failed : EmailOutboxStatus.Pending;
            item.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(Math.Pow(2, Math.Min(item.Attempts, 4)));
            item.LastError = exception.Message[..Math.Min(exception.Message.Length, 2000)];
        }
        item.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return true;
    }

    private async Task SendStaleRemindersAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var reminderDays = Math.Clamp(
            await db.Organizations.Select(x => (int?)x.StaleReminderDays).SingleOrDefaultAsync(ct) ?? 3,
            1,
            30
        );
        var cutoff = DateTimeOffset.UtcNow.AddDays(-reminderDays);
        var applications = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
            .Where(x => x.Status == ApplicationStatus.Active && x.LastActivityAt < cutoff
                && (x.LastReminderAt == null || x.LastReminderAt < cutoff))
            .Take(100).ToListAsync(ct);
        foreach (var application in applications)
        {
            db.EmailOutbox.Add(new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = application.Candidate!.Email,
                Subject = $"Update on your {application.Requisition!.Title} application",
                Body = $"Your application is still being reviewed. We will share the next update when there is progress.\n\nApplication: {application.Requisition.Title}",
            });
            application.LastReminderAt = DateTimeOffset.UtcNow;
        }
        if (applications.Count > 0) await db.SaveChangesAsync(ct);
    }
}
