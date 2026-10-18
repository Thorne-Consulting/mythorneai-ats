using System.Net.Http.Json;
using System.Text.Json;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Candidate_list_has_one_row_per_person_and_filters_by_job_and_stage()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);

        var found = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?search=Jordan%20Lee",
            cancellationToken
        );
        found.GetProperty("total").GetInt32().ShouldBe(1);
        var jordan = found.GetProperty("items")[0];
        var jordanId = jordan.GetProperty("id").GetGuid();
        var application = jordan.GetProperty("applications")[0];
        var jobId = application.GetProperty("requisitionId").GetGuid();
        var stageId = application.GetProperty("stageId").GetGuid();
        application.GetProperty("requisitionTitle").GetString().ShouldNotBeNullOrWhiteSpace();
        application.GetProperty("stage").GetString().ShouldNotBeNullOrWhiteSpace();

        // Application filters narrow to the people with an application in that job and stage.
        var inStage = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates?requisitionId={jobId}&stageId={stageId}&pageSize=100",
            cancellationToken
        );
        var inStageIds = inStage.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToList();
        inStageIds.ShouldContain(jordanId);
        inStageIds.Count.ShouldBe(inStageIds.Distinct().Count());

        // The same stage id on another job matches nobody.
        var otherJob = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates?requisitionId={Guid.NewGuid()}&stageId={stageId}&pageSize=100",
            cancellationToken
        );
        otherJob.GetProperty("total").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task Candidate_list_shows_people_without_applications_only_to_hiring_staff()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        const string sampleSource = "/api/candidates?source=Career%20center%20sample&pageSize=100";

        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var forRecruiter = await recruiter.GetFromJsonAsync<JsonElement>(sampleSource, cancellationToken);
        forRecruiter.GetProperty("total").GetInt32().ShouldBeGreaterThan(0);
        forRecruiter.GetProperty("items")[0].GetProperty("applications").GetArrayLength().ShouldBe(0);

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var forManager = await manager.GetFromJsonAsync<JsonElement>(sampleSource, cancellationToken);
        forManager.GetProperty("total").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task Candidate_list_pages_without_repeating_people()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);

        var first = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?sort=name&page=1&pageSize=10",
            cancellationToken
        );
        var second = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?sort=name&page=2&pageSize=10",
            cancellationToken
        );
        first.GetProperty("total").GetInt32().ShouldBeGreaterThan(10);
        first.GetProperty("items").GetArrayLength().ShouldBe(10);
        var firstIds = first.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid());
        var secondIds = second.GetProperty("items").EnumerateArray().Select(x => x.GetProperty("id").GetGuid());
        firstIds.Intersect(secondIds).ShouldBeEmpty();
    }
}
