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
    private static void MapSearch(RouteGroupBuilder api)
    {
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
                var term = q.Trim().ToLower();
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var requisitions = await ScopeRequisitions(
                        db.Requisitions.AsNoTracking(),
                        principal
                    )
                    .Where(x => x.Title.ToLower().Contains(term) || x.Code.ToLower().Contains(term))
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        x.Code,
                        x.Title,
                        Type = "Requisition",
                    })
                    .ToListAsync(ct);
                var candidates = await db
                    .Candidates.AsNoTracking()
                    .Where(x =>
                        (canSeeAllCandidates || allowedCandidateIds.Contains(x.Id))
                        && (
                            x.FirstName.ToLower().Contains(term)
                            || x.LastName.ToLower().Contains(term)
                            || x.Email.ToLower().Contains(term)
                        )
                    )
                    .Take(8)
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.FirstName + " " + x.LastName,
                        Email = principal.IsInRole(nameof(UserRole.Interviewer))
                            ? "Restricted"
                            : x.Email,
                        Type = "Candidate",
                    })
                    .ToListAsync(ct);
                return Results.Ok(new { Requisitions = requisitions, Candidates = candidates });
            }
        );
    }
}
