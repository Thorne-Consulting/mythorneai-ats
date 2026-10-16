using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    // The matching eval: for each job, the seed resume that obviously fits best must rank first.
    // It needs a real OpenAI key (so it skips in CI); run it whenever the prompts, the scoring
    // or the embedding model change and look at whether the order held.
    [Theory]
    [InlineData("Platform engineer", "Elliot Shaw", "Python, Go or .NET services", "Operating production infrastructure")]
    [InlineData("Product designer", "Ada Whitfield", "Product design portfolio", "Prototyping and user research")]
    [InlineData("Senior product engineer", "Maya Fernandez", "React and TypeScript", "Building production web applications")]
    public async Task Ranking_puts_the_obvious_best_resume_first(string job, string expectedFirst, string required1, string required2)
    {
        var ct = TestContext.Current.CancellationToken;
        if (!_factory!.Services.GetRequiredService<IAiAssistant>().IsConfigured)
            Assert.Skip("Needs OPENAI_API_KEY; the matching eval only runs with a real model.");
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jobs = await recruiter.GetFromJsonAsync<JsonElement>("/api/requisitions", ct);
        var jobId = jobs.EnumerateArray().Single(x => x.GetProperty("title").GetString() == job).GetProperty("id").GetGuid();
        (await recruiter.PutAsJsonAsync($"/api/requisitions/{jobId}/requirements", new { required = new[] { required1, required2 }, preferred = Array.Empty<string>(), minYears = (decimal?)null, location = "" }, ct)).EnsureSuccessStatusCode();

        // The embedding worker sweeps every few seconds; wait until the job and the resumes are indexed.
        JsonElement result = default;
        for (var attempt = 0; attempt < 30; attempt++)
        {
            result = await (await recruiter.PostAsJsonAsync("/api/talent/rank", new { requisitionId = jobId, page = 1, pageSize = 10 }, ct)).Content.ReadFromJsonAsync<JsonElement>(ct);
            if (result.GetProperty("semantic").GetBoolean() && result.GetProperty("pending").GetInt32() == 0) break;
            await Task.Delay(2000, ct);
        }
        result.GetProperty("semantic").GetBoolean().ShouldBeTrue("embeddings never became available");
        result.GetProperty("items")[0].GetProperty("name").GetString().ShouldBe(expectedFirst);
    }
}
