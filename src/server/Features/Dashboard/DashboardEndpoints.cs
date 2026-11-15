using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapDashboard(RouteGroupBuilder api)
    {
        MapDashboardLayout(api);
        api.MapGet(
            "/dashboard",
            async (
                string? period,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var requisitions = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
                var applications = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var applicationIds = applications.Select(x => x.Id);
                var email = principal.Email();
                var now = DateTimeOffset.UtcNow;
                var staleDays =
                    await db
                        .Organizations.Select(x => (int?)x.StaleReminderDays)
                        .SingleOrDefaultAsync(ct)
                    ?? 3;
                var staleCutoff = now.AddDays(-Math.Clamp(staleDays, 1, 30));
                // The period the trend numbers cover, compared with the one before it.
                var days = DashboardDays(period);
                var since = now.AddDays(-days);
                var before = since.AddDays(-days);
                var hireMoves = db
                    .StageTransitions.AsNoTracking()
                    .Where(t =>
                        applicationIds.Contains(t.ApplicationId)
                        && t.ToStatus == ApplicationStatus.Hired
                        && (t.FromStatus == null || t.FromStatus != ApplicationStatus.Hired)
                    );
                var applied = applications.Where(x =>
                    x.Status != ApplicationStatus.PendingVerification
                );
                var pipeline = await applications
                    .Where(x =>
                        x.Status == ApplicationStatus.Active
                        && x.Requisition!.Status == RequisitionStatus.Open
                        && x.PipelineStage!.Type != StageType.Hired
                    )
                    .GroupBy(x => x.PipelineStage!.Type)
                    .Select(g => new { Type = g.Key, Count = g.Count() })
                    .ToListAsync(ct);
                var reached = await ReachedByTypeAsync(
                    db,
                    applied.Where(x =>
                        x.AppliedAt >= since && x.Requisition!.Status == RequisitionStatus.Open
                    ),
                    ct
                );

                var summary = new
                {
                    Period = days,
                    Hires = await hireMoves.CountAsync(t => t.OccurredAt >= since, ct),
                    HiresBefore = await hireMoves.CountAsync(
                        t => t.OccurredAt >= before && t.OccurredAt < since,
                        ct
                    ),
                    Applied = await applied.CountAsync(x => x.AppliedAt >= since, ct),
                    AppliedBefore = await applied.CountAsync(
                        x => x.AppliedAt >= before && x.AppliedAt < since,
                        ct
                    ),
                    OpenRequisitions = await requisitions.CountAsync(
                        x => x.Status == RequisitionStatus.Open,
                        ct
                    ),
                    ActiveCandidates = await applications.CountAsync(
                        x => x.Status == ApplicationStatus.Active,
                        ct
                    ),
                    InterviewsThisWeek = await db
                        .Interviews.AsNoTracking()
                        .CountAsync(
                            x =>
                                applicationIds.Contains(x.ApplicationId)
                                && (
                                    principal.IsHiringStaff()
                                    || principal.IsInRole(nameof(UserRole.HiringManager))
                                    || x.InterviewerEmails.Contains(email)
                                )
                                && x.StartsAt >= now
                                && x.StartsAt < now.AddDays(7)
                                && x.Status == InterviewStatus.Scheduled,
                            ct
                        ),
                    // Active people on open jobs by stage type, so different pipelines add up. Reached:
                    // of the people who applied in the period, how many got at least this far.
                    Pipeline = FunnelTypes.Select(
                        (type, index) =>
                            new
                            {
                                Stage = TypeLabel(type),
                                Type = type.ToString(),
                                Count = pipeline.Where(x => x.Type == type).Sum(x => x.Count),
                                Order = index,
                                Reached = reached[index],
                            }
                    ),
                    // Interviews I'm assigned to that have started and still have no scorecard from me.
                    ScorecardsDue = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && x.InterviewerEmails.Contains(email)
                            && (
                                x.Status == InterviewStatus.Scheduled
                                || x.Status == InterviewStatus.Completed
                            )
                            && x.StartsAt < now
                            && !x.Scorecards.Any(s => s.InterviewerEmail == email)
                        )
                        .OrderBy(x => x.EndsAt)
                        .Take(10)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.EndsAt,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            RequisitionTitle = x.Application.Requisition!.Title,
                        })
                        .ToListAsync(ct),
                    // Candidate messages nobody on the team has read yet.
                    UnreadMessages = await applications
                        .Where(x => x.Messages.Any(m => m.FromCandidate && m.ReadAt == null))
                        .OrderByDescending(x =>
                            x.Messages.Where(m => m.FromCandidate).Max(m => m.CreatedAt)
                        )
                        .Take(6)
                        .Select(x => new
                        {
                            ApplicationId = x.Id,
                            CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            RequisitionTitle = x.Requisition!.Title,
                            Preview = x
                                .Messages.Where(m => m.FromCandidate)
                                .OrderByDescending(m => m.CreatedAt)
                                .Select(m => m.Body)
                                .First(),
                            At = x.Messages.Where(m => m.FromCandidate).Max(m => m.CreatedAt),
                        })
                        .ToListAsync(ct),
                    // Active applications with no movement past the organization's stale threshold.
                    Stalled = await applications
                        .Where(x =>
                            x.Status == ApplicationStatus.Active
                            && !x.PipelineStage!.IsTerminal
                            && x.LastActivityAt < staleCutoff
                        )
                        .OrderBy(x => x.LastActivityAt)
                        .Take(6)
                        .Select(x => new
                        {
                            ApplicationId = x.Id,
                            CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            RequisitionTitle = x.Requisition!.Title,
                            Stage = x.PipelineStage!.Name,
                            StageType = x.PipelineStage.Type.ToString(),
                            x.LastActivityAt,
                        })
                        .ToListAsync(ct),
                    StalledTotal = await applications.CountAsync(
                        x =>
                            x.Status == ApplicationStatus.Active
                            && !x.PipelineStage!.IsTerminal
                            && x.LastActivityAt < staleCutoff,
                        ct
                    ),
                    // Open jobs with their stage spread, so Home can show every pipeline at a glance.
                    Jobs = await requisitions
                        .Where(x =>
                            x.Status == RequisitionStatus.Open
                            || x.Status == RequisitionStatus.PendingApproval
                        )
                        .OrderBy(x => x.Title)
                        .Select(x => new
                        {
                            x.Id,
                            x.Code,
                            x.Title,
                            Status = x.Status.ToString(),
                            x.Openings,
                            Hired = x.Applications.Count(a => a.Status == ApplicationStatus.Hired),
                            NewToday = x.Applications.Count(a =>
                                a.Status == ApplicationStatus.Active
                                && a.AppliedAt >= now.AddDays(-1)
                            ),
                            Stages = x
                                .Stages.OrderBy(stage => stage.SortOrder)
                                .Where(stage => !stage.IsTerminal)
                                .Select(stage => new
                                {
                                    stage.Name,
                                    Type = stage.Type.ToString(),
                                    stage.Color,
                                    Count = stage.Applications.Count(a =>
                                        a.Status == ApplicationStatus.Active
                                        && applicationIds.Contains(a.Id)
                                    ),
                                }),
                        })
                        .ToListAsync(ct),
                    RecentApplications = await applications
                        .OrderByDescending(x => x.LastActivityAt)
                        .Take(6)
                        .Select(x => new
                        {
                            x.Id,
                            CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            CandidateTitle = x.Candidate.CurrentTitle,
                            RequisitionTitle = x.Requisition!.Title,
                            Stage = x.PipelineStage!.Name,
                            StageType = x.PipelineStage.Type.ToString(),
                            x.LastActivityAt,
                        })
                        .ToListAsync(ct),
                    UpcomingInterviews = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && (
                                principal.IsHiringStaff()
                                || principal.IsInRole(nameof(UserRole.HiringManager))
                                || x.InterviewerEmails.Contains(email)
                            )
                            && x.StartsAt >= now
                            && x.Status == InterviewStatus.Scheduled
                        )
                        .OrderBy(x => x.StartsAt)
                        .Take(5)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.StartsAt,
                            x.EndsAt,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            RequisitionTitle = x.Application.Requisition!.Title,
                        })
                        .ToListAsync(ct),
                };

                return Results.Ok(summary);
            }
        );

        // What happened lately: moves, rejections, hires, applications and scorecards, newest first.
        // scope=mine keeps jobs I am on; requisitionId narrows to one job (the job overview).
        api.MapGet(
            "/activity",
            async (
                string? scope,
                Guid? requisitionId,
                int? take,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var count = Math.Clamp(take ?? 20, 1, 50);
                var email = principal.Email();
                var apps = ScopeApplications(db.Applications.AsNoTracking(), principal);
                if (requisitionId is { } job)
                    apps = apps.Where(x => x.RequisitionId == job);
                if (scope == "mine")
                    apps = apps.Where(x =>
                        x.Requisition!.Members.Any(m => m.User!.Email == email)
                        || x.Requisition.OwnerEmail == email
                        || x.Requisition.RecruiterEmail == email
                    );
                var moves = await (
                    from t in db.StageTransitions.AsNoTracking()
                    join a in apps on t.ApplicationId equals a.Id
                    orderby t.OccurredAt descending
                    select new
                    {
                        At = t.OccurredAt,
                        Actor = t.ActorEmail,
                        t.ApplicationId,
                        t.FromStageId,
                        t.ToStageId,
                        t.FromStatus,
                        t.ToStatus,
                        CandidateName = a.Candidate!.FirstName + " " + a.Candidate.LastName,
                        a.RequisitionId,
                        JobTitle = a.Requisition!.Title,
                        Stage = db
                            .PipelineStages.Where(s => s.Id == t.ToStageId)
                            .Select(s => new { s.Name, s.Type })
                            .FirstOrDefault(),
                    }
                )
                    .Take(count * 2)
                    .ToListAsync(ct);
                var scorecards = await (
                    from s in db.Scorecards.AsNoTracking()
                    join a in apps on s.Interview!.ApplicationId equals a.Id
                    orderby s.SubmittedAt descending
                    select new
                    {
                        At = s.SubmittedAt,
                        Actor = s.InterviewerEmail,
                        ApplicationId = a.Id,
                        CandidateName = a.Candidate!.FirstName + " " + a.Candidate.LastName,
                        a.RequisitionId,
                        JobTitle = a.Requisition!.Title,
                        Interview = s.Interview.Title,
                    }
                )
                    .Take(count)
                    .ToListAsync(ct);
                var items = moves
                    .Select(m => new
                    {
                        m.At,
                        m.Actor,
                        Verb = m.FromStageId is null && m.FromStatus is null
                            ? (m.Actor is null ? "applied" : "added")
                        : m.ToStatus == ApplicationStatus.Hired
                        && m.FromStatus != ApplicationStatus.Hired
                            ? "hired"
                        : m.ToStatus == ApplicationStatus.Rejected
                        && m.FromStatus != ApplicationStatus.Rejected
                            ? "rejected"
                        : m.ToStatus == ApplicationStatus.Withdrawn
                        && m.FromStatus != ApplicationStatus.Withdrawn
                            ? "withdrew"
                        : m.ToStatus == ApplicationStatus.Active
                        && m.FromStatus is ApplicationStatus.Rejected or ApplicationStatus.Withdrawn
                            ? "reopened"
                        : m.FromStageId != m.ToStageId ? "moved"
                        : null,
                        m.ApplicationId,
                        m.CandidateName,
                        m.RequisitionId,
                        m.JobTitle,
                        Detail = m.Stage?.Name,
                        StageType = m.Stage?.Type.ToString(),
                    })
                    .Where(x => x.Verb is not null)
                    .Concat(
                        scorecards.Select(s => new
                        {
                            s.At,
                            Actor = (string?)s.Actor,
                            Verb = (string?)"scored",
                            s.ApplicationId,
                            s.CandidateName,
                            s.RequisitionId,
                            s.JobTitle,
                            Detail = (string?)s.Interview,
                            StageType = (string?)null,
                        })
                    )
                    .OrderByDescending(x => x.At)
                    .Take(count)
                    .ToList();
                var actors = items
                    .Select(x => x.Actor)
                    .Where(x => x is not null)
                    .Distinct()
                    .ToArray();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(u => actors.Contains(u.Email))
                    .ToDictionaryAsync(
                        u => u.Email,
                        u => u.DisplayName,
                        StringComparer.OrdinalIgnoreCase,
                        ct
                    );
                return Results.Ok(
                    items.Select(x => new
                    {
                        x.At,
                        ActorName = x.Actor is null
                            ? null
                            : names.GetValueOrDefault(x.Actor) ?? x.Actor,
                        Mine = x.Actor != null
                            && string.Equals(x.Actor, email, StringComparison.OrdinalIgnoreCase),
                        x.Verb,
                        x.ApplicationId,
                        x.CandidateName,
                        x.RequisitionId,
                        x.JobTitle,
                        x.Detail,
                        x.StageType,
                    })
                );
            }
        );
    }

    private static readonly StageType[] FunnelTypes =
    [
        StageType.Applied,
        StageType.Screen,
        StageType.Interview,
        StageType.Offer,
        StageType.Hired,
    ];

    private static string TypeLabel(StageType type) =>
        type switch
        {
            StageType.Applied => "New",
            StageType.Screen => "Screening",
            StageType.Interview => "Interview",
            StageType.Offer => "Offer",
            StageType.Hired => "Hired",
            _ => "Other",
        };

    /// <summary>7, 30 (the default) or 90 days.</summary>
    public static int DashboardDays(string? period) =>
        period switch
        {
            "week" => 7,
            "quarter" => 90,
            _ => 30,
        };

    /// <summary>For each funnel type, how many of these applications got at least that far.</summary>
    private static async Task<int[]> ReachedByTypeAsync(
        AtsDbContext db,
        IQueryable<Application> cohort,
        CancellationToken ct
    )
    {
        var current = await cohort.Select(x => new { x.Id, x.PipelineStage!.Type }).ToListAsync(ct);
        var ids = current.Select(x => x.Id).ToArray();
        var visited = await (
            from t in db.StageTransitions.AsNoTracking()
            join s in db.PipelineStages on t.ToStageId equals s.Id
            where ids.Contains(t.ApplicationId)
            select new { t.ApplicationId, s.Type }
        ).ToListAsync(ct);
        var furthest = current
            .Select(x => (x.Id, x.Type))
            .Concat(visited.Select(x => (x.ApplicationId, x.Type)))
            .Where(x => Array.IndexOf(FunnelTypes, x.Type) >= 0)
            .GroupBy(x => x.Item1)
            .Select(g => g.Max(x => Array.IndexOf(FunnelTypes, x.Type)))
            .ToList();
        return FunnelTypes.Select((_, index) => furthest.Count(x => x >= index)).ToArray();
    }
}
