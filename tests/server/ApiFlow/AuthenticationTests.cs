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
    public async Task Authenticated_hiring_flow_and_role_scope_work()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var anonymous = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }
        );
        (await anonymous.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );

        var admin = _factory.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await admin.PostAsJsonAsync(
                "/api/auth/dev-login",
                new { email = "admin@example.test" },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await AddAntiforgeryTokenAsync(admin, cancellationToken);

        var candidateResponse = await admin.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Taylor",
                lastName = "Nguyen",
                email = "taylor.nguyen@example.com",
                phone = "+1 312 555 0100",
                location = "Chicago, IL",
                currentTitle = "Engineer",
                linkedInUrl = (string?)null,
                source = "Test",
                tags = new[] { "integration-test" },
            },
            cancellationToken
        );
        candidateResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var candidate = await candidateResponse.Content.ReadFromJsonAsync<JsonElement>(
            cancellationToken
        );
        var candidateId = candidate.GetProperty("id").GetGuid();

        var resume = new MultipartFormDataContent();
        resume.Add(new ByteArrayContent("%PDF-1.4\n%%EOF"u8.ToArray()), "file", "resume.pdf");
        var uploadResponse = await admin.PostAsync(
            $"/api/candidates/{candidateId}/attachments",
            resume,
            cancellationToken
        );
        uploadResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var attachmentId = (
            await uploadResponse.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)
        )
            .GetProperty("id")
            .GetGuid();
        var previewResponse = await admin.GetAsync(
            $"/api/attachments/{attachmentId}?inline=true",
            cancellationToken
        );
        previewResponse.StatusCode.ShouldBe(HttpStatusCode.OK);
        previewResponse.Content.Headers.ContentType!.MediaType.ShouldBe("application/pdf");
        previewResponse.Content.Headers.ContentDisposition.ShouldBeNull();
        previewResponse.Headers.GetValues("X-Frame-Options").Single().ShouldBe("SAMEORIGIN");

        var adminCandidates = await admin.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var adminCandidateIds = adminCandidates
            .EnumerateArray()
            .Select(item => item.GetProperty("id").GetGuid())
            .ToList();
        adminCandidateIds.ShouldContain(candidateId);

        var duplicateResponse = await admin.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Taylor",
                lastName = "Nguyen",
                email = "taylor.nguyen@example.com",
                phone = (string?)null,
                location = (string?)null,
                currentTitle = (string?)null,
                linkedInUrl = (string?)null,
                source = "Test",
                tags = Array.Empty<string>(),
            },
            cancellationToken
        );
        duplicateResponse.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var interviewer = _factory.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await interviewer.PostAsJsonAsync(
                "/api/auth/dev-login",
                new { email = "interviewer@example.test" },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        candidates.GetArrayLength().ShouldBe(1);
        candidates[0].GetProperty("name").GetString().ShouldBe("Jordan Lee");
        // An admin sees the whole workspace; an interviewer only sees who they interview.
        adminCandidateIds.Count.ShouldBeGreaterThan(candidates.GetArrayLength());
        (await interviewer.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );

        var integrationStatus = await admin.GetFromJsonAsync<JsonElement>(
            "/api/admin/integrations",
            cancellationToken
        );
        integrationStatus.GetProperty("provider").GetString().ShouldBe("None");
        integrationStatus.GetProperty("enabled").GetBoolean().ShouldBeFalse();
        (
            await admin.PostAsync("/api/admin/integrations/retry-failed", null, cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        (await admin.PostAsync("/api/auth/logout", null, cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await admin.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );
    }

    [Theory]
    [InlineData("recruiter@example.test")]
    [InlineData("manager@example.test")]
    [InlineData("interviewer@example.test")]
    public async Task Non_administrators_cannot_access_administration(string email)
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var client = await LoginAsync(email, cancellationToken);
        (await client.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await client.GetAsync("/api/admin/audit", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await client.GetAsync("/api/admin/integrations", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }
}
