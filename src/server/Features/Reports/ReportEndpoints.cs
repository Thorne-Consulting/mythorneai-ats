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
    // Which columns the chart plots: label column, then value columns. Null means table only.
    int? ChartLabel = null,
    int[]? ChartValues = null
);

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

    private static async Task<ReportTable> FunnelAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var apps = await applications
            .Select(x => new { x.Id, x.RequisitionId, StageSort = x.PipelineStage!.SortOrder })
            .ToListAsync(ct);
        var ids = apps.Select(x => x.Id).ToList();
        // Furthest stage each application has touched: where it is now, or any stage it passed through.
        var reached = await db
            .StageTransitions.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId))
            .Join(db.PipelineStages, t => t.ToStageId, s => s.Id, (t, s) => new { t.ApplicationId, s.SortOrder })
            .GroupBy(x => x.ApplicationId)
            .Select(g => new { Id = g.Key, Max = g.Max(x => x.SortOrder) })
            .ToDictionaryAsync(x => x.Id, x => x.Max, ct);
        var requisitionIds = apps.Select(x => x.RequisitionId).Distinct().ToList();
        var stages = await db.PipelineStages.AsNoTracking().Where(x => requisitionIds.Contains(x.RequisitionId)).ToListAsync(ct);
        var furthest = apps.ToDictionary(x => x.Id, x => Math.Max(x.StageSort, reached.GetValueOrDefault(x.Id, -1)));
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
        return new(
            "funnel", "Hiring funnel", "How many applications reached each stage, and how many carried on to the next.",
            ["Stage", "Reached", "Share of applicants (%)", "Carried on from previous (%)"], table,
            apps.Count == 0 ? "No applications match these filters." : null, 0, [1]);
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
        return new(
            "time-to-hire", "Time to hire and fill", "Average days from application to hire, and days from opening a job to filling every seat.",
            ["Code", "Job", "Status", "Applications", "Hired", "Avg days to hire", "Days to fill", "Open for (days)"], rows,
            rows.All(x => x[4] is 0) ? "Nobody has been hired within these filters yet." : null, 1, [5]);
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
            rows.Count == 0 ? "Stage timing starts from when this was turned on, so it fills in as applications move." : "Counted from when stage history started being recorded.", 0, [2]);
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
        return new(
            "interviewers", "Interviewer load and feedback", "Who is interviewing the most, and how quickly their scorecards arrive.",
            ["Interviewer", "Interviews", "Upcoming", "Finished", "Scorecards in", "Overdue", "Avg hours to submit"], rows,
            rows.Count == 0 ? "No interviews have been scheduled yet." : null, 0, [1, 4]);
    }

    private static async Task<ReportTable> SourcesAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var data = await applications.Select(x => new { x.Source, x.Status, Interviewed = x.Interviews.Any(i => i.Status != InterviewStatus.Cancelled && i.Status != InterviewStatus.Proposed) }).ToListAsync(ct);
        var rows = data.GroupBy(x => x.Source)
            .Select(g => new object?[]
            {
                g.Key, g.Count(), g.Count(x => x.Interviewed), g.Count(x => x.Status == ApplicationStatus.Hired), g.Count(x => x.Status == ApplicationStatus.Rejected),
                Percent(g.Count(x => x.Interviewed), g.Count()), Percent(g.Count(x => x.Status == ApplicationStatus.Hired), g.Count()),
            })
            .OrderByDescending(x => (int)x[1]!).ToList();
        return new(
            "sources", "Source effectiveness", "Where applications come from and which sources lead to interviews and hires.",
            ["Source", "Applications", "Interviewed", "Hired", "Rejected", "Interview rate (%)", "Hire rate (%)"], rows,
            rows.Count == 0 ? "No applications match these filters." : null, 0, [1, 2, 3]);
    }

    private static async Task<ReportTable> AiOutcomesAsync(AtsDbContext db, IQueryable<Application> applications, CancellationToken ct)
    {
        var data = await applications
            .Join(db.JobFits, a => new { a.RequisitionId, a.CandidateId }, f => new { f.RequisitionId, f.CandidateId }, (a, f) => new { f.Score, a.Status, Interviewed = a.Interviews.Any(i => i.Status != InterviewStatus.Cancelled && i.Status != InterviewStatus.Proposed) })
            .ToListAsync(ct);
        string Bucket(int score) => score >= 80 ? "80–100" : score >= 60 ? "60–79" : score >= 40 ? "40–59" : "0–39";
        var order = new[] { "80–100", "60–79", "40–59", "0–39" };
        var rows = order.Select(bucket =>
        {
            var group = data.Where(x => Bucket(x.Score) == bucket).ToList();
            return new object?[] { bucket, group.Count, group.Count(x => x.Interviewed), group.Count(x => x.Status == ApplicationStatus.Hired), group.Count(x => x.Status == ApplicationStatus.Rejected), Percent(group.Count(x => x.Status == ApplicationStatus.Hired), group.Count) };
        }).ToList();
        return new(
            "ai-outcomes", "AI fit versus outcome", "Did candidates the AI scored higher actually get further? Only applications that had a fit assessment are counted.",
            ["AI fit score", "Applications", "Interviewed", "Hired", "Rejected", "Hire rate (%)"], rows,
            data.Count == 0 ? "No applicant has an AI fit assessment yet. Run one from a shortlist to start building this up." : "Small numbers prove nothing; read this as a trend once there are dozens of outcomes.", 0, [1, 3]);
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
        return new(
            "hires", "Hires", "Everyone marked hired, with the details payroll and HR need. Export it as CSV.",
            ["Name", "Email", "Phone", "Job code", "Job", "Department", "Location", "Employment type", "Hired on", "Target start", "Source"], rows,
            rows.Count == 0 ? "Nobody has been hired within these filters yet." : null);
    }
}
