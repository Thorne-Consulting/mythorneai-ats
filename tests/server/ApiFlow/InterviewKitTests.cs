using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private static object Competency(Guid? id, string name, string question, int weight = 3) =>
        new
        {
            id,
            name,
            question,
            followUps = "",
            description = "",
            weight,
        };

    private static object KitBody(string name, params object[] criteria) =>
        new
        {
            name,
            instructions = "Ask every candidate the same questions.",
            durationMinutes = 45,
            criteria,
        };

    private async Task<(Guid ApplicationId, Guid RequisitionId)> JordanJobAsync(
        HttpClient client,
        CancellationToken ct
    )
    {
        var applicationId = await JordanApplicationAsync(client, ct);
        var detail = await client.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        return (
            applicationId,
            detail.GetProperty("application").GetProperty("requisitionId").GetGuid()
        );
    }

    private static async Task<Guid> CreatedIdAsync(
        HttpResponseMessage response,
        CancellationToken ct
    )
    {
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
    }

    private static async Task<JsonElement> KitAsync(
        HttpClient client,
        Guid requisitionId,
        Guid kitId,
        CancellationToken ct
    ) =>
        await client.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{requisitionId}/interview-kits/{kitId}",
            ct
        );

    private static Guid[] CompetencyIds(JsonElement kit) =>
        [
            .. kit.GetProperty("kit")
                .GetProperty("criteria")
                .EnumerateArray()
                .Select(x => x.GetProperty("id").GetGuid()),
        ];

    [Fact]
    public async Task Editing_a_kit_in_use_makes_a_version_and_scheduled_interviews_keep_theirs()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (applicationId, requisitionId) = await JordanJobAsync(recruiter, ct);
        var kitId = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{requisitionId}/interview-kits",
                KitBody(
                    "Versioned kit",
                    Competency(null, "Craft", "Show us your best work."),
                    Competency(null, "Judgement", "What did you cut?"),
                    Competency(null, "Teamwork", "A disagreement?")
                ),
                ct
            ),
            ct
        );
        var v1 = await KitAsync(recruiter, requisitionId, kitId, ct);
        v1.GetProperty("kit").GetProperty("version").GetInt32().ShouldBe(1);
        var ids = CompetencyIds(v1);

        // Schedule and score an interview on version 1.
        var startsAt = DateTimeOffset.UtcNow.AddDays(2);
        var interviewId = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/interviews",
                new
                {
                    title = "Versioned kit interview",
                    interviewKitId = kitId,
                    startsAt,
                    endsAt = startsAt.AddMinutes(45),
                    timeZone = "America/Chicago",
                    meetingLink = (string?)null,
                    interviewerEmails = new[] { "interviewer@example.test" },
                },
                ct
            ),
            ct
        );
        await StartInterviewAsync(interviewId, ct);
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        var before = (
            await interviewer.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}",
                ct
            )
        )
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        var rowIds = before
            .GetProperty("criteria")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();
        (
            await interviewer.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/scorecards",
                new
                {
                    recommendation = "Yes",
                    rating = 4,
                    evidence = "Clear.",
                    strengths = "Craft.",
                    concerns = "None.",
                    criteria = rowIds.Select(id => new
                    {
                        criterionId = id,
                        rating = 4,
                        evidence = "Good.",
                    }),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        // Rename one, drop a scored one, add one. Allowed now: the scored version is kept.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/requisitions/{requisitionId}/interview-kits/{kitId}",
                KitBody(
                    "Versioned kit",
                    Competency(ids[1], "Judgement calls", "What did you cut, and why?", 4),
                    Competency(ids[0], "Craft", "Show us your best work."),
                    Competency(null, "Presenting", "Walk us through it.")
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var v2 = await KitAsync(recruiter, requisitionId, kitId, ct);
        v2.GetProperty("kit").GetProperty("version").GetInt32().ShouldBe(2);
        v2.GetProperty("kit").GetProperty("interviews").GetInt32().ShouldBe(0);
        var current = CompetencyIds(v2);
        current[0].ShouldBe(ids[1]);
        current[1].ShouldBe(ids[0]);
        current[2].ShouldNotBeOneOf(ids);
        var earlier = v2.GetProperty("versions").EnumerateArray().Single();
        earlier.GetProperty("version").GetInt32().ShouldBe(1);
        earlier.GetProperty("interviews").GetInt32().ShouldBe(1);

        // The interview still shows version 1, with its scorecard intact.
        var after = (
            await interviewer.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}",
                ct
            )
        )
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        after
            .GetProperty("criteria")
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe(["Craft", "Judgement", "Teamwork"]);
        after
            .GetProperty("criteria")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ShouldBe(rowIds);
        var card = after.GetProperty("scorecards").EnumerateArray().Single();
        card.GetProperty("criteria").GetArrayLength().ShouldBe(3);
        var frozenId = after.GetProperty("interviewKitId").GetGuid();
        frozenId.ShouldBe(earlier.GetProperty("id").GetGuid());

        // The frozen version reads back, cannot be edited, and is not offered for new interviews.
        var frozen = await KitAsync(recruiter, requisitionId, frozenId, ct);
        frozen.GetProperty("kit").GetProperty("versionOfId").GetGuid().ShouldBe(kitId);
        frozen.GetProperty("canManage").GetBoolean().ShouldBeFalse();
        (
            await recruiter.PutAsJsonAsync(
                $"/api/requisitions/{requisitionId}/interview-kits/{frozenId}",
                KitBody("Changed", Competency(null, "X", "Y?")),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        var job = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{requisitionId}",
            ct
        );
        var offered = job.GetProperty("interviewKits")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();
        offered.ShouldContain(kitId);
        offered.ShouldNotContain(frozenId);
        var list = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{requisitionId}/interview-kits",
            ct
        );
        list.GetProperty("kits")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == kitId)
            .GetProperty("interviews")
            .GetInt32()
            .ShouldBe(1);

        // The finalist comparison lines up the renamed competency with its scores from version 1.
        var compare = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/compare?ids={applicationId},{(await recruiter.GetFromJsonAsync<JsonElement[]>($"/api/applications/{applicationId}/peers", ct))![0].GetProperty("id").GetGuid()}",
            ct
        );
        var judgement = compare
            .GetProperty("competencies")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == ids[1]);
        judgement
            .GetProperty("scores")
            .GetProperty(applicationId.ToString())
            .GetProperty("average")
            .GetDouble()
            .ShouldBe(4);
    }

    [Fact]
    public async Task Competency_ids_stay_put_and_bad_kits_are_refused_not_trimmed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (_, requisitionId) = await JordanJobAsync(recruiter, ct);
        var kitId = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{requisitionId}/interview-kits",
                KitBody(
                    "Ids kit",
                    Competency(null, "Craft", "Q1?"),
                    Competency(null, "Judgement", "Q2?")
                ),
                ct
            ),
            ct
        );
        var ids = CompetencyIds(await KitAsync(recruiter, requisitionId, kitId, ct));
        var url = $"/api/requisitions/{requisitionId}/interview-kits/{kitId}";

        // Nobody uses the kit yet: a rename and reorder edits it in place, ids and all.
        (
            await recruiter.PutAsJsonAsync(
                url,
                KitBody(
                    "Ids kit",
                    Competency(ids[1], "Judgement calls", "Q2?"),
                    Competency(ids[0], "Craft", "Q1?")
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var kit = await KitAsync(recruiter, requisitionId, kitId, ct);
        CompetencyIds(kit).ShouldBe([ids[1], ids[0]]);
        kit.GetProperty("kit").GetProperty("version").GetInt32().ShouldBe(2);
        kit.GetProperty("versions").GetArrayLength().ShouldBe(0);

        // Saving the same content again is not a new version.
        (
            await recruiter.PutAsJsonAsync(
                url,
                KitBody(
                    "Ids kit",
                    Competency(ids[1], "Judgement calls", "Q2?"),
                    Competency(ids[0], "Craft", "Q1?")
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await KitAsync(recruiter, requisitionId, kitId, ct))
            .GetProperty("kit")
            .GetProperty("version")
            .GetInt32()
            .ShouldBe(2);

        // Problems are refused with a reason; nothing is silently dropped.
        foreach (
            var bad in new[]
            {
                KitBody("Ids kit", Competency(Guid.NewGuid(), "Stranger", "Q?")),
                KitBody(
                    "Ids kit",
                    Competency(null, "Craft", "Q1?"),
                    Competency(null, "craft", "Q2?")
                ),
                KitBody("Ids kit", Competency(null, "No question", "")),
                KitBody("Ids kit", Competency(ids[0], "A", "Q?"), Competency(ids[0], "B", "Q?")),
                KitBody("", Competency(null, "Craft", "Q?")),
            }
        )
            (await recruiter.PutAsJsonAsync(url, bad, ct)).StatusCode.ShouldBe(
                HttpStatusCode.BadRequest
            );
        CompetencyIds(await KitAsync(recruiter, requisitionId, kitId, ct))
            .ShouldBe([ids[1], ids[0]]);
    }

    [Fact]
    public async Task Kit_list_duplicates_reorders_archives_and_sets_a_stage()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (applicationId, requisitionId) = await JordanJobAsync(recruiter, ct);
        var baseUrl = $"/api/requisitions/{requisitionId}/interview-kits";
        var first = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                baseUrl,
                KitBody("List kit A", Competency(null, "Craft", "Q?")),
                ct
            ),
            ct
        );
        var copy = await CreatedIdAsync(
            await recruiter.PostAsync($"{baseUrl}/{first}/duplicate", null, ct),
            ct
        );
        (await KitAsync(recruiter, requisitionId, copy, ct))
            .GetProperty("kit")
            .GetProperty("name")
            .GetString()
            .ShouldBe("List kit A (copy)");

        async Task<Guid[]> ActiveAsync() =>
            [
                .. (await recruiter.GetFromJsonAsync<JsonElement>(baseUrl, ct))
                    .GetProperty("kits")
                    .EnumerateArray()
                    .Where(x => x.GetProperty("archivedAt").ValueKind == JsonValueKind.Null)
                    .Select(x => x.GetProperty("id").GetGuid()),
            ];
        var order = await ActiveAsync();
        var reversed = order.Reverse().ToArray();
        (
            await recruiter.PutAsJsonAsync($"{baseUrl}/order", new { ids = reversed }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await ActiveAsync()).ShouldBe(reversed);
        (
            await recruiter.PutAsJsonAsync($"{baseUrl}/order", new { ids = reversed.Skip(1) }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var detail = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var stageId = detail
            .GetProperty("application")
            .GetProperty("stages")[1]
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PutAsJsonAsync(
                $"{baseUrl}/{copy}/stage",
                new { pipelineStageId = stageId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await KitAsync(recruiter, requisitionId, copy, ct))
            .GetProperty("kit")
            .GetProperty("pipelineStageId")
            .GetGuid()
            .ShouldBe(stageId);
        (
            await recruiter.PutAsJsonAsync(
                $"{baseUrl}/{copy}/stage",
                new { pipelineStageId = Guid.NewGuid() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // An upcoming interview blocks archiving, with the reason.
        var startsAt = DateTimeOffset.UtcNow.AddDays(5);
        await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/interviews",
                new
                {
                    title = "List kit interview",
                    interviewKitId = first,
                    startsAt,
                    endsAt = startsAt.AddMinutes(45),
                    timeZone = "UTC",
                    meetingLink = (string?)null,
                    interviewerEmails = new[] { "interviewer@example.test" },
                },
                ct
            ),
            ct
        );
        var blocked = await recruiter.PostAsync($"{baseUrl}/{first}/archive", null, ct);
        blocked.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await blocked.Content.ReadAsStringAsync(ct)).ShouldContain("upcoming interview");

        (await recruiter.PostAsync($"{baseUrl}/{copy}/archive", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await ActiveAsync()).ShouldNotContain(copy);
        var job = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{requisitionId}",
            ct
        );
        job.GetProperty("interviewKits")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ShouldNotContain(copy);
        (await recruiter.PostAsync($"{baseUrl}/{copy}/restore", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await ActiveAsync()).ShouldContain(copy);

        // Interviewers can read kits but not change them.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.PostAsync($"{baseUrl}/{copy}/duplicate", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task Question_bank_and_templates_start_seeded_and_only_staff_change_them()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var templates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/interview-library/templates",
            ct
        );
        templates
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ShouldContain("Recruiter screen");
        templates.EnumerateArray().Count().ShouldBeGreaterThanOrEqualTo(6);
        templates
            .EnumerateArray()
            .First()
            .GetProperty("competencies")
            .GetArrayLength()
            .ShouldBeGreaterThan(0);
        var bank = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/interview-library/questions",
            ct
        );
        var seeded = bank.EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Problem solving");
        seeded
            .GetProperty("tags")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldContain("Technical");

        var question = new
        {
            name = "Bank test competency",
            question = "Tell me about a hard trade-off.",
            followUps = "What did it cost?",
            goodLooksLike = "Names the cost plainly.",
            weight = 4,
            tags = new[] { "Leadership", " leadership ", "Judgement" },
        };
        var id = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync("/api/interview-library/questions", question, ct),
            ct
        );
        (
            await recruiter.PostAsJsonAsync("/api/interview-library/questions", question, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PostAsJsonAsync(
                "/api/interview-library/questions",
                new
                {
                    name = "",
                    question = "Q?",
                    weight = 3,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                "/api/interview-library/questions",
                new
                {
                    name = "W",
                    question = "Q?",
                    weight = 9,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var saved = (
            await recruiter.GetFromJsonAsync<JsonElement>("/api/interview-library/questions", ct)
        )
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id);
        saved
            .GetProperty("tags")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe(["Leadership", "Judgement"]);

        (
            await recruiter.PutAsJsonAsync($"/api/interview-library/questions/{id}", question, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await recruiter.PostAsync($"/api/interview-library/questions/{id}/archive", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetFromJsonAsync<JsonElement>("/api/interview-library/questions", ct))
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ShouldNotContain(id);
        (
            await recruiter.GetFromJsonAsync<JsonElement>(
                "/api/interview-library/questions?archived=true",
                ct
            )
        )
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ShouldContain(id);

        // A kit saved as a template comes back whole.
        var templateId = await CreatedIdAsync(
            await recruiter.PostAsJsonAsync(
                "/api/interview-library/templates",
                new
                {
                    name = "Template test",
                    summary = "One line",
                    durationMinutes = 30,
                    instructions = "Be fair.",
                    candidateMessage = "",
                    interviewerMessage = "",
                    competencies = new[] { Competency(null, "Craft", "Show us?", 5) },
                },
                ct
            ),
            ct
        );
        var template = (
            await recruiter.GetFromJsonAsync<JsonElement>("/api/interview-library/templates", ct)
        )
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == templateId);
        template.GetProperty("competencies")[0].GetProperty("weight").GetInt32().ShouldBe(5);
        (
            await recruiter.PostAsync(
                $"/api/interview-library/templates/{templateId}/archive",
                null,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // Hiring managers read the library; only admins and recruiters change it.
        using var manager = await LoginAsync("manager@example.test", ct);
        (await manager.GetAsync("/api/interview-library/questions", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        (
            await manager.PostAsJsonAsync("/api/interview-library/questions", question, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.GetAsync("/api/interview-library/templates", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task Previous_and_next_applicant_walk_one_stage_of_the_job()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var here = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/neighbors",
            ct
        );
        var total = here.GetProperty("total").GetInt32();
        var position = here.GetProperty("position").GetInt32();
        position.ShouldBeInRange(1, total);
        if (here.GetProperty("next").ValueKind != JsonValueKind.Null)
        {
            var nextId = here.GetProperty("next").GetProperty("id").GetGuid();
            var there = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{nextId}/neighbors?stageId={here.GetProperty("stage").GetProperty("id").GetGuid()}",
                ct
            );
            there.GetProperty("position").GetInt32().ShouldBe(position + 1);
            there.GetProperty("previous").GetProperty("id").GetGuid().ShouldBe(applicationId);
        }
        (
            await recruiter.GetAsync($"/api/applications/compare?ids={applicationId}", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}
