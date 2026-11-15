using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    // An open seeded job that has active candidates.
    private static async Task<JsonElement> OpenJobWithCandidatesAsync(
        HttpClient client,
        CancellationToken ct
    ) =>
        (await client.GetFromJsonAsync<JsonElement>("/api/requisitions", ct))
            .EnumerateArray()
            .First(x =>
                x.GetProperty("status").GetString() == "Open"
                && x.GetProperty("activeApplications").GetInt32() > 0
            );

    [Fact]
    public async Task Closing_a_job_needs_a_reason_and_can_reject_its_active_candidates()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var listed = await OpenJobWithCandidatesAsync(admin, ct);
        var jobId = listed.GetProperty("id").GetGuid();
        var active = listed.GetProperty("activeApplications").GetInt32();
        listed.GetProperty("openedAt").ValueKind.ShouldBe(JsonValueKind.String);
        listed
            .GetProperty("stages")
            .EnumerateArray()
            .Sum(x => x.GetProperty("count").GetInt32())
            .ShouldBe(active);

        (
            await admin.PatchAsJsonAsync(
                $"/api/requisitions/{jobId}/status",
                new { status = "Closed" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        // Rejecting candidates only makes sense when the job stops hiring.
        (
            await admin.PatchAsJsonAsync(
                $"/api/requisitions/{jobId}/status",
                new
                {
                    status = "OnHold",
                    reason = "Budget under review",
                    rejectActive = new { reason = "Position closed", sendEmail = false },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var closed = await admin.PatchAsJsonAsync(
            $"/api/requisitions/{jobId}/status",
            new
            {
                status = "Closed",
                reason = "Budget removed",
                rejectActive = new { reason = "Position closed", sendEmail = true },
            },
            ct
        );
        closed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await closed.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("rejected")
            .GetInt32()
            .ShouldBe(active);

        var job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct);
        job.GetProperty("statusReason").GetString().ShouldBe("Budget removed");
        job.GetProperty("closedAt").ValueKind.ShouldBe(JsonValueKind.String);
        job.GetProperty("stages")
            .EnumerateArray()
            .Sum(x => x.GetProperty("count").GetInt32())
            .ShouldBe(0);

        var history = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{jobId}/status-history",
            ct
        );
        var last = history[0];
        last.GetProperty("from").GetString().ShouldBe("Open");
        last.GetProperty("to").GetString().ShouldBe("Closed");
        last.GetProperty("reason").GetString().ShouldBe("Budget removed");
        last.GetProperty("rejected").GetInt32().ShouldBe(active);
        last.GetProperty("actorEmail").GetString().ShouldBe("admin@example.test");

        // Reopening clears the reason and the close date.
        (
            await admin.PatchAsJsonAsync(
                $"/api/requisitions/{jobId}/status",
                new { status = "Open" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct);
        job.GetProperty("statusReason").ValueKind.ShouldBe(JsonValueKind.Null);
        job.GetProperty("closedAt").ValueKind.ShouldBe(JsonValueKind.Null);
    }

    [Fact]
    public async Task Duplicating_a_job_makes_a_draft_with_the_same_stages_and_kits()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(recruiter, ct)).GetProperty("id").GetGuid();
        var source = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{jobId}",
            ct
        );

        var created = await recruiter.PostAsync($"/api/requisitions/{jobId}/duplicate", null, ct);
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var copyId = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        var copy = await recruiter.GetFromJsonAsync<JsonElement>($"/api/requisitions/{copyId}", ct);

        copy.GetProperty("status").GetString().ShouldBe("Draft");
        copy.GetProperty("title")
            .GetString()
            .ShouldBe($"{source.GetProperty("title").GetString()} (copy)");
        copy.GetProperty("code").GetString().ShouldNotBe(source.GetProperty("code").GetString());
        copy.GetProperty("description")
            .GetString()
            .ShouldBe(source.GetProperty("description").GetString());
        copy.GetProperty("stages")
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe(
                source
                    .GetProperty("stages")
                    .EnumerateArray()
                    .Select(x => x.GetProperty("name").GetString())
            );
        copy.GetProperty("interviewKits")
            .GetArrayLength()
            .ShouldBe(source.GetProperty("interviewKits").GetArrayLength());
        // Candidates stay on the original job.
        copy.GetProperty("stages")
            .EnumerateArray()
            .Sum(x => x.GetProperty("count").GetInt32())
            .ShouldBe(0);
    }
}
