using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Someone's dashboard: card order and hidden cards on the Team tab ("Hide for now" on "Finish
/// setting up" hides that card). Kept with the account, so every browser shows the same dashboard.
/// </summary>
public sealed record DashboardLayout(string[]? Order, string[]? Hidden)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static DashboardLayout? Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return null;
        try
        {
            return JsonSerializer.Deserialize<DashboardLayout>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public string Serialize() => JsonSerializer.Serialize(this, Json);

    // Card ids are short words ("pipeline"); the web app drops ones it does not know.
    public bool IsValid() =>
        (Order ?? [])
            .Concat(Hidden ?? [])
            .All(x => x.Length is > 0 and <= 32 && x.All(char.IsAsciiLetter))
        && (Order?.Length ?? 0) <= 30
        && (Hidden?.Length ?? 0) <= 30;
}

public static partial class AtsEndpoints
{
    private static void MapDashboardLayout(RouteGroupBuilder api)
    {
        // 204 until they change something, so the web app uses the role's default.
        api.MapGet(
            "/dashboard/layout",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var json = await db
                    .Users.AsNoTracking()
                    .Where(x => x.Email == principal.Email())
                    .Select(x => x.DashboardJson)
                    .SingleOrDefaultAsync(ct);
                return DashboardLayout.Parse(json) is { } layout
                    ? Results.Ok(layout)
                    : Results.NoContent();
            }
        );

        // Fields sent replace the saved ones; fields left out stay.
        api.MapPut(
            "/dashboard/layout",
            async (
                DashboardLayout patch,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (!patch.IsValid())
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["layout"] = ["Pick cards from the list."],
                        }
                    );
                var user = await db.Users.SingleAsync(x => x.Email == principal.Email(), ct);
                var saved = DashboardLayout.Parse(user.DashboardJson);
                var merged = new DashboardLayout(
                    patch.Order ?? saved?.Order,
                    patch.Hidden ?? saved?.Hidden
                );
                user.DashboardJson = merged.Serialize();
                await db.SaveChangesAsync(ct);
                return Results.Ok(merged);
            }
        );
    }
}
