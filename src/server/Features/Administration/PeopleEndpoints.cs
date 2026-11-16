using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

// Members, invitations and access requests: the Members hub in Settings.
public static partial class AtsEndpoints
{
    private static void MapPeople(RouteGroupBuilder api)
    {
        var admin = api.MapGroup("/admin").RequireAuthorization(AtsPolicies.Admin);

        admin.MapGet(
            "/users",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var owner = await db
                    .Organizations.Select(x => x.OwnerEmail)
                    .SingleOrDefaultAsync(ct);
                var users = await db
                    .Users.AsNoTracking()
                    .Include(x => x.CustomRole)
                    .OrderBy(x => x.DisplayName)
                    .ToListAsync(ct);
                return Results.Ok(
                    users.Select(x => new
                    {
                        x.Id,
                        x.Email,
                        x.DisplayName,
                        // The built-in role it behaves like; RoleKey and RoleName name the role itself.
                        Role = x.Role.ToString(),
                        RoleKey = RoleKey(x),
                        RoleName = Permissions.RoleName(x),
                        x.Departments,
                        x.AvatarTone,
                        x.IsActive,
                        x.LastSignInAt,
                        x.InvitedAt,
                        x.InvitedByEmail,
                        IsOwner = x.Email == owner,
                        x.UpdatedAt,
                    })
                );
            }
        );

        // Teams to pick from: every job department, plus teams already given to someone.
        admin.MapGet(
            "/departments",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var jobs = await db
                    .Requisitions.Select(x => x.Department)
                    .Distinct()
                    .ToListAsync(ct);
                var given = await db
                    .Users.SelectMany(x => x.Departments)
                    .Distinct()
                    .ToListAsync(ct);
                return Results.Ok(
                    jobs.Concat(given)
                        .Select(x => x.Trim())
                        .Where(x => x.Length > 0)
                        .DistinctBy(x => x.ToLowerInvariant())
                        .Order(StringComparer.OrdinalIgnoreCase)
                );
            }
        );

        // Kept for scripts and tests: creates or updates one member by email.
        admin.MapPost(
            "/users",
            async (
                UpsertUserRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    string.IsNullOrWhiteSpace(request.Email)
                    || string.IsNullOrWhiteSpace(request.DisplayName)
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["user"] = ["Email and display name are required."],
                        }
                    );
                var role = await FindRoleAsync(db, request.Role, ct);
                if (role is null)
                    return UnknownRole();
                var email = request.Email.Trim().ToLowerInvariant();
                var user = await db
                    .Users.Include(x => x.CustomRole)
                    .SingleOrDefaultAsync(x => x.Email == email, ct);
                if (user is null)
                {
                    user = new AppUser
                    {
                        Email = email,
                        DisplayName = request.DisplayName.Trim(),
                        Departments = CleanDepartments(request.Departments),
                        IsActive = request.IsActive,
                    };
                    role.ApplyTo(user);
                    db.Users.Add(user);
                    Audit.Add(
                        db,
                        principal,
                        "User",
                        user.Id,
                        "Created",
                        new { user.Email, Role = role.Name }
                    );
                }
                else
                {
                    var problem = await AccessChangeProblemAsync(
                        db,
                        principal.Email(),
                        [user],
                        role,
                        request.IsActive,
                        ct
                    );
                    if (problem is not null)
                        return Results.Conflict(new { message = problem });
                    var action = AccessAction(user, role, request.IsActive);
                    var before = Permissions.RoleName(user);
                    user.DisplayName = request.DisplayName.Trim();
                    role.ApplyTo(user);
                    user.Departments = CleanDepartments(request.Departments);
                    user.IsActive = request.IsActive;
                    user.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "User",
                        user.Id,
                        action,
                        changes: action == "RoleChanged" ? RoleChange(before, role.Name) : null
                    );
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { user.Id });
            }
        );

        admin.MapPatch(
            "/users",
            async (
                UpdateUsersRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var ids = (request.Ids ?? []).Distinct().ToArray();
                if (ids.Length == 0)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["ids"] = ["Pick at least one member."] }
                    );
                if (
                    request.DisplayName is not null
                    && (ids.Length != 1 || string.IsNullOrWhiteSpace(request.DisplayName))
                )
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["displayName"] = ["Give one member a name."],
                        }
                    );
                var role = request.Role is null ? null : await FindRoleAsync(db, request.Role, ct);
                if (request.Role is not null && role is null)
                    return UnknownRole();
                var users = await db
                    .Users.Include(x => x.CustomRole)
                    .Where(x => ids.Contains(x.Id))
                    .ToListAsync(ct);
                if (users.Count != ids.Length)
                    return Results.NotFound();
                var problem = await AccessChangeProblemAsync(
                    db,
                    principal.Email(),
                    users,
                    role,
                    request.IsActive,
                    ct
                );
                if (problem is not null)
                    return Results.Conflict(new { message = problem });
                foreach (var user in users)
                {
                    var action = AccessAction(user, role, request.IsActive ?? user.IsActive);
                    var before = Permissions.RoleName(user);
                    role?.ApplyTo(user);
                    if (request.IsActive is { } active)
                        user.IsActive = active;
                    if (request.Departments is { } departments)
                        user.Departments = CleanDepartments(departments);
                    if (request.DisplayName is { } name)
                        user.DisplayName = name.Trim();
                    user.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "User",
                        user.Id,
                        action,
                        changes: action == "RoleChanged" ? RoleChange(before, role!.Name) : null
                    );
                }
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // ---- Invitations: a member row that has never signed in, plus an email --------------
        admin.MapPost(
            "/invitations",
            async (
                InviteMembersRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var role = await FindRoleAsync(db, request.Role, ct);
                if (role is null)
                    return UnknownRole();
                var emails = (request.Emails ?? [])
                    .Select(x => x.Trim().ToLowerInvariant())
                    .Where(x => x.Length > 0)
                    .Distinct()
                    .ToList();
                if (emails.Count is 0 or > 50)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["emails"] = ["Add between 1 and 50 email addresses."],
                        }
                    );
                var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                var domains = organization?.AllowedEmailDomains ?? [];
                var existing = await db
                    .Users.Where(x => emails.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, ct);
                var inviter = await db
                    .Users.AsNoTracking()
                    .SingleAsync(x => x.Email == principal.Email(), ct);
                var created = new List<object>();
                var skipped = new List<object>();
                foreach (var email in emails)
                {
                    var reason =
                        !IsEmail(email) ? "This is not an email address."
                        : domains.Length > 0 && !domains.Contains(email.Split('@')[1])
                            ? "Not one of your company email domains."
                        : existing.GetValueOrDefault(email) is { } user
                            ? user.IsActive ? "Already a member."
                                : "Has a deactivated account. Reactivate it under Members."
                        : null;
                    if (reason is not null)
                    {
                        skipped.Add(new { email, reason });
                        continue;
                    }
                    var invited = new AppUser
                    {
                        Email = email,
                        DisplayName = NameFromEmail(email),
                        Departments = CleanDepartments(request.Departments),
                        InvitedAt = DateTimeOffset.UtcNow,
                        InvitedByEmail = inviter.Email,
                    };
                    role.ApplyTo(invited);
                    db.Users.Add(invited);
                    await QueueInvitationAsync(
                        db,
                        organization,
                        inviter.DisplayName,
                        invited,
                        request.Note,
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "User",
                        invited.Id,
                        "Invited",
                        new { invited.Email, Role = role.Name }
                    );
                    created.Add(new { invited.Id, email });
                }
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { created, skipped });
            }
        );

        admin.MapPost(
            "/invitations/{id:guid}/resend",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var user = await db
                    .Users.Include(x => x.CustomRole)
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && x.InvitedAt != null
                            && x.LastSignInAt == null
                            && x.IsActive,
                        ct
                    );
                if (user is null)
                    return Results.NotFound();
                var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                var inviter = await db
                    .Users.AsNoTracking()
                    .Where(x => x.Email == principal.Email())
                    .Select(x => x.DisplayName)
                    .SingleAsync(ct);
                user.InvitedAt = DateTimeOffset.UtcNow;
                user.InvitedByEmail = principal.Email();
                await QueueInvitationAsync(db, organization, inviter, user, null, ct);
                Audit.Add(db, principal, "User", user.Id, "InviteResent");
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        admin.MapDelete(
            "/invitations/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                // Only someone who never signed in: a member with history is deactivated instead.
                var user = await db.Users.SingleOrDefaultAsync(
                    x => x.Id == id && x.InvitedAt != null && x.LastSignInAt == null,
                    ct
                );
                if (user is null)
                    return Results.NotFound();
                db.Users.Remove(user);
                Audit.Add(db, principal, "User", user.Id, "InviteWithdrawn", new { user.Email });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // ---- Access requests: uninvited sign-ins from a company domain ----------------------
        admin.MapGet(
            "/access-requests",
            async (AtsDbContext db, CancellationToken ct) =>
                Results.Ok(
                    await db
                        .AccessRequests.AsNoTracking()
                        .Where(x => x.Status == AccessRequestStatus.Pending)
                        .OrderByDescending(x => x.CreatedAt)
                        .Select(x => new
                        {
                            x.Id,
                            x.Email,
                            x.Name,
                            x.Note,
                            x.CreatedAt,
                        })
                        .ToListAsync(ct)
                )
        );

        admin.MapPost(
            "/access-requests/{id:guid}/approve",
            async (
                Guid id,
                ApproveAccessRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var pending = await db.AccessRequests.SingleOrDefaultAsync(
                    x => x.Id == id && x.Status == AccessRequestStatus.Pending,
                    ct
                );
                if (pending is null)
                    return Results.NotFound();
                var role = await FindRoleAsync(db, request.Role, ct);
                if (role is null)
                    return UnknownRole();
                if (await db.Users.AnyAsync(x => x.Email == pending.Email, ct))
                    return Results.Conflict(
                        new
                        {
                            message = "This person already has an account. Change their access under Members.",
                        }
                    );
                var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                var inviter = await db
                    .Users.AsNoTracking()
                    .SingleAsync(x => x.Email == principal.Email(), ct);
                var user = new AppUser
                {
                    Email = pending.Email,
                    DisplayName = pending.Name,
                    Departments = CleanDepartments(request.Departments),
                    InvitedAt = DateTimeOffset.UtcNow,
                    InvitedByEmail = inviter.Email,
                };
                role.ApplyTo(user);
                db.Users.Add(user);
                pending.Status = AccessRequestStatus.Approved;
                pending.DecidedAt = DateTimeOffset.UtcNow;
                pending.DecidedByEmail = inviter.Email;
                await QueueInvitationAsync(
                    db,
                    organization,
                    inviter.DisplayName,
                    user,
                    null,
                    ct,
                    approved: true
                );
                Audit.Add(
                    db,
                    principal,
                    "AccessRequest",
                    pending.Id,
                    "AccessApproved",
                    new { pending.Email, Role = role.Name }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { user.Id });
            }
        );

        admin.MapPost(
            "/access-requests/{id:guid}/decline",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var pending = await db.AccessRequests.SingleOrDefaultAsync(
                    x => x.Id == id && x.Status == AccessRequestStatus.Pending,
                    ct
                );
                if (pending is null)
                    return Results.NotFound();
                // A declined person can ask again after 7 days.
                pending.Status = AccessRequestStatus.Declined;
                pending.DecidedAt = DateTimeOffset.UtcNow;
                pending.DecidedByEmail = principal.Email();
                Audit.Add(
                    db,
                    principal,
                    "AccessRequest",
                    pending.Id,
                    "AccessDeclined",
                    new { pending.Email }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
    }

    /// <summary>
    /// The plain reason a change to members' access is refused, or null. Keeps the workspace from
    /// locking itself out: nobody changes their own access, the owner stays an active admin, and at
    /// least one active admin remains. "Admin" means a role that manages the workspace, built-in or
    /// custom (its <see cref="AppUser.Role"/> is Admin). Used for member changes and role edits.
    /// </summary>
    public static async Task<string?> AccessChangeProblemAsync(
        AtsDbContext db,
        string actorEmail,
        IReadOnlyCollection<AppUser> targets,
        RoleChoice? role,
        bool? isActive,
        CancellationToken ct
    )
    {
        bool Demotes(AppUser user) =>
            role is { } r && r.Kind != UserRole.Admin && user.Role == UserRole.Admin;
        bool Deactivates(AppUser user) => isActive == false && user.IsActive;
        if (
            targets.Any(x =>
                x.Email == actorEmail && ((role is { } r && !r.Is(x)) || Deactivates(x))
            )
        )
            return "You can't change your own role or remove your own access. Ask another admin.";
        var owner = await db.Organizations.Select(x => x.OwnerEmail).SingleOrDefaultAsync(ct);
        if (targets.Any(x => x.Email == owner && (Demotes(x) || Deactivates(x))))
            return "The workspace owner must stay an active admin.";
        var losing = targets
            .Where(x => x.Role == UserRole.Admin && x.IsActive && (Demotes(x) || Deactivates(x)))
            .Select(x => x.Id)
            .ToList();
        if (
            losing.Count > 0
            && !await db.Users.AnyAsync(
                x => x.Role == UserRole.Admin && x.IsActive && !losing.Contains(x.Id),
                ct
            )
        )
            return "At least one active admin must remain. Make someone else an admin first.";
        return null;
    }

    /// <summary>A role change for the activity history, by name: built-in and custom roles alike.</summary>
    internal static object RoleChange(string from, string to) => new { Role = new { from, to } };

    // Names the change, so the activity history reads "changed the role of" rather than "updated".
    private static string AccessAction(AppUser user, RoleChoice? role, bool isActive) =>
        user.IsActive && !isActive ? "AccessRemoved"
        : !user.IsActive && isActive ? "AccessRestored"
        : role is not null && !role.Is(user) ? "RoleChanged"
        : "Updated";

    /// <summary>Team names as typed, trimmed and without repeats (ignoring case).</summary>
    private static string[] CleanDepartments(string[]? departments) =>
        (departments ?? [])
            .Select(x => x.Trim())
            .Where(x => x.Length is > 0 and <= 120)
            .DistinctBy(x => x.ToLowerInvariant())
            .Take(20)
            .ToArray();

    private static bool IsEmail(string value) =>
        value.Split('@') is [{ Length: > 0 }, var domain]
        && domain.Contains('.')
        && !domain.StartsWith('.')
        && !domain.EndsWith('.');

    // "jordan.lee@acme.com" becomes "Jordan Lee" until they sign in with their real name.
    private static string NameFromEmail(string email) =>
        string.Join(
            ' ',
            email
                .Split('@')[0]
                .Split(['.', '_', '-'], StringSplitOptions.RemoveEmptyEntries)
                .Select(x => char.ToUpperInvariant(x[0]) + x[1..])
        );

    /// <summary>The invitation email, from the "member-invited" template admins can edit.</summary>
    private static Task QueueInvitationAsync(
        AtsDbContext db,
        Organization? organization,
        string inviterName,
        AppUser user,
        string? note,
        CancellationToken ct,
        bool approved = false
    )
    {
        var message =
            approved ? $"{inviterName} approved your request to join."
            : string.IsNullOrWhiteSpace(note) ? ""
            : $"A note from {inviterName}: {note.Trim()}";
        return EmailTemplates.QueueAsync(
            db,
            "member-invited",
            null,
            user.Email,
            new Dictionary<string, string>
            {
                ["inviterName"] = inviterName,
                ["role"] = Permissions.RoleName(user),
                ["note"] = message,
                ["signInLink"] = string.IsNullOrWhiteSpace(organization?.PublicUrl)
                    ? ""
                    : $"{organization.PublicUrl.TrimEnd('/')}/",
            },
            null,
            ct
        );
    }
}
