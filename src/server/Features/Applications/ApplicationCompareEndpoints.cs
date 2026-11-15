using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Moving between applicants on a job, and comparing finalists side by side.</summary>
public static partial class AtsEndpoints
{
    private static void MapApplicationCompare(RouteGroupBuilder api)
    {
        // Previous and next active applicant in a stage of the same job, oldest application first.
        api.MapGet(
            "/applications/{id:guid}/neighbors",
            async (
                Guid id,
                Guid? stageId,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var scoped = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var current = await scoped
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.RequisitionId,
                        x.PipelineStageId,
                        x.AppliedAt,
                    })
                    .SingleOrDefaultAsync(ct);
                if (current is null)
                    return Results.NotFound();
                var stage = await db
                    .PipelineStages.AsNoTracking()
                    .Where(s =>
                        s.Id == (stageId ?? current.PipelineStageId)
                        && s.RequisitionId == current.RequisitionId
                    )
                    .Select(s => new { s.Id, s.Name })
                    .SingleOrDefaultAsync(ct);
                if (stage is null)
                    return Results.NotFound();
                // ponytail: the whole stage in memory; fine for stages of a few thousand people.
                var people = await scoped
                    .Where(x =>
                        x.RequisitionId == current.RequisitionId
                        && x.PipelineStageId == stage.Id
                        && x.Status == ApplicationStatus.Active
                    )
                    .OrderBy(x => x.AppliedAt)
                    .ThenBy(x => x.Id)
                    .Select(x => new
                    {
                        x.Id,
                        x.AppliedAt,
                        Name = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                    })
                    .ToListAsync(ct);
                var index = people.FindIndex(x => x.Id == id);
                // Someone just moved out of the stage keeps their place, by when they applied.
                var next =
                    index >= 0 ? index + 1 : people.FindIndex(x => x.AppliedAt > current.AppliedAt);
                if (next < 0)
                    next = people.Count;
                var previous = (index >= 0 ? index : next) - 1;
                return Results.Ok(
                    new
                    {
                        Stage = stage,
                        Position = index >= 0 ? index + 1 : (int?)null,
                        Total = people.Count,
                        Previous = previous >= 0
                            ? new { people[previous].Id, people[previous].Name }
                            : null,
                        Next = next < people.Count
                            ? new { people[next].Id, people[next].Name }
                            : null,
                    }
                );
            }
        );

        // Other applicants on the same job to compare with: active or hired, most feedback first.
        api.MapGet(
            "/applications/{id:guid}/peers",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var scoped = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var requisitionId = await scoped
                    .Where(x => x.Id == id)
                    .Select(x => (Guid?)x.RequisitionId)
                    .SingleOrDefaultAsync(ct);
                if (requisitionId is null)
                    return Results.NotFound();
                return Results.Ok(
                    await scoped
                        .Where(x =>
                            x.RequisitionId == requisitionId
                            && x.Id != id
                            && (
                                x.Status == ApplicationStatus.Active
                                || x.Status == ApplicationStatus.Hired
                            )
                        )
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            Stage = x.PipelineStage!.Name,
                            StageOrder = x.PipelineStage.SortOrder,
                            Scorecards = x.Interviews.SelectMany(i => i.Scorecards).Count(),
                        })
                        .OrderByDescending(x => x.Scorecards)
                        .ThenByDescending(x => x.StageOrder)
                        .ThenBy(x => x.Name)
                        .Take(50)
                        .ToListAsync(ct)
                );
            }
        );

        // Two to four applicants on one job: feedback by competency, the decision and the offer.
        api.MapGet(
            "/applications/compare",
            async (string? ids, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var list = (ids ?? "")
                    .Split(
                        ',',
                        StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
                    )
                    .Select(x => Guid.TryParse(x, out var guid) ? guid : Guid.Empty)
                    .Distinct()
                    .ToArray();
                if (list.Length is < 2 or > 4 || list.Contains(Guid.Empty))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["ids"] = ["Choose 2 to 4 applicants on the same job."],
                        }
                    );
                var email = principal.Email();
                var canSeeTerms =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var applicants = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(x => list.Contains(x.Id))
                    .Select(x => new
                    {
                        x.Id,
                        x.RequisitionId,
                        RequisitionTitle = x.Requisition!.Title,
                        x.CandidateId,
                        CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        CandidateTitle = x.Candidate.CurrentTitle,
                        Stage = x.PipelineStage!.Name,
                        Status = x.Status.ToString(),
                        x.AppliedAt,
                        Decision = db
                            .HiringDecisions.Where(d => d.ApplicationId == x.Id)
                            .OrderByDescending(d => d.DecidedAt)
                            .Select(d => new
                            {
                                Decision = d.Decision.ToString(),
                                d.Rationale,
                                d.DecidedBy,
                                d.DecidedAt,
                            })
                            .FirstOrDefault(),
                        Offer = db
                            .Offers.Where(o => o.ApplicationId == x.Id)
                            .OrderByDescending(o => o.CreatedAt)
                            .Select(o => new
                            {
                                Status = o.Status.ToString(),
                                BaseSalary = canSeeTerms ? o.BaseSalary : null,
                                o.Currency,
                                o.PayPeriod,
                                o.StartDate,
                                o.SentAt,
                            })
                            .FirstOrDefault(),
                        Expected = x
                            .Interviews.Where(i =>
                                i.Status != InterviewStatus.Cancelled
                                && i.Status != InterviewStatus.NoShow
                            )
                            .Sum(i => i.InterviewerEmails.Length),
                    })
                    .ToListAsync(ct);
                if (applicants.Count != list.Length)
                    return Results.NotFound();
                if (applicants.Select(x => x.RequisitionId).Distinct().Count() != 1)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["ids"] = ["Compare applicants for the same job."],
                        }
                    );

                // Blind review holds here too: nothing from an applicant you still owe a scorecard on.
                var blinded = new HashSet<Guid>();
                foreach (var applicant in applicants)
                    if ((await BlindingInterviewsAsync(db, applicant.Id, email, ct)).Length > 0)
                        blinded.Add(applicant.Id);
                var visible = list.Where(x => !blinded.Contains(x)).ToArray();
                var cards = await db
                    .Scorecards.AsNoTracking()
                    .Where(s => visible.Contains(s.Interview!.ApplicationId))
                    .Select(s => new
                    {
                        s.Interview!.ApplicationId,
                        Recommendation = s.Recommendation.ToString(),
                        s.Rating,
                    })
                    .ToListAsync(ct);
                var ratings = await db
                    .ScorecardCriterionRatings.AsNoTracking()
                    .Where(r => visible.Contains(r.Scorecard!.Interview!.ApplicationId))
                    .Select(r => new
                    {
                        r.Scorecard!.Interview!.ApplicationId,
                        Competency = r.InterviewCriterion!.CompetencyId == Guid.Empty
                            ? r.InterviewCriterion.Id
                            : r.InterviewCriterion.CompetencyId,
                        r.InterviewCriterion.Name,
                        Kit = r.InterviewCriterion.InterviewKit!.Name,
                        KitOrder = r.InterviewCriterion.InterviewKit.SortOrder,
                        Order = r.InterviewCriterion.SortOrder,
                        r.Rating,
                        r.Scorecard.SubmittedAt,
                    })
                    .ToListAsync(ct);

                // One row per competency (the same one across kit versions), named as it was last scored.
                var competencies = ratings
                    .GroupBy(r => r.Competency)
                    .Select(group =>
                    {
                        var latest = group.MaxBy(r => r.SubmittedAt)!;
                        return new
                        {
                            Id = group.Key,
                            latest.Name,
                            latest.Kit,
                            latest.KitOrder,
                            latest.Order,
                            Scores = group
                                .GroupBy(r => r.ApplicationId)
                                .ToDictionary(
                                    x => x.Key,
                                    x => new
                                    {
                                        Average = Math.Round(x.Average(r => r.Rating), 1),
                                        Count = x.Count(),
                                    }
                                ),
                        };
                    })
                    .OrderBy(x => x.KitOrder)
                    .ThenBy(x => x.Order)
                    .ToList();

                return Results.Ok(
                    new
                    {
                        RequisitionId = applicants[0].RequisitionId,
                        RequisitionTitle = applicants[0].RequisitionTitle,
                        Applicants = list.Select(id => applicants.Single(x => x.Id == id))
                            .Select(x =>
                            {
                                var mine = cards.Where(c => c.ApplicationId == x.Id).ToList();
                                return new
                                {
                                    x.Id,
                                    x.CandidateId,
                                    x.CandidateName,
                                    x.CandidateTitle,
                                    x.Stage,
                                    x.Status,
                                    x.AppliedAt,
                                    Blinded = blinded.Contains(x.Id),
                                    x.Decision,
                                    x.Offer,
                                    Feedback = new
                                    {
                                        Submitted = blinded.Contains(x.Id)
                                            ? (int?)null
                                            : mine.Count,
                                        x.Expected,
                                        Average = mine.Count > 0
                                            ? Math.Round(mine.Average(c => c.Rating), 1)
                                            : (double?)null,
                                        Recommendations = mine.GroupBy(c => c.Recommendation)
                                            .ToDictionary(g => g.Key, g => g.Count()),
                                    },
                                };
                            }),
                        Competencies = competencies.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Kit,
                            x.Scores,
                        }),
                    }
                );
            }
        );
    }
}
