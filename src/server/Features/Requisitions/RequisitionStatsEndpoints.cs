using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    /// <summary>How far each person got: the furthest stage they were ever in, by stage order.</summary>
    public static int[] ReachedPerStage(
        IReadOnlyList<Guid> stageIds,
        IEnumerable<(Guid ApplicationId, Guid StageId)> visits
    )
    {
        var order = stageIds
            .Select((id, index) => (id, index))
            .ToDictionary(x => x.id, x => x.index);
        var furthest = visits
            .Where(x => order.ContainsKey(x.StageId))
            .GroupBy(x => x.ApplicationId)
            .Select(g => g.Max(x => order[x.StageId]))
            .ToList();
        return stageIds.Select((_, index) => furthest.Count(x => x >= index)).ToArray();
    }

    private static void MapRequisitionStats(RouteGroupBuilder api)
    {
        // The job's health: how far people get, how long they wait, feedback owed, what is next.
        api.MapGet(
            "/requisitions/{id:guid}/stats",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var job = await ScopeRequisitions(db.Requisitions.AsNoTracking(), principal)
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.OpenedAt,
                        x.ClosedAt,
                        x.CreatedAt,
                        Stages = x
                            .Stages.OrderBy(s => s.SortOrder)
                            .Select(s => new
                            {
                                s.Id,
                                s.Name,
                                Type = s.Type.ToString(),
                                s.Color,
                                s.TargetDays,
                            })
                            .ToList(),
                    })
                    .SingleOrDefaultAsync(ct);
                if (job is null)
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                var applications = ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(x =>
                        x.RequisitionId == id && x.Status != ApplicationStatus.PendingVerification
                    );
                var apps = await applications
                    .Select(x => new
                    {
                        x.Id,
                        x.PipelineStageId,
                        x.Status,
                        x.Source,
                        x.AppliedAt,
                    })
                    .ToListAsync(ct);
                var appIds = apps.Select(x => x.Id).ToArray();
                var moves = await db
                    .StageTransitions.AsNoTracking()
                    .Where(x => x.RequisitionId == id && appIds.Contains(x.ApplicationId))
                    .OrderBy(x => x.OccurredAt)
                    .Select(x => new
                    {
                        x.ApplicationId,
                        x.FromStageId,
                        x.ToStageId,
                        x.OccurredAt,
                    })
                    .ToListAsync(ct);
                var stageIds = job.Stages.Select(x => x.Id).ToList();
                var reached = ReachedPerStage(
                    stageIds,
                    apps.Select(x => (x.Id, x.PipelineStageId))
                        .Concat(moves.Select(x => (x.ApplicationId, x.ToStageId)))
                );

                // Each stay in a stage: from entering it to the next move, or to now while still there.
                var stays = new Dictionary<Guid, List<double>>();
                var movesByApp = moves.ToLookup(x => x.ApplicationId);
                foreach (var app in apps)
                {
                    var own = movesByApp[app.Id].Where(x => x.FromStageId != x.ToStageId).ToList();
                    var stage = own.FirstOrDefault()?.FromStageId ?? app.PipelineStageId;
                    var since = app.AppliedAt;
                    foreach (var move in own)
                    {
                        if (move.FromStageId is { } from)
                            Add(from, (move.OccurredAt - since).TotalDays);
                        stage = move.ToStageId;
                        since = move.OccurredAt;
                    }
                    if (app.Status == ApplicationStatus.Active)
                        Add(stage, (now - since).TotalDays);
                }
                void Add(Guid stage, double days) =>
                    (stays.TryGetValue(stage, out var list) ? list : stays[stage] = []).Add(
                        Math.Max(0, days)
                    );

                // First review: the first move out of the first stage.
                var firstStage = stageIds.FirstOrDefault();
                var firstReview = apps.Select(app =>
                        movesByApp[app.Id]
                            .FirstOrDefault(x =>
                                x.FromStageId == firstStage && x.ToStageId != firstStage
                            )
                            is { } move
                            ? (double?)(move.OccurredAt - app.AppliedAt).TotalDays
                            : null
                    )
                    .Where(x => x is not null)
                    .Select(x => x!.Value)
                    .ToList();

                var interviews = db
                    .Interviews.AsNoTracking()
                    .Where(x => appIds.Contains(x.ApplicationId));
                var feedbackOwed = await interviews
                    .Where(x =>
                        x.Status == InterviewStatus.Completed
                        || (x.Status == InterviewStatus.Scheduled && x.EndsAt < now)
                    )
                    .SumAsync(x => x.InterviewerEmails.Length - x.Scorecards.Count, ct);
                var upcoming = await interviews
                    .Where(x => x.Status == InterviewStatus.Scheduled && x.StartsAt > now)
                    .OrderBy(x => x.StartsAt)
                    .Take(5)
                    .Select(x => new
                    {
                        x.Id,
                        x.ApplicationId,
                        x.Title,
                        x.StartsAt,
                        CandidateName = x.Application!.Candidate!.FirstName
                            + " "
                            + x.Application.Candidate.LastName,
                    })
                    .ToListAsync(ct);
                var started = job.OpenedAt ?? job.CreatedAt;

                return Results.Ok(
                    new
                    {
                        Total = apps.Count,
                        Active = apps.Count(x => x.Status == ApplicationStatus.Active),
                        Hired = apps.Count(x => x.Status == ApplicationStatus.Hired),
                        Rejected = apps.Count(x =>
                            x.Status is ApplicationStatus.Rejected or ApplicationStatus.Withdrawn
                        ),
                        DaysOpen = job.OpenedAt is null
                            ? (int?)null
                            : (int)((job.ClosedAt ?? now) - started).TotalDays,
                        DaysToFirstReview = firstReview.Count == 0
                            ? (double?)null
                            : Math.Round(firstReview.Average(), 1),
                        FeedbackOwed = Math.Max(0, feedbackOwed),
                        Stages = job.Stages.Select(
                            (stage, index) =>
                                new
                                {
                                    stage.Id,
                                    stage.Name,
                                    stage.Type,
                                    stage.Color,
                                    stage.TargetDays,
                                    Count = apps.Count(x =>
                                        x.PipelineStageId == stage.Id
                                        && (
                                            x.Status == ApplicationStatus.Active
                                            || x.Status == ApplicationStatus.Hired
                                        )
                                    ),
                                    Reached = reached[index],
                                    MedianDays = stays.TryGetValue(stage.Id, out var list)
                                    && list.Count > 0
                                        ? Math.Round(Median(list), 1)
                                        : (double?)null,
                                }
                        ),
                        Sources = apps.GroupBy(x => x.Source.Trim())
                            .Select(g => new
                            {
                                Source = g.Key,
                                Count = g.Count(),
                                Hired = g.Count(x => x.Status == ApplicationStatus.Hired),
                            })
                            .OrderByDescending(x => x.Count)
                            .Take(5),
                        Upcoming = upcoming,
                    }
                );
            }
        );
    }

    private static double Median(List<double> values)
    {
        var sorted = values.OrderBy(x => x).ToList();
        var middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
}
