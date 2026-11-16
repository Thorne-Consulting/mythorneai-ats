namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// The one way to write a date and time for a person: in their time zone, with the zone named.
/// Use it in every email and message. Never print a raw UTC timestamp to a person.
/// </summary>
public static class TimeText
{
    /// <summary>Resolve an IANA (or Windows) zone id, falling back to UTC when unknown.</summary>
    public static TimeZoneInfo Zone(string? id)
    {
        if (!string.IsNullOrWhiteSpace(id) && TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zone))
            return zone;
        return TimeZoneInfo.Utc;
    }

    /// <summary>First zone that is set: the person's, then the organization's, then UTC.</summary>
    public static TimeZoneInfo Zone(params string?[] ids) =>
        Zone(ids.FirstOrDefault(id => !string.IsNullOrWhiteSpace(id)));

    /// <summary>"Saturday, November 14, 2026 at 3:00 PM Eastern Standard Time".</summary>
    public static string DateTime(DateTimeOffset at, TimeZoneInfo zone)
    {
        var local = TimeZoneInfo.ConvertTime(at, zone);
        return $"{local:dddd, MMMM d, yyyy} at {local:h:mm tt} {ZoneName(local, zone)}";
    }

    /// <summary>"Saturday, November 14, 2026, 3:00 – 3:45 PM Eastern Standard Time".</summary>
    public static string Range(DateTimeOffset start, DateTimeOffset end, TimeZoneInfo zone)
    {
        var from = TimeZoneInfo.ConvertTime(start, zone);
        var to = TimeZoneInfo.ConvertTime(end, zone);
        var sameDay = from.Date == to.Date;
        var startText = from.ToString(from.ToString("tt") == to.ToString("tt") && sameDay ? "h:mm" : "h:mm tt");
        var endText = sameDay ? to.ToString("h:mm tt") : to.ToString("dddd, MMMM d, h:mm tt");
        return $"{from:dddd, MMMM d, yyyy}, {startText} – {endText} {ZoneName(from, zone)}";
    }

    /// <summary>The zone's name at that moment, for example "Eastern Daylight Time" or "UTC".</summary>
    public static string ZoneName(DateTimeOffset local, TimeZoneInfo zone)
    {
        if (zone == TimeZoneInfo.Utc)
            return "UTC";
        var name = zone.IsDaylightSavingTime(local) ? zone.DaylightName : zone.StandardName;
        return string.IsNullOrWhiteSpace(name) ? zone.Id : name;
    }
}
