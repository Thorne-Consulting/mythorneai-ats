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
    public async Task Hiring_managers_are_scoped_to_their_requisitions()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", cancellationToken);
        var response = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                code = $"OPS-{Guid.NewGuid():N}"[..12],
                title = "Operations analyst",
                department = "Operations",
                location = "Chicago, IL",
                employmentType = "Full time",
                workMode = "Hybrid",
                openings = 1,
                ownerEmail = "another.manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Authorization boundary test",
                targetStartDate = (string?)null,
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var requisitionId = created.GetProperty("id").GetGuid();

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        (
            await manager.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        (
            await recruiter.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Only_an_assigned_interviewer_can_submit_a_locked_scorecard()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates[0].GetProperty("id").GetGuid();
        var candidate = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var application = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var interviewId = application
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .First(item =>
                item.GetProperty("criteria").GetArrayLength() == 0
                && item.GetProperty("scorecards").GetArrayLength() == 0
            )
            .GetProperty("id")
            .GetGuid();

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var managerAttempt = await manager.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 5,
                evidence = "Manager is not assigned to this interview.",
                strengths = "None assessed.",
                concerns = "Not assigned.",
            },
            cancellationToken
        );
        managerAttempt.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var firstSubmission = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Clear technical reasoning with relevant examples.",
                strengths = "Clear reasoning.",
                concerns = "None observed.",
            },
            cancellationToken
        );
        firstSubmission.StatusCode.ShouldBe(HttpStatusCode.Created);

        var secondSubmission = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "No",
                rating = 1,
                evidence = "Attempt to replace locked feedback.",
                strengths = "Already recorded.",
                concerns = "Duplicate submission.",
            },
            cancellationToken
        );
        secondSubmission.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }
}
