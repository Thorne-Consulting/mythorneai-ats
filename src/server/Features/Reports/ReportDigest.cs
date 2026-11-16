using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Scheduled report emails: when the next one goes out, and what it says.</summary>
public static class ReportDigest
{
    private static readonly string[] DayNames = CultureInfo
        .InvariantCulture
        .DateTimeFormat
        .DayNames;

    /// <summary>The first send time after <paramref name="after"/>, at the local hour in the zone.</summary>
    public static DateTimeOffset NextSend(
        ReportFrequency frequency,
        int dayOfWeek,
        int dayOfMonth,
        int hour,
        DateTimeOffset after,
        TimeZoneInfo zone
    )
    {
        var day = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(after, zone).DateTime);
        for (var i = 0; i < 400; i++, day = day.AddDays(1))
        {
            var due =
                frequency == ReportFrequency.Weekly
                    ? (int)day.DayOfWeek == dayOfWeek
                    : day.Day == Math.Min(dayOfMonth, DateTime.DaysInMonth(day.Year, day.Month));
            if (!due)
                continue;
            var local = day.ToDateTime(new TimeOnly(hour, 0));
            // A local hour skipped by a daylight-saving change sends an hour later.
            if (zone.IsInvalidTime(local))
                local = local.AddHours(1);
            var at = new DateTimeOffset(local, zone.GetUtcOffset(local)).ToUniversalTime();
            if (at > after)
                return at;
        }
        throw new InvalidOperationException("No send time found within a year.");
    }

    /// <summary>"every Monday at 8:00 AM Central Standard Time".</summary>
    public static string Describe(
        ReportFrequency frequency,
        int dayOfWeek,
        int dayOfMonth,
        int hour,
        TimeZoneInfo zone
    )
    {
        var time = new DateTime(2000, 1, 1, hour, 0, 0).ToString(
            "h:mm tt",
            CultureInfo.InvariantCulture
        );
        var zoneName = TimeText.ZoneName(
            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone),
            zone
        );
        return frequency == ReportFrequency.Weekly
            ? $"every {DayNames[dayOfWeek]} at {time} {zoneName}"
            : $"on day {dayOfMonth} of every month at {time} {zoneName}";
    }

    /// <summary>Active people whose role can see reports.</summary>
    public static Task<List<AppUser>> ReadersAsync(AtsDbContext db, CancellationToken ct) =>
        Permissions.MembersWithAsync(db, Permissions.Reports, ct);

    /// <summary>A saved view's parameters as a report key and its filters.</summary>
    public static (string Report, ReportQuery Query, Dictionary<string, string> Values) ParseView(
        string json
    )
    {
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var document = JsonDocument.Parse(json);
            foreach (var property in document.RootElement.EnumerateObject())
                if (
                    property.Value.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(property.Value.GetString())
                )
                    values[property.Name] = property.Value.GetString()!;
        }
        catch (JsonException) { }
        string? Get(string key) => values.GetValueOrDefault(key);
        var query = new ReportQuery
        {
            RequisitionId = Guid.TryParse(Get("requisitionId"), out var job) ? job : null,
            Department = Get("department"),
            Source = Get("source"),
            Recruiter = Get("recruiter"),
            Range = Get("range"),
            From = DateOnly.TryParse(Get("from"), CultureInfo.InvariantCulture, out var from)
                ? from
                : null,
            To = DateOnly.TryParse(Get("to"), CultureInfo.InvariantCulture, out var to) ? to : null,
            GroupBy = Get("groupBy"),
        };
        return (Get("report") ?? "", query, values);
    }

    private static ClaimsPrincipal PrincipalFor(AppUser user) =>
        new(
            new ClaimsIdentity(
                [
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                    new Claim(ClaimTypes.Email, user.Email),
                    new Claim(ClaimTypes.Name, user.DisplayName),
                    new Claim(ClaimTypes.Role, user.Role.ToString()),
                ],
                "report-email"
            )
        );

    /// <summary>"up 12% from 40 in the previous 30 days".</summary>
    public static string Change(ReportStat now, ReportStat? before, string previousLabel)
    {
        if (now.Number is not { } value || before?.Number is not { } old)
            return "";
        if (Math.Abs(value - old) < 0.05)
            return $" (the same as the {previousLabel})";
        var direction = value > old ? "up" : "down";
        // A rate moves in points: 50% to 60% is up 10 points, not up 20%.
        var points = Math.Round(Math.Abs(value - old), 1);
        if (now.Value.EndsWith('%'))
            return $" ({direction} {points.ToString("0.#", CultureInfo.InvariantCulture)} {(points == 1 ? "point" : "points")} from {before.Value} in the {previousLabel})";
        return old == 0
            ? $" ({direction} from {before.Value} in the {previousLabel})"
            : $" ({direction} {Math.Abs((value - old) / old * 100):0}% from {before.Value} in the {previousLabel})";
    }

    /// <summary>Queue every scheduled email that is due. Each recipient gets their own numbers.</summary>
    public static async Task<int> SendDueAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        // ponytail: one API instance sends these; add a row lock (like the outbox) if it ever runs on several.
        var due = await db
            .ReportSubscriptions.Include(x => x.SavedView)
            .Where(x => !x.Paused && x.NextSendAt <= now)
            .OrderBy(x => x.NextSendAt)
            .Take(20)
            .ToListAsync(ct);
        if (due.Count == 0)
            return 0;
        var organization =
            await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct)
            ?? new Organization { Name = "", OwnerEmail = "" };
        var zone = TimeText.Zone(organization.TimeZone);
        var readers = (await ReadersAsync(db, ct)).ToDictionary(x => x.Email.ToLowerInvariant());
        foreach (var subscription in due)
        {
            subscription.LastSentAt = now;
            subscription.NextSendAt = NextSend(
                subscription.Frequency,
                subscription.DayOfWeek,
                subscription.DayOfMonth,
                subscription.Hour,
                now,
                zone
            );
            foreach (var email in subscription.Recipients)
            {
                // People who left or lost report access stop getting it, without an error.
                if (!readers.TryGetValue(email, out var user))
                    continue;
                var message = await ComposeAsync(
                    db,
                    user,
                    subscription,
                    organization,
                    zone,
                    ct,
                    now
                );
                if (message is { } m)
                    db.EmailOutbox.Add(
                        new EmailOutboxItem
                        {
                            Recipient = user.Email,
                            Subject = m.Subject,
                            Body = m.Body,
                            TemplateKey = "report-digest",
                        }
                    );
            }
        }
        await db.SaveChangesAsync(ct);
        return due.Count;
    }

    public static async Task<(string Subject, string Body)?> ComposeAsync(
        AtsDbContext db,
        AppUser user,
        ReportSubscription subscription,
        Organization organization,
        TimeZoneInfo zone,
        CancellationToken ct,
        DateTimeOffset now
    )
    {
        var view = subscription.SavedView!;
        var (key, query, values) = ParseView(view.ParamsJson);
        var info = ReportEngine.Info(key);
        if (info is null)
            return null;
        var principal = PrincipalFor(user);
        var scoped = AtsEndpoints.ScopeForReports(db.Applications.AsNoTracking(), principal);
        var field = ReportEngine.DateFieldOf(info);
        var context = await ReportEngine.LoadAsync(db, scoped, query, field, now, ct);
        var table = (await ReportEngine.RunAsync(context, info.Key, ct))!;
        var previous = context.Period.Previous();
        ReportTable? before = null;
        if (previous is not null)
        {
            var earlier = new ReportQuery
            {
                RequisitionId = query.RequisitionId,
                Department = query.Department,
                Source = query.Source,
                Recruiter = query.Recruiter,
                From = previous.From,
                To = previous.To,
                GroupBy = query.GroupBy,
            };
            before = await ReportEngine.RunAsync(
                await ReportEngine.LoadAsync(db, scoped, earlier, field, now, ct),
                info.Key,
                ct
            );
        }

        var body = new StringBuilder();
        body.AppendLine($"{info.Title}: {context.Period.Label}");
        var filters = new List<string>();
        if (query.RequisitionId is not null && context.Facts.FirstOrDefault() is { } any)
            filters.Add($"job {any.Job}");
        if (query.Department is { } department)
            filters.Add($"department {department}");
        if (query.Source is { } source)
            filters.Add($"source {source}");
        if (query.Recruiter is { } recruiter)
            filters.Add(
                $"recruiter {context.Names.GetValueOrDefault(recruiter.ToLowerInvariant(), recruiter)}"
            );
        if (filters.Count > 0)
            body.AppendLine($"Filtered to {string.Join(", ", filters)}.");
        body.AppendLine();
        foreach (var stat in table.Stats ?? [])
            body.AppendLine(
                $"{stat.Label}: {stat.Value}{Change(stat, before?.Stats?.FirstOrDefault(x => x.Label == stat.Label), previous?.Label ?? "")}"
            );
        if (table.Note is { } note)
            body.AppendLine().AppendLine(note);
        body.AppendLine();
        var site = organization.PublicUrl?.TrimEnd('/');
        var link = string.Join(
            '&',
            values
                .Where(x => x.Key != "report")
                .Select(x => $"{Uri.EscapeDataString(x.Key)}={Uri.EscapeDataString(x.Value)}")
        );
        body.AppendLine(
            string.IsNullOrWhiteSpace(site)
                ? "To see the full report, open MyThorneAI and go to Reports."
                : $"See the full report: {site}/reports/{info.Key}{(link.Length > 0 ? "?" + link : "")}"
        );
        body.AppendLine();
        var reader = TimeText.Zone(user.TimeZone, organization.TimeZone);
        body.AppendLine(
            $"You get \"{view.Name}\" {Describe(subscription.Frequency, subscription.DayOfWeek, subscription.DayOfMonth, subscription.Hour, zone)}. "
                + $"The next one comes on {TimeText.DateTime(subscription.NextSendAt, reader)}."
        );
        body.AppendLine(
            string.IsNullOrWhiteSpace(site)
                ? "To pause or stop it, go to Reports, then Scheduled emails."
                : $"To pause or stop it: {site}/reports/subscriptions"
        );
        return (
            $"{view.Name}: {info.Title}, {context.Period.Label.ToLowerInvariant()}",
            body.ToString().TrimEnd()
        );
    }
}

public sealed class ReportDigestWorker(
    IServiceScopeFactory scopes,
    ILogger<ReportDigestWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                await ReportDigest.SendDueAsync(db, DateTimeOffset.UtcNow, stoppingToken);
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
            catch (Exception exception)
            {
                logger.LogError(exception, "Scheduled report emails failed; retrying.");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken).ContinueWith(_ => { });
            }
        }
    }
}
