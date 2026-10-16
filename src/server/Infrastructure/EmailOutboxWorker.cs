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
            if (await db.Candidates.AnyAsync(x => x.Email == item.Recipient && x.EmailBounced, ct))
                throw new InvalidOperationException("This address bounced earlier, so the email was not sent.");
            item.ProviderMessageId = await sender.SendAsync(item.Recipient, item.Subject, item.Body, ct);
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
            item.Status = permanent || item.Attempts >= 5 ? EmailOutboxStatus.Failed : EmailOutboxStatus.Pending;
            item.NextAttemptAt = DateTimeOffset.UtcNow.AddMinutes(Math.Pow(2, Math.Min(item.Attempts, 4)));
            item.LastError = exception.Message[..Math.Min(exception.Message.Length, 2000)];
        }
        item.LockedUntil = null;
        await db.SaveChangesAsync(ct);
        return true;
    }

    private async Task RunRemindersAsync(CancellationToken ct)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
        if (organization is null || InQuietHours(organization, DateTimeOffset.UtcNow))
            return;
        await SendStaleRemindersAsync(db, organization, ct);
        await SendBookingRemindersAsync(db, organization, ct);
        await SendScorecardRemindersAsync(db, organization, ct);
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
        catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            zone = TimeZoneInfo.Utc;
        }
        var hour = TimeZoneInfo.ConvertTime(now, zone).Hour;
        return organization.QuietHoursStart < organization.QuietHoursEnd
            ? hour >= organization.QuietHoursStart && hour < organization.QuietHoursEnd
            : hour >= organization.QuietHoursStart || hour < organization.QuietHoursEnd;
    }

    private static async Task SendStaleRemindersAsync(AtsDbContext db, Organization organization, CancellationToken ct)
    {
        var days = Math.Clamp(organization.StaleReminderDays, 1, 30);
        var cutoff = DateTimeOffset.UtcNow.AddDays(-days);
        var applications = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition).Include(x => x.PipelineStage)
            .Where(x => x.Status == ApplicationStatus.Active && x.LastActivityAt < cutoff
                && !x.PipelineStage!.IsTerminal
                && x.ReminderCount < organization.MaxReminders
                && (x.LastReminderAt == null || x.LastReminderAt < cutoff)
                && !x.Interviews.Any(i => i.Status == InterviewStatus.Proposed))
            .Take(100).ToListAsync(ct);
        foreach (var application in applications)
        {
            if (!application.Candidate!.DoNotContact)
                await EmailTemplates.QueueAsync(
                    db, "stale-reminder", application.RequisitionId, application.Candidate.Email,
                    new Dictionary<string, string>
                    {
                        ["firstName"] = application.Candidate.FirstName,
                        ["jobTitle"] = application.Requisition!.Title,
                    },
                    application.Id, ct);
            // The recruiter is the one who has to act, so they hear about it too.
            var waiting = (int)(DateTimeOffset.UtcNow - application.LastActivityAt).TotalDays;
            db.EmailOutbox.Add(new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = application.Requisition!.RecruiterEmail,
                Subject = $"Stalled: {application.Candidate.FirstName} {application.Candidate.LastName} for {application.Requisition.Title}",
                Body = $"{application.Candidate.FirstName} {application.Candidate.LastName} has been in \"{application.PipelineStage!.Name}\" for {waiting} days with no activity. Move them forward or close the loop.",
            });
            await PipelineEvents.NotifyAsync(db,
                $"Stalled: {application.Candidate.FirstName} {application.Candidate.LastName} has been in {application.PipelineStage.Name} for {application.Requisition.Title} for {waiting} days.", ct);
            application.LastReminderAt = DateTimeOffset.UtcNow;
            application.ReminderCount++;
        }
        if (applications.Count > 0) await db.SaveChangesAsync(ct);
    }

    private static async Task SendBookingRemindersAsync(AtsDbContext db, Organization organization, CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(organization.BookReminderDays, 1, 30));
        var open = await db.Interviews
            .Include(x => x.Application).ThenInclude(x => x!.Candidate)
            .Include(x => x.Application).ThenInclude(x => x!.Requisition)
            .Where(x => x.Status == InterviewStatus.Proposed
                && x.Application!.Status == ApplicationStatus.Active
                && x.CreatedAt < cutoff
                && x.BookingReminderCount < organization.MaxReminders
                && (x.LastBookingReminderAt == null || x.LastBookingReminderAt < cutoff))
            .OrderBy(x => x.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        // Several proposed slots can belong to one request; remind once per application.
        foreach (var group in open.GroupBy(x => x.ApplicationId))
        {
            var interview = group.First();
            var application = interview.Application!;
            if (!application.Candidate!.DoNotContact)
                await EmailTemplates.QueueAsync(
                    db, "booking-reminder", application.RequisitionId, application.Candidate.Email,
                    new Dictionary<string, string>
                    {
                        ["firstName"] = application.Candidate.FirstName,
                        ["jobTitle"] = application.Requisition!.Title,
                        ["interviewTitle"] = interview.Title,
                    },
                    application.Id, ct);
            await PipelineEvents.NotifyAsync(db,
                $"{application.Candidate.FirstName} {application.Candidate.LastName} hasn't booked the {interview.Title} interview for {application.Requisition!.Title} yet.", ct);
            foreach (var slot in group)
            {
                slot.LastBookingReminderAt = DateTimeOffset.UtcNow;
                slot.BookingReminderCount++;
            }
        }
        if (open.Count > 0) await db.SaveChangesAsync(ct);
    }

    private static async Task SendScorecardRemindersAsync(AtsDbContext db, Organization organization, CancellationToken ct)
    {
        var cutoff = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(organization.ScorecardReminderDays, 1, 30));
        var interviews = await db.Interviews
            .Include(x => x.Application).ThenInclude(x => x!.Requisition)
            .Include(x => x.Scorecards)
            .Where(x =>
                x.Status == InterviewStatus.Scheduled
                && x.ScorecardReminderCount < organization.MaxReminders
                && (x.LastScorecardReminderAt == null || x.LastScorecardReminderAt < cutoff)
                && x.EndsAt < DateTimeOffset.UtcNow)
            .Take(100)
            .ToListAsync(ct);
        foreach (var interview in interviews)
        {
            var missing = interview.InterviewerEmails
                .Where(email => !interview.Scorecards.Any(scorecard =>
                    scorecard.InterviewerEmail.Equals(email, StringComparison.OrdinalIgnoreCase)))
                .ToArray();
            if (missing.Length == 0 || interview.Application?.Requisition is null)
                continue;
            foreach (var interviewer in missing)
                await EmailTemplates.QueueAsync(
                    db, "scorecard-reminder", interview.Application.RequisitionId, interviewer,
                    new Dictionary<string, string>
                    {
                        ["jobTitle"] = interview.Application.Requisition.Title,
                        ["interviewTitle"] = interview.Title,
                    },
                    interview.ApplicationId, ct);
            await PipelineEvents.NotifyAsync(db,
                $"Scorecard overdue for {interview.Title} ({interview.Application.Requisition.Title}): {string.Join(", ", missing)}.", ct);
            interview.LastScorecardReminderAt = DateTimeOffset.UtcNow;
            interview.ScorecardReminderCount++;
        }
        if (interviews.Count > 0)
            await db.SaveChangesAsync(ct);
    }
}
