using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapSearch(RouteGroupBuilder api)
    {
        // Header search. People match like the Candidates list search: every word must match some
        // field (typos in names allowed, phone digits too), best name matches first.
        api.MapGet(
            "/search",
            async (string q, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(q) || q.Trim().Length < 2)
                    return Results.Ok(
                        new
                        {
                            Requisitions = Array.Empty<object>(),
                            Candidates = Array.Empty<object>(),
                        }
                    );
                var search = CandidateSearch.Parse(q);
                var words = search
                    .Words.Concat(search.Phrases)
                    .Select(word => word.ToLower())
                    .ToArray();
                var jobs = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
                foreach (var word in words)
                    jobs = jobs.Where(x =>
                        x.Title.ToLower().Contains(word) || x.Code.ToLower().Contains(word)
                    );
                var requisitions = await jobs.OrderBy(x =>
                        x.Status == RequisitionStatus.Open ? 0 : 1
                    )
                    .ThenBy(x => x.Title)
                    .Take(6)
                    .Select(x => new
                    {
                        x.Id,
                        x.Code,
                        x.Title,
                        Status = x.Status.ToString(),
                        Type = "Requisition",
                    })
                    .ToListAsync(ct);

                var scoped = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var canSeeEveryone = principal.IsHiringStaff();
                var people = ApplySearch(
                    db.Candidates.AsNoTracking()
                        .Where(x =>
                            canSeeEveryone || scoped.Select(a => a.CandidateId).Contains(x.Id)
                        ),
                    search
                );
                var ordered = search.RankQuery is null
                    ? people.OrderByDescending(x => x.UpdatedAt)
                    : OrderBySearch(people, search).ThenByDescending(x => x.UpdatedAt);
                var restricted = principal.IsInRole(nameof(UserRole.Interviewer));
                var candidates = await ordered
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.FirstName + " " + x.LastName,
                        Email = restricted ? "Restricted" : x.Email,
                        x.CurrentTitle,
                        // Where they are now: the most recently touched application you can see.
                        Current = scoped
                            .Where(a => a.CandidateId == x.Id)
                            .OrderBy(a => a.Status == ApplicationStatus.Active ? 0 : 1)
                            .ThenByDescending(a => a.LastActivityAt)
                            .Select(a => new
                            {
                                ApplicationId = a.Id,
                                Job = a.Requisition!.Title,
                                Stage = a.PipelineStage!.Name,
                                Status = a.Status.ToString(),
                            })
                            .FirstOrDefault(),
                        Type = "Candidate",
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        Requisitions = requisitions,
                        Candidates = candidates.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Email,
                            x.CurrentTitle,
                            CurrentJob = x.Current?.Job,
                            Stage = x.Current is null ? null
                            : x.Current.Status == "Active" ? x.Current.Stage
                            : x.Current.Status,
                            x.Type,
                        }),
                    }
                );
            }
        );
    }
}
