using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Auth;

/// <summary>
/// What a role may do: the capabilities the API tells apart, and nothing it doesn't. Each one is
/// enforced on the server (see the comment on each) and carried in the session as
/// <see cref="Claim"/> claims, plus the role claims the endpoint checks read (<see cref="RoleClaims"/>).
/// The four built-in roles are fixed sets; custom roles (<see cref="CustomRole"/>) pick their own.
/// </summary>
public static class Permissions
{
    /// <summary>Settings, members and roles, and every job including confidential ones (the Admin policy and role).</summary>
    public const string Workspace = "workspace";

    /// <summary>Post jobs and run the jobs they are on: move, email, schedule, offers (the ManageHiring policy).</summary>
    public const string Jobs = "jobs";

    /// <summary>The same on every job that isn't confidential (the Recruiter scope in ScopeRequisitions and CanManage).</summary>
    public const string AllJobs = "all_jobs";

    /// <summary>Add and edit candidates, see all of them, interview kits and assessments (ManageCandidates, IsHiringStaff).</summary>
    public const string Candidates = "candidates";

    /// <summary>Candidate imports (checked in the import endpoints).</summary>
    public const string Import = "import";

    /// <summary>Reports and report emails (checked in the report endpoints and the digest).</summary>
    public const string Reports = "reports";

    /// <summary>Shared email, posting and offer letter templates (checked in the template endpoints).</summary>
    public const string Templates = "templates";

    /// <summary>Every capability, in the order the role editor shows them.</summary>
    public static readonly string[] All =
    [
        Workspace,
        Jobs,
        AllJobs,
        Candidates,
        Import,
        Reports,
        Templates,
    ];

    // What each capability needs first; without it the API would refuse the work anyway.
    private static readonly Dictionary<string, string> Needs = new()
    {
        [AllJobs] = Jobs,
        [Candidates] = Jobs,
        [Import] = Candidates,
        [Templates] = Jobs,
    };

    public static readonly IReadOnlyDictionary<UserRole, string[]> BuiltIn = new Dictionary<
        UserRole,
        string[]
    >
    {
        [UserRole.Admin] = All,
        [UserRole.Recruiter] = [Jobs, AllJobs, Candidates, Import, Reports, Templates],
        [UserRole.HiringManager] = [Jobs, Reports],
        [UserRole.Interviewer] = [],
    };

    public static readonly IReadOnlyDictionary<UserRole, string> BuiltInNames = new Dictionary<
        UserRole,
        string
    >
    {
        [UserRole.Admin] = "Admin",
        [UserRole.Recruiter] = "Recruiter",
        [UserRole.HiringManager] = "Hiring manager",
        [UserRole.Interviewer] = "Interviewer",
    };

    /// <summary>Known capabilities only, with what they need; managing the workspace includes everything.</summary>
    public static string[] Normalize(IEnumerable<string>? permissions)
    {
        var set = (permissions ?? []).Where(All.Contains).ToHashSet();
        if (set.Contains(Workspace))
            return All;
        while (set.RemoveWhere(p => Needs.TryGetValue(p, out var need) && !set.Contains(need)) > 0)
        { }
        return All.Where(set.Contains).ToArray();
    }

    /// <summary>
    /// The built-in role these capabilities behave like. Stored on <see cref="AppUser.Role"/>, so
    /// queries such as "every admin" and the dashboard's role defaults keep working for custom roles.
    /// </summary>
    public static UserRole KindOf(IReadOnlyCollection<string> permissions) =>
        permissions.Contains(Workspace) ? UserRole.Admin
        : permissions.Contains(AllJobs) ? UserRole.Recruiter
        : permissions.Contains(Jobs) ? UserRole.HiringManager
        : UserRole.Interviewer;

    /// <summary>
    /// The role claims the API's checks read (<c>IsInRole</c>), so each one means one capability:
    /// Admin = workspace, Recruiter = every open job, HiringManager = works on jobs, Interviewer =
    /// neither. A built-in recruiter carries Recruiter and HiringManager.
    /// </summary>
    public static IEnumerable<string> RoleClaims(IReadOnlyCollection<string> permissions)
    {
        if (permissions.Contains(Workspace))
        {
            yield return nameof(UserRole.Admin);
            yield break;
        }
        if (permissions.Contains(AllJobs))
            yield return nameof(UserRole.Recruiter);
        yield return permissions.Contains(Jobs)
            ? nameof(UserRole.HiringManager)
            : nameof(UserRole.Interviewer);
    }

    public const string Claim = "ats_permission";

    /// <summary>A member's capabilities. A custom role must be loaded (<c>Include(x => x.CustomRole)</c>).</summary>
    public static string[] Of(AppUser user) =>
        user.CustomRoleId is null ? BuiltIn[user.Role]
        : user.CustomRole is { } role ? Normalize(role.Permissions)
        : throw new InvalidOperationException("Load the member's custom role first.");

    public static async Task<string[]> OfAsync(
        AtsDbContext db,
        AppUser user,
        CancellationToken ct = default
    ) =>
        user.CustomRoleId is not { } id || user.CustomRole is not null
            ? Of(user)
            : Normalize(
                await db
                    .CustomRoles.Where(x => x.Id == id)
                    .Select(x => x.Permissions)
                    .SingleOrDefaultAsync(ct)
            );

    /// <summary>The role's name as people read it: "Hiring manager", or the custom role's name.</summary>
    public static string RoleName(AppUser user) => user.CustomRole?.Name ?? BuiltInNames[user.Role];

    /// <summary>Active members who have a capability, for example everyone who gets report emails.</summary>
    public static async Task<List<AppUser>> MembersWithAsync(
        AtsDbContext db,
        string permission,
        CancellationToken ct
    ) =>
        (
            await db
                .Users.AsNoTracking()
                .Include(x => x.CustomRole)
                .Where(x => x.IsActive)
                .OrderBy(x => x.DisplayName)
                .ToListAsync(ct)
        )
            .Where(x => Of(x).Contains(permission))
            .ToList();

    public static HashSet<string> For(ClaimsPrincipal principal) =>
        principal.FindAll(Claim).Select(x => x.Value).ToHashSet();

    public static bool Has(this ClaimsPrincipal principal, string permission) =>
        principal.HasClaim(Claim, permission);

    // ponytail: kept async with the unused db so callers in other areas didn't change; the session
    // claims are refreshed from the database on every request (ValidateSessionAsync).
    public static Task<bool> HasAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        string permission,
        CancellationToken ct
    ) => Task.FromResult(principal.Has(permission));
}
