using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Jobs someone started in the create-job wizard. The wizard saves its form as they go; each
/// person sees only their own. Creating the job (with <c>draftId</c>) removes the draft.
/// </summary>
public static partial class AtsEndpoints
{
    private const int JobDraftMaxBytes = 400_000;

    private static void MapJobDrafts(RouteGroupBuilder api)
    {
        api.MapGet(
                "/requisitions/drafts",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var me = principal.Email();
                    return Results.Ok(
                        await db
                            .JobDrafts.AsNoTracking()
                            .Where(x => x.OwnerEmail == me)
                            .OrderByDescending(x => x.UpdatedAt)
                            .Select(x => new
                            {
                                x.Id,
                                x.Title,
                                x.Step,
                                x.CreatedAt,
                                x.UpdatedAt,
                            })
                            .ToListAsync(ct)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
                "/requisitions/drafts/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var me = principal.Email();
                    var draft = await db
                        .JobDrafts.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id && x.OwnerEmail == me, ct);
                    return draft is null
                        ? Results.NotFound()
                        : Results.Ok(
                            new
                            {
                                draft.Id,
                                draft.Title,
                                draft.Step,
                                Data = JsonDocument.Parse(draft.DataJson).RootElement,
                                draft.UpdatedAt,
                            }
                        );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Saves the form; the id comes from the wizard, so the first save creates the draft.
        api.MapPut(
                "/requisitions/drafts/{id:guid}",
                async (
                    Guid id,
                    SaveJobDraftRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var me = principal.Email();
                    var json =
                        request.Data.ValueKind == JsonValueKind.Object
                            ? request.Data.GetRawText()
                            : null;
                    if (json is null || json.Length > JobDraftMaxBytes)
                        return JobProblem("data", "The form could not be saved. Try again.");
                    var draft = await db.JobDrafts.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (draft is not null && draft.OwnerEmail != me)
                        return Results.NotFound();
                    if (draft is null)
                    {
                        draft = new JobDraft { Id = id, OwnerEmail = me };
                        db.JobDrafts.Add(draft);
                    }
                    var title = request.Title?.Trim() ?? "";
                    draft.Title = title[..Math.Min(title.Length, 200)];
                    draft.Step = Math.Clamp(request.Step, 0, 20);
                    draft.DataJson = json;
                    draft.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { draft.Id, draft.UpdatedAt });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapDelete(
                "/requisitions/drafts/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var me = principal.Email();
                    var removed = await db
                        .JobDrafts.Where(x => x.Id == id && x.OwnerEmail == me)
                        .ExecuteDeleteAsync(ct);
                    return removed == 0 ? Results.NotFound() : Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
