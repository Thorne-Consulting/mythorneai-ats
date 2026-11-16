using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapCandidateCompare(RouteGroupBuilder api)
    {
        // Up to four people side by side for one job: the match number and requirements, the AI fit
        // check, where they are in the job, and the panel's feedback (hidden while you owe yours).
        api.MapGet(
                "/requisitions/{id:guid}/compare",
                async (
                    Guid id,
                    string? candidateIds,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await ScopeRequisitions(
                            db.Requisitions.AsNoTracking(),
                            principal
                        )
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null)
                        return Results.NotFound();
                    var ids = (candidateIds ?? "")
                        .Split(
                            ',',
                            StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries
                        )
                        .Select(value => Guid.TryParse(value, out var parsed) ? parsed : Guid.Empty)
                        .Where(value => value != Guid.Empty)
                        .Distinct()
                        .Take(4)
                        .ToArray();
                    var people = FilterCandidates(
                        new QueryCollection(
                            new Dictionary<string, StringValues> { ["includeDnc"] = "true" }
                        ),
                        principal,
                        db
                    )
                        .People.Where(x => ids.Contains(x.Id));
                    var ranked = (
                        await RankAsync(db, ai, principal, requisition, "", people, ct)
                    ).Rows.ToDictionary(x => x.Id);
                    var me = principal.Email();
                    var apps = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                        .Where(a => a.RequisitionId == id && ids.Contains(a.CandidateId))
                        .Select(a => new
                        {
                            a.Id,
                            a.CandidateId,
                            Stage = a.PipelineStage!.Name,
                            StageType = a.PipelineStage.Type.ToString(),
                            StageColor = a.PipelineStage.Color,
                            Status = a.Status.ToString(),
                            a.AppliedAt,
                            Blinded = a.Interviews.Any(i =>
                                i.Status != InterviewStatus.Cancelled
                                && i.Status != InterviewStatus.NoShow
                                && i.InterviewerEmails.Contains(me)
                                && !i.Scorecards.Any(s => s.InterviewerEmail == me)
                            ),
                        })
                        .ToListAsync(ct);
                    var appIds = apps.Select(a => a.Id).ToList();
                    var cards = await db
                        .Scorecards.AsNoTracking()
                        .Where(s => appIds.Contains(s.Interview!.ApplicationId))
                        .Select(s => new
                        {
                            s.Interview!.ApplicationId,
                            s.InterviewerEmail,
                            s.Recommendation,
                            s.Rating,
                        })
                        .ToListAsync(ct);
                    var ratings = await db
                        .ScorecardCriterionRatings.AsNoTracking()
                        .Where(r => appIds.Contains(r.Scorecard!.Interview!.ApplicationId))
                        .Select(r => new
                        {
                            r.Scorecard!.Interview!.ApplicationId,
                            Name = r.InterviewCriterion!.Name,
                            r.Rating,
                        })
                        .ToListAsync(ct);
                    var emails = cards.Select(c => c.InterviewerEmail).Distinct().ToList();
                    var names = await db
                        .Users.AsNoTracking()
                        .Where(u => emails.Contains(u.Email.ToLower()))
                        .ToDictionaryAsync(u => u.Email.ToLower(), u => u.DisplayName, ct);
                    var fits = await db
                        .JobFits.AsNoTracking()
                        .Where(f => f.RequisitionId == id && ids.Contains(f.CandidateId))
                        .ToDictionaryAsync(f => f.CandidateId, ct);
                    var found = await people
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.CurrentTitle,
                        })
                        .ToDictionaryAsync(x => x.Id, ct);
                    var requirements = JobRequirements.Parse(requisition.RequirementsJson);
                    return Results.Ok(
                        new
                        {
                            Job = new { requisition.Id, requisition.Title },
                            Requirements = new { requirements.Required, requirements.Preferred },
                            People = ids.Where(found.ContainsKey)
                                .Select(candidateId =>
                                {
                                    var app = apps.FirstOrDefault(a =>
                                        a.CandidateId == candidateId
                                    );
                                    var match = ranked.GetValueOrDefault(candidateId);
                                    var fit = fits.GetValueOrDefault(candidateId);
                                    var hidden = app?.Blinded ?? false;
                                    var mine = cards
                                        .Where(c => c.ApplicationId == app?.Id)
                                        .ToList();
                                    return new
                                    {
                                        CandidateId = candidateId,
                                        found[candidateId].Name,
                                        found[candidateId].CurrentTitle,
                                        Match = match is null
                                            ? null
                                            : new
                                            {
                                                match.Score,
                                                match.Matched,
                                                match.Missing,
                                            },
                                        Application = app is null
                                            ? null
                                            : new
                                            {
                                                app.Id,
                                                app.Stage,
                                                app.StageType,
                                                app.StageColor,
                                                app.Status,
                                                app.AppliedAt,
                                            },
                                        Fit = fit is null
                                            ? null
                                            : new
                                            {
                                                fit.Score,
                                                fit.CreatedAt,
                                                Result = JsonDocument
                                                    .Parse(fit.ResultJson)
                                                    .RootElement.Clone(),
                                            },
                                        Feedback = app is null
                                            ? null
                                            : new
                                            {
                                                Hidden = hidden,
                                                Count = mine.Count,
                                                Recommendations = hidden
                                                    ? []
                                                    : mine.Select(c => new
                                                        {
                                                            Interviewer = names.GetValueOrDefault(
                                                                c.InterviewerEmail,
                                                                c.InterviewerEmail.Split('@')[0]
                                                            ),
                                                            Recommendation = CandidateActivity.RecommendationText(
                                                                c.Recommendation
                                                            ),
                                                        })
                                                        .ToArray(),
                                                Average = hidden || mine.Count == 0
                                                    ? (double?)null
                                                    : Math.Round(mine.Average(c => c.Rating), 1),
                                                Criteria = hidden
                                                    ? []
                                                    : ratings
                                                        .Where(r => r.ApplicationId == app.Id)
                                                        .GroupBy(r => r.Name)
                                                        .Select(g => new
                                                        {
                                                            Name = g.Key,
                                                            Average = Math.Round(
                                                                g.Average(r => r.Rating),
                                                                1
                                                            ),
                                                            Count = g.Count(),
                                                        })
                                                        .ToArray(),
                                            },
                                    };
                                }),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
