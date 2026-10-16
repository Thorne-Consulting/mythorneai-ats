using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Auth;

// Extra capabilities an admin can grant or take away per role. Admin always has all of them.
public static class Permissions
{
    public const string Reports = "reports";
    public const string Import = "import";
    public const string Templates = "templates";

    public static readonly string[] All = [Reports, Import, Templates];

    private static readonly Dictionary<string, string[]> Defaults = new()
    {
        [nameof(UserRole.Recruiter)] = All,
        [nameof(UserRole.HiringManager)] = [Reports],
        [nameof(UserRole.Interviewer)] = [],
    };

    public static Dictionary<string, string[]> Parse(string? json)
    {
        var result = new Dictionary<string, string[]>(Defaults);
        if (string.IsNullOrWhiteSpace(json))
            return result;
        try
        {
            var stored = JsonSerializer.Deserialize<Dictionary<string, string[]>>(json) ?? [];
            foreach (var (role, permissions) in stored)
                if (Defaults.ContainsKey(role))
                    result[role] = permissions.Where(All.Contains).Distinct().ToArray();
        }
        catch (JsonException) { }
        return result;
    }

    public static async Task<HashSet<string>> ForAsync(AtsDbContext db, ClaimsPrincipal principal, CancellationToken ct)
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return [.. All];
        var json = await db.Organizations.Select(x => x.RolePermissionsJson).SingleOrDefaultAsync(ct);
        var map = Parse(json);
        return map.Where(x => principal.IsInRole(x.Key)).SelectMany(x => x.Value).ToHashSet();
    }

    public static async Task<bool> HasAsync(AtsDbContext db, ClaimsPrincipal principal, string permission, CancellationToken ct) =>
        (await ForAsync(db, principal, ct)).Contains(permission);
}
