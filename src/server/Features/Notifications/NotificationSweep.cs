using System.Text;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// Time-based notifications, run by <see cref="EmailOutboxWorker"/> every few minutes: snoozes that
/// end, interviews about to start, the daily "gone quiet" summary and the daily summary email.
/// The two daily ones wait until quiet hours are over (the summary goes out as the day starts).
/// </summary>
public static class NotificationSweep
{
    public static readonly TimeSpan InterviewLead = TimeSpan.FromHours(1);
    private static readonly TimeSpan KeepFor = TimeSpan.FromDays(90);

    public static async Task RunAsync(
        AtsDbContext db,
        Organization organization,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        await EndSnoozesAsync(db, now, ct);
        await InterviewsSoonAsync(db, organization, now, ct);
        if (!EmailOutboxWorker.InQuietHours(organization, now))
        {
            await StalledSummaryAsync(db, organization, now, ct);
            await DigestsAsync(db, organization, now, ct);
        }
        await db.Notifications.Where(x => x.CreatedAt < now - KeepFor).ExecuteDeleteAsync(ct);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Snoozed threads come back to the inbox, and whoever snoozed them hears about it.</summary>
    public static async Task EndSnoozesAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var due = await db
            .Applications.Include(x => x.Candidate)
            .Where(x => x.SnoozedUntil != null && x.SnoozedUntil <= now)
            .Take(200)
            .ToListAsync(ct);
        foreach (var application in due)
        {
            await Notify.AddAsync(
                db,
                [application.SnoozedBy ?? application.AssigneeEmail],
                new NotificationDraft(
                    NotificationKinds.SnoozeEnded,
                    $"Back in your inbox: {application.Candidate!.FirstName} {application.Candidate.LastName}",
                    $"/messages?thread={application.Id}",
                    ApplicationId: application.Id
                ),
                ct
            );
            application.SnoozedUntil = null;
            application.SnoozedBy = null;
        }
    }

    /// <summary>One notification per interviewer, an hour before the interview.</summary>
    public static async Task InterviewsSoonAsync(
        AtsDbContext db,
        Organization organization,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var soon = await db
            .Interviews.AsNoTracking()
            .Where(x =>
                x.Status == InterviewStatus.Scheduled
                && x.StartsAt > now
                && x.StartsAt <= now + InterviewLead
            )
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.StartsAt,
                x.EndsAt,
                x.InterviewerEmails,
                x.ApplicationId,
                Candidate = x.Application!.Candidate!.FirstName
                    + " "
                    + x.Application.Candidate.LastName,
                Job = x.Application.Requisition!.Title,
            })
            .Take(200)
            .ToListAsync(ct);
        foreach (var interview in soon)
        {
            var group = $"interview-soon:{interview.Id}";
            var told = await db
                .Notifications.Where(x => x.GroupKey == group)
                .Select(x => x.UserEmail)
                .ToListAsync(ct);
            var people = interview
                .InterviewerEmails.Select(x => x.ToLowerInvariant())
                .Except(told)
                .ToArray();
            if (people.Length == 0)
                continue;
            var zones = await db
                .Users.AsNoTracking()
                .Where(x => people.Contains(x.Email))
                .ToDictionaryAsync(x => x.Email, x => x.TimeZone, ct);
            // Each person reads the time in their own zone.
            foreach (var email in people)
                await Notify.AddAsync(
                    db,
                    [email],
                    new NotificationDraft(
                        NotificationKinds.InterviewSoon,
                        $"Starting soon: {interview.Title} with {interview.Candidate}",
                        $"/interviews/{interview.Id}",
                        Body: $"{interview.Job} · {TimeText.Range(interview.StartsAt, interview.EndsAt, TimeText.Zone(zones.GetValueOrDefault(email), organization.TimeZone))}",
                        GroupKey: group,
                        ApplicationId: interview.ApplicationId
                    ),
                    ct
                );
        }
    }

    /// <summary>
    /// Once a day, each recruiter hears how many applications on their jobs have gone quiet, as one
    /// entry instead of one per application. The team channel gets one line too.
    /// </summary>
    public static async Task StalledSummaryAsync(
        AtsDbContext db,
        Organization organization,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var days = Math.Clamp(organization.StaleReminderDays, 1, 30);
        var cutoff = now.AddDays(-days);
        var today = LocalDate(organization, now);
        var group = $"stalled:{today:yyyy-MM-dd}";
        var perJob = await db
            .Applications.AsNoTracking()
            .Where(x =>
                x.Status == ApplicationStatus.Active
                && x.LastActivityAt < cutoff
                && !x.PipelineStage!.IsTerminal
            )
            .GroupBy(x => new { x.RequisitionId, x.Requisition!.RecruiterEmail })
            .Select(g => new
            {
                g.Key.RequisitionId,
                g.Key.RecruiterEmail,
                Count = g.Count(),
            })
            .ToListAsync(ct);
        // Each job's recruiters on its hiring team, or its recruiter field when the team has none.
        var jobIds = perJob.Select(x => x.RequisitionId).ToArray();
        var members = await db
            .RequisitionMembers.AsNoTracking()
            .Where(x =>
                jobIds.Contains(x.RequisitionId)
                && x.Role == RequisitionRole.Recruiter
                && x.User!.IsActive
            )
            .Select(x => new { x.RequisitionId, Email = x.User!.Email.ToLower() })
            .ToListAsync(ct);
        var counts = perJob
            .SelectMany(job =>
            {
                var recruiters = members
                    .Where(m => m.RequisitionId == job.RequisitionId)
                    .Select(m => m.Email)
                    .ToList();
                if (recruiters.Count == 0)
                    recruiters.Add(job.RecruiterEmail.ToLowerInvariant());
                return recruiters.Select(email => (Recruiter: email, job.Count));
            })
            .GroupBy(x => x.Recruiter)
            .Select(g => new { Recruiter = g.Key, Count = g.Sum(x => x.Count) })
            .ToList();
        var told = await db
            .Notifications.Where(x => x.GroupKey == group)
            .Select(x => x.UserEmail)
            .ToListAsync(ct);
        var total = 0;
        foreach (var row in counts.Where(x => !told.Contains(x.Recruiter.ToLowerInvariant())))
        {
            total += row.Count;
            await Notify.AddAsync(
                db,
                [row.Recruiter],
                new NotificationDraft(
                    NotificationKinds.Stalled,
                    row.Count == 1
                        ? $"1 application on your jobs has had no activity for {days} days or more"
                        : $"{row.Count} applications on your jobs have had no activity for {days} days or more",
                    "/reports/stuck",
                    GroupKey: group
                ),
                ct
            );
        }
        if (total > 0)
            await PipelineEvents.NotifyAsync(
                db,
                $"{total} applications have had no activity for {days} days or more.",
                ct,
                TeamChannel.Stalled,
                "/reports/stuck"
            );
    }

    /// <summary>
    /// The daily summary email: each person's unread notifications of the kinds they chose for it,
    /// sent once a day after quiet hours end.
    /// </summary>
    public static async Task DigestsAsync(
        AtsDbContext db,
        Organization organization,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var dayStart = DayStart(organization, now);
        var digestKinds = NotificationKinds.All.Where(x => x.Digest).Select(x => x.Key).ToArray();
        var chosen = await db
            .NotificationPreferences.AsNoTracking()
            .Select(x => new
            {
                x.UserEmail,
                x.Kind,
                x.Digest,
            })
            .ToListAsync(ct);
        var pending = await db
            .Notifications.Where(x =>
                x.DigestedAt == null && x.ReadAt == null && x.CreatedAt > now.AddDays(-2)
            )
            .OrderBy(x => x.CreatedAt)
            .ToListAsync(ct);
        var sentToday = await db
            .EmailOutbox.Where(x => x.TemplateKey == "digest" && x.CreatedAt >= dayStart)
            .Select(x => x.Recipient)
            .ToListAsync(ct);
        var site = organization.PublicUrl;
        foreach (var person in pending.GroupBy(x => x.UserEmail))
        {
            if (sentToday.Contains(person.Key))
                continue;
            var mine = chosen
                .Where(x => x.UserEmail == person.Key)
                .ToDictionary(x => x.Kind, x => x.Digest);
            var items = person
                .Where(x =>
                    mine.TryGetValue(x.Kind, out var on) ? on : digestKinds.Contains(x.Kind)
                )
                .ToList();
            if (items.Count == 0)
                continue;
            var list = new StringBuilder();
            foreach (var item in items.Take(30))
            {
                var link = Notify.AbsoluteLink(site, item.Href);
                list.Append("- ")
                    .Append(link.Length > 0 ? $"[{item.Title}]({link})" : item.Title)
                    .Append(item.Body is { Length: > 0 } body ? $": {body.Split('\n')[0]}" : "")
                    .Append('\n');
            }
            if (items.Count > 30)
                list.Append($"- And {items.Count - 30} more\n");
            await EmailTemplates.QueueAsync(
                db,
                "digest",
                null,
                person.Key,
                new Dictionary<string, string>
                {
                    ["count"] = items.Count == 1 ? "1 update" : $"{items.Count} updates",
                    ["items"] = list.ToString().TrimEnd(),
                    ["link"] = Notify.AbsoluteLink(site, "/notifications"),
                },
                null,
                ct
            );
            foreach (var item in items)
                item.DigestedAt = now;
        }
    }

    private static DateTime LocalDate(Organization organization, DateTimeOffset now) =>
        TimeZoneInfo.ConvertTime(now, TimeText.Zone(organization.TimeZone)).Date;

    // Midnight today in the organization's zone, as a UTC instant (Postgres takes only UTC).
    public static DateTimeOffset DayStart(Organization organization, DateTimeOffset now)
    {
        var zone = TimeText.Zone(organization.TimeZone);
        var local = TimeZoneInfo.ConvertTime(now, zone);
        return new DateTimeOffset(local.Date, local.Offset).ToUniversalTime();
    }
}
