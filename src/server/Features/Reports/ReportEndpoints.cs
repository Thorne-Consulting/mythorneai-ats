using System.Globalization;
using System.Security.Claims;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

public sealed record ReportTable(
    string Key,
    string Title,
    string Description,
    string[] Columns,
    List<object?[]> Rows,
    string? Note = null,
    ReportStat[]? Stats = null,
    ReportChart[]? Charts = null
);

/// <summary>A headline number shown above a report, already formatted.</summary>
public sealed record ReportStat(string Label, string Value);

/// <summary>
/// One chart with its own small dataset. Columns[0] labels each row, the rest are series.
/// Kind is bar, stacked, line, donut, funnel or scatter (scatter plots Columns[0] against Columns[1]).
/// </summary>
public sealed record ReportChart(string Kind, string Title, string[] Columns, List<object?[]> Rows, string? Caption = null);

public static partial class AtsEndpoints
{
    public static readonly (string Key, string Title)[] ReportCatalog =
    [
        ("funnel", "Hiring funnel"),
        ("time-to-hire", "Time to hire and fill"),
        ("time-in-stage", "Time in each stage"),
        ("interviewers", "Interviewer load and feedback"),
        ("sources", "Source effectiveness"),
        ("ai-outcomes", "AI fit versus outcome"),
        ("hires", "Hires (for payroll and HR hand-off)"),
    ];

    private static void MapReports(RouteGroupBuilder api)
    {
        api.MapGet(
            "/reports",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                await Permissions.HasAsync(db, principal, Permissions.Reports, ct)
                    ? Results.Ok(ReportCatalog.Select(x => new { x.Key, x.Title }))
                    : Results.Forbid()
        );

        api.MapGet(
            "/reports/{key}",
            async (
                string key,
                Guid? requisitionId,
                string? source,
                DateOnly? from,
                DateOnly? to,
                string? format,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Permissions.HasAsync(db, principal, Permissions.Reports, ct))
                    return Results.Forbid();
                var applications = ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(x => x.Status != ApplicationStatus.PendingVerification);
                if (requisitionId is not null)
                    applications = applications.Where(x => x.RequisitionId == requisitionId);
                if (!string.IsNullOrWhiteSpace(source))
                    applications = applications.Where(x => x.Source == source);
                if (from is not null)
                {
                    var start = new DateTimeOffset(from.Value.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                    applications = applications.Where(x => x.AppliedAt >= start);
                }
                if (to is not null)
                {
                    var end = new DateTimeOffset(to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                    applications = applications.Where(x => x.AppliedAt < end);
                }
                ReportTable? table = key switch
                {
                    "funnel" => await FunnelAsync(db, applications, ct),
                    "time-to-hire" => await TimeToHireAsync(db, applications, ct),
                    "time-in-stage" => await TimeInStageAsync(db, applications, ct),
                    "interviewers" => await InterviewersAsync(db, applications, ct),
                    "sources" => await SourcesAsync(db, applications, ct),
                    "ai-outcomes" => await AiOutcomesAsync(db, applications, ct),
                    "hires" => await HiresAsync(db, applications, ct),
                    _ => null,
                };
                if (table is null)
                    return Results.NotFound();
                if (format == "csv")
                {
                    var csv = new StringBuilder().AppendLine(string.Join(',', table.Columns.Select(Csv.Escape)));
                    foreach (var row in table.Rows)
                        csv.AppendLine(string.Join(',', row.Select(cell => Csv.Escape(CellText(cell)))));
                    return Results.File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"{key}-{DateTime.UtcNow:yyyyMMdd}.csv");
                }
                return Results.Ok(table);
            }
        );
    }

    private static string CellText(object? cell) =>
        cell switch
        {
            null => "",
            DateTimeOffset date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly date => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            double number => number.ToString("0.#", CultureInfo.InvariantCulture),
            decimal number => number.ToString("0.#", CultureInfo.InvariantCulture),
            _ => cell.ToString() ?? "",
        };

    private static double Percent(int part, int whole) => whole == 0 ? 0 : Math.Round(100.0 * part / whole, 1);

    private static string Pct(double value) => value.ToString("0.#", CultureInfo.InvariantCulture) + "%";

    private static string Days(double? value) =>
        value is null ? "–" : value.Value.ToString("0.#", CultureInfo.InvariantCulture) + (value == 1 ? " day" : " days");

    private static string Count(int value) => value.ToString(CultureInfo.InvariantCulture);

    /// <summary>Counts per week, or per month once the dates span more than six months, with empty periods filled in.</summary>
    private static (string Unit, List<object?[]> Rows) PerPeriod(IReadOnlyCollection<DateTimeOffset> dates)
    {
        if (dates.Count == 0)
            return ("Week of", []);
        var monthly = (dates.Max() - dates.Min()).TotalDays > 183;
        DateOnly Start(DateTimeOffset date)
        {
            var day = DateOnly.FromDateTime(date.UtcDateTime);
            return monthly ? new DateOnly(day.Year, day.Month, 1) : day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
        }
        var counts = dates.GroupBy(Start).ToDictionary(g => g.Key, g => g.Count());
        var rows = new List<object?[]>();
        for (var period = counts.Keys.Min(); period <= counts.Keys.Max(); period = monthly ? period.AddMonths(1) : period.AddDays(7))
            rows.Add([period.ToString(monthly ? "MMM yyyy" : "MMM d", CultureInfo.InvariantCulture), counts.GetValueOrDefault(period)]);
        return (monthly ? "Month" : "Week of", rows);
    }

    /// <summary>How many values fall in each bucket; a bucket holds values up to its limit and above the previous one.</summary>
    private static List<object?[]> Histogram(IReadOnlyCollection<double> values, params (string Label, double UpTo)[] buckets) =>
        buckets
            .Select((bucket, i) => new object?[] { bucket.Label, values.Count(v => v <= bucket.UpTo && (i == 0 || v > buckets[i - 1].UpTo)) })
            .ToList();

    /// <summary>Furthest stage each application has touched, as a sort order: where it is now, or any stage it passed through.</summary>
    private static async Task<Dictionary<Guid, int>> FurthestStageAsync(AtsDbContext db, Dictionary<Guid, int> current, CancellationToken ct)
    {
        var ids = current.Keys.ToList();
        var reached = await db
            .StageTransitions.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId))
            .Join(db.PipelineStages, t => t.ToStageId, s => s.Id, (t, s) => new { t.ApplicationId, s.SortOrder })
            .GroupBy(x => x.ApplicationId)
            .Select(g => new { Id = g.Key, Max = g.Max(x => x.SortOrder) })
            .ToDictionaryAsync(x => x.Id, x => x.Max, ct);
        return current.ToDictionary(x => x.Key, x => Math.Max(x.Value, reached.GetValueOrDefault(x.Key, -1)));
    }

    private static async Task<ReportTable> FunnelAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var apps = await applications
            .Select(x => new { x.Id, x.RequisitionId, x.AppliedAt, StageSort = x.PipelineStage!.SortOrder })
            .ToListAsync(ct);
        var furthest = await FurthestStageAsync(db, apps.ToDictionary(x => x.Id, x => x.StageSort), ct);
        var requisitionIds = apps.Select(x => x.RequisitionId).Distinct().ToList();
        var stages = await db.PipelineStages.AsNoTracking().Where(x => requisitionIds.Contains(x.RequisitionId)).ToListAsync(ct);
        var rows = stages
            .GroupBy(x => x.Name)
            .Select(group => new
            {
                Name = group.Key,
                Order = group.Average(x => x.SortOrder),
                Count = apps.Count(app => group.Any(stage => stage.RequisitionId == app.RequisitionId && furthest[app.Id] >= stage.SortOrder)),
            })
            .OrderBy(x => x.Order)
            .ToList();
        var first = rows.FirstOrDefault()?.Count ?? 0;
        var table = new List<object?[]>();
        for (var i = 0; i < rows.Count; i++)
            table.Add([rows[i].Name, rows[i].Count, Percent(rows[i].Count, first), i == 0 ? 100.0 : Percent(rows[i].Count, rows[i - 1].Count)]);
        var last = rows.LastOrDefault();
        var (unit, perPeriod) = PerPeriod(apps.Select(x => x.AppliedAt).ToList());
        return new(
            "funnel", "Hiring funnel", "How many applications reached each stage, and how many carried on to the next.",
            ["Stage", "Reached", "Share of applicants (%)", "Carried on from previous (%)"], table,
            apps.Count == 0 ? "No applications match these filters." : null,
            [
                new("Applications", Count(apps.Count)),
                new("Got past the first stage", rows.Count > 1 ? Pct(Percent(rows[1].Count, first)) : "–"),
                new(last is null ? "Reached the last stage" : $"Reached {last.Name}", Count(last?.Count ?? 0)),
            ],
            [
                new("funnel", "Applications reaching each stage", ["Stage", "Reached"], table.Select(x => new[] { x[0], x[1] }).ToList()),
                new("line", "Applications over time", [unit, "Applications"], perPeriod),
            ]);
    }

    private static async Task<ReportTable> TimeToHireAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var data = await applications
            .Select(x => new
            {
                x.RequisitionId, x.AppliedAt, x.Status, x.LastActivityAt,
                Code = x.Requisition!.Code, Title = x.Requisition.Title, Openings = x.Requisition.Openings,
                JobCreated = x.Requisition.CreatedAt, JobStatus = x.Requisition.Status, x.Id,
            })
            .ToListAsync(ct);
        var hiredIds = data.Where(x => x.Status == ApplicationStatus.Hired).Select(x => x.Id).ToList();
        var hiredAt = await db
            .StageTransitions.AsNoTracking()
            .Where(x => hiredIds.Contains(x.ApplicationId) && x.ToStatus == ApplicationStatus.Hired)
            .GroupBy(x => x.ApplicationId)
            .Select(g => new { Id = g.Key, At = g.Max(x => x.OccurredAt) })
            .ToDictionaryAsync(x => x.Id, x => x.At, ct);
        var rows = data
            .GroupBy(x => x.RequisitionId)
            .Select(group =>
            {
                var first = group.First();
                var hires = group.Where(x => x.Status == ApplicationStatus.Hired).Select(x => new { x.AppliedAt, At = hiredAt.GetValueOrDefault(x.Id, x.LastActivityAt) }).ToList();
                double? toHire = hires.Count == 0 ? null : Math.Round(hires.Average(x => (x.At - x.AppliedAt).TotalDays), 1);
                double? toFill = hires.Count >= first.Openings ? Math.Round((hires.Max(x => x.At) - first.JobCreated).TotalDays, 1) : null;
                var openFor = first.JobStatus == RequisitionStatus.Open ? Math.Round((DateTimeOffset.UtcNow - first.JobCreated).TotalDays, 1) : (double?)null;
                return new object?[] { first.Code, first.Title, first.JobStatus.ToString(), group.Count(), hires.Count, toHire, toFill, openFor };
            })
            .OrderByDescending(x => (int)x[3]!)
            .ToList();
        var daysToHire = data
            .Where(x => x.Status == ApplicationStatus.Hired)
            .Select(x => (hiredAt.GetValueOrDefault(x.Id, x.LastActivityAt) - x.AppliedAt).TotalDays)
            .ToList();
        return new(
            "time-to-hire", "Time to hire and fill", "Average days from application to hire, and days from opening a job to filling every seat.",
            ["Code", "Job", "Status", "Applications", "Hired", "Avg days to hire", "Days to fill", "Open for (days)"], rows,
            daysToHire.Count == 0 ? "Nobody has been hired within these filters yet." : null,
            [
                new("Hires", Count(daysToHire.Count)),
                new("Average time to hire", Days(daysToHire.Count == 0 ? null : Math.Round(daysToHire.Average(), 1))),
                new("Fastest hire", Days(daysToHire.Count == 0 ? null : Math.Round(daysToHire.Min(), 1))),
                new("Jobs still open", Count(rows.Count(x => (string)x[2]! == nameof(RequisitionStatus.Open)))),
            ],
            [
                new("bar", "How long hires took", ["Time to hire", "Hires"],
                    Histogram(daysToHire, ("Under a week", 7), ("1–2 weeks", 14), ("2–4 weeks", 30), ("1–2 months", 60), ("Over 2 months", double.MaxValue))),
                new("bar", "Average days to hire by job", ["Job", "Avg days to hire"],
                    rows.Where(x => x[5] is not null).Select(x => new[] { x[1], x[5] }).ToList()),
            ]);
    }

    private static async Task<ReportTable> TimeInStageAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var active = await applications.Select(x => new { x.Id, x.Status }).ToListAsync(ct);
        var ids = active.Select(x => x.Id).ToList();
        var transitions = await db
            .StageTransitions.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId))
            .Join(db.PipelineStages, t => t.ToStageId, s => s.Id, (t, s) => new { t.ApplicationId, t.OccurredAt, s.Name })
            .OrderBy(x => x.ApplicationId).ThenBy(x => x.OccurredAt)
            .ToListAsync(ct);
        var stillActive = active.Where(x => x.Status == ApplicationStatus.Active).Select(x => x.Id).ToHashSet();
        var durations = new List<(string Stage, double Days)>();
        foreach (var group in transitions.GroupBy(x => x.ApplicationId))
        {
            var list = group.ToList();
            for (var i = 0; i < list.Count; i++)
            {
                var end = i + 1 < list.Count ? list[i + 1].OccurredAt : stillActive.Contains(group.Key) ? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
                if (end is not null)
                    durations.Add((list[i].Name, (end.Value - list[i].OccurredAt).TotalDays));
            }
        }
        var rows = durations.GroupBy(x => x.Stage)
            .Select(g => new object?[] { g.Key, g.Count(), Math.Round(g.Average(x => x.Days), 1), Math.Round(g.Max(x => x.Days), 1) })
            .OrderByDescending(x => (double)x[2]!)
            .ToList();
        return new(
            "time-in-stage", "Time in each stage", "Average days an application spends in a stage before moving on.",
            ["Stage", "Stays measured", "Avg days", "Longest (days)"], rows,
            rows.Count == 0 ? "Stage timing starts from when this was turned on, so it fills in as applications move." : "Counted from when stage history started being recorded.",
            [
                new("Stays measured", Count(durations.Count)),
                new("Average stay", Days(durations.Count == 0 ? null : Math.Round(durations.Average(x => x.Days), 1))),
                new("Slowest stage", rows.Count == 0 ? "–" : (string)rows[0][0]!),
            ],
            [
                new("bar", "Average and longest stay by stage", ["Stage", "Avg days", "Longest (days)"], rows.Select(x => new[] { x[0], x[2], x[3] }).ToList()),
                new("bar", "How long stays last", ["Length of stay", "Stays"],
                    Histogram(durations.Select(x => x.Days).ToList(), ("Under a day", 1), ("1–3 days", 3), ("4–7 days", 7), ("1–2 weeks", 14), ("2–4 weeks", 30), ("Over a month", double.MaxValue))),
            ]);
    }

    private static async Task<ReportTable> InterviewersAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var ids = applications.Select(x => x.Id);
        var interviews = await db.Interviews.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId) && x.Status != InterviewStatus.Cancelled && x.Status != InterviewStatus.Proposed)
            .Select(x => new { x.Id, x.EndsAt, x.InterviewerEmails, Scorecards = x.Scorecards.Select(s => new { s.InterviewerEmail, s.SubmittedAt }).ToList() })
            .ToListAsync(ct);
        var names = await db.Users.AsNoTracking().ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        var now = DateTimeOffset.UtcNow;
        // One entry per interviewer per finished interview: hours from the end to their scorecard, or null if it never came.
        var finished = interviews
            .Where(i => i.EndsAt < now)
            .SelectMany(i => i.InterviewerEmails.Select(email =>
                i.Scorecards.FirstOrDefault(s => s.InterviewerEmail.Equals(email, StringComparison.OrdinalIgnoreCase)) is { } card
                    ? Math.Max(0, (card.SubmittedAt - i.EndsAt).TotalHours)
                    : (double?)null))
            .ToList();
        var rows = interviews
            .SelectMany(i => i.InterviewerEmails.Select(email => new { Email = email.ToLowerInvariant(), Interview = i }))
            .GroupBy(x => x.Email)
            .Select(group =>
            {
                var past = group.Where(x => x.Interview.EndsAt < now).ToList();
                var submitted = past.Select(x => x.Interview.Scorecards.FirstOrDefault(s => s.InterviewerEmail.Equals(group.Key, StringComparison.OrdinalIgnoreCase))).Where(s => s is not null).ToList();
                var latency = past
                    .Select(x => new { x.Interview.EndsAt, Card = x.Interview.Scorecards.FirstOrDefault(s => s.InterviewerEmail.Equals(group.Key, StringComparison.OrdinalIgnoreCase)) })
                    .Where(x => x.Card is not null).Select(x => Math.Max(0, (x.Card!.SubmittedAt - x.EndsAt).TotalHours)).ToList();
                return new object?[]
                {
                    names.GetValueOrDefault(group.Key, group.Key), group.Count(), group.Count(x => x.Interview.EndsAt >= now),
                    past.Count, submitted.Count, past.Count - submitted.Count,
                    latency.Count == 0 ? null : Math.Round(latency.Average(), 1),
                };
            })
            .OrderByDescending(x => (int)x[1]!)
            .ToList();
        var submittedHours = finished.OfType<double>().ToList();
        return new(
            "interviewers", "Interviewer load and feedback", "Who is interviewing the most, and how quickly their scorecards arrive.",
            ["Interviewer", "Interviews", "Upcoming", "Finished", "Scorecards in", "Overdue", "Avg hours to submit"], rows,
            rows.Count == 0 ? "No interviews have been scheduled yet." : null,
            [
                new("Interviews", Count(interviews.Count)),
                new("Upcoming", Count(interviews.Count(x => x.EndsAt >= now))),
                new("Scorecards overdue", Count(finished.Count(x => x is null))),
                new("Average time to submit", submittedHours.Count == 0 ? "–" : submittedHours.Average().ToString("0.#", CultureInfo.InvariantCulture) + " hours"),
            ],
            [
                new("stacked", "Interviews per person", ["Interviewer", "Scorecards in", "Overdue", "Upcoming"], rows.Select(x => new[] { x[0], x[4], x[5], x[2] }).ToList()),
            ]);
    }

    private static async Task<ReportTable> SourcesAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var data = await applications.Select(x => new { x.Source, x.Status, Interviewed = x.Interviews.Any(i => i.Status != InterviewStatus.Cancelled && i.Status != InterviewStatus.Proposed) }).ToListAsync(ct);
        var groups = data.GroupBy(x => x.Source).OrderByDescending(g => g.Count()).ToList();
        var rows = groups
            .Select(g => new object?[]
            {
                g.Key, g.Count(), g.Count(x => x.Interviewed), g.Count(x => x.Status == ApplicationStatus.Hired), g.Count(x => x.Status == ApplicationStatus.Rejected),
                Percent(g.Count(x => x.Interviewed), g.Count()), Percent(g.Count(x => x.Status == ApplicationStatus.Hired), g.Count()),
            })
            .ToList();
        return new(
            "sources", "Source effectiveness", "Where applications come from and which sources lead to interviews and hires.",
            ["Source", "Applications", "Interviewed", "Hired", "Rejected", "Interview rate (%)", "Hire rate (%)"], rows,
            rows.Count == 0 ? "No applications match these filters." : null,
            [
                new("Sources", Count(rows.Count)),
                new("Biggest source", rows.Count == 0 ? "–" : (string)rows[0][0]!),
                new("Interview rate", Pct(Percent(data.Count(x => x.Interviewed), data.Count))),
                new("Hire rate", Pct(Percent(data.Count(x => x.Status == ApplicationStatus.Hired), data.Count))),
            ],
            [
                new("donut", "Where applications come from", ["Source", "Applications"], rows.Select(x => new[] { x[0], x[1] }).ToList()),
                new("stacked", "What happened to them", ["Source", "Still active", "Hired", "Rejected", "Withdrawn"],
                    groups.Select(g => new object?[]
                    {
                        g.Key, g.Count(x => x.Status == ApplicationStatus.Active), g.Count(x => x.Status == ApplicationStatus.Hired),
                        g.Count(x => x.Status == ApplicationStatus.Rejected), g.Count(x => x.Status == ApplicationStatus.Withdrawn),
                    }).ToList()),
            ]);
    }

    private static async Task<ReportTable> AiOutcomesAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var data = await applications
            .Join(db.JobFits, a => new { a.RequisitionId, a.CandidateId }, f => new { f.RequisitionId, f.CandidateId }, (a, f) => new
            {
                a.Id, a.RequisitionId, StageSort = a.PipelineStage!.SortOrder, f.Score, a.Status,
                Interviewed = a.Interviews.Any(i => i.Status != InterviewStatus.Cancelled && i.Status != InterviewStatus.Proposed),
            })
            .ToListAsync(ct);
        string Bucket(int score) => score >= 80 ? "80–100" : score >= 60 ? "60–79" : score >= 40 ? "40–59" : "0–39";
        var order = new[] { "80–100", "60–79", "40–59", "0–39" };
        var rows = order.Select(bucket =>
        {
            var group = data.Where(x => Bucket(x.Score) == bucket).ToList();
            return new object?[] { bucket, group.Count, group.Count(x => x.Interviewed), group.Count(x => x.Status == ApplicationStatus.Hired), group.Count(x => x.Status == ApplicationStatus.Rejected), Percent(group.Count(x => x.Status == ApplicationStatus.Hired), group.Count) };
        }).ToList();

        // How far each assessed application got, as a step number within its own job's pipeline (1 is the first stage).
        var furthest = await FurthestStageAsync(db, data.GroupBy(x => x.Id).ToDictionary(g => g.Key, g => g.First().StageSort), ct);
        var requisitionIds = data.Select(x => x.RequisitionId).Distinct().ToList();
        var stageOrders = (await db.PipelineStages.AsNoTracking().Where(x => requisitionIds.Contains(x.RequisitionId)).Select(x => new { x.RequisitionId, x.SortOrder }).ToListAsync(ct))
            .ToLookup(x => x.RequisitionId, x => x.SortOrder);
        var scatter = data
            .Select(x => new object?[] { x.Score, stageOrders[x.RequisitionId].Count(sort => sort <= furthest[x.Id]) })
            .ToList();
        double? AverageFit(ApplicationStatus status) =>
            data.Any(x => x.Status == status) ? Math.Round(data.Where(x => x.Status == status).Average(x => x.Score), 1) : null;
        string Fit(double? value) => value is null ? "–" : value.Value.ToString("0.#", CultureInfo.InvariantCulture);
        return new(
            "ai-outcomes", "AI fit versus outcome", "Did candidates the AI scored higher actually get further? Only applications that had a fit assessment are counted.",
            ["AI fit score", "Applications", "Interviewed", "Hired", "Rejected", "Hire rate (%)"], rows,
            data.Count == 0 ? "No applicant has an AI fit assessment yet. Run one from a shortlist to start building this up." : "Small numbers prove nothing; read this as a trend once there are dozens of outcomes.",
            [
                new("Assessed applications", Count(data.Count)),
                new("Average fit of hires", Fit(AverageFit(ApplicationStatus.Hired))),
                new("Average fit of rejections", Fit(AverageFit(ApplicationStatus.Rejected))),
            ],
            [
                new("scatter", "Fit score against how far they got", ["AI fit score", "Stage reached"], scatter,
                    "Each dot is one application. Higher dots got further through the pipeline; 1 is the first stage."),
                new("bar", "Hire rate by fit score", ["AI fit score", "Hire rate (%)"], rows.Select(x => new[] { x[0], x[5] }).ToList()),
            ]);
    }

    private static async Task<ReportTable> HiresAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var hired = await applications.Where(x => x.Status == ApplicationStatus.Hired)
            .Select(x => new
            {
                x.Id, Name = x.Candidate!.FirstName + " " + x.Candidate.LastName, x.Candidate.Email, x.Candidate.Phone,
                Code = x.Requisition!.Code, Title = x.Requisition.Title, x.Requisition.Department, x.Requisition.Location, x.Requisition.EmploymentType,
                x.Requisition.TargetStartDate, x.Source, x.LastActivityAt,
            }).ToListAsync(ct);
        var ids = hired.Select(x => x.Id).ToList();
        var at = await db.StageTransitions.AsNoTracking().Where(x => ids.Contains(x.ApplicationId) && x.ToStatus == ApplicationStatus.Hired)
            .GroupBy(x => x.ApplicationId).Select(g => new { Id = g.Key, At = g.Max(x => x.OccurredAt) }).ToDictionaryAsync(x => x.Id, x => x.At, ct);
        var rows = hired.Select(x => new object?[]
            { x.Name, x.Email, x.Phone, x.Code, x.Title, x.Department, x.Location, x.EmploymentType, at.GetValueOrDefault(x.Id, x.LastActivityAt), x.TargetStartDate, x.Source })
            .OrderByDescending(x => (DateTimeOffset)x[8]!).ToList();
        var departments = hired.GroupBy(x => x.Department).OrderByDescending(g => g.Count()).ToList();
        var (unit, perPeriod) = PerPeriod(rows.Select(x => (DateTimeOffset)x[8]!).ToList());
        return new(
            "hires", "Hires", "Everyone marked hired, with the details payroll and HR need. Export it as CSV.",
            ["Name", "Email", "Phone", "Job code", "Job", "Department", "Location", "Employment type", "Hired on", "Target start", "Source"], rows,
            rows.Count == 0 ? "Nobody has been hired within these filters yet." : null,
            [
                new("Hires", Count(rows.Count)),
                new("Departments", Count(departments.Count)),
                new("Most hires from", hired.Count == 0 ? "–" : hired.GroupBy(x => x.Source).MaxBy(g => g.Count())!.Key),
            ],
            [
                new("line", "Hires over time", [unit, "Hires"], perPeriod),
                new("donut", "Hires by department", ["Department", "Hires"], departments.Select(g => new object?[] { g.Key, g.Count() }).ToList()),
            ]);
    }
}
