using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Candidate_contact_and_scope_follow_the_signed_in_role()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var assignedCandidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        assignedCandidates.GetArrayLength().ShouldBe(1);
        var candidateId = assignedCandidates[0].GetProperty("id").GetGuid();

        var restricted = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        restricted.GetProperty("email").GetString().ShouldBe("Restricted");
        restricted.GetProperty("phone").ValueKind.ShouldBe(JsonValueKind.Null);

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var visible = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        visible.GetProperty("email").GetString().ShouldBe("jordan.lee@example.com");
        visible.GetProperty("phone").GetString().ShouldBe("+1 312 555 0142");
    }

    [Fact]
    public async Task Mutations_require_an_antiforgery_token()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync(
            "recruiter@example.test",
            cancellationToken,
            addAntiforgeryToken: false
        );
        var response = await recruiter.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Casey",
                lastName = "NoToken",
                email = "casey.no-token@example.com",
                phone = (string?)null,
                location = (string?)null,
                currentTitle = (string?)null,
                linkedInUrl = (string?)null,
                source = "Test",
                tags = Array.Empty<string>(),
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Role_and_account_changes_apply_to_an_existing_session()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        const string email = "temporary.interviewer@example.test";
        using var admin = await LoginAsync("admin@example.test", cancellationToken);

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Interviewer",
                    role = "Interviewer",
                    department = "Engineering",
                    isActive = true,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var temporaryUser = await LoginAsync(email, cancellationToken);
        var initial = await temporaryUser.GetFromJsonAsync<JsonElement>(
            "/api/auth/me",
            cancellationToken
        );
        initial.GetProperty("role").GetString().ShouldBe("Interviewer");

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Recruiter",
                    role = "Recruiter",
                    department = "Sales",
                    isActive = true,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        var updated = await temporaryUser.GetFromJsonAsync<JsonElement>(
            "/api/auth/me",
            cancellationToken
        );
        updated.GetProperty("role").GetString().ShouldBe("Recruiter");
        updated.GetProperty("displayName").GetString().ShouldBe("Temporary Recruiter");

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Recruiter",
                    role = "Recruiter",
                    department = "Sales",
                    isActive = false,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await temporaryUser.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );
    }
}
