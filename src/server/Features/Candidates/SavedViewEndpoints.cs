using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SavedViewRequest(string? Area, string? Name, string? ParamsJson, bool? Shared);

/// <summary>
/// Saved views for any list: the candidate list ("talent"), the jobs list ("jobs") and others by
/// name. Reports keep their own at /reports/views. A view is the owner's until they share it with the team; anyone can pin a view
/// they can see.
/// </summary>
public static partial class AtsEndpoints
{
    /// <summary>A list's name, for example "talent" or "jobs". Reports have their own endpoints.</summary>
    private static bool IsViewArea(string? area) =>
        area is { Length: > 1 and <= 40 }
        && area != "reports"
        && area.All(c => char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c == '-');

    /// <summary>The list query string a candidate view stores beside its filters (<c>listQuery</c>), for counts.</summary>
    private static string? SavedViewQuery(string paramsJson)
    {
        try
        {
            using var document = JsonDocument.Parse(paramsJson);
            return
                document.RootElement.ValueKind == JsonValueKind.Object
                && document.RootElement.TryGetProperty("listQuery", out var query)
                && query.ValueKind == JsonValueKind.String
                ? query.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static void MapSavedViews(RouteGroupBuilder api)
    {
        api.MapGet(
            "/saved-views",
            async (string area, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var views = await db
                    .SavedViews.AsNoTracking()
                    .Where(x => x.Area == area && (x.OwnerEmail == me || x.Shared))
                    .ToListAsync(ct);
                var owners = views.Select(x => x.OwnerEmail).Distinct().ToList();
                var names = await db
                    .Users.AsNoTracking()
                    .Where(u => owners.Contains(u.Email.ToLower()))
                    .ToDictionaryAsync(u => u.Email.ToLower(), u => u.DisplayName, ct);
                return Results.Ok(
                    views
                        .OrderByDescending(x => x.PinnedBy.Contains(me))
                        .ThenBy(x => x.OwnerEmail != me)
                        .ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                        .Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.ParamsJson,
                            x.Shared,
                            Mine = x.OwnerEmail == me,
                            OwnerName = names.GetValueOrDefault(
                                x.OwnerEmail,
                                x.OwnerEmail.Split('@')[0]
                            ),
                            Pinned = x.PinnedBy.Contains(me),
                        })
                );
            }
        );

        api.MapPost(
            "/saved-views",
            async (
                SavedViewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!IsViewArea(request.Area))
                    return Problem("area", "Views cannot be saved on this page.");
                var me = principal.Email();
                var (name, error) = await ValidViewAsync(db, me, request.Area!, request, null, ct);
                if (error is not null)
                    return error;
                if (request.ParamsJson is null || !IsJson(request.ParamsJson))
                    return Problem(
                        "paramsJson",
                        "That view could not be read. Try saving it again."
                    );
                var view = new SavedView
                {
                    OwnerEmail = me,
                    Area = request.Area!,
                    Name = name!,
                    ParamsJson = request.ParamsJson,
                    Shared = request.Shared ?? false,
                };
                db.SavedViews.Add(view);
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/saved-views/{view.Id}", new { view.Id });
            }
        );

        // Rename, save new filters, or share with the team. Only the owner can change a view.
        api.MapPut(
            "/saved-views/{id:guid}",
            async (
                Guid id,
                SavedViewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var me = principal.Email();
                var view = await db.SavedViews.SingleOrDefaultAsync(
                    x => x.Id == id && x.Area != "reports" && x.OwnerEmail == me,
                    ct
                );
                if (view is null)
                    return Results.NotFound();
                if (request.Name is not null)
                {
                    var (name, error) = await ValidViewAsync(db, me, view.Area, request, id, ct);
                    if (error is not null)
                        return error;
                    view.Name = name!;
                }
                if (request.ParamsJson is not null)
                {
                    if (!IsJson(request.ParamsJson))
                        return Problem(
                            "paramsJson",
                            "That view could not be read. Try saving it again."
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
            "/saved-views/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var deleted = await db
                    .SavedViews.Where(x => x.Id == id && x.Area != "reports" && x.OwnerEmail == me)
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
            var me = principal.Email();
            var view = await db.SavedViews.SingleOrDefaultAsync(
                x => x.Id == id && x.Area != "reports" && (x.OwnerEmail == me || x.Shared),
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
            "/saved-views/{id:guid}/pin",
            (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                Pin(id, true, principal, db, ct)
        );
        api.MapDelete(
            "/saved-views/{id:guid}/pin",
            (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                Pin(id, false, principal, db, ct)
        );
    }

    private static async Task<(string? Name, IResult? Error)> ValidViewAsync(
        AtsDbContext db,
        string me,
        string area,
        SavedViewRequest request,
        Guid? id,
        CancellationToken ct
    )
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > 120)
            return (null, Problem("name", "Give the view a name of up to 120 characters."));
        if (
            await db.SavedViews.AnyAsync(
                x => x.OwnerEmail == me && x.Area == area && x.Name == name && x.Id != id,
                ct
            )
        )
            return (
                null,
                Problem("name", "You already have a view with this name. Choose another name.")
            );
        return (name, null);
    }

    private static bool IsJson(string value)
    {
        try
        {
            JsonDocument.Parse(value).Dispose();
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
