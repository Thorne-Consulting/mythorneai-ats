using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>A role picked for someone: built-in, or custom with the built-in role it behaves like.</summary>
public sealed record RoleChoice(UserRole Kind, CustomRole? Custom)
{
    public string Name => Custom?.Name ?? Permissions.BuiltInNames[Kind];

    public bool Is(AppUser user) => user.CustomRoleId == Custom?.Id && user.Role == Kind;

    public void ApplyTo(AppUser user)
    {
        user.Role = Kind;
        user.CustomRoleId = Custom?.Id;
        user.CustomRole = Custom;
    }
}

// Roles: the four built-in ones (fixed, in Permissions.BuiltIn) and the ones admins make.
public static partial class AtsEndpoints
{
    private static void MapRoles(RouteGroupBuilder api)
    {
        var roles = api.MapGroup("/admin/roles").RequireAuthorization(AtsPolicies.Admin);

        roles.MapGet(
            "",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var custom = await db
                    .CustomRoles.AsNoTracking()
                    .OrderBy(x => x.Name)
                    .ToListAsync(ct);
                var counts = await db
                    .Users.Where(x => x.IsActive)
                    .GroupBy(x => new { x.CustomRoleId, x.Role })
                    .Select(g => new
                    {
                        g.Key.CustomRoleId,
                        g.Key.Role,
                        Count = g.Count(),
                    })
                    .ToListAsync(ct);
                var builtIn = Enum.GetValues<UserRole>()
                    .Select(kind => new
                    {
                        Key = kind.ToString(),
                        Name = Permissions.BuiltInNames[kind],
                        Description = (string?)null,
                        BuiltIn = true,
                        Kind = kind.ToString(),
                        Permissions = Permissions.BuiltIn[kind],
                        Members = counts
                            .Where(x => x.CustomRoleId == null && x.Role == kind)
                            .Sum(x => x.Count),
                    });
                var made = custom.Select(role =>
                {
                    var permissions = Permissions.Normalize(role.Permissions);
                    return new
                    {
                        Key = role.Id.ToString(),
                        role.Name,
                        role.Description,
                        BuiltIn = false,
                        Kind = Permissions.KindOf(permissions).ToString(),
                        Permissions = permissions,
                        Members = counts.Where(x => x.CustomRoleId == role.Id).Sum(x => x.Count),
                    };
                });
                return Results.Ok(
                    new { Roles = builtIn.Concat(made), Available = Permissions.All }
                );
            }
        );

        roles.MapPost(
            "",
            async (
                SaveRoleRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var problem = await RoleProblemAsync(db, request, null, ct);
                if (problem is not null)
                    return Results.ValidationProblem(problem);
                var role = new CustomRole
                {
                    Name = request.Name.Trim(),
                    Description = CleanDescription(request.Description),
                    Permissions = Permissions.Normalize(request.Permissions),
                };
                db.CustomRoles.Add(role);
                Audit.Add(
                    db,
                    principal,
                    "Role",
                    role.Id,
                    "Created",
                    new { role.Name, role.Permissions }
                );
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/admin/roles/{role.Id}", new { Key = role.Id });
            }
        );

        roles.MapPut(
            "/{id:guid}",
            async (
                Guid id,
                SaveRoleRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var role = await db.CustomRoles.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (role is null)
                    return Results.NotFound();
                var problem = await RoleProblemAsync(db, request, id, ct);
                if (problem is not null)
                    return Results.ValidationProblem(problem);
                var permissions = Permissions.Normalize(request.Permissions);
                var kind = Permissions.KindOf(permissions);
                var members = await db
                    .Users.Include(x => x.CustomRole)
                    .Where(x => x.CustomRoleId == id)
                    .ToListAsync(ct);
                // Taking "manage the workspace" away is a demotion for everyone with the role.
                var refused = await AccessChangeProblemAsync(
                    db,
                    principal.Email(),
                    members,
                    new RoleChoice(kind, role),
                    null,
                    ct
                );
                if (refused is not null)
                    return Results.Conflict(new { message = refused });
                role.Name = request.Name.Trim();
                role.Description = CleanDescription(request.Description);
                role.Permissions = permissions;
                role.UpdatedAt = DateTimeOffset.UtcNow;
                foreach (var member in members)
                    member.Role = kind;
                // The interceptor adds the before and after of the name and the capabilities.
                Audit.Add(db, principal, "Role", role.Id, "Updated");
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // Everyone with the role moves to another one first, in the same request.
        roles.MapDelete(
            "/{id:guid}",
            async (
                Guid id,
                string? moveTo,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var role = await db.CustomRoles.SingleOrDefaultAsync(x => x.Id == id, ct);
                if (role is null)
                    return Results.NotFound();
                var members = await db
                    .Users.Include(x => x.CustomRole)
                    .Where(x => x.CustomRoleId == id)
                    .ToListAsync(ct);
                if (members.Count > 0)
                {
                    var target = await FindRoleAsync(db, moveTo, ct);
                    if (target is null || target.Custom?.Id == id)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["moveTo"] = ["Pick a new role for the people who have this one."],
                            }
                        );
                    var refused = await AccessChangeProblemAsync(
                        db,
                        principal.Email(),
                        members,
                        target,
                        null,
                        ct
                    );
                    if (refused is not null)
                        return Results.Conflict(new { message = refused });
                    foreach (var member in members)
                    {
                        target.ApplyTo(member);
                        member.UpdatedAt = DateTimeOffset.UtcNow;
                        Audit.Add(
                            db,
                            principal,
                            "User",
                            member.Id,
                            "RoleChanged",
                            changes: RoleChange(role.Name, target.Name)
                        );
                    }
                }
                db.CustomRoles.Remove(role);
                Audit.Add(db, principal, "Role", role.Id, "Deleted", new { role.Name });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
    }

    /// <summary>A built-in role by name ("Recruiter") or a custom role by id; null when there is no such role.</summary>
    internal static async Task<RoleChoice?> FindRoleAsync(
        AtsDbContext db,
        string? key,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(key))
            return null;
        if (Guid.TryParse(key, out var id))
            return await db.CustomRoles.SingleOrDefaultAsync(x => x.Id == id, ct) is { } role
                ? new RoleChoice(Permissions.KindOf(Permissions.Normalize(role.Permissions)), role)
                : null;
        return
            Enum.TryParse<UserRole>(key, ignoreCase: true, out var builtIn)
            && Enum.IsDefined(builtIn)
            ? new RoleChoice(builtIn, null)
            : null;
    }

    internal static string RoleKey(AppUser user) =>
        user.CustomRoleId?.ToString() ?? user.Role.ToString();

    private static IResult UnknownRole() =>
        Results.ValidationProblem(
            new Dictionary<string, string[]> { ["role"] = ["Pick one of the workspace's roles."] }
        );

    private static string? CleanDescription(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();

    private static async Task<Dictionary<string, string[]>?> RoleProblemAsync(
        AtsDbContext db,
        SaveRoleRequest request,
        Guid? self,
        CancellationToken ct
    )
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > 60)
            return new() { ["name"] = ["Give the role a name of up to 60 characters."] };
        if ((request.Description?.Trim().Length ?? 0) > 300)
            return new() { ["description"] = ["Keep the description under 300 characters."] };
        var lower = name.ToLowerInvariant();
        var taken =
            Permissions.BuiltInNames.Values.Any(x => x.ToLowerInvariant() == lower)
            || await db.CustomRoles.AnyAsync(x => x.Id != self && x.Name.ToLower() == lower, ct);
        return taken
            ? new() { ["name"] = ["Another role has this name. Pick a different one."] }
            : null;
    }

    /// <summary>
    /// The old per-role switches (reports, import, templates) become custom roles once, for the
    /// people who had them, so nobody gains or loses access when the switches go away.
    /// </summary>
    public static async Task CarryOverRoleSwitchesAsync(AtsDbContext db)
    {
        var organization = await db.Organizations.SingleOrDefaultAsync();
        if (organization?.RolePermissionsJson is not { } json)
            return;
        Dictionary<string, string[]>? stored = null;
        try
        {
            stored = JsonSerializer.Deserialize<Dictionary<string, string[]>>(json);
        }
        catch (JsonException) { }
        string[] switches = [Permissions.Reports, Permissions.Import, Permissions.Templates];
        foreach (var (name, granted) in stored ?? [])
        {
            if (
                !Enum.TryParse<UserRole>(name, out var kind)
                || !Enum.IsDefined(kind)
                || kind == UserRole.Admin
            )
                continue;
            var builtIn = Permissions.BuiltIn[kind];
            var permissions = Permissions.Normalize(
                builtIn.Except(switches).Concat(granted.Intersect(switches))
            );
            if (permissions.ToHashSet().SetEquals(builtIn))
                continue;
            var people = await db
                .Users.Where(x => x.Role == kind && x.CustomRoleId == null)
                .ToListAsync();
            if (people.Count == 0)
                continue;
            var role = new CustomRole
            {
                Name = $"{Permissions.BuiltInNames[kind]} (your settings)",
                Description = "Made from the switches this workspace had set for the role.",
                Permissions = permissions,
            };
            db.CustomRoles.Add(role);
            foreach (var person in people)
                new RoleChoice(Permissions.KindOf(permissions), role).ApplyTo(person);
        }
        organization.RolePermissionsJson = null;
        await db.SaveChangesAsync();
    }
}
