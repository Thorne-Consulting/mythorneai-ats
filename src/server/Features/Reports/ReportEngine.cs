using System.Globalization;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using static MyThorneAI.Ats.Api.Api.ReportFormat;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Everything a report needs: the filtered applications and the dates they cover.</summary>
public sealed class ReportContext
{
    public required AtsDbContext Db { get; init; }
    public required ReportQuery Query { get; init; }
    public required ReportPeriod Period { get; init; }
    public required List<AppFact> Facts { get; init; }
    public required Organization Organization { get; init; }

    /// <summary>Display names for the recruiters in Facts, by lower-case email.</summary>
    public required Dictionary<string, string> Names { get; init; }
    public DateTimeOffset Now { get; init; }

    /// <summary>
    /// Whether the viewer may see offer terms (base salaries): hiring staff and hiring managers,
    /// the same rule as the compare page. Off for emailed digests and everyone else.
    /// </summary>
    public bool ShowPay { get; init; }

    /// <summary>Several jobs combine their stages by type; one job keeps its own stage names.</summary>
    public bool ByType => Query.RequisitionId is null;

    /// <summary>Today in the organization's time zone.</summary>
    public DateOnly Today =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(Now, Period.Zone).DateTime);

    /// <summary>"in the last 30 days", "this quarter", "at any time".</summary>
    public string Phrase =>
        Period.IsAllTime ? "at any time"
        : Query.Range?.ToLowerInvariant() is "30d" or "90d"
            ? $"in the {Period.Label.ToLowerInvariant()}"
        : Query.Range?.ToLowerInvariant() is "quarter" or "year" ? Period.Label.ToLowerInvariant()
        : Period.From is not null && Period.To is not null ? $"from {Period.Label}"
        : char.ToLowerInvariant(Period.Label[0]) + Period.Label[1..];
}

public sealed record ReportGroup(string Label, ReportDrill Drill, List<AppFact> Items);

public static partial class ReportEngine
{
    public static readonly ReportInfo[] Catalog =
    [
        new(
            "funnel",
            "Hiring funnel",
            "Pipeline",
            "How many applications reached each stage, and where people left.",
            "applied",
            ["job", "department", "source", "recruiter"]
        ),
        new(
            "velocity",
            "Pipeline velocity",
            "Pipeline",
            "How long applications wait in each stage, and who is stuck now.",
            "applied",
            []
        ),
        new(
            "rejections",
            "Rejection reasons",
            "Pipeline",
            "Why applications end, and at which stage.",
            "applied",
            ["stage", "job", "department", "source"]
        ),
        new(
            "time-to-hire",
            "Time to hire and fill",
            "Speed",
            "Days from application to hire, and from opening a job to filling it.",
            "hired",
            ["job", "department", "source", "recruiter", "month"]
        ),
        new(
            "sources",
            "Source quality",
            "Sources",
            "How far candidates from each source get, not only how many apply.",
            "applied",
            []
        ),
        new(
            "ai-outcomes",
            "AI fit versus outcome",
            "Sources",
            "Whether candidates the AI scored higher actually got further.",
            "applied",
            ["job"]
        ),
        new(
            "interviewers",
            "Interviewer load and feedback",
            "Team",
            "Who interviews the most, how fast scorecards arrive, and how each person votes.",
            "interview",
            []
        ),
        new(
            "offers",
            "Offer acceptance",
            "Team",
            "How many offers people accept, how fast they answer, and why they say no.",
            "offer",
            ["job", "department", "recruiter", "month"]
        ),
        new(
            "hires",
            "Hires",
            "People",
            "Everyone you hired, with their job and start date.",
            "hired",
            ["department", "source", "job", "recruiter", "month"]
        ),
    ];

    public static readonly Dictionary<string, string> GroupLabels = new()
    {
        ["job"] = "Job",
        ["department"] = "Department",
        ["source"] = "Source",
        ["recruiter"] = "Recruiter",
        ["month"] = "Month",
        ["stage"] = "Stage reached",
    };

    /// <summary>Old report keys still open their report.</summary>
    public static ReportInfo? Info(string? key) =>
        Catalog.FirstOrDefault(x => x.Key == (key == "time-in-stage" ? "velocity" : key));

    public static ReportDateField DateFieldOf(ReportInfo? info) =>
        info?.DateField switch
        {
            "hired" => ReportDateField.Hired,
            "interview" or "offer" => ReportDateField.Other,
            _ => ReportDateField.Applied,
        };

    /// <summary>Stage types in the order a funnel reads them. Other sits where tasks and checks usually do.</summary>
    public static readonly StageType[] TypeOrder =
    [
        StageType.Applied,
        StageType.Screen,
        StageType.Interview,
        StageType.Other,
        StageType.Offer,
        StageType.Hired,
    ];

    public static string TypeLabel(StageType type) =>
        type switch
        {
            StageType.Applied => "Applied",
            StageType.Screen => "Screening",
            StageType.Interview => "Interview",
            StageType.Offer => "Offer",
            StageType.Hired => "Hired",
            _ => "Other",
        };

    /// <summary>
    /// What a stage is called in a report, and the key drill-downs match on. Several jobs combine by
    /// type, so "Onsite" in one pipeline and "Panel" in another both count as Interview. One job keeps
    /// its own stage names and order.
    /// </summary>
    public static string StageKey(bool byType, string name, StageType type) =>
        byType ? TypeLabel(type) : name.Trim();

    public static string StageKey(ReportContext c, AppFact f) =>
        StageKey(c.ByType, f.Stage, f.StageType);

    /// <summary>Where a stage sorts: by type across jobs, by the job's own order within one.</summary>
    public static double StageOrder(bool byType, StageType type, int sortOrder) =>
        byType ? Array.IndexOf(TypeOrder, type) : sortOrder;

    /// <summary>Said under stage charts when several jobs are combined.</summary>
    private const string ByTypeCaption =
        "Stages from every job, combined by type. Pick a job to see its own stages.";

    public static async Task<ReportContext> LoadAsync(
        AtsDbContext db,
        IQueryable<Application> scoped,
        ReportQuery query,
        ReportDateField field,
        DateTimeOffset now,
        CancellationToken ct,
        bool showPay = false
    )
    {
        var organization =
            await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct)
            ?? new Organization { Name = "", OwnerEmail = "" };
        var period = ReportPeriod.Resolve(
            query.Range,
            query.From,
            query.To,
            now,
            TimeText.Zone(organization.TimeZone)
        );
        var apps = scoped.Where(x => x.Status != ApplicationStatus.PendingVerification);
        if (query.RequisitionId is { } job)
            apps = apps.Where(x => x.RequisitionId == job);
        if (!string.IsNullOrWhiteSpace(query.Department))
        {
            var department = query.Department.Trim().ToLower();
            apps = apps.Where(x => x.Requisition!.Department.Trim().ToLower() == department);
        }
        if (!string.IsNullOrWhiteSpace(query.Source))
        {
            var source = SourceKey(query.Source);
            apps = apps.Where(x => x.Source.Trim().ToLower() == source);
        }
        if (!string.IsNullOrWhiteSpace(query.Recruiter))
        {
            var recruiter = query.Recruiter.Trim().ToLower();
            apps = apps.Where(x => x.Requisition!.RecruiterEmail.ToLower() == recruiter);
        }
        if (field == ReportDateField.Applied)
        {
            if (period.Start is { } start)
                apps = apps.Where(x => x.AppliedAt >= start);
            if (period.End is { } end)
                apps = apps.Where(x => x.AppliedAt < end);
        }
        else if (field == ReportDateField.Hired && !period.IsAllTime)
        {
            // Hires count by the day they were hired. A hire with no recorded date can't be placed in a period.
            apps = apps.Where(x => x.Status == ApplicationStatus.Hired);
            if (period.Start is { } start)
                apps = apps.Where(x =>
                    db.StageTransitions.Where(t =>
                            t.ApplicationId == x.Id && t.ToStatus == ApplicationStatus.Hired
                        )
                        .Max(t => (DateTimeOffset?)t.OccurredAt) >= start
                );
            if (period.End is { } end)
                apps = apps.Where(x =>
                    db.StageTransitions.Where(t =>
                            t.ApplicationId == x.Id && t.ToStatus == ApplicationStatus.Hired
                        )
                        .Max(t => (DateTimeOffset?)t.OccurredAt) < end
                );
        }

        var rows = await apps.Select(x => new
            {
                x.Id,
                x.CandidateId,
                Candidate = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                x.RequisitionId,
                Job = x.Requisition!.Title,
                JobCode = x.Requisition.Code,
                x.Requisition.Department,
                Recruiter = x.Requisition.RecruiterEmail,
                x.Source,
                x.Status,
                x.PipelineStageId,
                Stage = x.PipelineStage!.Name,
                StageSort = x.PipelineStage.SortOrder,
                x.PipelineStage.IsTerminal,
                StageType = x.PipelineStage.Type,
                StageColor = x.PipelineStage.Color,
                x.AppliedAt,
                x.LastActivityAt,
                x.DispositionReason,
            })
            .ToListAsync(ct);
        var hiredIds = rows.Where(x => x.Status == ApplicationStatus.Hired)
            .Select(x => x.Id)
            .ToList();
        var hiredAt = await db
            .StageTransitions.AsNoTracking()
            .Where(x => hiredIds.Contains(x.ApplicationId) && x.ToStatus == ApplicationStatus.Hired)
            .GroupBy(x => x.ApplicationId)
            .Select(g => new { Id = g.Key, At = g.Max(x => x.OccurredAt) })
            .ToDictionaryAsync(x => x.Id, x => x.At, ct);
        // One display name per source: the spelling used most often.
        var sourceNames = rows.GroupBy(x => SourceKey(x.Source))
            .ToDictionary(
                g => g.Key,
                g =>
                    g.Key.Length == 0
                        ? "Not recorded"
                        : g.GroupBy(x => x.Source.Trim())
                            .OrderByDescending(x => x.Count())
                            .ThenBy(x => x.Key)
                            .First()
                            .Key
            );
        var facts = rows.Select(x => new AppFact(
                x.Id,
                x.CandidateId,
                x.Candidate,
                x.RequisitionId,
                x.Job,
                x.JobCode,
                x.Department.Trim(),
                x.Recruiter.ToLowerInvariant(),
                sourceNames[SourceKey(x.Source)],
                x.Status,
                x.PipelineStageId,
                x.Stage,
                x.StageSort,
                x.IsTerminal,
                x.StageType,
                x.StageColor,
                x.AppliedAt,
                x.LastActivityAt,
                x.DispositionReason,
                hiredAt.TryGetValue(x.Id, out var at) ? at : null
            ))
            .ToList();
        return new ReportContext
        {
            Db = db,
            Query = query,
            Period = period,
            Facts = facts,
            Organization = organization,
            Names = await NamesAsync(db, facts.Select(x => x.Recruiter), ct),
            Now = now,
            ShowPay = showPay,
        };
    }

    public static async Task<ReportTable?> RunAsync(
        ReportContext c,
        string key,
        CancellationToken ct
    )
    {
        var info = Info(key);
        if (info is null)
            return null;
        var table = info.Key switch
        {
            "funnel" => await FunnelAsync(c, info, ct),
            "velocity" => await VelocityAsync(c, info, ct),
            "rejections" => await RejectionsAsync(c, info, ct),
            "time-to-hire" => await TimeToHireAsync(c, info, ct),
            "sources" => await SourcesAsync(c, info, ct),
            "ai-outcomes" => await AiOutcomesAsync(c, info, ct),
            "interviewers" => await InterviewersAsync(c, info, ct),
            "offers" => await OffersAsync(c, info, ct),
            _ => await HiresAsync(c, info, ct),
        };
        table.Organization = c.Organization.Name;
        table.Period = c.Period.Label;
        return table;
    }

    private static string? Breakdown(ReportContext c, ReportInfo info) =>
        c.Query.GroupBy is { } by && info.Breakdowns.Contains(by) ? by : null;

    /// <summary>Applications split by job, department, source, recruiter, stage or month (of the given date).</summary>
    public static List<ReportGroup> GroupFacts(
        ReportContext c,
        IEnumerable<AppFact> facts,
        string by,
        Func<AppFact, DateTimeOffset?>? dateOf = null
    )
    {
        var list = facts.ToList();
        DateOnly? MonthOf(AppFact f)
        {
            if (dateOf?.Invoke(f) is not { } at)
                return null;
            var day = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(at, c.Period.Zone).DateTime);
            return new DateOnly(day.Year, day.Month, 1);
        }
        IEnumerable<ReportGroup> groups = by switch
        {
            "job" => list.GroupBy(x => x.RequisitionId)
                .Select(g => new ReportGroup(
                    g.First().Job,
                    ReportDrill.Of(("requisitionId", g.Key.ToString())),
                    g.ToList()
                )),
            "department" => list.GroupBy(x => x.Department.ToLowerInvariant())
                .Select(g => new ReportGroup(
                    g.First().Department,
                    ReportDrill.Of(("department", g.First().Department)),
                    g.ToList()
                )),
            "source" => list.GroupBy(x => SourceKey(x.Source))
                .Select(g => new ReportGroup(
                    g.First().Source,
                    ReportDrill.Of(("source", g.First().Source)),
                    g.ToList()
                )),
            "recruiter" => list.GroupBy(x => x.Recruiter)
                .Select(g => new ReportGroup(
                    c.Names.GetValueOrDefault(g.Key, g.Key),
                    ReportDrill.Of(("recruiter", g.Key)),
                    g.ToList()
                )),
            "stage" => list.GroupBy(x => StageKey(c, x))
                .OrderBy(g => g.Average(x => StageOrder(c.ByType, x.StageType, x.StageSort)))
                .Select(g => new ReportGroup(g.Key, ReportDrill.Of(("stage", g.Key)), g.ToList())),
            _ => list.GroupBy(MonthOf)
                .OrderBy(g => g.Key ?? DateOnly.MaxValue)
                .Select(g =>
                    g.Key is { } month
                        ? new ReportGroup(
                            month.ToString("MMM yyyy", CultureInfo.InvariantCulture),
                            DatesDrill(month, month.AddMonths(1).AddDays(-1)),
                            g.ToList()
                        )
                        : new ReportGroup(
                            "Date not recorded",
                            ReportDrill.Of(("range", "")),
                            g.ToList()
                        )
                ),
        };
        return by is "stage" or "month"
            ? groups.ToList()
            : groups.OrderByDescending(x => x.Items.Count).ThenBy(x => x.Label).ToList();
    }

    // ---- Hiring funnel -------------------------------------------------------------------------

    /// <summary>Funnel stages in order, and for each application the index of the furthest one it reached.</summary>
    public sealed record FunnelShape(List<string> Keys, Dictionary<Guid, int> Last);

    public static async Task<FunnelShape> FunnelOfAsync(
        AtsDbContext db,
        List<AppFact> facts,
        bool byType,
        CancellationToken ct
    )
    {
        var ids = facts.Select(x => x.Id).ToList();
        var passed = await db
            .StageTransitions.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId))
            .Join(
                db.PipelineStages,
                t => t.ToStageId,
                s => s.Id,
                (t, s) => new { t.ApplicationId, s.SortOrder }
            )
            .GroupBy(x => x.ApplicationId)
            .Select(g => new { Id = g.Key, Max = g.Max(x => x.SortOrder) })
            .ToDictionaryAsync(x => x.Id, x => x.Max, ct);
        var jobIds = facts.Select(x => x.RequisitionId).Distinct().ToList();
        var stages = await db
            .PipelineStages.AsNoTracking()
            .Where(x => jobIds.Contains(x.RequisitionId))
            .Select(x => new
            {
                x.RequisitionId,
                x.Name,
                x.SortOrder,
                x.Type,
            })
            .ToListAsync(ct);
        // Across jobs, Other stages mean something different in each pipeline, so the funnel skips them.
        var keys = byType
            ? TypeOrder
                .Where(t => t != StageType.Other && stages.Any(s => s.Type == t))
                .Select(TypeLabel)
                .ToList()
            : stages
                .GroupBy(x => x.Name.Trim())
                .OrderBy(g => g.Average(x => x.SortOrder))
                .Select(g => g.Key)
                .ToList();
        var sorts = stages
            .GroupBy(x => x.RequisitionId)
            .ToDictionary(
                g => g.Key,
                g =>
                    g.GroupBy(x => StageKey(byType, x.Name, x.Type))
                        .ToDictionary(k => k.Key, k => k.Min(x => x.SortOrder))
            );
        var last = facts.ToDictionary(
            f => f.Id,
            f =>
            {
                // Furthest point: where it is now, or any later stage it passed through and came back
                // from. A hire reached the end, whatever stage an old record sits in.
                var furthest =
                    f.Status == ApplicationStatus.Hired
                        ? int.MaxValue
                        : Math.Max(f.StageSort, passed.GetValueOrDefault(f.Id, int.MinValue));
                var jobSorts = sorts.GetValueOrDefault(f.RequisitionId) ?? [];
                var index = -1;
                for (var i = 0; i < keys.Count; i++)
                    if (jobSorts.TryGetValue(keys[i], out var sort) && sort <= furthest)
                        index = i;
                return index;
            }
        );
        return new(keys, last);
    }

    /// <summary>
    /// Where people went: each stage flows on to the next, out to "Left" for those who ended
    /// there, and the last stage flows to "Hired". Rows are [from, to, applications].
    /// </summary>
    private static ReportChart FlowChart(
        List<string> keys,
        List<int> reached,
        List<AppFact> facts,
        int hired
    )
    {
        var rows = new List<object?[]>();
        for (var i = 0; i < keys.Count; i++)
        {
            // Everyone whose furthest stage is this one and who ended.
            var shapeLeft = facts.Count(f => Ended(f) && FurthestIs(f, i));
            if (i + 1 < keys.Count && reached[i + 1] > 0)
                rows.Add([keys[i], keys[i + 1], reached[i + 1]]);
            if (shapeLeft > 0)
                rows.Add([keys[i], "Left", shapeLeft]);
        }
        // The last stage is often "Hired" itself; a node never flows into itself.
        if (hired > 0 && keys[^1] != "Hired")
            rows.Add([keys[^1], "Hired", hired]);
        // Still in progress at a stage: reached it, did not move on, did not end.
        for (var i = 0; i < keys.Count; i++)
        {
            var open =
                reached[i]
                - (i + 1 < keys.Count ? reached[i + 1] : hired)
                - facts.Count(f => Ended(f) && FurthestIs(f, i));
            if (open > 0)
                rows.Add([keys[i], "Still in progress", open]);
        }
        return new ReportChart(
            "sankey",
            "Where applications went",
            ["From", "To", "Applications"],
            rows,
            "Each band is the number of applications that took that path."
        );
    }

    // ponytail: the funnel's "furthest stage" lookup is rebuilt per call from the stage list the
    // caller already has; FunnelAsync sets it before drawing the flow.
    [ThreadStatic]
    private static Dictionary<Guid, int>? _furthest;

    private static bool FurthestIs(AppFact f, int index) =>
        _furthest is not null && _furthest.TryGetValue(f.Id, out var last) && last == index;

    public static bool Ended(AppFact f) =>
        f.Status is ApplicationStatus.Rejected or ApplicationStatus.Withdrawn;

    private static async Task<ReportTable> FunnelAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var facts = c.Facts;
        var shape = await FunnelOfAsync(c.Db, facts, c.ByType, ct);
        _furthest = shape.Last;
        var reached = shape.Keys.Select((_, i) => facts.Count(f => shape.Last[f.Id] >= i)).ToList();
        var rows = new List<object?[]>();
        var drill = new List<ReportDrill?>();
        for (var i = 0; i < shape.Keys.Count; i++)
        {
            var left = facts.Where(f => shape.Last[f.Id] == i && Ended(f)).ToList();
            var top = left.GroupBy(f => ReasonOf(f.Reason))
                .OrderByDescending(g => g.Count())
                .FirstOrDefault();
            rows.Add([
                shape.Keys[i],
                reached[i],
                Percent(reached[i], facts.Count),
                i == 0 ? null : Percent(reached[i], reached[i - 1]),
                left.Count,
                top is null ? null : $"{top.Key} ({top.Count()})",
            ]);
            drill.Add(ReportDrill.Of(("reached", shape.Keys[i])));
        }
        var hired = facts.Count(f => f.Status == ApplicationStatus.Hired);
        var (unit, perPeriod, periodDrill) = PerPeriod(
            facts.Select(x => x.AppliedAt).ToList(),
            c.Period
        );
        string[] columns =
        [
            "Stage",
            "Reached",
            "Share of applications (%)",
            "Moved on from the stage before (%)",
            "Left at this stage",
            "Top reason for leaving here",
        ];

        var by = Breakdown(c, info);
        if (by is not null)
        {
            var groups = GroupFacts(c, facts, by);
            columns =
            [
                GroupLabels[by],
                "Applications",
                .. shape.Keys.Skip(1).Select(k => $"Reached {k} (%)"),
            ];
            rows = groups
                .Select(g =>
                    (object?[])
                        [
                            g.Label,
                            g.Items.Count,
                            .. shape
                                .Keys.Skip(1)
                                .Select(
                                    (_, i) =>
                                        (object?)Percent(
                                            g.Items.Count(f => shape.Last[f.Id] >= i + 1),
                                            g.Items.Count
                                        )
                                ),
                        ]
                )
                .ToList();
            drill = groups.Select(g => (ReportDrill?)g.Drill).ToList();
        }
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            rows,
            facts.Count == 0 ? "No applications match these filters." : null,
            [
                new("Applications", Count(facts.Count), $"Applied {c.Phrase}", facts.Count),
                new(
                    "Moved past the first stage",
                    Pct(reached.Count > 1 ? Percent(reached[1], facts.Count) : null),
                    "Share of these applications",
                    reached.Count > 1 ? Percent(reached[1], facts.Count) : null
                ),
                new(
                    "Hired",
                    Count(hired),
                    $"{Pct(Percent(hired, facts.Count))} of these applications",
                    hired,
                    ReportDrill.Of(("status", "Hired"))
                ),
                new(
                    "Ended",
                    Count(facts.Count(Ended)),
                    "Rejected or withdrew",
                    facts.Count(Ended),
                    ReportDrill.Of(("status", "ended"))
                ),
            ],
            [
                new(
                    "funnel",
                    "Applications reaching each stage",
                    ["Stage", "Reached"],
                    rows.Count == 0 || by is not null
                        ? shape.Keys.Select((k, i) => new object?[] { k, reached[i] }).ToList()
                        : rows.Select(x => new[] { x[0], x[1] }).ToList(),
                    c.ByType ? ByTypeCaption : null
                )
                {
                    Drill = shape
                        .Keys.Select(k => (ReportDrill?)ReportDrill.Of(("reached", k)))
                        .ToList(),
                },
                new(
                    "area",
                    "Applications over time",
                    [unit, "Applications"],
                    perPeriod,
                    $"Per {(unit == "Month" ? "month" : "week")}, by the day they applied."
                )
                {
                    Drill = periodDrill,
                },
                .. by is null && facts.Count > 0
                    ? new[] { FlowChart(shape.Keys, reached, facts, hired) }
                    : [],
            ]
        )
        {
            RowDrill = drill,
            GroupBy = by,
        };
    }

    // ---- Pipeline velocity ---------------------------------------------------------------------

    private sealed record Stay(
        Guid Application,
        string Stage,
        DateTimeOffset Start,
        DateTimeOffset? End,
        bool MovedOn
    );

    private static async Task<ReportTable> VelocityAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var facts = c.Facts;
        var ids = facts.Select(x => x.Id).ToList();
        var moves = await c
            .Db.StageTransitions.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId))
            .Join(
                c.Db.PipelineStages,
                t => t.ToStageId,
                s => s.Id,
                (t, s) =>
                    new
                    {
                        t.ApplicationId,
                        t.OccurredAt,
                        t.ToStatus,
                        s.Name,
                        s.SortOrder,
                        s.Type,
                    }
            )
            .OrderBy(x => x.ApplicationId)
            .ThenBy(x => x.OccurredAt)
            .ToListAsync(ct);

        // A stay starts when an application enters a stage and ends when it moves stage or stops being
        // active. Across jobs, moving between two stages of the same type stays one stay.
        var stays = new List<Stay>();
        var openSince = new Dictionary<Guid, (string Stage, DateTimeOffset Since)>();
        foreach (var group in moves.GroupBy(x => x.ApplicationId))
        {
            string? stage = null;
            var sort = 0;
            var start = default(DateTimeOffset);
            (string? Name, DateTimeOffset Since) named = (null, default);
            foreach (var move in group)
            {
                var active = move.ToStatus == ApplicationStatus.Active;
                if (named.Name != move.Name || !active)
                    named = (active ? move.Name : null, move.OccurredAt);
                var key = StageKey(c.ByType, move.Name, move.Type);
                if (stage == key && active)
                    continue;
                if (stage is not null)
                    stays.Add(
                        new(
                            group.Key,
                            stage,
                            start,
                            move.OccurredAt,
                            active && move.SortOrder > sort
                        )
                    );
                (stage, sort, start) = (active ? key : null, move.SortOrder, move.OccurredAt);
            }
            // The stuck list says how long someone has been in the stage it names.
            if (named.Name is not null)
                openSince[group.Key] = (named.Name, named.Since);
        }

        var staleDays = Math.Clamp(c.Organization.StaleReminderDays, 1, 30);
        var stuck = facts
            .Where(f =>
                f.Status == ApplicationStatus.Active
                && !f.StageTerminal
                && f.LastActivityAt < c.Now.AddDays(-staleDays)
            )
            .OrderBy(f => f.LastActivityAt)
            .ToList();
        var done = stays.Where(x => x.End is not null).ToList();
        var fourWeeksAgo = c.Now.AddDays(-28);
        var order = facts
            .Select(f =>
                (Stage: StageKey(c, f), Sort: StageOrder(c.ByType, f.StageType, f.StageSort))
            )
            .Concat(
                moves.Select(m =>
                    (
                        Stage: StageKey(c.ByType, m.Name, m.Type),
                        Sort: StageOrder(c.ByType, m.Type, m.SortOrder)
                    )
                )
            )
            .GroupBy(x => x.Stage)
            .OrderBy(g => g.Average(x => x.Sort))
            .Select(g => g.Key)
            .ToList();
        double Length(Stay stay) => (stay.End!.Value - stay.Start).TotalDays;
        var rows = order
            .Select(stage =>
            {
                var finished = done.Where(x => x.Stage == stage).ToList();
                var now = facts.Count(f =>
                    f.Status == ApplicationStatus.Active && StageKey(c, f) == stage
                );
                return new object?[]
                {
                    stage,
                    now,
                    stuck.Count(f => StageKey(c, f) == stage),
                    finished.Count,
                    Percentile(finished.Select(Length), 0.5),
                    Average(finished.Select(Length).ToList()),
                    Percent(finished.Count(x => x.MovedOn), finished.Count),
                    Math.Round(finished.Count(x => x.End >= fourWeeksAgo) / 4.0, 1),
                };
            })
            .ToList();
        var slowest = rows.Where(x => x[4] is not null).MaxBy(x => (double)x[4]!);

        // Moves per week over the last 12 weeks, whatever the date filter: velocity is about now.
        var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(c.Now, c.Period.Zone).DateTime);
        var recent = new ReportPeriod(today.AddDays(-83), today, "Last 12 weeks", c.Period.Zone);
        var (unit, perWeek, _) = PerPeriod(
            moves.Where(x => recent.Contains(x.OccurredAt)).Select(x => x.OccurredAt).ToList(),
            recent
        );

        var stuckRows = stuck
            .Select(f =>
                new object?[]
                {
                    f.Candidate,
                    f.Job,
                    f.Stage,
                    openSince.TryGetValue(f.Id, out var open) && open.Stage == f.Stage
                        ? Math.Round((c.Now - open.Since).TotalDays, 1)
                        : null,
                    Math.Round((c.Now - f.LastActivityAt).TotalDays, 1),
                    c.Names.GetValueOrDefault(f.Recruiter, f.Recruiter),
                }
            )
            .ToList();
        return new(
            info.Key,
            info.Title,
            info.Description,
            [
                "Stage",
                "Now in stage",
                "Stuck now",
                "Stays measured",
                "Median days",
                "Average days",
                "Moved forward (%)",
                "Moves out per week",
            ],
            rows,
            done.Count == 0
                ? "Stage timing is counted from when stage history started being recorded, so it fills in as applications move."
                : null,
            [
                new(
                    "Median days in a stage",
                    Days(Percentile(done.Select(Length), 0.5)),
                    "Across every finished stay",
                    Percentile(done.Select(Length), 0.5),
                    LowerIsBetter: true
                ),
                new(
                    "Moves in the last 4 weeks",
                    Count(moves.Count(x => x.OccurredAt >= fourWeeksAgo)),
                    "Applications moved to another stage",
                    moves.Count(x => x.OccurredAt >= fourWeeksAgo)
                ),
                new(
                    "Stuck now",
                    Count(stuck.Count),
                    $"Active, with no activity for {staleDays}+ days",
                    stuck.Count,
                    ReportDrill.Of(("stuck", "true")),
                    LowerIsBetter: true
                ),
                new(
                    "Slowest stage",
                    slowest is null ? "None yet" : (string)slowest[0]!,
                    slowest is null ? "Highest median days" : $"Median {Days((double)slowest[4]!)}"
                ),
            ],
            [
                new(
                    "bar",
                    "Median days in each stage",
                    ["Stage", "Median days"],
                    rows.Where(x => x[4] is not null).Select(x => new[] { x[0], x[4] }).ToList(),
                    c.ByType ? ByTypeCaption : null
                )
                {
                    Drill = rows.Where(x => x[4] is not null)
                        .Select(x => (ReportDrill?)ReportDrill.Of(("stage", (string)x[0]!)))
                        .ToList(),
                },
                new(
                    "line",
                    "Stage moves per week",
                    [unit, "Moves"],
                    perWeek,
                    "The last 12 weeks, whatever the dates above."
                ),
            ]
        )
        {
            RowDrill = rows.Select(x => (ReportDrill?)ReportDrill.Of(("stage", (string)x[0]!)))
                .ToList(),
            Sections =
            [
                new(
                    "stuck",
                    "Stuck now",
                    $"Active applications with no activity for more than {staleDays} days. Remind their recruiters to move them on or close them.",
                    [
                        "Candidate",
                        "Job",
                        "Stage",
                        "Days in stage",
                        "Days with no activity",
                        "Recruiter",
                    ],
                    stuckRows,
                    stuck
                        .Select(f =>
                            (ReportDrill?)ReportDrill.Of(("applicationId", f.Id.ToString()))
                        )
                        .ToList(),
                    "remind-stuck"
                ),
            ],
        };
    }

    // ---- Rejection reasons ---------------------------------------------------------------------

    private static async Task<ReportTable> RejectionsAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var ended = c.Facts.Where(Ended).ToList();
        var reasons = ended
            .GroupBy(f => ReasonOf(f.Reason))
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .ToList();
        string[] columns =
        [
            "Reason",
            "Rejected by your team",
            "Withdrew",
            "Total",
            "Share of all (%)",
        ];
        var rows = reasons
            .Select(g =>
                new object?[]
                {
                    g.Key,
                    g.Count(f => f.Status == ApplicationStatus.Rejected),
                    g.Count(f => f.Status == ApplicationStatus.Withdrawn),
                    g.Count(),
                    Percent(g.Count(), ended.Count),
                }
            )
            .ToList();
        var drill = reasons.Select(g => (ReportDrill?)ReportDrill.Of(("reason", g.Key))).ToList();
        var top = reasons.Take(5).Select(g => g.Key).ToList();

        var ids = ended.Select(f => f.Id).ToList();
        var endedAt = await c
            .Db.StageTransitions.AsNoTracking()
            .Where(x =>
                ids.Contains(x.ApplicationId)
                && (
                    x.ToStatus == ApplicationStatus.Rejected
                    || x.ToStatus == ApplicationStatus.Withdrawn
                )
            )
            .GroupBy(x => x.ApplicationId)
            .Select(g => g.Max(x => x.OccurredAt))
            .ToListAsync(ct);
        var (unit, perPeriod, _) = PerPeriod(
            endedAt,
            c.Period.IsAllTime || c.Period.From is null || c.Period.To is null
                ? new ReportPeriod(null, null, "", c.Period.Zone)
                : c.Period
        );

        var byStage = GroupFacts(c, ended, "stage");
        var by = Breakdown(c, info);
        if (by is not null)
        {
            var groups = GroupFacts(c, ended, by);
            columns = [GroupLabels[by], .. top, "Other reasons", "Total"];
            rows = groups
                .Select(g =>
                    (object?[])
                        [
                            g.Label,
                            .. top.Select(r =>
                                (object?)g.Items.Count(f => ReasonOf(f.Reason) == r)
                            ),
                            g.Items.Count(f => !top.Contains(ReasonOf(f.Reason))),
                            g.Items.Count,
                        ]
                )
                .ToList();
            drill = groups
                .Select(g => (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "ended"))))
                .ToList();
        }
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            rows,
            ended.Count == 0
                ? "No application has been rejected or withdrawn within these filters."
                : null,
            [
                new(
                    "Applications ended",
                    Count(ended.Count),
                    $"Rejected or withdrew, applied {c.Phrase}",
                    ended.Count,
                    ReportDrill.Of(("status", "ended"))
                ),
                new(
                    "Rejected by your team",
                    Count(ended.Count(f => f.Status == ApplicationStatus.Rejected)),
                    "Your team said no",
                    ended.Count(f => f.Status == ApplicationStatus.Rejected),
                    ReportDrill.Of(("status", "Rejected"))
                ),
                new(
                    "Withdrew",
                    Count(ended.Count(f => f.Status == ApplicationStatus.Withdrawn)),
                    "The candidate pulled out",
                    ended.Count(f => f.Status == ApplicationStatus.Withdrawn),
                    ReportDrill.Of(("status", "Withdrawn"))
                ),
                new(
                    "Top reason",
                    reasons.FirstOrDefault()?.Key ?? "None yet",
                    reasons.FirstOrDefault() is { } first
                        ? $"{Count(first.Count())} of {Count(ended.Count)} applications"
                        : "The most common reason"
                ),
            ],
            [
                new(
                    "treemap",
                    "Reasons",
                    ["Reason", "Applications"],
                    reasons.Select(g => new object?[] { g.Key, g.Count() }).ToList()
                )
                {
                    Drill = reasons
                        .Select(g => (ReportDrill?)ReportDrill.Of(("reason", g.Key)))
                        .ToList(),
                },
                new(
                    "stacked",
                    "Where people left, by stage",
                    ["Stage", .. top],
                    byStage
                        .Select(g =>
                            (object?[])
                                [
                                    g.Label,
                                    .. top.Select(r =>
                                        (object?)g.Items.Count(f => ReasonOf(f.Reason) == r)
                                    ),
                                ]
                        )
                        .ToList(),
                    "Each bar is the stage the application was in when it ended."
                        + (c.ByType ? " Stages from every job are combined by type." : "")
                )
                {
                    Drill = byStage
                        .Select(g =>
                            (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "ended")))
                        )
                        .ToList(),
                },
                new(
                    "area",
                    "Applications ended over time",
                    [unit, "Ended"],
                    perPeriod,
                    $"Per {(unit == "Month" ? "month" : "week")}, by the day the application was rejected or withdrawn."
                ),
            ]
        )
        {
            RowDrill = drill,
            GroupBy = by,
        };
    }

    // ---- Time to hire and fill -----------------------------------------------------------------

    private static double DaysToHire(AppFact f) => (f.HiredAt!.Value - f.AppliedAt).TotalDays;

    private static async Task<ReportTable> TimeToHireAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var hires = c.Facts.Where(f => f.Status == ApplicationStatus.Hired).ToList();
        var known = hires.Where(f => f.HiredAt is not null).ToList();
        var days = known.Select(DaysToHire).ToList();
        var jobIds = c.Facts.Select(f => f.RequisitionId).Distinct().ToList();
        var jobs = await c
            .Db.Requisitions.AsNoTracking()
            .Where(x => jobIds.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Openings,
                x.OpenedAt,
                x.CreatedAt,
                x.Status,
            })
            .ToListAsync(ct);

        string[] columns =
        [
            "Job",
            "Hires",
            "Median days to hire",
            "75th percentile (days)",
            "Average days to hire",
            "Days to fill",
            "Open for (days)",
        ];
        var rows = jobs.Select(job =>
            {
                var mine = known.Where(f => f.RequisitionId == job.Id).ToList();
                var times = mine.Select(DaysToHire).ToList();
                var lastHire =
                    mine.Count == 0 ? (DateTimeOffset?)null : mine.Max(x => x.HiredAt!.Value);
                // A job reopened after its hire keeps its first opening date for days to fill.
                var opened =
                    job.OpenedAt is { } at && (lastHire is null || at <= lastHire)
                        ? at
                        : job.CreatedAt;
                double? toFill =
                    lastHire is { } filled && mine.Count >= job.Openings
                        ? Math.Max(0, Math.Round((filled - opened).TotalDays, 1))
                        : null;
                double? openFor =
                    job.Status == RequisitionStatus.Open
                        ? Math.Round((c.Now - opened).TotalDays, 1)
                        : null;
                return (
                    Id: job.Id,
                    Row: new object?[]
                    {
                        job.Title,
                        mine.Count,
                        Percentile(times, 0.5),
                        Percentile(times, 0.75),
                        Average(times),
                        toFill,
                        openFor,
                    }
                );
            })
            // Jobs with nothing to time (no hires, not open) would only add empty rows.
            .Where(x => (int)x.Row[1]! > 0 || x.Row[6] is not null)
            .OrderByDescending(x => (int)x.Row[1]!)
            .ThenBy(x => (string)x.Row[0]!)
            .ToList();
        var table = rows.Select(x => x.Row).ToList();
        var drill = rows.Select(x =>
                (ReportDrill?)
                    ReportDrill.Of(("requisitionId", x.Id.ToString()), ("status", "Hired"))
            )
            .ToList();

        var by = Breakdown(c, info);
        if (by is not null && by != "job")
        {
            var groups = GroupFacts(c, known, by, f => f.HiredAt);
            columns =
            [
                GroupLabels[by],
                "Hires",
                "Median days to hire",
                "75th percentile (days)",
                "Average days to hire",
            ];
            table = groups
                .Select(g =>
                {
                    var times = g.Items.Select(DaysToHire).ToList();
                    return new object?[]
                    {
                        g.Label,
                        g.Items.Count,
                        Percentile(times, 0.5),
                        Percentile(times, 0.75),
                        Average(times),
                    };
                })
                .ToList();
            drill = groups
                .Select(g => (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "Hired"))))
                .ToList();
        }
        var months = GroupFacts(c, known, "month", f => f.HiredAt);
        var unknown = hires.Count - known.Count;
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            table,
            hires.Count == 0 ? "Nobody has been hired within these filters yet."
                : unknown > 0
                    ? $"{Count(unknown)} {(unknown == 1 ? "hire has" : "hires have")} no recorded hire date, so {(unknown == 1 ? "it is" : "they are")} left out of the times."
                : null,
            [
                new(
                    "Hires",
                    Count(known.Count),
                    $"Hired {c.Phrase}",
                    known.Count,
                    ReportDrill.Of(("status", "Hired"))
                ),
                new(
                    "Median days to hire",
                    Days(Percentile(days, 0.5)),
                    "Half of hires took this long or less",
                    Percentile(days, 0.5),
                    LowerIsBetter: true
                ),
                new(
                    "75th percentile",
                    Days(Percentile(days, 0.75)),
                    "3 in 4 hires took this long or less",
                    Percentile(days, 0.75),
                    LowerIsBetter: true
                ),
                new(
                    "Average days to hire",
                    Days(Average(days)),
                    "One slow hire can pull this up",
                    Average(days),
                    LowerIsBetter: true
                ),
            ],
            [
                new(
                    "bar",
                    "How long hires took",
                    ["Time to hire", "Hires"],
                    Histogram(
                        days,
                        ("Under a week", 7),
                        ("1 to 2 weeks", 14),
                        ("2 to 4 weeks", 30),
                        ("1 to 2 months", 60),
                        ("Over 2 months", double.MaxValue)
                    )
                ),
                new(
                    "area",
                    "Median days to hire by month",
                    ["Month", "Median days"],
                    months
                        .Select(g =>
                            new object?[] { g.Label, Percentile(g.Items.Select(DaysToHire), 0.5) }
                        )
                        .ToList(),
                    "By the month of the hire."
                )
                {
                    Drill = months
                        .Select(g =>
                            (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "Hired")))
                        )
                        .ToList(),
                },
            ]
        )
        {
            RowDrill = drill,
            GroupBy = by,
        };
    }

    // ---- Source quality ------------------------------------------------------------------------

    public static async Task<(HashSet<Guid> Interviewed, HashSet<Guid> Offered)> ProgressAsync(
        AtsDbContext db,
        List<AppFact> facts,
        CancellationToken ct
    )
    {
        var ids = facts.Select(x => x.Id).ToList();
        var interviewed = await db
            .Interviews.AsNoTracking()
            .Where(x =>
                ids.Contains(x.ApplicationId)
                && x.Status != InterviewStatus.Cancelled
                && x.Status != InterviewStatus.Proposed
            )
            .Select(x => x.ApplicationId)
            .Distinct()
            .ToListAsync(ct);
        // Reached offer: an offer was sent (whatever the answer), or they were hired.
        var offered = await db
            .Offers.AsNoTracking()
            .Where(x => ids.Contains(x.ApplicationId) && x.SentAt != null)
            .Select(x => x.ApplicationId)
            .Distinct()
            .ToListAsync(ct);
        return (
            [.. interviewed],
            [.. offered, .. facts.Where(f => f.Status == ApplicationStatus.Hired).Select(f => f.Id)]
        );
    }

    private static async Task<ReportTable> SourcesAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var facts = c.Facts;
        var (interviewed, offered) = await ProgressAsync(c.Db, facts, ct);
        var hires = facts.Count(f => f.Status == ApplicationStatus.Hired);
        var groups = GroupFacts(c, facts, "source");
        var rows = groups
            .Select(g =>
            {
                var hired = g.Items.Where(f => f.Status == ApplicationStatus.Hired).ToList();
                return new object?[]
                {
                    g.Label,
                    g.Items.Count,
                    Percent(g.Items.Count(f => interviewed.Contains(f.Id)), g.Items.Count),
                    Percent(g.Items.Count(f => offered.Contains(f.Id)), g.Items.Count),
                    Percent(hired.Count, g.Items.Count),
                    Percentile(hired.Where(f => f.HiredAt is not null).Select(DaysToHire), 0.5),
                    Percent(hired.Count, hires),
                };
            })
            .ToList();
        // A hire rate means little on a handful of applications.
        var best = groups
            .Where(g => g.Items.Count >= 5)
            .MaxBy(g =>
                (double)g.Items.Count(f => f.Status == ApplicationStatus.Hired) / g.Items.Count
            );
        var bestRate = best is null
            ? null
            : Percent(best.Items.Count(f => f.Status == ApplicationStatus.Hired), best.Items.Count);
        return new(
            info.Key,
            info.Title,
            info.Description,
            [
                "Source",
                "Applications",
                "Reached interview (%)",
                "Reached offer (%)",
                "Hired (%)",
                "Median days to hire",
                "Share of hires (%)",
            ],
            rows,
            facts.Count == 0 ? "No applications match these filters." : null,
            [
                new(
                    "Applications",
                    Count(facts.Count),
                    $"Applied {c.Phrase}, from {Count(groups.Count)} {(groups.Count == 1 ? "source" : "sources")}",
                    facts.Count
                ),
                new(
                    "Reached interview",
                    Pct(Percent(interviewed.Count, facts.Count)),
                    "Share of all applications",
                    Percent(interviewed.Count, facts.Count),
                    ReportDrill.Of(("interviewed", "true"))
                ),
                new(
                    "Most applications",
                    groups.FirstOrDefault()?.Label ?? "None yet",
                    groups.FirstOrDefault() is { } top
                        ? $"{Count(top.Items.Count)} applications"
                        : "The biggest source"
                ),
                new(
                    "Best hire rate",
                    best?.Label ?? "Not enough data yet",
                    best is null
                        ? "Needs a source with 5 or more applications"
                        : $"{Pct(bestRate)} of its applications were hired"
                ),
            ],
            [
                new(
                    "bar",
                    "Applications by source",
                    ["Source", "Applications"],
                    rows.Select(x => new[] { x[0], x[1] }).ToList()
                )
                {
                    Drill = groups.Select(g => (ReportDrill?)g.Drill).ToList(),
                },
                new(
                    "radar",
                    "How far each source's candidates get",
                    ["Source", "Reached interview (%)", "Reached offer (%)", "Hired (%)"],
                    rows.Select(x => new[] { x[0], x[2], x[3], x[4] }).ToList(),
                    "Share of each source's applications."
                )
                {
                    Drill = groups.Select(g => (ReportDrill?)g.Drill).ToList(),
                    Tones = ["blue", "amber", "green"],
                },
            ]
        )
        {
            RowDrill = groups.Select(g => (ReportDrill?)g.Drill).ToList(),
        };
    }

    // ---- AI fit versus outcome -----------------------------------------------------------------

    public static string FitBucket(int score) =>
        score >= 80 ? "80 to 100"
        : score >= 60 ? "60 to 79"
        : score >= 40 ? "40 to 59"
        : "0 to 39";

    private static async Task<ReportTable> AiOutcomesAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var ids = c.Facts.Select(f => f.Id).ToList();
        var scores = await c
            .Db.Applications.AsNoTracking()
            .Where(a => ids.Contains(a.Id))
            .Join(
                c.Db.JobFits,
                a => new { a.RequisitionId, a.CandidateId },
                f => new { f.RequisitionId, f.CandidateId },
                (a, f) => new { a.Id, f.Score }
            )
            .ToDictionaryAsync(x => x.Id, x => x.Score, ct);
        var data = c.Facts.Where(f => scores.ContainsKey(f.Id)).ToList();
        var (interviewed, _) = await ProgressAsync(c.Db, data, ct);
        var shape = await FunnelOfAsync(c.Db, data, c.ByType, ct);
        string[] order = ["80 to 100", "60 to 79", "40 to 59", "0 to 39"];
        var rows = order
            .Select(bucket =>
            {
                var group = data.Where(x => FitBucket(scores[x.Id]) == bucket).ToList();
                return new object?[]
                {
                    bucket,
                    group.Count,
                    group.Count(x => interviewed.Contains(x.Id)),
                    group.Count(x => x.Status == ApplicationStatus.Hired),
                    group.Count(x => x.Status == ApplicationStatus.Rejected),
                    Percent(group.Count(x => x.Status == ApplicationStatus.Hired), group.Count),
                };
            })
            .ToList();
        var drill = order.Select(bucket => (ReportDrill?)ReportDrill.Of(("fit", bucket))).ToList();
        string[] columns =
        [
            "AI fit score",
            "Applications",
            "Interviewed",
            "Hired",
            "Rejected",
            "Hire rate (%)",
        ];
        double? AverageFit(IEnumerable<AppFact> items) =>
            Average(items.Select(x => (double)scores[x.Id]).ToList());
        if (Breakdown(c, info) == "job")
        {
            var groups = GroupFacts(c, data, "job");
            columns =
            [
                "Job",
                "Applications",
                "Interviewed",
                "Hired",
                "Average fit",
                "Average fit of hires",
            ];
            rows = groups
                .Select(g =>
                    new object?[]
                    {
                        g.Label,
                        g.Items.Count,
                        g.Items.Count(x => interviewed.Contains(x.Id)),
                        g.Items.Count(x => x.Status == ApplicationStatus.Hired),
                        AverageFit(g.Items),
                        AverageFit(g.Items.Where(x => x.Status == ApplicationStatus.Hired)),
                    }
                )
                .ToList();
            drill = groups.Select(g => (ReportDrill?)g.Drill).ToList();
        }
        // Too few outcomes make any chart look like a finding. Show the numbers, hold back the charts.
        var outcomes = data.Count(x =>
            x.Status is ApplicationStatus.Hired or ApplicationStatus.Rejected
        );
        const int enough = 30;
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            rows,
            data.Count == 0
                    ? "No applicant has an AI fit assessment yet. Run one from a shortlist to start building this up."
                : outcomes < enough
                    ? $"Charts appear once {enough} assessed applications have ended in a hire or a rejection. There are {Count(outcomes)} so far, and small numbers can mislead."
                : "Read this as a trend. Each job scores fit against its own requirements.",
            [
                new(
                    "Assessed applications",
                    Count(data.Count),
                    $"With an AI fit score, applied {c.Phrase}",
                    data.Count
                ),
                new(
                    "Average fit of hires",
                    AverageFit(data.Where(x => x.Status == ApplicationStatus.Hired))
                        ?.ToString("0.#", CultureInfo.InvariantCulture)
                        ?? "None yet",
                    "Out of 100",
                    AverageFit(data.Where(x => x.Status == ApplicationStatus.Hired)),
                    ReportDrill.Of(("status", "Hired"))
                ),
                new(
                    "Average fit of rejections",
                    AverageFit(data.Where(x => x.Status == ApplicationStatus.Rejected))
                        ?.ToString("0.#", CultureInfo.InvariantCulture)
                        ?? "None yet",
                    "Out of 100",
                    AverageFit(data.Where(x => x.Status == ApplicationStatus.Rejected)),
                    ReportDrill.Of(("status", "Rejected"))
                ),
                new(
                    "Outcomes so far",
                    Count(outcomes),
                    "Assessed applications hired or rejected",
                    outcomes
                ),
            ],
            outcomes < enough
                ? []
                :
                [
                    new(
                        "scatter",
                        "Fit score against how far they got",
                        ["AI fit score", "Stage reached"],
                        data.Select(x => new object?[] { scores[x.Id], shape.Last[x.Id] + 1 })
                            .ToList(),
                        "Each dot is one application. Higher dots got further; 1 is the first stage."
                    )
                    {
                        Drill = data.Select(x =>
                                (ReportDrill?)ReportDrill.Of(("applicationId", x.Id.ToString()))
                            )
                            .ToList(),
                    },
                    new(
                        "radial",
                        "Hire rate by fit score",
                        ["AI fit score", "Hire rate (%)"],
                        rows.Select(x => new[] { x[0], x[5] }).ToList()
                    )
                    {
                        Drill = order
                            .Select(bucket => (ReportDrill?)ReportDrill.Of(("fit", bucket)))
                            .ToList(),
                        Tones = ["green"],
                    },
                ]
        )
        {
            RowDrill = drill,
            GroupBy = Breakdown(c, info),
        };
    }

    // ---- Interviewer load and feedback ---------------------------------------------------------

    public sealed record InterviewFact(
        Guid Id,
        Guid ApplicationId,
        string Title,
        InterviewStatus Status,
        DateTimeOffset StartsAt,
        DateTimeOffset EndsAt,
        string[] Interviewers,
        List<(string Email, DateTimeOffset At, Recommendation Vote)> Cards
    );

    public static async Task<List<InterviewFact>> InterviewsAsync(
        AtsDbContext db,
        List<AppFact> facts,
        CancellationToken ct
    )
    {
        var ids = facts.Select(x => x.Id).ToList();
        var rows = await db
            .Interviews.AsNoTracking()
            .Where(x =>
                ids.Contains(x.ApplicationId)
                && x.Status != InterviewStatus.Cancelled
                && x.Status != InterviewStatus.Proposed
            )
            .Select(x => new
            {
                x.Id,
                x.ApplicationId,
                x.Title,
                x.Status,
                x.StartsAt,
                x.EndsAt,
                x.InterviewerEmails,
                Cards = x
                    .Scorecards.Select(s => new
                    {
                        s.InterviewerEmail,
                        s.SubmittedAt,
                        s.Recommendation,
                    })
                    .ToList(),
            })
            .ToListAsync(ct);
        return rows.Select(x => new InterviewFact(
                x.Id,
                x.ApplicationId,
                x.Title,
                x.Status,
                x.StartsAt,
                x.EndsAt,
                x.InterviewerEmails.Select(e => e.ToLowerInvariant()).Distinct().ToArray(),
                x.Cards.Select(s =>
                        (s.InterviewerEmail.ToLowerInvariant(), s.SubmittedAt, s.Recommendation)
                    )
                    .ToList()
            ))
            .ToList();
    }

    /// <summary>A scorecard is overdue when it hasn't arrived 24 hours after the interview ended.</summary>
    public static bool IsOverdue(InterviewFact interview, string email, DateTimeOffset now) =>
        interview.EndsAt < now.AddHours(-24) && interview.Cards.All(x => x.Email != email);

    private static async Task<ReportTable> InterviewersAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var all = await InterviewsAsync(c.Db, c.Facts, ct);
        var interviews = all.Where(x => c.Period.Contains(x.StartsAt)).ToList();
        var now = c.Now;
        var fourWeeksAgo = now.AddDays(-28);
        var seats = interviews
            .SelectMany(i => i.Interviewers.Select(email => (Email: email, Interview: i)))
            .ToList();
        var names = await NamesAsync(c.Db, seats.Select(x => x.Email), ct);
        var people = seats
            .GroupBy(x => x.Email)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => names[g.Key])
            .ToList();
        var rows = people
            .Select(group =>
            {
                var email = group.Key;
                var past = group.Where(x => x.Interview.EndsAt < now).ToList();
                var cards = past.SelectMany(x =>
                        x.Interview.Cards.Where(s => s.Email == email)
                            .Select(s => (Card: s, x.Interview.EndsAt))
                    )
                    .ToList();
                var hours = cards
                    .Select(x => Math.Max(0, (x.Card.At - x.EndsAt).TotalHours))
                    .ToList();
                return new object?[]
                {
                    names[email],
                    group.Count(),
                    Math.Round(
                        all.Count(i =>
                            i.Interviewers.Contains(email)
                            && i.StartsAt >= fourWeeksAgo
                            && i.StartsAt < now
                        ) / 4.0,
                        1
                    ),
                    group.Count(x => x.Interview.EndsAt >= now),
                    cards.Count,
                    past.Count(x => IsOverdue(x.Interview, email, now)),
                    Percentile(hours, 0.5),
                    Percent(
                        cards.Count(x =>
                            x.Card.Vote is Recommendation.Yes or Recommendation.StrongYes
                        ),
                        cards.Count
                    ),
                    Percent(
                        cards.Count(x =>
                            x.Card.Vote is Recommendation.No or Recommendation.StrongNo
                        ),
                        cards.Count
                    ),
                };
            })
            .ToList();
        var byApplication = c.Facts.ToDictionary(f => f.Id);
        var overdue = seats
            .Where(x => IsOverdue(x.Interview, x.Email, now))
            .OrderBy(x => x.Interview.EndsAt)
            .ToList();
        var submitted = interviews
            .Where(i => i.EndsAt < now)
            .SelectMany(i => i.Cards.Select(s => Math.Max(0, (s.At - i.EndsAt).TotalHours)))
            .ToList();
        string Hours(double? value) =>
            value is null
                ? "None yet"
                : value.Value.ToString("0.#", CultureInfo.InvariantCulture)
                    + (value == 1 ? " hour" : " hours");
        // Only people who have sent a scorecard can show how they vote.
        var voters = people
            .Where(g => g.Any(x => x.Interview.Cards.Any(c => c.Email == g.Key)))
            .ToList();
        var personDrill = people
            .Select(g => (ReportDrill?)ReportDrill.Of(("interviewer", g.Key)))
            .ToList();
        return new(
            info.Key,
            info.Title,
            info.Description,
            [
                "Interviewer",
                "Interviews",
                "Per week, last 4 weeks",
                "Upcoming",
                "Scorecards in",
                "Overdue",
                "Median hours to submit",
                "Voted yes (%)",
                "Voted no (%)",
            ],
            rows,
            rows.Count == 0 ? "No interviews match these filters." : null,
            [
                new(
                    "Interviews",
                    Count(interviews.Count),
                    $"Held or booked {c.Phrase}",
                    interviews.Count
                ),
                new(
                    "Upcoming",
                    Count(interviews.Count(x => x.EndsAt >= now)),
                    "Booked and not yet over",
                    interviews.Count(x => x.EndsAt >= now)
                ),
                new(
                    "Scorecards overdue",
                    Count(overdue.Count),
                    "No scorecard 24 hours after the interview",
                    overdue.Count,
                    ReportDrill.Of(("overdue", "true")),
                    LowerIsBetter: true
                ),
                new(
                    "Median time to submit",
                    Hours(Percentile(submitted, 0.5)),
                    "From the end of the interview",
                    Percentile(submitted, 0.5),
                    LowerIsBetter: true
                ),
            ],
            [
                new(
                    "stacked",
                    "Interviews per person",
                    ["Interviewer", "Scorecards in", "Overdue", "Upcoming"],
                    rows.Select(x => new[] { x[0], x[4], x[5], x[3] }).ToList()
                )
                {
                    Drill = personDrill,
                    Tones = ["green", "red", "blue"],
                },
                new(
                    "stacked",
                    "How each person votes",
                    ["Interviewer", "Yes", "Mixed", "No"],
                    voters
                        .Select(g =>
                        {
                            var votes = g.SelectMany(x =>
                                    x.Interview.Cards.Where(s => s.Email == g.Key)
                                )
                                .Select(s => s.Vote)
                                .ToList();
                            return new object?[]
                            {
                                names[g.Key],
                                votes.Count(v =>
                                    v is Recommendation.Yes or Recommendation.StrongYes
                                ),
                                votes.Count(v => v == Recommendation.Mixed),
                                votes.Count(v => v is Recommendation.No or Recommendation.StrongNo),
                            };
                        })
                        .ToList(),
                    "Scorecards by recommendation. A very one-sided spread can mean someone needs calibrating."
                )
                {
                    Drill = voters
                        .Select(g => (ReportDrill?)ReportDrill.Of(("interviewer", g.Key)))
                        .ToList(),
                    Tones = ["green", "gray", "red"],
                },
            ]
        )
        {
            RowDrill = personDrill,
            Sections =
            [
                new(
                    "overdue",
                    "Overdue scorecards",
                    "Interviews that ended more than a day ago with no scorecard from this person. Send a reminder.",
                    ["Interviewer", "Candidate", "Job", "Interview", "Ended", "Days overdue"],
                    overdue
                        .Select(x =>
                            new object?[]
                            {
                                names[x.Email],
                                byApplication
                                    .GetValueOrDefault(x.Interview.ApplicationId)
                                    ?.Candidate,
                                byApplication.GetValueOrDefault(x.Interview.ApplicationId)?.Job,
                                x.Interview.Title,
                                x.Interview.EndsAt,
                                Math.Round((now - x.Interview.EndsAt).TotalDays, 1),
                            }
                        )
                        .ToList(),
                    overdue
                        .Select(x =>
                            (ReportDrill?)
                                ReportDrill.Of(
                                    ("applicationId", x.Interview.ApplicationId.ToString()),
                                    ("interviewId", x.Interview.Id.ToString()),
                                    ("interviewer", x.Email)
                                )
                        )
                        .ToList(),
                    "remind-scorecards"
                ),
            ],
        };
    }

    // ---- Offer acceptance ----------------------------------------------------------------------

    /// <summary>What happened to a sent offer. Expired: still unanswered after its last day.</summary>
    public enum OfferResult
    {
        Accepted,
        Declined,
        Waiting,
        Expired,
        Withdrawn,
    }

    public sealed record OfferFact(
        Guid Id,
        Guid ApplicationId,
        DateTimeOffset SentAt,
        OfferStatus Status,
        DateTimeOffset? RespondedAt,
        DateOnly? ExpiresOn,
        string? DeclineReason,
        bool Revision,
        decimal? BaseSalary = null,
        string Currency = "",
        string PayPeriod = "Year"
    )
    {
        public OfferResult Result(DateOnly today) =>
            Status switch
            {
                OfferStatus.Accepted => OfferResult.Accepted,
                OfferStatus.Declined => OfferResult.Declined,
                OfferStatus.Withdrawn => OfferResult.Withdrawn,
                _ => ExpiresOn is { } last && last < today
                    ? OfferResult.Expired
                    : OfferResult.Waiting,
            };

        /// <summary>Days from sending to the candidate's answer, for answered offers.</summary>
        public double? DaysToAnswer =>
            Status is OfferStatus.Accepted or OfferStatus.Declined && RespondedAt is { } at
                ? Math.Max(0, (at - SentAt).TotalDays)
                : null;
    }

    public static string ResultLabel(OfferResult result) =>
        result switch
        {
            OfferResult.Waiting => "Waiting for an answer",
            OfferResult.Expired => "Expired with no answer",
            OfferResult.Withdrawn => "Withdrawn by your team",
            _ => result.ToString(),
        };

    private static readonly string[] ResultTones = ["green", "red", "amber", "gray", "light"];

    /// <summary>Offers sent to these applications between the dates. Each revision is its own offer.</summary>
    public static async Task<List<OfferFact>> OfferFactsAsync(
        AtsDbContext db,
        List<AppFact> facts,
        DateTimeOffset? from,
        DateTimeOffset? to,
        CancellationToken ct
    )
    {
        var ids = facts.Select(f => f.Id).ToList();
        var offers = db
            .Offers.AsNoTracking()
            .Where(x =>
                ids.Contains(x.ApplicationId)
                && x.SentAt != null
                && (
                    x.Status == OfferStatus.Sent
                    || x.Status == OfferStatus.Accepted
                    || x.Status == OfferStatus.Declined
                    || x.Status == OfferStatus.Withdrawn
                )
            );
        if (from is { } start)
            offers = offers.Where(x => x.SentAt >= start);
        if (to is { } end)
            offers = offers.Where(x => x.SentAt < end);
        return await offers
            .OrderByDescending(x => x.SentAt)
            .Select(x => new OfferFact(
                x.Id,
                x.ApplicationId,
                x.SentAt!.Value,
                x.Status,
                x.RespondedAt,
                x.ExpiresOn,
                x.DeclineReason,
                x.ReplacesOfferId != null,
                x.BaseSalary,
                x.Currency,
                x.PayPeriod
            ))
            .ToListAsync(ct);
    }

    /// <summary>Accepted out of answered (accepted or declined). Unanswered and withdrawn offers don't count.</summary>
    public static double? AcceptanceRate(IReadOnlyCollection<OfferFact> offers) =>
        Percent(
            offers.Count(o => o.Status == OfferStatus.Accepted),
            offers.Count(o => o.Status is OfferStatus.Accepted or OfferStatus.Declined)
        );

    private static async Task<ReportTable> OffersAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var offers = await OfferFactsAsync(c.Db, c.Facts, c.Period.Start, c.Period.End, ct);
        var today = c.Today;
        var facts = c.Facts.ToDictionary(f => f.Id);
        // Yearly base pay in the workspace currency, from the last good rate table. Offers paid by
        // the hour or month, or in a currency the table lacks, are left out and the hint says so.
        var money = await CurrencyEndpoints.PolicyAsync(c.Db, ct);
        var table = await CurrencyRates.StoredAsync(c.Db, ct);
        decimal? InBase(OfferFact o) =>
            o.BaseSalary is { } amount && o.PayPeriod == "Year"
                ? o.Currency.Equals(money.Base, StringComparison.OrdinalIgnoreCase)
                    ? amount
                    : table?.Convert(amount, o.Currency, money.Base)
                : null;
        var yearly = offers.Select(InBase).OfType<decimal>().ToList();
        var leftOut = offers.Count(o => o.BaseSalary is not null) - yearly.Count;
        int Count(OfferResult result) => offers.Count(o => o.Result(today) == result);
        var accepted = Count(OfferResult.Accepted);
        var answered = accepted + Count(OfferResult.Declined);
        var waiting = Count(OfferResult.Waiting);
        var expired = Count(OfferResult.Expired);
        var revised = offers.Count(o => o.Revision);
        double? MedianDays(IEnumerable<OfferFact> items) =>
            Percentile(items.Select(o => o.DaysToAnswer).OfType<double>(), 0.5);
        static ReportDrill Sent(ReportDrill drill) =>
            Merge(drill, ReportDrill.Of(("offer", "sent")));

        string[] columns =
        [
            "Candidate",
            "Job",
            "Sent",
            "Result",
            "Days to answer",
            "Reason for declining",
            "Revised offer",
            .. c.ShowPay ? new[] { $"Base salary ({money.Base} a year)" } : [],
        ];
        var rows = offers
            .Select(o =>
                (object?[])
                    [
                        facts[o.ApplicationId].Candidate,
                        facts[o.ApplicationId].Job,
                        o.SentAt,
                        ResultLabel(o.Result(today)),
                        o.DaysToAnswer is { } days ? Math.Round(days, 1) : null,
                        o.Status == OfferStatus.Declined ? ReasonOf(o.DeclineReason) : null,
                        o.Revision ? "Yes" : null,
                        .. c.ShowPay
                            ? new object?[] { InBase(o) is { } pay ? Math.Round(pay) : null }
                            : [],
                    ]
            )
            .ToList();
        var drill = offers
            .Select(o =>
                (ReportDrill?)ReportDrill.Of(("applicationId", o.ApplicationId.ToString()))
            )
            .ToList();

        var by = Breakdown(c, info);
        if (by is not null)
        {
            DateOnly MonthOf(DateTimeOffset at)
            {
                var day = DateOnly.FromDateTime(
                    TimeZoneInfo.ConvertTime(at, c.Period.Zone).DateTime
                );
                return new DateOnly(day.Year, day.Month, 1);
            }
            var offered = offers.Select(o => o.ApplicationId).ToHashSet();
            var groups =
                by == "month"
                    ? offers
                        .GroupBy(o => MonthOf(o.SentAt))
                        .OrderBy(g => g.Key)
                        .Select(g =>
                            (
                                Label: g.Key.ToString("MMM yyyy", CultureInfo.InvariantCulture),
                                Drill: Sent(DatesDrill(g.Key, g.Key.AddMonths(1).AddDays(-1))),
                                Items: g.ToList()
                            )
                        )
                        .ToList()
                    : GroupFacts(c, c.Facts.Where(f => offered.Contains(f.Id)), by)
                        .Select(g =>
                        {
                            var ids = g.Items.Select(f => f.Id).ToHashSet();
                            return (
                                g.Label,
                                Drill: Sent(g.Drill),
                                Items: offers.Where(o => ids.Contains(o.ApplicationId)).ToList()
                            );
                        })
                        .OrderByDescending(g => g.Items.Count)
                        .ThenBy(g => g.Label)
                        .ToList();
            columns =
            [
                GroupLabels[by],
                "Offers sent",
                "Accepted",
                "Declined",
                "Waiting",
                "Expired",
                "Withdrawn",
                "Acceptance rate (%)",
                "Median days to answer",
                "Revised offers",
            ];
            rows = groups
                .Select(g =>
                    (object?[])
                        [
                            g.Label,
                            g.Items.Count,
                            .. Enum.GetValues<OfferResult>()
                                .Select(r => (object?)g.Items.Count(o => o.Result(today) == r)),
                            AcceptanceRate(g.Items),
                            MedianDays(g.Items),
                            g.Items.Count(o => o.Revision),
                        ]
                )
                .ToList();
            drill = groups.Select(g => (ReportDrill?)g.Drill).ToList();
        }

        var results = Enum.GetValues<OfferResult>()
            .Select((r, i) => (Result: r, Count: Count(r), Tone: ResultTones[i]))
            .Where(x => x.Count > 0)
            .ToList();
        var reasons = offers
            .Where(o => o.Status == OfferStatus.Declined)
            .GroupBy(o => ReasonOf(o.DeclineReason), StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .ToList();

        // Sent and accepted per week or month, by the day each offer was sent.
        var from =
            c.Period.From
            ?? (
                offers.Count == 0
                    ? today
                    : offers.Min(o =>
                        DateOnly.FromDateTime(
                            TimeZoneInfo.ConvertTime(o.SentAt, c.Period.Zone).DateTime
                        )
                    )
            );
        var (unit, buckets) = Buckets(from, c.Period.To ?? today);
        bool In(OfferFact o, DateOnly start, DateOnly end) =>
            DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(o.SentAt, c.Period.Zone).DateTime)
                is var day
            && day >= start
            && day <= end;

        var charts = new List<ReportChart>
        {
            new(
                "donut",
                "What happened to each offer",
                ["Result", "Offers"],
                results.Select(x => new object?[] { ResultLabel(x.Result), x.Count }).ToList()
            )
            {
                Drill = results
                    .Select(x =>
                        (ReportDrill?)
                            ReportDrill.Of(("offer", x.Result.ToString().ToLowerInvariant()))
                    )
                    .ToList(),
                Tones = results.Select(x => x.Tone).ToArray(),
            },
            new(
                "area",
                "Offers sent and accepted",
                [unit, "Sent", "Accepted"],
                offers.Count == 0
                    ? []
                    : buckets
                        .Select(b =>
                            new object?[]
                            {
                                b.Label,
                                offers.Count(o => In(o, b.Start, b.End)),
                                offers.Count(o =>
                                    In(o, b.Start, b.End) && o.Status == OfferStatus.Accepted
                                ),
                            }
                        )
                        .ToList(),
                $"Per {(unit == "Month" ? "month" : "week")}, by the day the offer was sent."
            )
            {
                Drill = buckets
                    .Select(b => (ReportDrill?)Sent(DatesDrill(b.Start, b.End)))
                    .ToList(),
                Tones = ["amber", "green"],
            },
        };
        if (reasons.Count > 0)
            charts.Insert(
                1,
                new(
                    "bar",
                    "Reasons for declining",
                    ["Reason", "Offers"],
                    reasons.Select(g => new object?[] { g.Key, g.Count() }).ToList()
                )
                {
                    Drill = reasons
                        .Select(g =>
                            (ReportDrill?)
                                ReportDrill.Of(("offer", "declined"), ("declineReason", g.Key))
                        )
                        .ToList(),
                    Tones = ["red"],
                }
            );

        var candidates = offers.Select(o => o.ApplicationId).Distinct().Count();
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            rows,
            offers.Count == 0
                ? "No offers were sent within these filters. Offers count from the day they are sent, and their answers from the application's offer."
                : null,
            [
                .. (ReportStat[])
                    [
                        new(
                            "Offers sent",
                            ReportFormat.Count(offers.Count),
                            $"Sent {c.Phrase}"
                                + (
                                    revised > 0
                                        ? $", {ReportFormat.Count(revised)} of them {(revised == 1 ? "a revised offer" : "revised offers")}"
                                    : candidates < offers.Count
                                        ? $", to {ReportFormat.Count(candidates)} candidates"
                                    : ""
                                ),
                            offers.Count,
                            ReportDrill.Of(("offer", "sent"))
                        ),
                        new(
                            "Acceptance rate",
                            Pct(AcceptanceRate(offers)),
                            answered == 0
                                ? "Nobody has answered yet"
                                : $"{ReportFormat.Count(accepted)} of {ReportFormat.Count(answered)} answers were yes",
                            AcceptanceRate(offers),
                            ReportDrill.Of(("offer", "accepted"))
                        ),
                        new(
                            "Median days to answer",
                            Days(MedianDays(offers)),
                            "From sending the offer to their answer",
                            MedianDays(offers),
                            LowerIsBetter: true
                        ),
                        new(
                            "Waiting for an answer",
                            ReportFormat.Count(waiting),
                            expired > 0
                                ? $"And {ReportFormat.Count(expired)} past the last day to accept"
                                : "Sent, with no answer yet",
                            waiting,
                            ReportDrill.Of(("offer", "waiting"))
                        ),
                    ],
                .. c.ShowPay
                    ? new ReportStat[]
                    {
                        new(
                            $"Average base salary ({money.Base})",
                            yearly.Count == 0
                                ? "–"
                                : Currencies.Format(Math.Round(yearly.Average()), money.Base),
                            yearly.Count == 0
                                ? "No yearly base salaries to average"
                                : (
                                    table is null
                                        ? "Amounts in other currencies are not converted: no rate table yet"
                                        : $"Other currencies converted at rates from {table.Date:MMMM d, yyyy}"
                                )
                                    + (
                                        leftOut > 0
                                            ? $"; {ReportFormat.Count(leftOut)} left out"
                                            : ""
                                    ),
                            (double)(yearly.Count == 0 ? 0 : yearly.Average())
                        ),
                    }
                    : [],
            ],
            [.. charts]
        )
        {
            RowDrill = drill,
            GroupBy = by,
            // Withdrawn offers don't count toward anything; the spreadsheet keeps them.
            HiddenColumns = by is null ? null : ["Withdrawn"],
        };
    }

    // ---- Hires ---------------------------------------------------------------------------------

    private static async Task<ReportTable> HiresAsync(
        ReportContext c,
        ReportInfo info,
        CancellationToken ct
    )
    {
        var hires = c
            .Facts.Where(f => f.Status == ApplicationStatus.Hired)
            .OrderByDescending(f => f.HiredAt ?? DateTimeOffset.MinValue)
            .ToList();
        var ids = hires.Select(f => f.Id).ToList();
        var details = await c
            .Db.Applications.AsNoTracking()
            .Where(x => ids.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.Candidate!.Email,
                x.Candidate.Phone,
                x.Requisition!.Location,
                x.Requisition.EmploymentType,
                x.Requisition.TargetStartDate,
            })
            .ToDictionaryAsync(x => x.Id, ct);
        string[] columns =
        [
            "Name",
            "Job",
            "Department",
            "Location",
            "Hired on",
            "Target start",
            "Source",
            "Email",
            "Phone",
            "Job code",
            "Employment type",
        ];
        var rows = hires
            .Select(f =>
            {
                var d = details[f.Id];
                return new object?[]
                {
                    f.Candidate,
                    f.Job,
                    f.Department,
                    d.Location,
                    f.HiredAt is { } at ? at : "Not recorded",
                    d.TargetStartDate,
                    f.Source,
                    d.Email,
                    d.Phone,
                    f.JobCode,
                    d.EmploymentType,
                };
            })
            .ToList();
        var drill = hires
            .Select(f => (ReportDrill?)ReportDrill.Of(("applicationId", f.Id.ToString())))
            .ToList();
        string[]? hidden = ["Email", "Phone", "Job code", "Employment type"];
        var by = Breakdown(c, info);
        if (by is not null)
        {
            var groups = GroupFacts(c, hires, by, f => f.HiredAt);
            columns = [GroupLabels[by], "Hires", "Share of hires (%)"];
            rows = groups
                .Select(g =>
                    new object?[] { g.Label, g.Items.Count, Percent(g.Items.Count, hires.Count) }
                )
                .ToList();
            drill = groups
                .Select(g => (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "Hired"))))
                .ToList();
            hidden = null;
        }
        var departments = GroupFacts(c, hires, "department");
        var sources = GroupFacts(c, hires, "source");
        var dated = hires.Where(f => f.HiredAt is not null).ToList();
        var (unit, perPeriod, periodDrill) = PerPeriod(
            dated.Select(f => f.HiredAt!.Value).ToList(),
            c.Period,
            ReportDrill.Of(("status", "Hired"))
        );
        var unknown = hires.Count - dated.Count;
        return new(
            info.Key,
            info.Title,
            info.Description,
            columns,
            rows,
            hires.Count == 0 ? "Nobody has been hired within these filters yet."
                : unknown > 0
                    ? $"{Count(unknown)} {(unknown == 1 ? "hire has" : "hires have")} no recorded hire date. {(unknown == 1 ? "It shows" : "They show")} as \"Not recorded\" and {(unknown == 1 ? "is" : "are")} left out of the chart over time."
                : null,
            [
                new("Hires", Count(hires.Count), $"Hired {c.Phrase}", hires.Count),
                new(
                    "Departments",
                    Count(departments.Count),
                    "With at least one hire",
                    departments.Count
                ),
                new(
                    "Top source",
                    sources.FirstOrDefault()?.Label ?? "None yet",
                    sources.FirstOrDefault() is { } top
                        ? $"{Count(top.Items.Count)} of {Count(hires.Count)} hires"
                        : "Where most hires came from"
                ),
            ],
            [
                new(
                    "area",
                    "Hires over time",
                    [unit, "Hires"],
                    perPeriod,
                    $"Per {(unit == "Month" ? "month" : "week")}, by the day of the hire."
                )
                {
                    Drill = periodDrill,
                },
                new(
                    "pie",
                    "Hires by department",
                    ["Department", "Hires"],
                    departments.Select(g => new object?[] { g.Label, g.Items.Count }).ToList()
                )
                {
                    Drill = departments
                        .Select(g =>
                            (ReportDrill?)Merge(g.Drill, ReportDrill.Of(("status", "Hired")))
                        )
                        .ToList(),
                },
                new(
                    "sunburst",
                    "Hires by department and job",
                    ["Department", "Job", "Hires"],
                    departments
                        .SelectMany(g =>
                            g.Items.GroupBy(f => f.Job)
                                .Select(j => new object?[] { g.Label, j.Key, j.Count() })
                        )
                        .ToList(),
                    "The inner ring is the department, the outer ring each job in it."
                ),
            ]
        )
        {
            RowDrill = drill,
            HiddenColumns = hidden,
            GroupBy = by,
        };
    }
}
