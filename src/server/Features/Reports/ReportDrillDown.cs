using System.Globalization;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using static MyThorneAI.Ats.Api.Api.ReportFormat;

namespace MyThorneAI.Ats.Api.Api;

public sealed record OverviewKpi(
    string Key,
    string Label,
    string Value,
    double? Number,
    string? PreviousValue,
    double? Previous,
    string Hint,
    string Report,
    bool LowerIsBetter,
    bool Percent = false
);

public sealed record ReportOverview(
    string Period,
    string? Comparison,
    OverviewKpi[] Kpis,
    ReportChart[] Charts
);

public sealed record DrillItem(
    Guid ApplicationId,
    Guid CandidateId,
    string Candidate,
    string Job,
    string JobCode,
    string Stage,
    string StageType,
    string? StageColor,
    ApplicationStatus Status,
    string Source,
    DateTimeOffset AppliedAt,
    DateTimeOffset? HiredAt,
    string? Reason
);

public sealed record DrillResult(string[] Criteria, int Total, List<DrillItem> Items);

public static partial class ReportEngine
{
    /// <summary>The reports home: four numbers against the previous period and four small charts, in one pass.</summary>
    public static async Task<ReportOverview> OverviewAsync(
        AtsDbContext db,
        IQueryable<Application> scoped,
        ReportQuery query,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var range =
            string.IsNullOrWhiteSpace(query.Range) && query.From is null && query.To is null
                ? "30d"
                : query.Range;
        var c = await LoadAsync(
            db,
            scoped,
            new ReportQuery
            {
                Range = range,
                From = query.From,
                To = query.To,
            },
            ReportDateField.Other,
            now,
            ct
        );
        var period = c.Period;
        var previous = period.Previous();
        var applied = c.Facts.Where(f => period.Contains(f.AppliedAt)).ToList();
        var hired = c.Facts.Where(f => f.HiredAt is { } at && period.Contains(at)).ToList();
        var hiredBefore = previous is null
            ? []
            : c.Facts.Where(f => f.HiredAt is { } at && previous.Contains(at)).ToList();
        var interviews = await InterviewsAsync(db, c.Facts, ct);
        var offers = await OfferFactsAsync(db, c.Facts, (previous ?? period).Start, period.End, ct);
        double? Acceptance(ReportPeriod? p) =>
            p is null ? null : AcceptanceRate(offers.Where(o => p.Contains(o.SentAt)).ToList());
        double? Median(IEnumerable<AppFact> items) =>
            Percentile(items.Select(f => (f.HiredAt!.Value - f.AppliedAt).TotalDays), 0.5);

        OverviewKpi Kpi(
            string key,
            string label,
            double? value,
            double? before,
            Func<double?, string> format,
            string hint,
            string report,
            bool lowerIsBetter = false,
            bool percent = false
        ) =>
            new(
                key,
                label,
                format(value),
                value,
                previous is null ? null : format(before),
                previous is null ? null : before,
                hint,
                report,
                lowerIsBetter,
                percent
            );
        string Whole(double? value) => Count((int)(value ?? 0));
        var kpis = new[]
        {
            Kpi(
                "applications",
                "Applications",
                applied.Count,
                previous is null ? null : c.Facts.Count(f => previous.Contains(f.AppliedAt)),
                Whole,
                $"Applied {c.Phrase}",
                "funnel"
            ),
            Kpi(
                "hires",
                "Hires",
                hired.Count,
                hiredBefore.Count,
                Whole,
                $"Hired {c.Phrase}",
                "hires"
            ),
            Kpi(
                "time-to-hire",
                "Median days to hire",
                Median(hired),
                Median(hiredBefore),
                Days,
                $"For people hired {c.Phrase}",
                "time-to-hire",
                lowerIsBetter: true
            ),
            Kpi(
                "offers",
                "Offer acceptance",
                Acceptance(period),
                Acceptance(previous),
                Pct,
                $"Of offers sent {c.Phrase} that got an answer",
                "offers",
                percent: true
            ),
        };

        var shape = await FunnelOfAsync(db, applied, c.ByType, ct);
        var funnel = new ReportChart(
            "funnel",
            "Hiring funnel",
            ["Stage", "Reached"],
            shape
                .Keys.Select(
                    (k, i) => new object?[] { k, applied.Count(f => shape.Last[f.Id] >= i) }
                )
                .ToList(),
            $"Applications that applied {c.Phrase}, by the furthest stage they reached."
        )
        {
            Drill = shape.Keys.Select(k => (ReportDrill?)ReportDrill.Of(("reached", k))).ToList(),
            Report = "funnel",
        };

        // Hires per week (or month) for this period, with the previous period lined up underneath.
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(now, period.Zone).DateTime);
        var from =
            period.From
            ?? (
                hired.Count == 0
                    ? today
                    : hired.Min(f =>
                        DateOnly.FromDateTime(
                            TimeZoneInfo.ConvertTime(f.HiredAt!.Value, period.Zone).DateTime
                        )
                    )
            );
        var to = period.To ?? today;
        var shift = previous is null ? 0 : to.DayNumber - from.DayNumber + 1;
        var (unit, buckets) = Buckets(from, to);
        int HiredIn(IEnumerable<AppFact> items, DateOnly start, DateOnly end) =>
            items.Count(f =>
                DateOnly.FromDateTime(
                    TimeZoneInfo.ConvertTime(f.HiredAt!.Value, period.Zone).DateTime
                )
                    is var day
                && day >= start
                && day <= end
            );
        var hires = new ReportChart(
            "line",
            "Hires over time",
            previous is null ? [unit, "Hires"] : [unit, "Hires", "Previous period"],
            buckets
                .Select(b =>
                    previous is null
                        ? new object?[] { b.Label, HiredIn(hired, b.Start, b.End) }
                        : new object?[]
                        {
                            b.Label,
                            HiredIn(hired, b.Start, b.End),
                            HiredIn(hiredBefore, b.Start.AddDays(-shift), b.End.AddDays(-shift)),
                        }
                )
                .ToList(),
            previous is null
                ? "By the day of the hire."
                : $"By the day of the hire. The dashed line is the {previous.Label}."
        )
        {
            Drill = buckets
                .Select(b =>
                    (ReportDrill?)Merge(
                        DatesDrill(b.Start, b.End),
                        ReportDrill.Of(("status", "Hired"))
                    )
                )
                .ToList(),
            Compare = previous is not null,
            Report = "hires",
            Tones = previous is null ? ["green"] : ["green", "gray"],
        };

        var (interviewed, _) = await ProgressAsync(db, applied, ct);
        var sources = GroupFacts(c, applied, "source").Take(6).ToList();
        var quality = new ReportChart(
            "bar",
            "Share reaching an interview, by source",
            ["Source", "Reached interview (%)"],
            sources
                .Select(g =>
                    new object?[]
                    {
                        g.Label,
                        Percent(g.Items.Count(f => interviewed.Contains(f.Id)), g.Items.Count),
                    }
                )
                .ToList(),
            $"The {sources.Count} biggest sources {c.Phrase}."
        )
        {
            Drill = sources.Select(g => (ReportDrill?)g.Drill).ToList(),
            Report = "sources",
            Tones = ["blue"],
        };

        var seats = interviews
            .SelectMany(i =>
                i.Interviewers.Where(email => IsOverdue(i, email, now)).Select(email => email)
            )
            .ToList();
        var names = await NamesAsync(db, seats, ct);
        var late = seats
            .GroupBy(x => x)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => names[g.Key])
            .Take(6)
            .ToList();
        var overdue = new ReportChart(
            "bar",
            "Overdue scorecards, by interviewer",
            ["Interviewer", "Overdue scorecards"],
            late.Select(g => new object?[] { names[g.Key], g.Count() }).ToList(),
            "Right now, across every interview: no scorecard 24 hours after it ended."
        )
        {
            Drill = late.Select(g =>
                    (ReportDrill?)
                        ReportDrill.Of(
                            ("interviewer", g.Key),
                            ("overdue", "true"),
                            ("range", "all")
                        )
                )
                .ToList(),
            Report = "interviewers",
            Tones = ["red"],
        };

        return new(period.Label, previous?.Label, kpis, [funnel, hires, quality, overdue]);
    }

    /// <summary>The applications behind a number: the report's filters plus the drill keys.</summary>
    public static async Task<(string[] Criteria, List<AppFact> Items)> DrillAsync(
        AtsDbContext db,
        IQueryable<Application> scoped,
        ReportQuery q,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var info = Info(q.Report);
        var field = DateFieldOf(info);
        var c = await LoadAsync(db, scoped, q, field, now, ct);
        IEnumerable<AppFact> items = c.Facts;
        var criteria = new List<string>();
        static string Cap(string text) =>
            text.Length == 0 ? text : char.ToUpperInvariant(text[0]) + text[1..];

        if (!string.IsNullOrWhiteSpace(q.Status))
        {
            if (q.Status.Equals("ended", StringComparison.OrdinalIgnoreCase))
            {
                items = items.Where(Ended);
                criteria.Add("Rejected or withdrew");
            }
            else if (Enum.TryParse<ApplicationStatus>(q.Status, true, out var status))
            {
                items = items.Where(f => f.Status == status);
                criteria.Add(
                    status switch
                    {
                        ApplicationStatus.Hired => "Hired",
                        ApplicationStatus.Rejected => "Rejected by your team",
                        ApplicationStatus.Withdrawn => "Withdrew",
                        _ => "Still active",
                    }
                );
            }
        }
        if (!string.IsNullOrWhiteSpace(q.Reached))
        {
            var shape = await FunnelOfAsync(db, c.Facts, c.ByType, ct);
            var index = shape.Keys.FindIndex(k =>
                k.Equals(q.Reached.Trim(), StringComparison.OrdinalIgnoreCase)
            );
            items = items.Where(f => index >= 0 && shape.Last[f.Id] >= index);
            criteria.Add($"Reached {q.Reached.Trim()}");
        }
        if (!string.IsNullOrWhiteSpace(q.Stage))
        {
            items = items.Where(f =>
                StageKey(c, f).Equals(q.Stage.Trim(), StringComparison.OrdinalIgnoreCase)
            );
            criteria.Add($"At the {q.Stage.Trim()} stage");
        }
        if (!string.IsNullOrWhiteSpace(q.Reason))
        {
            items = items.Where(f =>
                Ended(f)
                && ReasonOf(f.Reason).Equals(q.Reason.Trim(), StringComparison.OrdinalIgnoreCase)
            );
            criteria.Add($"Reason: {q.Reason.Trim()}");
        }
        if (q.Stuck == true)
        {
            var days = Math.Clamp(c.Organization.StaleReminderDays, 1, 30);
            items = items.Where(f =>
                f.Status == ApplicationStatus.Active
                && !f.StageTerminal
                && f.LastActivityAt < now.AddDays(-days)
            );
            criteria.Add($"No activity for {days}+ days");
        }
        if (q.Interviewed == true)
        {
            var (interviewed, _) = await ProgressAsync(db, c.Facts, ct);
            items = items.Where(f => interviewed.Contains(f.Id));
            criteria.Add("Reached an interview");
        }
        if (!string.IsNullOrWhiteSpace(q.Interviewer) || q.Overdue == true)
        {
            var email = q.Interviewer?.Trim().ToLowerInvariant();
            var interviews = (await InterviewsAsync(db, c.Facts, ct))
                .Where(i => field != ReportDateField.Other || c.Period.Contains(i.StartsAt))
                .Where(i =>
                    email is null
                        ? i.Interviewers.Any(e => q.Overdue != true || IsOverdue(i, e, now))
                        : i.Interviewers.Contains(email)
                            && (q.Overdue != true || IsOverdue(i, email, now))
                )
                .Select(i => i.ApplicationId)
                .ToHashSet();
            items = items.Where(f => interviews.Contains(f.Id));
            var name = email is null ? null : (await NamesAsync(db, [email], ct))[email];
            criteria.Add(
                q.Overdue == true
                    ? name is null
                        ? "Scorecard overdue"
                        : $"Scorecard overdue from {name}"
                    : $"Interviewed by {name}"
            );
        }
        if (!string.IsNullOrWhiteSpace(q.Offer))
        {
            var sent = q.Offer.Equals("sent", StringComparison.OrdinalIgnoreCase);
            OfferResult? result = Enum.TryParse<OfferResult>(q.Offer, true, out var parsed)
                ? parsed
                : null;
            var reason = q.DeclineReason?.Trim();
            var offered = (await OfferFactsAsync(db, c.Facts, c.Period.Start, c.Period.End, ct))
                .Where(o => sent || o.Result(c.Today) == result)
                .Where(o =>
                    string.IsNullOrEmpty(reason)
                    || ReasonOf(o.DeclineReason).Equals(reason, StringComparison.OrdinalIgnoreCase)
                )
                .Select(o => o.ApplicationId)
                .ToHashSet();
            items = items.Where(f => offered.Contains(f.Id));
            criteria.Add(
                sent || result is null
                    ? "Offer sent"
                    : $"Offer {ResultLabel(result.Value).ToLowerInvariant()}"
            );
            if (!string.IsNullOrEmpty(reason))
                criteria.Add($"Their reason: {reason}");
        }
        if (!string.IsNullOrWhiteSpace(q.Fit))
        {
            var ids = c.Facts.Select(f => f.Id).ToList();
            var scores = await db
                .Applications.AsNoTracking()
                .Where(a => ids.Contains(a.Id))
                .Join(
                    db.JobFits,
                    a => new { a.RequisitionId, a.CandidateId },
                    f => new { f.RequisitionId, f.CandidateId },
                    (a, f) => new { a.Id, f.Score }
                )
                .ToDictionaryAsync(x => x.Id, x => x.Score, ct);
            items = items.Where(f =>
                scores.TryGetValue(f.Id, out var score) && FitBucket(score) == q.Fit
            );
            criteria.Add($"AI fit score {q.Fit}");
        }

        // Then the report's own filters, so the reader knows exactly what the list counts.
        if (q.RequisitionId is not null && c.Facts.FirstOrDefault() is { } any)
            criteria.Add($"Job: {any.Job}");
        if (!string.IsNullOrWhiteSpace(q.Department))
            criteria.Add($"Department: {q.Department.Trim()}");
        if (!string.IsNullOrWhiteSpace(q.Source))
            criteria.Add($"Source: {q.Source.Trim()}");
        if (!string.IsNullOrWhiteSpace(q.Recruiter))
            criteria.Add(
                $"Recruiter: {c.Names.GetValueOrDefault(q.Recruiter.Trim().ToLowerInvariant(), q.Recruiter.Trim())}"
            );
        if (!c.Period.IsAllTime)
            criteria.Add(
                Cap(
                    info?.DateField switch
                    {
                        "hired" => $"Hired {c.Phrase}",
                        "interview" => $"Interviewed {c.Phrase}",
                        "offer" => $"Offer sent {c.Phrase}",
                        _ => $"Applied {c.Phrase}",
                    }
                )
            );
        return (
            criteria.ToArray(),
            items.OrderByDescending(f => f.HiredAt ?? f.AppliedAt).ToList()
        );
    }

    public static DrillItem ToItem(AppFact f) =>
        new(
            f.Id,
            f.CandidateId,
            f.Candidate,
            f.Job,
            f.JobCode,
            f.Stage,
            f.StageType.ToString(),
            f.StageColor,
            f.Status,
            f.Source,
            f.AppliedAt,
            f.HiredAt,
            Ended(f) ? ReasonOf(f.Reason) : null
        );

    public static string DrillCsv(List<AppFact> items)
    {
        var csv = new System.Text.StringBuilder().AppendLine(
            "Candidate,Job,Job code,Stage,Status,Source,Applied on,Hired on,Reason"
        );
        foreach (var f in items)
            csv.AppendLine(
                string.Join(
                    ',',
                    new object?[]
                    {
                        f.Candidate,
                        f.Job,
                        f.JobCode,
                        f.Stage,
                        f.Status.ToString(),
                        f.Source,
                        f.AppliedAt,
                        f.HiredAt,
                        Ended(f) ? ReasonOf(f.Reason) : null,
                    }.Select(x => Csv.Escape(CellText(x)))
                )
            );
        return csv.ToString();
    }
}
