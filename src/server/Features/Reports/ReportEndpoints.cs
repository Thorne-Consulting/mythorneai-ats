using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record ReportViewRequest(string? Name, string? ParamsJson, bool? Shared);

public sealed record ReportSubscriptionRequest(
    Guid SavedViewId,
    string[]? Recipients,
    ReportFrequency Frequency,
    int DayOfWeek,
    int DayOfMonth,
    int Hour,
    bool? Paused
);

public sealed record RemindStuckRequest(Guid[]? ApplicationIds);

public sealed record ScorecardReminderItem(Guid InterviewId, string? Interviewer);

public sealed record RemindScorecardsRequest(ScorecardReminderItem[]? Items);

public static partial class AtsEndpoints
{
    /// <summary>Applications a person may see in reports. The scheduled report emails use it for each recipient.</summary>
    internal static IQueryable<Application> ScopeForReports(
        IQueryable<Application> query,
        ClaimsPrincipal principal
    ) => ScopeApplications(query, principal);

    private static IResult ReportInvalid(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static void MapReports(RouteGroupBuilder api)
    {
        static Task<bool> Allowed(
            AtsDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct
        ) => Permissions.HasAsync(db, principal, Permissions.Reports, ct);
        static IQueryable<Application> Scope(AtsDbContext db, ClaimsPrincipal principal) =>
            ScopeApplications(db.Applications.AsNoTracking(), principal);

        api.MapGet(
            "/reports",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                await Allowed(db, principal, ct)
                    ? Results.Ok(ReportEngine.Catalog)
                    : Results.Forbid()
        );

        // The values each filter can take, from the applications this person can see.
        api.MapGet(
            "/reports/options",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var c = await ReportEngine.LoadAsync(
                    db,
                    Scope(db, principal),
                    new ReportQuery(),
                    ReportDateField.Other,
                    DateTimeOffset.UtcNow,
                    ct
                );
                return Results.Ok(
                    new
                    {
                        Jobs = c
                            .Facts.GroupBy(f => f.RequisitionId)
                            .Select(g => new
                            {
                                Value = g.Key.ToString(),
                                Label = $"{g.First().Job} ({g.First().JobCode})",
                            })
                            .OrderBy(x => x.Label),
                        Departments = c
                            .Facts.Select(f => f.Department)
                            .Where(x => x.Length > 0)
                            .DistinctBy(x => x.ToLowerInvariant())
                            .Order(),
                        Sources = ReportEngine
                            .GroupFacts(c, c.Facts, "source")
                            .Select(g => g.Label)
                            .Order(),
                        Recruiters = c
                            .Facts.Select(f => f.Recruiter)
                            .Distinct()
                            .Select(email => new { Value = email, Label = c.Names[email] })
                            .OrderBy(x => x.Label),
                    }
                );
            }
        );

        api.MapGet(
            "/reports/overview",
            async (
                [AsParameters] ReportQuery query,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
                await Allowed(db, principal, ct)
                    ? Results.Ok(
                        await ReportEngine.OverviewAsync(
                            db,
                            Scope(db, principal),
                            query,
                            DateTimeOffset.UtcNow,
                            ct
                        )
                    )
                    : Results.Forbid()
        );

        // Drill-down: the applications behind any number in a report.
        api.MapGet(
            "/reports/applications",
            async (
                [AsParameters] ReportQuery query,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var (criteria, items) = await ReportEngine.DrillAsync(
                    db,
                    Scope(db, principal),
                    query,
                    DateTimeOffset.UtcNow,
                    ct
                );
                if (query.Format == "csv")
                    return Results.File(
                        Encoding.UTF8.GetBytes(ReportEngine.DrillCsv(items)),
                        "text/csv",
                        $"applications-{DateTime.UtcNow:yyyyMMdd}.csv"
                    );
                // ponytail: the drawer lists the first 500; "Export these" downloads them all.
                return Results.Ok(
                    new DrillResult(
                        criteria,
                        items.Count,
                        items.Take(500).Select(ReportEngine.ToItem).ToList()
                    )
                );
            }
        );

        api.MapPost(
            "/reports/stuck/remind",
            async (
                RemindStuckRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                if (request.ApplicationIds is not { Length: > 0 and <= 200 })
                    return ReportInvalid(
                        "applicationIds",
                        "Choose between 1 and 200 applications."
                    );
                var apps = await Scope(db, principal)
                    .Where(x =>
                        request.ApplicationIds.Contains(x.Id)
                        && x.Status == ApplicationStatus.Active
                    )
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        Job = x.Requisition!.Title,
                        Stage = x.PipelineStage!.Name,
                        x.LastActivityAt,
                        Recruiter = x.Requisition.RecruiterEmail,
                    })
                    .ToListAsync(ct);
                var sender = principal.FindFirstValue(ClaimTypes.Name) ?? principal.Email();
                var now = DateTimeOffset.UtcNow;
                // Empty when the organization has no web address set.
                var root = await AppLinkAsync(db, "", ct);
                string Link(string path) => root.Length == 0 ? "" : root + path;
                var groups = apps.GroupBy(x => x.Recruiter.ToLowerInvariant()).ToList();
                foreach (var group in groups)
                {
                    var lines = group.Select(x =>
                    {
                        var days = Math.Max(1, (int)(now - x.LastActivityAt).TotalDays);
                        var link = Link($"/applications/{x.Id}");
                        return $"- {x.Name} for {x.Job}: in {x.Stage}, with no activity for {days} {(days == 1 ? "day" : "days")}."
                            + (link.Length == 0 ? "" : $"\n  {link}");
                    });
                    var first = group.First();
                    var one = group.Count() == 1;
                    // The standard team email (title, body, link), so wording and branding stay in one place.
                    await EmailTemplates.QueueAsync(
                        db,
                        "notification",
                        null,
                        first.Recruiter,
                        new Dictionary<string, string>
                        {
                            ["title"] = one
                                ? $"Waiting on you: {first.Name} for {first.Job}"
                                : $"{group.Count()} applications are waiting on you",
                            ["body"] =
                                $"{sender} asked you to look at {(one ? "this application" : "these applications")}. Move each one to its next step, or close it.\n\n{string.Join("\n", lines)}",
                            ["link"] = Link(
                                one ? $"/applications/{first.Id}" : "/reports/velocity"
                            ),
                        },
                        one ? first.Id : null,
                        ct
                    );
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { Applications = apps.Count, Recruiters = groups.Count });
            }
        );

        api.MapPost(
            "/reports/scorecards/remind",
            async (
                RemindScorecardsRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                if (request.Items is not { Length: > 0 and <= 200 })
                    return ReportInvalid("items", "Choose between 1 and 200 scorecards.");
                var ids = request.Items.Select(x => x.InterviewId).Distinct().ToList();
                var visible = Scope(db, principal).Select(x => x.Id);
                var interviews = await db
                    .Interviews.Include(x => x.Scorecards)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Candidate)
                    .Where(x => ids.Contains(x.Id) && visible.Contains(x.ApplicationId))
                    .ToListAsync(ct);
                var now = DateTimeOffset.UtcNow;
                var sent = 0;
                foreach (
                    var item in request.Items.DistinctBy(x =>
                        (x.InterviewId, x.Interviewer?.Trim().ToLowerInvariant())
                    )
                )
                {
                    var interview = interviews.FirstOrDefault(x => x.Id == item.InterviewId);
                    var email = interview?.InterviewerEmails.FirstOrDefault(x =>
                        x.Equals(item.Interviewer?.Trim(), StringComparison.OrdinalIgnoreCase)
                    );
                    if (
                        interview is null
                        || email is null
                        || interview.EndsAt > now
                        || interview.Scorecards.Any(x =>
                            x.InterviewerEmail.Equals(email, StringComparison.OrdinalIgnoreCase)
                        )
                    )
                        continue;
                    await QueueScorecardReminderAsync(db, interview, email, ct);
                    interview.LastScorecardReminderAt = now;
                    sent++;
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { Sent = sent });
            }
        );

        MapReportViews(api);

        api.MapGet(
            "/reports/{key}",
            async (
                string key,
                [AsParameters] ReportQuery query,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var info = ReportEngine.Info(key);
                if (info is null)
                    return Results.NotFound();
                var context = await ReportEngine.LoadAsync(
                    db,
                    Scope(db, principal),
                    query,
                    ReportEngine.DateFieldOf(info),
                    DateTimeOffset.UtcNow,
                    ct
                );
                var table = (await ReportEngine.RunAsync(context, info.Key, ct))!;
                if (query.Format == "csv")
                {
                    var csv = new StringBuilder().AppendLine(
                        string.Join(',', table.Columns.Select(Csv.Escape))
                    );
                    foreach (var row in table.Rows)
                        csv.AppendLine(
                            string.Join(
                                ',',
                                row.Select(cell => Csv.Escape(ReportFormat.CellText(cell)))
                            )
                        );
                    return Results.File(
                        Encoding.UTF8.GetBytes(csv.ToString()),
                        "text/csv",
                        $"{info.Key}-{DateTime.UtcNow:yyyyMMdd}.csv"
                    );
                }
                return Results.Ok(table);
            }
        );
    }

    // ---- Saved report views and scheduled emails -----------------------------------------------

    /// <summary>A view's parameters must be a flat JSON object of strings naming a known report.</summary>
    private static bool ValidViewParams(string? json)
    {
        try
        {
            using var document = JsonDocument.Parse(json ?? "");
            var root = document.RootElement;
            return root.ValueKind == JsonValueKind.Object
                && root.EnumerateObject()
                    .All(x => x.Value.ValueKind is JsonValueKind.String or JsonValueKind.Null)
                && root.TryGetProperty("report", out var report)
                && ReportEngine.Info(report.GetString()) is not null;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static void MapReportViews(RouteGroupBuilder api)
    {
        static Task<bool> Allowed(
            AtsDbContext db,
            ClaimsPrincipal principal,
            CancellationToken ct
        ) => Permissions.HasAsync(db, principal, Permissions.Reports, ct);
        const string Area = "reports";

        api.MapGet(
            "/reports/views",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var me = principal.Email();
                var views = await db
                    .SavedViews.AsNoTracking()
                    .Where(x => x.Area == Area && (x.OwnerEmail == me || x.Shared))
                    .OrderBy(x => x.Name)
                    .ToListAsync(ct);
                var ids = views.Select(x => x.Id).ToList();
                var subscriptions = await db
                    .ReportSubscriptions.AsNoTracking()
                    .Where(x =>
                        ids.Contains(x.SavedViewId)
                        && (x.OwnerEmail == me || x.Recipients.Contains(me))
                    )
                    .ToListAsync(ct);
                var names = await ReportFormat.NamesAsync(db, views.Select(x => x.OwnerEmail), ct);
                return Results.Ok(
                    views.Select(x => new
                    {
                        x.Id,
                        x.Name,
                        x.ParamsJson,
                        x.Shared,
                        Mine = x.OwnerEmail == me,
                        Owner = names[x.OwnerEmail.ToLowerInvariant()],
                        Pinned = x.PinnedBy.Contains(me),
                        Emailed = subscriptions.Any(s =>
                            s.SavedViewId == x.Id && s.Recipients.Contains(me) && !s.Paused
                        ),
                        SubscriptionId = subscriptions
                            .FirstOrDefault(s => s.SavedViewId == x.Id && s.OwnerEmail == me)
                            ?.Id,
                    })
                );
            }
        );

        api.MapPost(
            "/reports/views",
            async (
                ReportViewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var name = request.Name?.Trim() ?? "";
                if (name.Length is 0 or > 120)
                    return ReportInvalid("name", "Give the view a name of up to 120 characters.");
                if (!ValidViewParams(request.ParamsJson))
                    return ReportInvalid(
                        "paramsJson",
                        "That view couldn't be read. Open the report again and save it from there."
                    );
                var me = principal.Email();
                if (
                    await db.SavedViews.AnyAsync(
                        x => x.OwnerEmail == me && x.Area == Area && x.Name == name,
                        ct
                    )
                )
                    return ReportInvalid(
                        "name",
                        "You already have a view with this name. Choose another name."
                    );
                var view = new SavedView
                {
                    OwnerEmail = me,
                    Area = Area,
                    Name = name,
                    ParamsJson = request.ParamsJson!,
                    Shared = request.Shared ?? false,
                };
                db.SavedViews.Add(view);
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/reports/views/{view.Id}", new { view.Id });
            }
        );

        api.MapPut(
            "/reports/views/{id:guid}",
            async (
                Guid id,
                ReportViewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var me = principal.Email();
                var view = await db.SavedViews.SingleOrDefaultAsync(
                    x => x.Id == id && x.Area == Area && x.OwnerEmail == me,
                    ct
                );
                if (view is null)
                    return Results.NotFound();
                if (request.Name is not null)
                {
                    var name = request.Name.Trim();
                    if (name.Length is 0 or > 120)
                        return ReportInvalid(
                            "name",
                            "Give the view a name of up to 120 characters."
                        );
                    if (
                        await db.SavedViews.AnyAsync(
                            x =>
                                x.OwnerEmail == me
                                && x.Area == Area
                                && x.Name == name
                                && x.Id != id,
                            ct
                        )
                    )
                        return ReportInvalid(
                            "name",
                            "You already have a view with this name. Choose another name."
                        );
                    view.Name = name;
                }
                if (request.ParamsJson is not null)
                {
                    if (!ValidViewParams(request.ParamsJson))
                        return ReportInvalid(
                            "paramsJson",
                            "That view couldn't be read. Open the report again and save it from there."
                        );
                    view.ParamsJson = request.ParamsJson;
                }
                if (request.Shared is { } shared)
                    view.Shared = shared;
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapDelete(
            "/reports/views/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                // Its scheduled emails go with it (cascade).
                var deleted = await db
                    .SavedViews.Where(x => x.Id == id && x.Area == Area && x.OwnerEmail == me)
                    .ExecuteDeleteAsync(ct);
                return deleted > 0 ? Results.NoContent() : Results.NotFound();
            }
        );

        async Task<IResult> Pin(
            Guid id,
            bool pin,
            ClaimsPrincipal principal,
            AtsDbContext db,
            CancellationToken ct
        )
        {
            if (!await Allowed(db, principal, ct))
                return Results.Forbid();
            var me = principal.Email();
            var view = await db.SavedViews.SingleOrDefaultAsync(
                x => x.Id == id && x.Area == Area && (x.OwnerEmail == me || x.Shared),
                ct
            );
            if (view is null)
                return Results.NotFound();
            view.PinnedBy = pin
                ? [.. view.PinnedBy.Append(me).Distinct()]
                : [.. view.PinnedBy.Where(x => x != me)];
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }
        api.MapPut(
            "/reports/views/{id:guid}/pin",
            (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                Pin(id, true, principal, db, ct)
        );
        api.MapDelete(
            "/reports/views/{id:guid}/pin",
            (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                Pin(id, false, principal, db, ct)
        );

        async Task<TimeZoneInfo> OrganizationZone(AtsDbContext db, CancellationToken ct) =>
            TimeText.Zone(
                await db
                    .Organizations.AsNoTracking()
                    .Select(x => x.TimeZone)
                    .SingleOrDefaultAsync(ct)
            );

        api.MapGet(
            "/reports/recipients",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                // Schedules run in the organization's time zone; the form names it.
                var zone = await OrganizationZone(db, ct);
                return Results.Ok(
                    new
                    {
                        Zone = TimeText.ZoneName(
                            TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, zone),
                            zone
                        ),
                        People = (await ReportDigest.ReadersAsync(db, ct)).Select(x => new
                        {
                            Value = x.Email.ToLowerInvariant(),
                            Label = x.DisplayName,
                        }),
                    }
                );
            }
        );

        api.MapGet(
            "/reports/subscriptions",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var me = principal.Email();
                var subscriptions = await db
                    .ReportSubscriptions.AsNoTracking()
                    .Include(x => x.SavedView)
                    .Where(x => x.OwnerEmail == me || x.Recipients.Contains(me))
                    .OrderBy(x => x.SavedView!.Name)
                    .ToListAsync(ct);
                var organization = await db
                    .Organizations.AsNoTracking()
                    .Select(x => x.TimeZone)
                    .SingleOrDefaultAsync(ct);
                var mine = await db
                    .Users.AsNoTracking()
                    .Where(x => x.Email.ToLower() == me)
                    .Select(x => x.TimeZone)
                    .FirstOrDefaultAsync(ct);
                var zone = TimeText.Zone(organization);
                var reader = TimeText.Zone(mine, organization);
                var names = await ReportFormat.NamesAsync(
                    db,
                    subscriptions.SelectMany(x => x.Recipients.Append(x.OwnerEmail)),
                    ct
                );
                return Results.Ok(
                    subscriptions.Select(x => new
                    {
                        x.Id,
                        x.SavedViewId,
                        ViewName = x.SavedView!.Name,
                        x.SavedView.ParamsJson,
                        Mine = x.OwnerEmail == me,
                        Owner = names[x.OwnerEmail.ToLowerInvariant()],
                        Recipients = x.Recipients.Select(email => new
                        {
                            Value = email,
                            Label = names[email.ToLowerInvariant()],
                        }),
                        x.Frequency,
                        x.DayOfWeek,
                        x.DayOfMonth,
                        x.Hour,
                        x.Paused,
                        Schedule = ReportDigest.Describe(
                            x.Frequency,
                            x.DayOfWeek,
                            x.DayOfMonth,
                            x.Hour,
                            zone
                        ),
                        NextSend = x.Paused ? null : TimeText.DateTime(x.NextSendAt, reader),
                        LastSent = x.LastSentAt is { } at ? TimeText.DateTime(at, reader) : null,
                    })
                );
            }
        );

        async Task<IResult?> CheckSchedule(
            ReportSubscriptionRequest request,
            AtsDbContext db,
            CancellationToken ct
        )
        {
            if (request.Recipients is not { Length: > 0 and <= 50 })
                return ReportInvalid("recipients", "Choose between 1 and 50 people to email.");
            if (!Enum.IsDefined(request.Frequency))
                return ReportInvalid("frequency", "Choose weekly or monthly.");
            if (request.DayOfWeek is < 0 or > 6)
                return ReportInvalid("dayOfWeek", "Choose a day of the week.");
            if (request.DayOfMonth is < 1 or > 28)
                return ReportInvalid(
                    "dayOfMonth",
                    "Choose a day from 1 to 28, so every month has it."
                );
            if (request.Hour is < 0 or > 23)
                return ReportInvalid("hour", "Choose an hour of the day.");
            var readers = (await ReportDigest.ReadersAsync(db, ct))
                .Select(x => x.Email.ToLowerInvariant())
                .ToHashSet();
            var outside = request.Recipients.FirstOrDefault(x =>
                !readers.Contains(x.Trim().ToLowerInvariant())
            );
            return outside is null
                ? null
                : ReportInvalid(
                    "recipients",
                    $"{outside} can't see reports, so they can't get this email."
                );
        }

        void Apply(
            ReportSubscription subscription,
            ReportSubscriptionRequest request,
            TimeZoneInfo zone
        )
        {
            subscription.Recipients =
            [
                .. request.Recipients!.Select(x => x.Trim().ToLowerInvariant()).Distinct(),
            ];
            subscription.Frequency = request.Frequency;
            subscription.DayOfWeek = request.DayOfWeek;
            subscription.DayOfMonth = request.DayOfMonth;
            subscription.Hour = request.Hour;
            subscription.Paused = request.Paused ?? subscription.Paused;
            subscription.NextSendAt = ReportDigest.NextSend(
                request.Frequency,
                request.DayOfWeek,
                request.DayOfMonth,
                request.Hour,
                DateTimeOffset.UtcNow,
                zone
            );
        }

        api.MapPost(
            "/reports/subscriptions",
            async (
                ReportSubscriptionRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var me = principal.Email();
                if (
                    !await db.SavedViews.AnyAsync(
                        x =>
                            x.Id == request.SavedViewId
                            && x.Area == Area
                            && (x.OwnerEmail == me || x.Shared),
                        ct
                    )
                )
                    return Results.NotFound();
                if (await CheckSchedule(request, db, ct) is { } problem)
                    return problem;
                // One schedule per person per view: saving again changes it.
                var subscription = await db.ReportSubscriptions.SingleOrDefaultAsync(
                    x => x.SavedViewId == request.SavedViewId && x.OwnerEmail == me,
                    ct
                );
                if (subscription is null)
                    db.ReportSubscriptions.Add(
                        subscription = new ReportSubscription
                        {
                            SavedViewId = request.SavedViewId,
                            OwnerEmail = me,
                        }
                    );
                Apply(subscription, request, await OrganizationZone(db, ct));
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { subscription.Id });
            }
        );

        api.MapPut(
            "/reports/subscriptions/{id:guid}",
            async (
                Guid id,
                ReportSubscriptionRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!await Allowed(db, principal, ct))
                    return Results.Forbid();
                var me = principal.Email();
                var subscription = await db.ReportSubscriptions.SingleOrDefaultAsync(
                    x => x.Id == id && x.OwnerEmail == me,
                    ct
                );
                if (subscription is null)
                    return Results.NotFound();
                if (await CheckSchedule(request, db, ct) is { } problem)
                    return problem;
                Apply(subscription, request, await OrganizationZone(db, ct));
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapDelete(
            "/reports/subscriptions/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var deleted = await db
                    .ReportSubscriptions.Where(x => x.Id == id && x.OwnerEmail == me)
                    .ExecuteDeleteAsync(ct);
                return deleted > 0 ? Results.NoContent() : Results.NotFound();
            }
        );

        // A recipient stops getting someone else's scheduled email.
        api.MapPost(
            "/reports/subscriptions/{id:guid}/unsubscribe",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var subscription = await db.ReportSubscriptions.SingleOrDefaultAsync(
                    x => x.Id == id && x.Recipients.Contains(me),
                    ct
                );
                if (subscription is null)
                    return Results.NotFound();
                subscription.Recipients = [.. subscription.Recipients.Where(x => x != me)];
                if (subscription.Recipients.Length == 0)
                    db.ReportSubscriptions.Remove(subscription);
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
    }
}
