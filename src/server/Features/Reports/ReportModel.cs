using System.Globalization;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Query-string parameters for a drill-down: which applications a number counts.</summary>
public sealed class ReportDrill : Dictionary<string, string>
{
    public ReportDrill()
        : base(StringComparer.OrdinalIgnoreCase) { }

    public static ReportDrill Of(params (string Key, string? Value)[] values)
    {
        var drill = new ReportDrill();
        foreach (var (key, value) in values)
            drill[key] = value ?? "";
        return drill;
    }
}

public sealed record ReportTable(
    string Key,
    string Title,
    string Description,
    string[] Columns,
    List<object?[]> Rows,
    string? Note = null,
    ReportStat[]? Stats = null,
    ReportChart[]? Charts = null
)
{
    /// <summary>One entry per row: the drill-down behind it. An <c>applicationId</c> makes the row a link.</summary>
    public List<ReportDrill?>? RowDrill { get; init; }

    /// <summary>Extra tables under the main one (for example the stuck list).</summary>
    public ReportSection[]? Sections { get; init; }

    /// <summary>Columns kept for the spreadsheet but hidden on screen until the user shows them.</summary>
    public string[]? HiddenColumns { get; init; }
    public string? GroupBy { get; init; }
    public string? Organization { get; set; }

    /// <summary>The dates the numbers cover, for example "Last 30 days".</summary>
    public string? Period { get; set; }
}

/// <summary>A headline number, already formatted. Hint says what it counts.</summary>
public sealed record ReportStat(
    string Label,
    string Value,
    string? Hint = null,
    double? Number = null,
    ReportDrill? Drill = null,
    bool LowerIsBetter = false
);

/// <summary>
/// One chart with its own small dataset. Columns[0] labels each row, the rest are series.
/// A donut has one series, so its Tones are one per row.
/// Kind is bar, stacked, line, donut, funnel or scatter (scatter plots Columns[0] against Columns[1]).
/// </summary>
public sealed record ReportChart(
    string Kind,
    string Title,
    string[] Columns,
    List<object?[]> Rows,
    string? Caption = null
)
{
    public List<ReportDrill?>? Drill { get; init; }

    /// <summary>A colour meaning per series (blue, violet, green, amber, red, gray, or light for "does not count").</summary>
    public string[]? Tones { get; init; }

    /// <summary>The last series is the previous period, drawn dashed.</summary>
    public bool Compare { get; init; }

    /// <summary>On the overview: the report this chart opens.</summary>
    public string? Report { get; init; }
}

/// <summary>An extra table in a report. Action names what selected rows can do (remind-stuck, remind-scorecards).</summary>
public sealed record ReportSection(
    string Key,
    string Title,
    string Description,
    string[] Columns,
    List<object?[]> Rows,
    List<ReportDrill?> RowDrill,
    string? Action = null
);

public sealed record ReportInfo(
    string Key,
    string Title,
    string Group,
    string Description,
    string DateField,
    string[] Breakdowns
);

/// <summary>The filters every report, the overview and the drill-down accept, plus the drill-down's own keys.</summary>
public sealed class ReportQuery
{
    public Guid? RequisitionId { get; set; }
    public string? Department { get; set; }
    public string? Source { get; set; }
    public string? Recruiter { get; set; }

    /// <summary>30d, 90d, quarter or year. Empty means From and To (each optional).</summary>
    public string? Range { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }

    /// <summary>job, department, source, recruiter, month or stage.</summary>
    public string? GroupBy { get; set; }
    public string? Format { get; set; }

    // Drill-down only.
    public string? Report { get; set; }
    public string? Reached { get; set; }
    public string? Stage { get; set; }
    public string? Status { get; set; }
    public string? Interviewer { get; set; }
    public bool? Overdue { get; set; }
    public string? Reason { get; set; }
    public string? Fit { get; set; }
    public bool? Stuck { get; set; }
    public bool? Interviewed { get; set; }

    /// <summary>sent, or what happened to the offer: accepted, declined, waiting, expired, withdrawn.</summary>
    public string? Offer { get; set; }
    public string? DeclineReason { get; set; }
}

/// <summary>The dates a report covers, as local days in the organization's time zone.</summary>
public sealed record ReportPeriod(DateOnly? From, DateOnly? To, string Label, TimeZoneInfo Zone)
{
    public DateTimeOffset? Start => From is { } day ? Midnight(day) : null;
    public DateTimeOffset? End => To is { } day ? Midnight(day.AddDays(1)) : null;
    public bool IsAllTime => From is null && To is null;

    private DateTimeOffset Midnight(DateOnly day)
    {
        var local = day.ToDateTime(TimeOnly.MinValue);
        // Npgsql only writes UTC offsets.
        return new DateTimeOffset(local, Zone.GetUtcOffset(local)).ToUniversalTime();
    }

    public bool Contains(DateTimeOffset at) =>
        (Start is null || at >= Start) && (End is null || at < End);

    /// <summary>The same number of days just before this period, or null when it has no start or end.</summary>
    public ReportPeriod? Previous()
    {
        if (From is not { } from || To is not { } to)
            return null;
        var days = to.DayNumber - from.DayNumber + 1;
        return new(from.AddDays(-days), from.AddDays(-1), $"previous {days} days", Zone);
    }

    public static ReportPeriod Resolve(
        string? range,
        DateOnly? from,
        DateOnly? to,
        DateTimeOffset now,
        TimeZoneInfo zone
    )
    {
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, zone).DateTime);
        return range?.Trim().ToLowerInvariant() switch
        {
            "30d" => new(today.AddDays(-29), today, "Last 30 days", zone),
            "90d" => new(today.AddDays(-89), today, "Last 90 days", zone),
            "quarter" => new(
                new DateOnly(today.Year, (today.Month - 1) / 3 * 3 + 1, 1),
                today,
                "This quarter",
                zone
            ),
            "year" => new(new DateOnly(today.Year, 1, 1), today, "This year", zone),
            "all" => new(null, null, "All time", zone),
            _ => (from, to) switch
            {
                (null, null) => new(null, null, "All time", zone),
                ({ } f, null) => new(f, null, $"Since {ReportFormat.Date(f)}", zone),
                (null, { } t) => new(null, t, $"Up to {ReportFormat.Date(t)}", zone),
                ({ } f, { } t) => new(
                    f,
                    t,
                    $"{ReportFormat.Date(f)} to {ReportFormat.Date(t)}",
                    zone
                ),
            },
        };
    }
}

public enum ReportDateField
{
    Applied,
    Hired,

    /// <summary>The report filters something else by date itself (interviews).</summary>
    Other,
}

/// <summary>One application, flattened with what every report needs.</summary>
public sealed record AppFact(
    Guid Id,
    Guid CandidateId,
    string Candidate,
    Guid RequisitionId,
    string Job,
    string JobCode,
    string Department,
    string Recruiter,
    string Source,
    ApplicationStatus Status,
    Guid StageId,
    string Stage,
    int StageSort,
    bool StageTerminal,
    StageType StageType,
    string? StageColor,
    DateTimeOffset AppliedAt,
    DateTimeOffset LastActivityAt,
    string? Reason,
    DateTimeOffset? HiredAt
);

public static class ReportFormat
{
    public static string Date(DateOnly day) =>
        day.ToString("MMM d, yyyy", CultureInfo.InvariantCulture);

    public static string Count(int value) => value.ToString("N0", CultureInfo.InvariantCulture);

    public static string Pct(double? value) =>
        value is null
            ? "None yet"
            : value.Value.ToString("0.#", CultureInfo.InvariantCulture) + "%";

    public static string Days(double? value) =>
        value is null
            ? "None yet"
            : value.Value.ToString("0.#", CultureInfo.InvariantCulture)
                + (value == 1 ? " day" : " days");

    public static double? Percent(int part, int whole) =>
        whole == 0 ? null : Math.Round(100.0 * part / whole, 1);

    /// <summary>Linear-interpolated percentile (0.5 is the median), rounded to one decimal.</summary>
    public static double? Percentile(IEnumerable<double> values, double p)
    {
        var sorted = values.Order().ToArray();
        if (sorted.Length == 0)
            return null;
        var rank = p * (sorted.Length - 1);
        var low = (int)Math.Floor(rank);
        var high = (int)Math.Ceiling(rank);
        return Math.Round(sorted[low] + (sorted[high] - sorted[low]) * (rank - low), 1);
    }

    public static double? Average(IReadOnlyCollection<double> values) =>
        values.Count == 0 ? null : Math.Round(values.Average(), 1);

    /// <summary>The key two sources match on: "LinkedIn " and "linkedin" are one source.</summary>
    public static string SourceKey(string? source) => (source ?? "").Trim().ToLowerInvariant();

    /// <summary>A rejection or withdrawal reason, grouped: free text after "Withdrawn by candidate:" is dropped.</summary>
    public static string ReasonOf(string? reason)
    {
        var text = (reason ?? "").Trim();
        if (text.Length == 0)
            return "No reason given";
        return text.StartsWith("Withdrawn by candidate", StringComparison.OrdinalIgnoreCase)
            ? "Withdrawn by candidate"
            : text;
    }

    public static string CellText(object? cell) =>
        cell switch
        {
            null => "",
            DateTimeOffset date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            double number => number.ToString("0.#", CultureInfo.InvariantCulture),
            decimal number => number.ToString("0.#", CultureInfo.InvariantCulture),
            _ => cell.ToString() ?? "",
        };

    /// <summary>
    /// Week (Monday start) or month buckets covering from..to, months once the span passes six months.
    /// Each bucket carries the drill-down dates for the applications in it.
    /// </summary>
    public static (string Unit, List<(DateOnly Start, DateOnly End, string Label)> Buckets) Buckets(
        DateOnly from,
        DateOnly to
    )
    {
        var monthly = to.DayNumber - from.DayNumber > 183;
        var start = monthly
            ? new DateOnly(from.Year, from.Month, 1)
            : from.AddDays(-(((int)from.DayOfWeek + 6) % 7));
        var buckets = new List<(DateOnly, DateOnly, string)>();
        for (var day = start; day <= to; day = monthly ? day.AddMonths(1) : day.AddDays(7))
        {
            var end = monthly ? day.AddMonths(1).AddDays(-1) : day.AddDays(6);
            buckets.Add(
                (
                    day,
                    end,
                    day.ToString(monthly ? "MMM yyyy" : "MMM d", CultureInfo.InvariantCulture)
                )
            );
        }
        return (monthly ? "Month" : "Week of", buckets);
    }

    public static ReportDrill DatesDrill(DateOnly start, DateOnly end) =>
        ReportDrill.Of(
            ("range", ""),
            ("from", start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
            ("to", end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
        );

    /// <summary>Counts per week or month, with empty periods filled in and a drill-down for each.</summary>
    public static (string Unit, List<object?[]> Rows, List<ReportDrill?> Drill) PerPeriod(
        IReadOnlyCollection<DateTimeOffset> dates,
        ReportPeriod period,
        ReportDrill? extra = null
    )
    {
        var days = dates
            .Select(x => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(x, period.Zone).DateTime))
            .ToList();
        if (days.Count == 0 && (period.From is null || period.To is null))
            return ("Week of", [], []);
        var from = period.From ?? days.Min();
        // With no end date the chart runs up to today, so quiet recent weeks show as quiet.
        var today = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, period.Zone).DateTime
        );
        var to = period.To ?? (days.Count == 0 ? today : new[] { days.Max(), today }.Max());
        var (unit, buckets) = Buckets(from, to);
        var rows = buckets
            .Select(b => new object?[] { b.Label, days.Count(d => d >= b.Start && d <= b.End) })
            .ToList();
        var drill = buckets
            .Select(b => (ReportDrill?)Merge(DatesDrill(b.Start, b.End), extra))
            .ToList();
        return (unit, rows, drill);
    }

    public static ReportDrill Merge(ReportDrill drill, ReportDrill? extra)
    {
        if (extra is not null)
            foreach (var (key, value) in extra)
                drill[key] = value;
        return drill;
    }

    /// <summary>How many values fall in each bucket; a bucket holds values up to its limit and above the previous one.</summary>
    public static List<object?[]> Histogram(
        IReadOnlyCollection<double> values,
        params (string Label, double UpTo)[] buckets
    ) =>
        buckets
            .Select(
                (bucket, i) =>
                    new object?[]
                    {
                        bucket.Label,
                        values.Count(v => v <= bucket.UpTo && (i == 0 || v > buckets[i - 1].UpTo)),
                    }
            )
            .ToList();

    public static async Task<Dictionary<string, string>> NamesAsync(
        AtsDbContext db,
        IEnumerable<string> emails,
        CancellationToken ct
    )
    {
        var wanted = emails.Select(x => x.ToLowerInvariant()).Distinct().ToList();
        var found = await db
            .Users.AsNoTracking()
            .Where(x => wanted.Contains(x.Email.ToLower()))
            .Select(x => new { x.Email, x.DisplayName })
            .ToListAsync(ct);
        var names = found.ToDictionary(x => x.Email.ToLowerInvariant(), x => x.DisplayName);
        foreach (var email in wanted)
            names.TryAdd(email, email);
        return names;
    }
}
