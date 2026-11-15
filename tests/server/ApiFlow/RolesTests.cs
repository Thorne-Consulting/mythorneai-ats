using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using MyThorneAI.Ats.Api.Auth;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Custom roles: every capability is enforced by the API, assignment, and the lock-out guards.
public sealed partial class ApiFlowTests
{
    private static async Task<string> CreateRoleAsync(
        HttpClient admin,
        string name,
        string[] permissions,
        CancellationToken ct
    )
    {
        var response = await admin.PostAsJsonAsync(
            "/api/admin/roles",
            new { name, permissions },
            ct
        );
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("key")
            .GetString()!;
    }

    private static async Task<Guid> MemberIdAsync(
        HttpClient admin,
        string email,
        CancellationToken ct
    ) =>
        (await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct))!
            .Single(x => x.GetProperty("email").GetString() == email)
            .GetProperty("id")
            .GetGuid();

    [Fact]
    public async Task Each_capability_of_a_custom_role_is_enforced_by_the_api()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var key = await CreateRoleAsync(admin, "Probe", [], ct);
        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email = "probe@example.test",
                    displayName = "Pat Probe",
                    role = key,
                    isActive = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var probe = await LoginAsync("probe@example.test", ct);

        // The person isn't on this job, so only "every open job" lets them see it.
        var job = (
            await admin.GetFromJsonAsync<JsonElement[]>("/api/requisitions?status=Open", ct)
        )!.First(x => !x.TryGetProperty("isConfidential", out var c) || !c.GetBoolean());
        var jobId = job.GetProperty("id").GetGuid();

        async Task Set(params string[] permissions) =>
            (
                await admin.PutAsJsonAsync(
                    $"/api/admin/roles/{key}",
                    new { name = "Probe", permissions },
                    ct
                )
            ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        async Task<HttpStatusCode> Status(Task<HttpResponseMessage> request) =>
            (await request).StatusCode;

        // Capability, what it needs, and an endpoint that only it opens.
        var checks = new (string Permission, string[] Needs, Func<Task<HttpStatusCode>> Check)[]
        {
            (Permissions.Workspace, [], () => Status(probe.GetAsync("/api/admin/users", ct))),
            (Permissions.Jobs, [], () => Status(probe.GetAsync("/api/inbox/counts", ct))),
            (
                Permissions.AllJobs,
                [Permissions.Jobs],
                () => Status(probe.GetAsync($"/api/requisitions/{jobId}", ct))
            ),
            (
                Permissions.Candidates,
                [Permissions.Jobs],
                () => Status(probe.GetAsync("/api/talent-pools", ct))
            ),
            (
                Permissions.Import,
                [Permissions.Jobs, Permissions.Candidates],
                // No file: allowed comes back as "choose a spreadsheet", refused as 403.
                () =>
                    Status(
                        probe.PostAsync(
                            "/api/candidates/imports?dryRun=true",
                            new MultipartFormDataContent(),
                            ct
                        )
                    )
            ),
            (Permissions.Reports, [], () => Status(probe.GetAsync("/api/reports/funnel", ct))),
            (
                Permissions.Templates,
                [Permissions.Jobs],
                () =>
                    Status(
                        probe.PostAsJsonAsync(
                            "/api/templates",
                            new
                            {
                                name = "",
                                subject = "",
                                body = "",
                                shared = true,
                            },
                            ct
                        )
                    )
            ),
        };
        foreach (var (permission, needs, check) in checks)
        {
            await Set([.. needs, permission]);
            (await check()).ShouldNotBeOneOf(
                [HttpStatusCode.Forbidden, HttpStatusCode.NotFound],
                $"{permission} should open it"
            );
            await Set(needs);
            (await check()).ShouldBeOneOf(
                [HttpStatusCode.Forbidden, HttpStatusCode.NotFound],
                $"{permission} should be needed"
            );
        }

        // What the web app reads: the role's name and rules, never a separate permissions list.
        await Set(Permissions.Jobs, Permissions.Reports);
        var me = await probe.GetFromJsonAsync<JsonElement>("/api/auth/me", ct);
        me.TryGetProperty("permissions", out _).ShouldBeFalse();
        me.GetProperty("roleName").GetString().ShouldBe("Probe");
        me.GetProperty("role").GetString().ShouldBe("HiringManager");
        var rules = me.GetProperty("rules")
            .EnumerateArray()
            .Select(x =>
                $"{x.GetProperty("action").GetString()} {x.GetProperty("subject").GetString()}"
            )
            .ToList();
        rules.ShouldContain("read Report");
        rules.ShouldContain("send Message");
        rules.ShouldNotContain("create Candidate");
    }

    [Fact]
    public async Task Custom_roles_are_assigned_and_cannot_lock_the_workspace_out()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);

        // Names are unique, built-in ones included; "manage the workspace" turns on everything.
        (
            await admin.PostAsJsonAsync(
                "/api/admin/roles",
                new { name = "recruiter", permissions = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var key = await CreateRoleAsync(admin, "Workspace admin", [Permissions.Workspace], ct);
        var listed = (await admin.GetFromJsonAsync<JsonElement>("/api/admin/roles", ct))
            .GetProperty("roles")
            .EnumerateArray()
            .ToList();
        listed.Count(x => x.GetProperty("builtIn").GetBoolean()).ShouldBe(4);
        var role = listed.Single(x => x.GetProperty("key").GetString() == key);
        role.GetProperty("kind").GetString().ShouldBe("Admin");
        role.GetProperty("permissions").GetArrayLength().ShouldBe(Permissions.All.Length);

        // A second admin moves the owner into the custom role: still an admin, so it's allowed.
        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email = "second.admin@example.test",
                    displayName = "Second Admin",
                    role = "Admin",
                    isActive = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var second = await LoginAsync("second.admin@example.test", ct);
        var owner = await MemberIdAsync(admin, "admin@example.test", ct);
        (
            await second.PatchAsJsonAsync(
                "/api/admin/users",
                new { ids = new[] { owner }, role = key },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var me = await admin.GetFromJsonAsync<JsonElement>("/api/auth/me", ct);
        me.GetProperty("roleName").GetString().ShouldBe("Workspace admin");
        me.GetProperty("rules")[0].GetProperty("action").GetString().ShouldBe("manage");

        // Taking "manage the workspace" from the owner's role, or deleting it, is refused.
        var demote = await second.PutAsJsonAsync(
            $"/api/admin/roles/{key}",
            new { name = "Workspace admin", permissions = new[] { Permissions.Jobs } },
            ct
        );
        demote.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await demote.Content.ReadAsStringAsync(ct)).ShouldContain("owner");
        (
            await second.DeleteAsync($"/api/admin/roles/{key}?moveTo=Recruiter", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        // Nor from your own role.
        var own = await admin.PutAsJsonAsync(
            $"/api/admin/roles/{key}",
            new { name = "Workspace admin", permissions = new[] { Permissions.Jobs } },
            ct
        );
        own.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await own.Content.ReadAsStringAsync(ct)).ShouldContain("your own role");

        // Back to the built-in role, then a recruiter gets the custom one and with it the settings.
        (
            await second.PatchAsJsonAsync(
                "/api/admin/users",
                new { ids = new[] { owner }, role = "Admin" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var recruiterId = await MemberIdAsync(admin, "recruiter@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (await recruiter.GetAsync("/api/admin/users", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (
            await admin.PatchAsJsonAsync(
                "/api/admin/users",
                new { ids = new[] { recruiterId }, role = key },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetAsync("/api/admin/users", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        var row = (await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct))!.Single(x =>
            x.GetProperty("id").GetGuid() == recruiterId
        );
        row.GetProperty("roleKey").GetString().ShouldBe(key);
        row.GetProperty("roleName").GetString().ShouldBe("Workspace admin");

        // Deleting a role with people on it needs a new role for them.
        (await admin.DeleteAsync($"/api/admin/roles/{key}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.BadRequest
        );
        (
            await admin.DeleteAsync($"/api/admin/roles/{key}?moveTo=Recruiter", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetAsync("/api/admin/users", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct))!
            .Single(x => x.GetProperty("id").GetGuid() == recruiterId)
            .GetProperty("roleKey")
            .GetString()
            .ShouldBe("Recruiter");
    }
}
