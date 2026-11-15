using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record TalentPoolRequest(string? Name, string? Description);

public static partial class AtsEndpoints
{
    // People join and leave pools through POST /candidates/bulk (addToPool, removeFromPool), so a
    // pool takes the same "selected or everyone matching" targets as every other bulk action.
    private static void MapTalentPools(RouteGroupBuilder api)
    {
        api.MapGet(
                "/talent-pools",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var pools = await db
                        .TalentPools.AsNoTracking()
                        .OrderBy(x => x.Name)
                        .Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Description,
                            x.OwnerEmail,
                            x.CreatedAt,
                            Count = x.Members.Count,
                        })
                        .ToListAsync(ct);
                    var owners = pools.Select(x => x.OwnerEmail).Distinct().ToList();
                    var names = await db
                        .Users.AsNoTracking()
                        .Where(u => owners.Contains(u.Email.ToLower()))
                        .ToDictionaryAsync(u => u.Email.ToLower(), u => u.DisplayName, ct);
                    return Results.Ok(
                        pools.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Description,
                            x.OwnerEmail,
                            OwnerName = names.GetValueOrDefault(
                                x.OwnerEmail,
                                x.OwnerEmail.Split('@')[0]
                            ),
                            x.CreatedAt,
                            x.Count,
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/talent-pools",
                async (
                    TalentPoolRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var (name, description, error) = await ValidPoolAsync(db, request, null, ct);
                    if (error is not null)
                        return error;
                    var pool = new TalentPool
                    {
                        Name = name!,
                        Description = description ?? "",
                        OwnerEmail = principal.Email(),
                    };
                    db.TalentPools.Add(pool);
                    Audit.Add(db, principal, "TalentPool", pool.Id, "Created", new { pool.Name });
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/talent-pools/{pool.Id}", new { pool.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPut(
                "/talent-pools/{id:guid}",
                async (
                    Guid id,
                    TalentPoolRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var pool = await db.TalentPools.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (pool is null)
                        return Results.NotFound();
                    var (name, description, error) = await ValidPoolAsync(db, request, id, ct);
                    if (error is not null)
                        return error;
                    pool.Name = name!;
                    pool.Description = description ?? "";
                    Audit.Add(db, principal, "TalentPool", id, "Updated", new { pool.Name });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // The people stay; only the list goes.
        api.MapDelete(
                "/talent-pools/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var pool = await db.TalentPools.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (pool is null)
                        return Results.NotFound();
                    db.TalentPools.Remove(pool);
                    Audit.Add(db, principal, "TalentPool", id, "Deleted", new { pool.Name });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }

    private static async Task<(string? Name, string? Description, IResult? Error)> ValidPoolAsync(
        AtsDbContext db,
        TalentPoolRequest request,
        Guid? id,
        CancellationToken ct
    )
    {
        var name = request.Name?.Trim() ?? "";
        var description = Clean(request.Description);
        if (name.Length is 0 or > 120)
            return (null, null, Problem("name", "Give the pool a name of up to 120 characters."));
        if (description?.Length > 500)
            return (
                null,
                null,
                Problem("description", "Keep the description under 500 characters.")
            );
        var lower = name.ToLowerInvariant();
        if (await db.TalentPools.AnyAsync(x => x.Id != id && x.Name.ToLower() == lower, ct))
            return (null, null, Problem("name", "There is already a pool with this name."));
        return (name, description, null);
    }
}
