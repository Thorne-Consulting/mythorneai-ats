using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Permission rules on /api/auth/me, team (department) scope, preferences and the endpoint guard.
public sealed partial class ApiFlowTests
{
    private async Task<Guid> CreateJobAsync(
        HttpClient admin,
        string department,
        string owner,
        CancellationToken ct,
        string recruiter = "dana.recruiter@example.test"
    )
    {
        var response = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                code = $"T-{Guid.NewGuid():N}"[..12],
                title = $"{department} lead",
                department,
                location = "Remote",
                employmentType = "Full time",
                workMode = "Remote",
                openings = 1,
                ownerEmail = owner,
                recruiterEmail = recruiter,
                description = "Team scope test",
                targetStartDate = (string?)null,
            },
            ct
        );
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
    }

    [Fact]
    public async Task Teams_limit_recruiters_and_widen_what_hiring_managers_see()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var operations = await CreateJobAsync(
            admin,
            "Operations",
            "priya.manager@example.test",
            ct
        );
        var engineering = await CreateJobAsync(
            admin,
            "Engineering",
            "priya.manager@example.test",
            ct
        );
        var users = await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct);
        Guid Id(string email) =>
            users!
                .Single(x => x.GetProperty("email").GetString() == email)
                .GetProperty("id")
                .GetGuid();

        // A recruiter with no teams sees every open job.
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (await recruiter.GetAsync($"/api/requisitions/{operations}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );

        // Given the Engineering team, the same session now sees only Engineering jobs.
        (
            await admin.PatchAsJsonAsync(
                "/api/admin/users",
                new
                {
                    ids = new[] { Id("recruiter@example.test") },
                    departments = new[] { "Engineering" },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetAsync($"/api/requisitions/{operations}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );
        (await recruiter.GetAsync($"/api/requisitions/{engineering}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        var list = await recruiter.GetFromJsonAsync<JsonElement[]>("/api/requisitions", ct);
        list!.ShouldNotContain(x => x.GetProperty("id").GetGuid() == operations);

        // The rules the web app reads say the same.
        var me = await recruiter.GetFromJsonAsync<JsonElement>("/api/auth/me", ct);
        me.GetProperty("departments")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe(["Engineering"]);
        me.GetProperty("rules")
            .EnumerateArray()
            .Any(rule =>
                rule.GetProperty("action").GetString() == "update"
                && rule.GetProperty("subject").GetString() == "Job"
                && rule.TryGetProperty("conditions", out var c)
                && c.TryGetProperty("department", out _)
            )
            .ShouldBeTrue();

        // A hiring manager in Engineering (seeded) sees that team's open jobs, but only changes their own.
        using var manager = await LoginAsync("manager@example.test", ct);
        (await manager.GetAsync($"/api/requisitions/{engineering}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        (await manager.GetAsync($"/api/requisitions/{operations}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );
        var managerRules = (await manager.GetFromJsonAsync<JsonElement>("/api/auth/me", ct))
            .GetProperty("rules")
            .EnumerateArray()
            .Where(x =>
                x.GetProperty("action").GetString() == "update"
                && x.GetProperty("subject").GetString() == "Job"
            )
            .Select(x => x.GetProperty("conditions").GetRawText())
            .ToList();
        managerRules.ShouldNotContain(x => x.Contains("department"));
    }

    [Fact]
    public async Task A_second_recruiter_on_the_team_manages_the_job_and_a_viewer_only_sees_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var job = await CreateJobAsync(
            admin,
            "Finance",
            "priya.manager@example.test",
            ct,
            recruiter: "recruiter@example.test"
        );
        // Confidential, so only the team gets in: the open-job rule for recruiters doesn't apply.
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{job}/settings",
                new
                {
                    isConfidential = true,
                    viewerEmails = Array.Empty<string>(),
                    allowCandidateReschedule = true,
                    allowCandidateWithdraw = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var users = await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct);
        Guid Id(string email) =>
            users!
                .Single(x => x.GetProperty("email").GetString() == email)
                .GetProperty("id")
                .GetGuid();
        async Task Team(string danaRole) =>
            (
                await admin.PutAsJsonAsync(
                    $"/api/requisitions/{job}/members",
                    new
                    {
                        members = new object[]
                        {
                            new
                            {
                                userId = Id("priya.manager@example.test"),
                                role = "HiringManager",
                            },
                            new { userId = Id("recruiter@example.test"), role = "Recruiter" },
                            new { userId = Id("dana.recruiter@example.test"), role = danaRole },
                        },
                    },
                    ct
                )
            ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        object Settings() =>
            new
            {
                isConfidential = true,
                viewerEmails = Array.Empty<string>(),
                allowCandidateReschedule = false,
                allowCandidateWithdraw = true,
            };

        // Dana is the second recruiter: the email mirrors only name the first, members name both.
        await Team("Recruiter");
        using var dana = await LoginAsync("dana.recruiter@example.test", ct);
        (await dana.GetAsync($"/api/requisitions/{job}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        (await dana.GetFromJsonAsync<JsonElement>($"/api/requisitions/{job}/interview-kits", ct))
            .GetProperty("canManage")
            .GetBoolean()
            .ShouldBeTrue();
        (
            await dana.PutAsJsonAsync($"/api/requisitions/{job}/settings", Settings(), ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // As a viewer she still sees the job, but can't change it.
        await Team("Viewer");
        (await dana.GetAsync($"/api/requisitions/{job}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        (
            await dana.PutAsJsonAsync($"/api/requisitions/{job}/settings", Settings(), ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Preferences_and_profile_are_saved_with_the_account()
    {
        var ct = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("tomas.interviewer@example.test", ct);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me/preferences",
                new { theme = "dark", dateFormat = "iso" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me/preferences",
                new { startPage = "/interviews" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await interviewer.PutAsJsonAsync("/api/me/preferences", new { theme = "purple" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me/preferences",
                new { startPage = "//evil.com" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me",
                new { displayName = "Tomas N.", avatarTone = "violet" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var me = await interviewer.GetFromJsonAsync<JsonElement>("/api/auth/me", ct);
        var prefs = me.GetProperty("preferences");
        prefs.GetProperty("theme").GetString().ShouldBe("dark");
        prefs.GetProperty("dateFormat").GetString().ShouldBe("iso");
        prefs.GetProperty("startPage").GetString().ShouldBe("/interviews");
        me.GetProperty("displayName").GetString().ShouldBe("Tomas N.");
        me.GetProperty("avatarTone").GetString().ShouldBe("violet");
        // Interviewers get no job rules, so the web app hides Jobs.
        me.GetProperty("rules")
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("subject").GetString() == "Job");
    }

    [Fact]
    public async Task Single_sign_on_status_says_how_people_sign_in()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var status = await admin.GetFromJsonAsync<JsonElement>("/api/admin/sso", ct);
        status.GetProperty("authMode").GetString().ShouldBe("Development");
        status.GetProperty("linked").GetBoolean().ShouldBeFalse();
        // No WorkOS in development: the hosted set-up can't open, and says why.
        var link = await admin.PostAsJsonAsync(
            "/api/admin/sso/portal-link",
            new { intent = "sso" },
            ct
        );
        link.StatusCode.ShouldBe(HttpStatusCode.Conflict, await link.Content.ReadAsStringAsync(ct));
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (await recruiter.GetAsync("/api/admin/sso", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    // Public on purpose: candidates, sign-in, health and docs. Anything else must name who may call it.
    private static readonly string[] PublicRoutes =
    [
        "/public/",
        "/auth/login",
        "/auth/callback",
        "/auth/access-request",
        "/auth/calendar/callback",
        "/health",
        "/openapi/",
        "/docs",
        // The candidate portal connects with its own session token, checked when it connects.
        "/api/hubs/inbox",
        // Development sign-in only exists when Auth:Mode is Development.
        "/api/auth/dev-users",
        "/api/auth/dev-login",
    ];

    [Fact]
    public async Task Every_endpoint_has_an_authorization_rule()
    {
        var ct = TestContext.Current.CancellationToken;
        using var client = _factory!.CreateClient(); // starts the app, so every route is mapped
        (await client.GetAsync("/health", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        var endpoints = _factory
            .Services.GetRequiredService<EndpointDataSource>()
            .Endpoints.OfType<RouteEndpoint>()
            .Select(x => new
            {
                Route = "/" + (x.RoutePattern.RawText ?? "").TrimStart('/'),
                Methods = string.Join(
                    ",",
                    x.Metadata.GetMetadata<IHttpMethodMetadata>()?.HttpMethods ?? ["ANY"]
                ),
                Policies = x
                    .Metadata.GetOrderedMetadata<IAuthorizeData>()
                    .Select(a => a.Policy ?? a.Roles ?? "signed-in")
                    .ToArray(),
                Anonymous = x.Metadata.GetMetadata<IAllowAnonymous>() is not null,
            })
            .ToList();
        endpoints.Count.ShouldBeGreaterThan(100);

        bool IsPublic(string route) =>
            PublicRoutes.Any(p => route.StartsWith(p.TrimEnd('/'), StringComparison.Ordinal));

        var unguarded = endpoints
            .Where(x => !IsPublic(x.Route) && (x.Policies.Length == 0 || x.Anonymous))
            .Select(x => $"{x.Methods} {x.Route}")
            .ToList();
        unguarded.ShouldBeEmpty(
            "Every endpoint needs RequireAuthorization (or a place on the public list in this test)."
        );

        // Workspace settings are for admins only.
        var openAdmin = endpoints
            .Where(x =>
                x.Route.StartsWith("/api/admin/") && !x.Policies.Contains(AtsPolicies.Admin)
            )
            .Select(x => $"{x.Methods} {x.Route}")
            .ToList();
        openAdmin.ShouldBeEmpty("Routes under /api/admin need the admin policy.");

        // Every policy is one role capability (or just signed in), so custom roles decide all of them.
        string[] known =
        [
            AtsPolicies.Read,
            AtsPolicies.SubmitScorecard,
            AtsPolicies.ManageHiring,
            AtsPolicies.ManageCandidates,
            AtsPolicies.Admin,
            "signed-in",
        ];
        endpoints
            .SelectMany(x => x.Policies)
            .Distinct()
            .Where(x => !known.Contains(x))
            .ShouldBeEmpty("Guard endpoints with a capability policy, not a list of roles.");
        var authorization = _factory.Services.GetRequiredService<IAuthorizationService>();
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        async Task<bool> Allows(string policy, params string[] permissions)
        {
            var user = new AppUser
            {
                Email = "probe@example.test",
                DisplayName = "Probe",
                CustomRoleId = Guid.NewGuid(),
                CustomRole = new CustomRole { Name = "Probe", Permissions = permissions },
            };
            var principal = await AuthExtensions.CreatePrincipalAsync(db, user, "test");
            return (await authorization.AuthorizeAsync(principal, policy)).Succeeded;
        }
        var allButWorkspace = Permissions.All.Except([Permissions.Workspace]).ToArray();
        (await Allows(AtsPolicies.Admin, Permissions.Workspace)).ShouldBeTrue();
        (await Allows(AtsPolicies.Admin, allButWorkspace)).ShouldBeFalse();
        (await Allows(AtsPolicies.ManageHiring, Permissions.Jobs)).ShouldBeTrue();
        (await Allows(AtsPolicies.ManageHiring, Permissions.Reports)).ShouldBeFalse();
        (
            await Allows(AtsPolicies.ManageCandidates, Permissions.Jobs, Permissions.Candidates)
        ).ShouldBeTrue();
        (
            await Allows(
                AtsPolicies.ManageCandidates,
                allButWorkspace.Except([Permissions.Candidates, Permissions.Import]).ToArray()
            )
        ).ShouldBeFalse();
        (await Allows(AtsPolicies.Read)).ShouldBeTrue();
        (await Allows(AtsPolicies.SubmitScorecard)).ShouldBeTrue();
    }
}
