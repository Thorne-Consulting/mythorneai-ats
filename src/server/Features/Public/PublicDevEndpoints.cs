using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    /// <summary>
    /// Development only (not mapped otherwise): list and reset the seeded @local.dev candidates so
    /// the candidate portal can be tried from a known state. Code for all of them: 123456.
    /// </summary>
    private static void MapPublicDev(RouteGroupBuilder api)
    {
        api.MapGet("/dev/local-candidates", async (AtsDbContext db, CancellationToken ct) =>
            Results.Ok(new { code = CandidateCodes.LocalCode, candidates = await SeedData.ListLocalPortalCandidatesAsync(db, ct) }));

        api.MapPost("/dev/local-candidates/reset", async (AtsDbContext db, CancellationToken ct) =>
        {
            await SeedData.ResetLocalPortalCandidatesAsync(db, ct);
            return Results.Ok(new { candidates = await SeedData.ListLocalPortalCandidatesAsync(db, ct) });
        });
    }
}
