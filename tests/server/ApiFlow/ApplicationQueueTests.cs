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
    public async Task Applicant_queue_filters_and_bulk_rejection_work()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var application = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var currentStageId = application
            .GetProperty("application")
            .GetProperty("stageId")
            .GetGuid();

        var filtered = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/applications?search=Jordan&tag=react&page=1&pageSize=10",
            cancellationToken
        );
        filtered.GetProperty("total").GetInt32().ShouldBe(1);
        filtered.GetProperty("items")[0].GetProperty("id").GetGuid().ShouldBe(applicationId);

        var response = await recruiter.PatchAsJsonAsync(
            "/api/applications/bulk-stage",
            new
            {
                applicationIds = new[] { applicationId },
                stageId = currentStageId,
                status = "Rejected",
                dispositionReason = "Does not meet the required experience",
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        result.GetProperty("updated").GetInt32().ShouldBe(1);

        var rejected = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/applications?status=Rejected&page=1&pageSize=10",
            cancellationToken
        );
        rejected
            .GetProperty("items")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("id").GetGuid() == applicationId);
    }
}
