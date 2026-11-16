using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Interviews;

/// <summary>One working range in a person's own day. End may be 24:00.</summary>
public sealed record WorkingRange(TimeSpan Start, TimeSpan End);

/// <summary>What the engine knows about one interviewer.</summary>
public sealed record PersonSchedule(
    string Email,
    TimeZoneInfo Zone,
    IReadOnlyDictionary<DayOfWeek, IReadOnlyList<WorkingRange>> Hours,
    TimeSpan Buffer,
    int? MaxPerDay,
    int? MaxPerWeek,
    IReadOnlyList<BusyWindow> Busy,
    IReadOnlyList<DateTimeOffset> Booked
);

public sealed record AvailableSlot(DateTimeOffset StartsAt, DateTimeOffset EndsAt);

/// <summary>
/// Slots that fit everyone's working hours, buffers, limits and known busy times.
/// MissingConnections names the people whose calendars we could not check: their working hours and
/// MyThorneAI interviews still count, but an outside meeting could clash.
/// </summary>
public sealed record AvailabilityResult(
    IReadOnlyList<AvailableSlot> Slots,
    IReadOnlyList<string> CheckedCalendars,
    IReadOnlyList<string> MissingConnections,
    bool Capped
);

public sealed record AvailabilityRequest(
    IReadOnlyCollection<string> InterviewerEmails,
    DateTimeOffset From,
    DateTimeOffset To,
    TimeSpan Duration,
    TimeSpan Step,
    TimeSpan MinimumNotice,
    Guid? IgnoreInterviewId = null,
    int MaxSlots = 200
);

/// <summary>
/// The availability engine: time zones, working hours, buffers, daily and weekly limits, MyThorneAI's
/// own interviews and connected calendars. Shared by the scheduler, the portal and the API.
/// </summary>
public sealed class AvailabilityService(
    AtsDbContext db,
    IUserCalendarService calendars,
    ILogger<AvailabilityService> logger
)
{
    /// <summary>9 AM to 5 PM, Monday to Friday, for people who have not set their hours.</summary>
    public static readonly IReadOnlyDictionary<
        DayOfWeek,
        IReadOnlyList<WorkingRange>
    > DefaultHours = Enum.GetValues<DayOfWeek>()
        .ToDictionary(
            day => day,
            day =>
                (IReadOnlyList<WorkingRange>)(
                    day is DayOfWeek.Saturday or DayOfWeek.Sunday
                        ? []
                        : [new WorkingRange(TimeSpan.FromHours(9), TimeSpan.FromHours(17))]
                )
        );

    /// <summary>Reads {"1":[["09:00","17:00"]]}; anything unreadable falls back to the default week.</summary>
    public static IReadOnlyDictionary<DayOfWeek, IReadOnlyList<WorkingRange>> ParseHours(
        string? json
    )
    {
        if (string.IsNullOrWhiteSpace(json))
            return DefaultHours;
        try
        {
            var raw = JsonSerializer.Deserialize<Dictionary<string, string[][]>>(json) ?? [];
            return Enum.GetValues<DayOfWeek>()
                .ToDictionary(
                    day => day,
                    day =>
                        (IReadOnlyList<WorkingRange>)(
                            raw.TryGetValue(((int)day).ToString(), out var ranges)
                                ? ranges
                                    .Where(r => r.Length == 2)
                                    .Select(r => new WorkingRange(ParseTime(r[0]), ParseTime(r[1])))
                                    .Where(r => r.End > r.Start)
                                    .OrderBy(r => r.Start)
                                    .ToArray()
                                : []
                        )
                );
        }
        catch (Exception exception) when (exception is JsonException or FormatException)
        {
            return DefaultHours;
        }
    }

    public static string HoursJson(
        IReadOnlyDictionary<DayOfWeek, IReadOnlyList<WorkingRange>> hours
    ) =>
        JsonSerializer.Serialize(
            hours
                .Where(x => x.Value.Count > 0)
                .OrderBy(x => x.Key)
                .ToDictionary(
                    x => ((int)x.Key).ToString(),
                    x =>
                        x.Value.Select(r => new[] { TimeText24(r.Start), TimeText24(r.End) })
                            .ToArray()
                )
        );

    /// <summary>"09:00" or "24:00".</summary>
    public static TimeSpan ParseTime(string value)
    {
        var parts = value.Split(':');
        if (
            parts.Length != 2
            || !int.TryParse(parts[0], out var hours)
            || !int.TryParse(parts[1], out var minutes)
            || hours is < 0 or > 24
            || minutes is < 0 or > 59
            || (hours == 24 && minutes > 0)
        )
            throw new FormatException($"\"{value}\" is not a time like 09:30.");
        return new TimeSpan(hours, minutes, 0);
    }

    private static string TimeText24(TimeSpan time) =>
        $"{(int)time.TotalHours:00}:{time.Minutes:00}";

    public async Task<AvailabilityResult> FindAsync(
        AvailabilityRequest request,
        CancellationToken ct
    )
    {
        if (request.To <= request.From || request.Duration <= TimeSpan.Zero)
            return new([], [], [], false);
        var known = await LoadPeopleAsync(
            request.InterviewerEmails,
            request.From,
            request.To,
            request.IgnoreInterviewId,
            ct
        );
        if (known.People.Count == 0)
            return new([], [], [], false);
        var (slots, capped) = FindSlots(
            known.People,
            request.From,
            request.To,
            request.Duration,
            request.Step,
            DateTimeOffset.UtcNow + request.MinimumNotice,
            request.MaxSlots
        );
        return new(slots, known.CheckedCalendars, known.MissingConnections, capped);
    }

    /// <summary>What the engine knows about each person between two times: zone, hours, limits and busy times.</summary>
    public sealed record KnownPeople(
        IReadOnlyList<PersonSchedule> People,
        IReadOnlyList<string> CheckedCalendars,
        IReadOnlyList<string> MissingConnections
    );

    public async Task<KnownPeople> LoadPeopleAsync(
        IEnumerable<string> interviewerEmails,
        DateTimeOffset from,
        DateTimeOffset to,
        Guid? ignoreInterviewId,
        CancellationToken ct
    )
    {
        var emails = interviewerEmails
            .Select(x => x.Trim().ToLowerInvariant())
            .Where(x => x.Length > 0)
            .Distinct()
            .ToArray();
        if (emails.Length == 0)
            return new([], [], []);

        var organizationZone = await db
            .Organizations.Select(x => x.TimeZone)
            .SingleOrDefaultAsync(ct);
        var users = await db
            .Users.AsNoTracking()
            .Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, StringComparer.OrdinalIgnoreCase, ct);
        // A week either side, so weekly limits count interviews just outside the range.
        var windowStart = from.AddDays(-8);
        var windowEnd = to.AddDays(8);
        var booked = await db
            .Interviews.AsNoTracking()
            .Where(x =>
                (x.Status == InterviewStatus.Scheduled || x.Status == InterviewStatus.Proposed)
                && x.Id != ignoreInterviewId
                && x.StartsAt < windowEnd
                && x.EndsAt > windowStart
                && x.InterviewerEmails.Any(email => emails.Contains(email))
            )
            .Select(x => new
            {
                x.StartsAt,
                x.EndsAt,
                x.InterviewerEmails,
                x.Status,
            })
            .ToListAsync(ct);
        var ignored = ignoreInterviewId is null
            ? null
            : await db
                .Interviews.AsNoTracking()
                .Where(x => x.Id == ignoreInterviewId)
                .Select(x => new BusyWindow(x.StartsAt, x.EndsAt))
                .SingleOrDefaultAsync(ct);

        var people = new List<PersonSchedule>();
        var checkedCalendars = new List<string>();
        var missing = new List<string>();
        foreach (var email in emails)
        {
            users.TryGetValue(email, out var user);
            var buffer = TimeSpan.FromMinutes(Math.Clamp(user?.BufferMinutes ?? 0, 0, 240));
            IReadOnlyList<BusyWindow>? calendar = null;
            try
            {
                calendar = await calendars.ReadBusyAsync(email, from - buffer, to + buffer, ct);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // An expired or revoked connection must not hide everyone else's times.
                logger.LogWarning(exception, "Could not read the calendar for {Email}.", email);
            }
            (calendar is null ? missing : checkedCalendars).Add(email);
            var mine = booked.Where(x => x.InterviewerEmails.Contains(email)).ToArray();
            people.Add(
                new PersonSchedule(
                    email,
                    TimeText.Zone(user?.TimeZone, organizationZone),
                    ParseHours(user?.WorkingHoursJson),
                    buffer,
                    user?.MaxInterviewsPerDay,
                    user?.MaxInterviewsPerWeek,
                    (calendar ?? [])
                        .Where(window => ignored is null || window != ignored)
                        .Concat(mine.Select(x => new BusyWindow(x.StartsAt, x.EndsAt)))
                        .ToArray(),
                    mine.Where(x => x.Status == InterviewStatus.Scheduled)
                        .Select(x => x.StartsAt)
                        .ToArray()
                )
            );
        }
        return new(people, checkedCalendars, missing);
    }

    /// <summary>A person's working hours between two times, as absolute ranges.</summary>
    public static IReadOnlyList<BusyWindow> WorkingWindows(
        PersonSchedule person,
        DateTimeOffset from,
        DateTimeOffset to
    )
    {
        var windows = new List<BusyWindow>();
        var day = TimeZoneInfo.ConvertTime(from, person.Zone).Date.AddDays(-1);
        var last = TimeZoneInfo.ConvertTime(to, person.Zone).Date;
        for (; day <= last; day = day.AddDays(1))
            foreach (var range in person.Hours.GetValueOrDefault(day.DayOfWeek) ?? [])
            {
                var start = At(day + range.Start, person.Zone);
                var end = At(day + range.End, person.Zone);
                if (end > from && start < to)
                    windows.Add(new(start < from ? from : start, end > to ? to : end));
            }
        return windows;
    }

    // A wall-clock time in a zone as an absolute time. In a spring-forward gap the clock skips ahead.
    private static DateTimeOffset At(DateTime local, TimeZoneInfo zone)
    {
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        while (zone.IsInvalidTime(unspecified))
            unspecified = unspecified.AddMinutes(15);
        return new DateTimeOffset(unspecified, zone.GetUtcOffset(unspecified));
    }

    /// <summary>
    /// The pure part: every step-aligned start where the whole interview fits each person's working
    /// hours (in their zone), stays clear of their busy times by their buffer, and stays under their
    /// daily and weekly limits.
    /// </summary>
    public static (IReadOnlyList<AvailableSlot> Slots, bool Capped) FindSlots(
        IReadOnlyList<PersonSchedule> people,
        DateTimeOffset from,
        DateTimeOffset to,
        TimeSpan duration,
        TimeSpan step,
        DateTimeOffset notBefore,
        int maxSlots
    )
    {
        if (step <= TimeSpan.Zero || duration <= TimeSpan.Zero)
            return ([], false);
        var earliest = from > notBefore ? from : notBefore;
        var start = new DateTimeOffset(
            (earliest.UtcTicks + step.Ticks - 1) / step.Ticks * step.Ticks,
            TimeSpan.Zero
        );
        var slots = new List<AvailableSlot>();
        for (var at = start; at + duration <= to; at += step)
        {
            var end = at + duration;
            if (!people.All(person => Fits(person, at, end)))
                continue;
            if (slots.Count == maxSlots)
                return (slots, true);
            slots.Add(new AvailableSlot(at, end));
        }
        return (slots, false);
    }

    /// <summary>That exact time suits everyone (hours, buffers, limits, busy times).</summary>
    public static bool FitsAll(
        IReadOnlyList<PersonSchedule> people,
        DateTimeOffset start,
        DateTimeOffset end
    ) => people.All(person => Fits(person, start, end));

    private static bool Fits(PersonSchedule person, DateTimeOffset start, DateTimeOffset end)
    {
        var localStart = TimeZoneInfo.ConvertTime(start, person.Zone);
        var localEnd = TimeZoneInfo.ConvertTime(end, person.Zone);
        var endOfDay =
            localEnd.Date == localStart.Date.AddDays(1) && localEnd.TimeOfDay == TimeSpan.Zero;
        if (localEnd.Date != localStart.Date && !endOfDay)
            return false;
        var startTime = localStart.TimeOfDay;
        var endTime = endOfDay ? TimeSpan.FromDays(1) : localEnd.TimeOfDay;
        if (
            !person.Hours.TryGetValue(localStart.DayOfWeek, out var ranges)
            || !ranges.Any(range => range.Start <= startTime && endTime <= range.End)
        )
            return false;
        if (
            person.Busy.Any(busy =>
                busy.StartsAt - person.Buffer < end && busy.EndsAt + person.Buffer > start
            )
        )
            return false;
        if (person.MaxPerDay is { } perDay)
        {
            var day = localStart.Date;
            if (
                person.Booked.Count(at => TimeZoneInfo.ConvertTime(at, person.Zone).Date == day)
                >= perDay
            )
                return false;
        }
        if (person.MaxPerWeek is { } perWeek)
        {
            var week = WeekStart(localStart.Date);
            if (
                person.Booked.Count(at =>
                    WeekStart(TimeZoneInfo.ConvertTime(at, person.Zone).Date) == week
                ) >= perWeek
            )
                return false;
        }
        return true;
    }

    private static DateTime WeekStart(DateTime date) =>
        date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
}
