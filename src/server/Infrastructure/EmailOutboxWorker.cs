using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed class EmailOutboxWorker(
    IServiceScopeFactory scopeFactory,
    IEmailSender sender,
    LocalFileStore files,
    IHubContext<InboxHub> hub,
    ILogger<EmailOutboxWorker> logger
) : BackgroundService
{
    private DateTimeOffset lastReminderSweep = DateTimeOffset.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Queued mail (sign-in codes, acceptances) goes out within seconds; reminders only need a sweep now and then.
                while (await ProcessOneAsync(stoppingToken)) { }
                if (DateTimeOffset.UtcNow - lastReminderSweep > TimeSpan.FromMinutes(5))
                {
                    await RunRemindersAsync(stoppingToken);
                    lastReminderSweep = DateTimeOffset.UtcNow;
                }
                await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
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
        var item = await db
            .EmailOutbox.Where(x =>
                (
                    x.Status == EmailOutboxStatus.Pending
                    || (x.Status == EmailOutboxStatus.Processing && x.LockedUntil <= now)
                )
                && x.NextAttemptAt <= now
            )
            .OrderBy(x => x.NextAttemptAt)
            .FirstOrDefaultAsync(ct);
        if (item is null)
            return false;
        item.Status = EmailOutboxStatus.Processing;
        item.Attempts++;
        item.LockedUntil = now.AddMinutes(5);
        await db.SaveChangesAsync(ct);
        try
        {
            if (await db.Candidates.AnyAsync(x => x.Email == item.Recipient && x.EmailBounced, ct))
                throw new InvalidOperationException(
                    "This address bounced earlier, so the email was not sent."
                );
            item.ProviderMessageId = await sender.SendAsync(
                item.Recipient,
                item.Subject,
                item.Body,
                ct,
                await ExtrasAsync(db, item, ct)
            );
            if (item.ProviderMessageId is not null)
            {
                item.DeliveryStatus = "sent";
                item.DeliveryUpdatedAt = DateTimeOffset.UtcNow;
            }
            item.Status = EmailOutboxStatus.Succeeded;
            item.CompletedAt = DateTimeOffset.UtcNow;
            item.LastError = null;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            var permanent = exception is InvalidOperationException;
            item.Status =
                permanent || item.Attempts >= 5
                    ? EmailOutboxStatus.Failed
                    : EmailOutboxStatus.Pending;
            item.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(
                Math.Pow(2, Math.Min(item.Attempts, 4))
            );
            item.LastError = exception.Message[..Math.Min(exception.Message.Length, 2000)];
        }
        item.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        // A scheduled or undo-delayed message just reached the candidate: their portal and the
        // team's status line ("Sending…" to "Sent") update.
        if (
            item.TemplateKey == EmailThreads.MessageTemplateKey
            && item.ApplicationId is { } applicationId
        )
        {
            var candidateId = await db
                .Applications.Where(x => x.Id == applicationId)
                .Select(x => (Guid?)x.CandidateId)
                .SingleOrDefaultAsync(ct);
            await hub.ThreadChangedAsync(applicationId, candidateId);
        }
        return true;
    }

    // Resend takes up to 40 MB per email after encoding; keep well under it and link to the portal above that.
    private const long MaxAttachedBytes = 25 * 1024 * 1024;

    private async Task<EmailExtras?> ExtrasAsync(
        AtsDbContext db,
        EmailOutboxItem item,
        CancellationToken ct
    )
    {
        if (
            item.FromName is null
            && item.ReplyTo is null
            && item.ThreadReference is null
            && item.AttachmentIds.Length == 0
            && item.InlineFileText is null
        )
            return null;
        var stored =
            item.AttachmentIds.Length == 0
                ? []
                : await db
                    .Attachments.AsNoTracking()
                    .Where(x => item.AttachmentIds.Contains(x.Id))
                    .ToListAsync(ct);
        List<EmailFile>? attached = null;
        if (stored.Count > 0 && stored.Sum(x => x.Length) <= MaxAttachedBytes)
        {
            attached = [];
            foreach (var file in stored)
            {
                await using var stream = files.OpenRead(file.StoredFileName);
                using var buffer = new MemoryStream();
                await stream.CopyToAsync(buffer, ct);
                attached.Add(new EmailFile(file.OriginalFileName, buffer.ToArray()));
            }
        }
        if (item.InlineFileText is not null)
            (attached ??= []).Add(
                new EmailFile(
                    item.InlineFileName ?? "attachment.txt",
                    System.Text.Encoding.UTF8.GetBytes(item.InlineFileText),
                    item.InlineFileContentType
                )
            );
        return new EmailExtras(item.FromName, item.ReplyTo, item.ThreadReference, attached);
    }

    private async Task RunRemindersAsync(CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        Organization? found;
        await using (var scope = scopeFactory.CreateAsyncScope())
            found = await scope
                .ServiceProvider.GetRequiredService<AtsDbContext>()
                .Organizations.AsNoTracking()
                .SingleOrDefaultAsync(ct);
        if (found is not { } organization)
            return;
        var steps = new List<(string, Func<AtsDbContext, Task>)>
        {
            ("notification sweep", db => NotificationSweep.RunAsync(db, organization, now, ct)),
        };
        if (!InQuietHours(organization, now))
            // Booking, scorecard, stuck-application and assessment reminders are built-in
            // workflows now (WorkflowWorker); approvals stay here.
            steps.Add(
                (
                    "approval reminders",
                    db => Api.AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct)
                )
            );
        await RunEachAsync(scopeFactory, logger, steps, ct);
    }

    /// <summary>
    /// Runs each sweep in its own scope, so one that fails (and its unsaved changes) cannot stop
    /// the others. Failures are logged. Returns how many failed.
    /// </summary>
    public static async Task<int> RunEachAsync(
        IServiceScopeFactory scopes,
        ILogger logger,
        IEnumerable<(string Name, Func<AtsDbContext, Task> Run)> steps,
        CancellationToken ct
    )
    {
        var failed = 0;
        foreach (var (name, run) in steps)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await run(scope.ServiceProvider.GetRequiredService<AtsDbContext>());
            }
            catch (Exception exception) when (!ct.IsCancellationRequested)
            {
                failed++;
                logger.LogError(exception, "The {Step} failed; the other sweeps still run.", name);
            }
        }
        return failed;
    }

    // Quiet hours are in the organization's time zone and may wrap past midnight (for example 20 to 8).
    public static bool InQuietHours(Organization organization, DateTimeOffset now)
    {
        if (organization.QuietHoursStart == organization.QuietHoursEnd)
            return false;
        TimeZoneInfo zone;
        try
        {
            zone = TimeZoneInfo.FindSystemTimeZoneById(organization.TimeZone);
        }
        catch (Exception exception)
            when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            zone = TimeZoneInfo.Utc;
        }
        var hour = TimeZoneInfo.ConvertTime(now, zone).Hour;
        return organization.QuietHoursStart < organization.QuietHoursEnd
            ? hour >= organization.QuietHoursStart && hour < organization.QuietHoursEnd
            : hour >= organization.QuietHoursStart || hour < organization.QuietHoursEnd;
    }
}
