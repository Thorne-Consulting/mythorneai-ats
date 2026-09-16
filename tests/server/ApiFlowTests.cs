using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class ApiFlowTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) =>
            {
                configuration.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:AtsDatabase"] = _database.GetConnectionString(),
                    ["Auth:Mode"] = "Development",
                    ["FileStorage:RootPath"] = Path.Combine(Path.GetTempPath(), $"ats-tests-{Guid.NewGuid():N}")
                });
            });
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null) await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    [Fact]
    public async Task Authenticated_hiring_flow_and_role_scope_work()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var anonymous = _factory!.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        (await anonymous.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        var admin = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        (await admin.PostAsJsonAsync("/api/auth/dev-login", new { email = "admin@mythorneai.local" }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await AddAntiforgeryTokenAsync(admin, cancellationToken);

        var candidateResponse = await admin.PostAsJsonAsync("/api/candidates", new
        {
            firstName = "Taylor",
            lastName = "Nguyen",
            email = "taylor.nguyen@example.com",
            phone = "+1 312 555 0100",
            location = "Chicago, IL",
            currentTitle = "Engineer",
            linkedInUrl = (string?)null,
            source = "Test",
            tags = new[] { "integration-test" }
        }, cancellationToken);
        candidateResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var candidate = await candidateResponse.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var candidateId = candidate.GetProperty("id").GetGuid();

        var resume = new MultipartFormDataContent();
        resume.Add(new ByteArrayContent("%PDF-1.4\n%%EOF"u8.ToArray()), "file", "resume.pdf");
        var uploadResponse = await admin.PostAsync($"/api/candidates/{candidateId}/attachments", resume, cancellationToken);
        uploadResponse.StatusCode.ShouldBe(HttpStatusCode.Created);

        var adminCandidates = await admin.GetFromJsonAsync<JsonElement>("/api/candidates", cancellationToken);
        adminCandidates.GetArrayLength().ShouldBe(3);

        var duplicateResponse = await admin.PostAsJsonAsync("/api/candidates", new
        {
            firstName = "Taylor",
            lastName = "Nguyen",
            email = "taylor.nguyen@example.com",
            phone = (string?)null,
            location = (string?)null,
            currentTitle = (string?)null,
            linkedInUrl = (string?)null,
            source = "Test",
            tags = Array.Empty<string>()
        }, cancellationToken);
        duplicateResponse.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var interviewer = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        (await interviewer.PostAsJsonAsync("/api/auth/dev-login", new { email = "interviewer@mythorneai.local" }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>("/api/candidates", cancellationToken);
        candidates.GetArrayLength().ShouldBe(1);
        candidates[0].GetProperty("name").GetString().ShouldBe("Jordan Lee");
        (await interviewer.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        (await admin.PostAsync("/api/auth/logout", null, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("recruiter@mythorneai.local")]
    [InlineData("manager@mythorneai.local")]
    [InlineData("interviewer@mythorneai.local")]
    [InlineData("hr@mythorneai.local")]
    public async Task Non_administrators_cannot_access_administration(string email)
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var client = await LoginAsync(email, cancellationToken);
        (await client.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await client.GetAsync("/api/admin/audit", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Candidate_contact_and_scope_follow_the_signed_in_role()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@mythorneai.local", cancellationToken);
        var assignedCandidates = await interviewer.GetFromJsonAsync<JsonElement>("/api/candidates", cancellationToken);
        assignedCandidates.GetArrayLength().ShouldBe(1);
        var candidateId = assignedCandidates[0].GetProperty("id").GetGuid();

        var restricted = await interviewer.GetFromJsonAsync<JsonElement>($"/api/candidates/{candidateId}", cancellationToken);
        restricted.GetProperty("email").GetString().ShouldBe("Restricted");
        restricted.GetProperty("phone").ValueKind.ShouldBe(JsonValueKind.Null);

        using var manager = await LoginAsync("manager@mythorneai.local", cancellationToken);
        var visible = await manager.GetFromJsonAsync<JsonElement>($"/api/candidates/{candidateId}", cancellationToken);
        visible.GetProperty("email").GetString().ShouldBe("jordan.lee@example.com");
        visible.GetProperty("phone").GetString().ShouldBe("+1 312 555 0142");
    }

    [Fact]
    public async Task Mutations_require_an_antiforgery_token()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@mythorneai.local", cancellationToken, addAntiforgeryToken: false);
        var response = await recruiter.PostAsJsonAsync("/api/candidates", new
        {
            firstName = "Casey",
            lastName = "NoToken",
            email = "casey.no-token@example.com",
            phone = (string?)null,
            location = (string?)null,
            currentTitle = (string?)null,
            linkedInUrl = (string?)null,
            source = "Test",
            tags = Array.Empty<string>()
        }, cancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Role_and_account_changes_apply_to_an_existing_session()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        const string email = "temporary.interviewer@mythorneai.local";
        using var admin = await LoginAsync("admin@mythorneai.local", cancellationToken);

        (await admin.PostAsJsonAsync("/api/admin/users", new
        {
            email,
            displayName = "Temporary Interviewer",
            role = "Interviewer",
            department = "Engineering",
            isActive = true
        }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var temporaryUser = await LoginAsync(email, cancellationToken);
        var initial = await temporaryUser.GetFromJsonAsync<JsonElement>("/api/auth/me", cancellationToken);
        initial.GetProperty("role").GetString().ShouldBe("Interviewer");

        (await admin.PostAsJsonAsync("/api/admin/users", new
        {
            email,
            displayName = "Temporary HR",
            role = "Hr",
            department = "People",
            isActive = true
        }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var updated = await temporaryUser.GetFromJsonAsync<JsonElement>("/api/auth/me", cancellationToken);
        updated.GetProperty("role").GetString().ShouldBe("Hr");
        updated.GetProperty("displayName").GetString().ShouldBe("Temporary HR");

        (await admin.PostAsJsonAsync("/api/admin/users", new
        {
            email,
            displayName = "Temporary HR",
            role = "Hr",
            department = "People",
            isActive = false
        }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await temporaryUser.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Hiring_managers_are_scoped_to_their_requisitions()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@mythorneai.local", cancellationToken);
        var response = await admin.PostAsJsonAsync("/api/requisitions", new
        {
            code = $"OPS-{Guid.NewGuid():N}"[..12],
            title = "Operations analyst",
            department = "Operations",
            location = "Chicago, IL",
            employmentType = "Full time",
            workMode = "Hybrid",
            openings = 1,
            ownerEmail = "another.manager@mythorneai.local",
            recruiterEmail = "recruiter@mythorneai.local",
            description = "Authorization boundary test",
            targetStartDate = (string?)null
        }, cancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var requisitionId = created.GetProperty("id").GetGuid();

        using var manager = await LoginAsync("manager@mythorneai.local", cancellationToken);
        (await manager.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var recruiter = await LoginAsync("recruiter@mythorneai.local", cancellationToken);
        (await recruiter.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Only_an_assigned_interviewer_can_submit_a_locked_scorecard()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@mythorneai.local", cancellationToken);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>("/api/candidates", cancellationToken);
        var candidateId = candidates[0].GetProperty("id").GetGuid();
        var candidate = await interviewer.GetFromJsonAsync<JsonElement>($"/api/candidates/{candidateId}", cancellationToken);
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var application = await interviewer.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", cancellationToken);
        var interviewId = application.GetProperty("application").GetProperty("interviews")[0].GetProperty("id").GetGuid();

        using var manager = await LoginAsync("manager@mythorneai.local", cancellationToken);
        var managerAttempt = await manager.PostAsJsonAsync($"/api/interviews/{interviewId}/scorecards", new
        {
            recommendation = "Yes",
            rating = 5,
            evidence = "Manager is not assigned to this interview."
        }, cancellationToken);
        managerAttempt.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var firstSubmission = await interviewer.PostAsJsonAsync($"/api/interviews/{interviewId}/scorecards", new
        {
            recommendation = "Yes",
            rating = 4,
            evidence = "Clear technical reasoning with relevant examples."
        }, cancellationToken);
        firstSubmission.StatusCode.ShouldBe(HttpStatusCode.Created);

        var secondSubmission = await interviewer.PostAsJsonAsync($"/api/interviews/{interviewId}/scorecards", new
        {
            recommendation = "No",
            rating = 1,
            evidence = "Attempt to replace locked feedback."
        }, cancellationToken);
        secondSubmission.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    private async Task<HttpClient> LoginAsync(string email, CancellationToken cancellationToken, bool addAntiforgeryToken = true)
    {
        var client = _factory!.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        (await client.PostAsJsonAsync("/api/auth/dev-login", new { email }, cancellationToken)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        if (addAntiforgeryToken) await AddAntiforgeryTokenAsync(client, cancellationToken);
        return client;
    }

    private static async Task AddAntiforgeryTokenAsync(HttpClient client, CancellationToken cancellationToken)
    {
        var payload = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", cancellationToken);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.GetProperty("token").GetString());
    }
}
