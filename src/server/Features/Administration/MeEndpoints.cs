using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Someone's own settings, kept with their account so a new laptop looks the same. The browser
/// keeps a copy so the theme paints before the app loads. Null means "not chosen".
/// </summary>
public sealed record MyPreferences(
    string? Theme = null,
    string? Density = null,
    string? StartPage = null,
    string? DateFormat = null,
    // True from their first sign-in until they close the welcome.
    bool? Welcome = null
)
{
    public static readonly string[] Themes = ["light", "dark", "system"];
    public static readonly string[] Densities = ["comfortable", "compact"];
    public static readonly string[] DateFormats = ["auto", "month", "day", "iso"];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static MyPreferences Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new();
        try
        {
            return JsonSerializer.Deserialize<MyPreferences>(json, Json) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    public string Serialize() => JsonSerializer.Serialize(this, Json);

    /// <summary>Fields sent replace the saved ones; fields left out stay.</summary>
    public MyPreferences Merge(MyPreferences patch) =>
        new(
            patch.Theme ?? Theme,
            patch.Density ?? Density,
            patch.StartPage ?? StartPage,
            patch.DateFormat ?? DateFormat,
            patch.Welcome ?? Welcome
        );

    /// <summary>The plain reason a patch is refused, or null.</summary>
    public string? Problem() =>
        Theme is not null && !Themes.Contains(Theme) ? "Pick light, dark or system."
        : Density is not null && !Densities.Contains(Density) ? "Pick comfortable or compact."
        : DateFormat is not null && !DateFormats.Contains(DateFormat)
            ? "Pick a date format from the list."
        : StartPage is not null
        && (!StartPage.StartsWith('/') || StartPage.StartsWith("//") || StartPage.Length > 200)
            ? "Pick a start page from the list."
        : null;
}

public sealed record UpdateMeRequest(string? DisplayName = null, string? AvatarTone = null);

public static partial class AtsEndpoints
{
    private static readonly string[] AvatarTones =
    [
        "blue",
        "violet",
        "green",
        "amber",
        "red",
        "gray",
    ];

    // Your own account: name, avatar colour and preferences. Role and teams stay with admins.
    private static void MapMe(RouteGroupBuilder api)
    {
        api.MapPut(
            "/me",
            async (
                UpdateMeRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var user = await db.Users.SingleAsync(x => x.Email == principal.Email(), ct);
                if (request.DisplayName is { } name)
                {
                    if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 200)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["displayName"] = ["Write your name, up to 200 characters."],
                            }
                        );
                    user.DisplayName = name.Trim();
                }
                if (request.AvatarTone is { } tone)
                {
                    if (tone.Length > 0 && !AvatarTones.Contains(tone))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["avatarTone"] = ["Pick one of the colours."],
                            }
                        );
                    user.AvatarTone = tone.Length == 0 ? null : tone;
                }
                user.UpdatedAt = DateTimeOffset.UtcNow;
                // The interceptor records the before and after.
                Audit.Add(db, principal, "User", user.Id, "ProfileUpdated");
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        api.MapPut(
            "/me/preferences",
            async (
                MyPreferences patch,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (patch.Problem() is { } problem)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["preferences"] = [problem] }
                    );
                var user = await db.Users.SingleAsync(x => x.Email == principal.Email(), ct);
                var merged = MyPreferences.Parse(user.PreferencesJson).Merge(patch);
                user.PreferencesJson = merged.Serialize();
                await db.SaveChangesAsync(ct);
                return Results.Ok(merged);
            }
        );
    }
}
