using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>Candidate notes, mentions, the activity feed, talent pools, saved views and ranking filters.</summary>
public sealed partial class ApiFlowTests
{
    private async Task<Guid> JordanAsync(HttpClient client, CancellationToken ct) =>
        Ids(await JsonAsync(client, "/api/candidates?search=Jordan%20Lee", ct)).Single();

    [Fact]
    public async Task Candidate_notes_mentions_and_activity_feed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var jordan = await JordanAsync(recruiter, ct);

        // A note about the person, with an @mention stored as a row for notifications.
        var posted = await recruiter.PostAsJsonAsync(
            $"/api/candidates/{jordan}/notes",
            new { body = "Ask [Morgan](mention:manager@example.test) about **team fit**." },
            ct
        );
        posted.StatusCode.ShouldBe(HttpStatusCode.Created);
        var created = await posted.Content.ReadFromJsonAsync<JsonElement>(ct);
        var noteId = created.GetProperty("id").GetGuid();
        created
            .GetProperty("mentioned")
            .EnumerateArray()
            .Single()
            .GetString()
            .ShouldBe("manager@example.test");
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.NoteMentions.CountAsync(x => x.NoteId == noteId, ct)).ShouldBe(1);
        }

        // The feed has it on top, typed, with the author's name; the notes filter keeps only notes.
        var feed = await JsonAsync(recruiter, $"/api/candidates/{jordan}/activity", ct);
        var first = feed.GetProperty("items")[0];
        first.GetProperty("type").GetString().ShouldBe("note");
        first.GetProperty("data").GetProperty("mine").GetBoolean().ShouldBeTrue();
        first.GetProperty("actorName").GetString().ShouldNotBeNullOrWhiteSpace();
        var types = feed.GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("type").GetString())
            .ToHashSet();
        types.ShouldContain("stage");
        types.ShouldContain("application");
        var notesOnly = await JsonAsync(
            recruiter,
            $"/api/candidates/{jordan}/activity?types=note",
            ct
        );
        notesOnly
            .GetProperty("items")
            .EnumerateArray()
            .All(x => x.GetProperty("type").GetString() == "note")
            .ShouldBeTrue();

        // Paging: a small page says where the next one starts, and the next page is older.
        var page = await JsonAsync(recruiter, $"/api/candidates/{jordan}/activity?limit=5", ct);
        var next = page.GetProperty("next").GetString()!;
        var older = await JsonAsync(
            recruiter,
            $"/api/candidates/{jordan}/activity?limit=5&before={Uri.EscapeDataString(next)}",
            ct
        );
        older
            .GetProperty("items")[0]
            .GetProperty("at")
            .GetDateTimeOffset()
            .ShouldBeLessThan(DateTimeOffset.Parse(next));

        // Only the author edits; editing takes a mention out; pin; the author deletes.
        (
            await admin.PutAsJsonAsync($"/api/notes/{noteId}", new { body = "Mine now" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (
            await recruiter.PutAsJsonAsync(
                $"/api/notes/{noteId}",
                new { body = "Ask about team fit." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.NoteMentions.CountAsync(x => x.NoteId == noteId, ct)).ShouldBe(0);
            (await db.Notes.SingleAsync(x => x.Id == noteId, ct)).EditedAt.ShouldNotBeNull();
        }
        (
            await recruiter.PutAsJsonAsync($"/api/notes/{noteId}/pin", new { }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var pinned = await JsonAsync(recruiter, $"/api/candidates/{jordan}/activity", ct);
        pinned
            .GetProperty("pinned")[0]
            .GetProperty("data")
            .GetProperty("noteId")
            .GetGuid()
            .ShouldBe(noteId);
        (await recruiter.DeleteAsync($"/api/notes/{noteId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );

        // An empty note is refused.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/candidates/{jordan}/notes",
                new { body = "  " },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Talent_pools_hold_people_and_filter_the_list()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var people = Ids(await JsonAsync(recruiter, "/api/candidates?sort=name&pageSize=10", ct));

        var created = await recruiter.PostAsJsonAsync(
            "/api/talent-pools",
            new { name = "Silver medalists", description = "Finalists for next time" },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var poolId = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                "/api/talent-pools",
                new { name = "silver MEDALISTS" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var added = await recruiter.PostAsJsonAsync(
            "/api/candidates/bulk",
            new
            {
                ids = people[..3],
                action = "addToPool",
                poolId,
            },
            ct
        );
        added.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await added.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("done")
            .GetInt32()
            .ShouldBe(3);
        // Adding again skips them.
        (
            await (
                await recruiter.PostAsJsonAsync(
                    "/api/candidates/bulk",
                    new
                    {
                        ids = people[..1],
                        action = "addToPool",
                        poolId,
                    },
                    ct
                )
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("skipped")
            .GetInt32()
            .ShouldBe(1);

        var inPool = await JsonAsync(recruiter, $"/api/candidates?poolId={poolId}&sort=added", ct);
        Ids(inPool).Order().ShouldBe(people[..3].Order());
        inPool
            .GetProperty("items")[0]
            .GetProperty("pool")
            .GetProperty("addedByName")
            .GetString()
            .ShouldNotBeNullOrWhiteSpace();
        var counts = await JsonAsync(recruiter, "/api/candidates/counts", ct);
        counts.GetProperty("pools").GetProperty(poolId.ToString()).GetInt32().ShouldBe(3);
        var detail = await JsonAsync(recruiter, $"/api/candidates/{people[0]}", ct);
        detail
            .GetProperty("pools")
            .EnumerateArray()
            .Single()
            .GetProperty("name")
            .GetString()
            .ShouldBe("Silver medalists");

        (
            await recruiter.PostAsJsonAsync(
                "/api/candidates/bulk",
                new
                {
                    ids = people[..1],
                    action = "removeFromPool",
                    poolId,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        Ids(await JsonAsync(recruiter, $"/api/candidates?poolId={poolId}", ct)).Length.ShouldBe(2);
        // The activity feed records it.
        var feed = await JsonAsync(
            recruiter,
            $"/api/candidates/{people[0]}/activity?types=profile",
            ct
        );
        feed.GetProperty("items")[0]
            .GetProperty("title")
            .GetString()
            .ShouldBe("Removed from the pool Silver medalists");

        (await recruiter.DeleteAsync($"/api/talent-pools/{poolId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await JsonAsync(recruiter, $"/api/candidates/{people[1]}", ct))
            .GetProperty("pools")
            .GetArrayLength()
            .ShouldBe(0);
    }

    [Fact]
    public async Task Spreadsheet_imports_are_listed_and_can_be_undone()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var csv =
            "First name,Last name,Email\nAna,Ruiz,ana.ruiz.import@example.com\nBo,Lin,bo.lin.import@example.com\n"u8.ToArray();
        var done = await recruiter.PostAsync(
            "/api/candidates/imports?dryRun=false",
            Sheet(csv, "spring.csv"),
            ct
        );
        (await done.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("created")
            .GetInt32()
            .ShouldBe(2);

        var history = await JsonAsync(recruiter, "/api/candidates/imports", ct);
        var batch = history[0];
        batch.GetProperty("fileName").GetString().ShouldBe("spring.csv");
        batch.GetProperty("created").GetInt32().ShouldBe(2);
        batch.GetProperty("canUndo").GetBoolean().ShouldBeTrue();
        var id = batch.GetProperty("id").GetGuid();

        (
            await recruiter.PostAsync($"/api/candidates/imports/{id}/undo", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await JsonAsync(recruiter, "/api/candidates?search=ana.ruiz.import", ct))
            .GetProperty("total")
            .GetInt32()
            .ShouldBe(0);
        (
            await recruiter.PostAsync($"/api/candidates/imports/{id}/undo", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await JsonAsync(recruiter, "/api/candidates/imports", ct))[0]
            .GetProperty("canUndo")
            .GetBoolean()
            .ShouldBeFalse();
    }

    [Fact]
    public async Task Custom_field_types_are_checked_and_filter_the_list()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/admin/custom-fields",
                new
                {
                    fields = new object[]
                    {
                        new
                        {
                            key = "team",
                            label = "Team",
                            type = "select",
                            options = new[] { "Sales", "Support" },
                        },
                        new
                        {
                            key = "langs",
                            label = "Languages spoken",
                            type = "multiselect",
                            options = new[] { "French", "Hindi" },
                        },
                        new
                        {
                            key = "site",
                            label = "Website",
                            type = "url",
                            options = Array.Empty<string>(),
                        },
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var people = Ids(await JsonAsync(admin, "/api/candidates?sort=name&pageSize=10", ct));

        // Values are checked by type: a link must be a web address, pick-many uses listed options.
        (
            await admin.PutAsJsonAsync(
                $"/api/candidates/{people[0]}/custom-fields",
                new { values = new Dictionary<string, object> { ["site"] = "not a link" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/candidates/{people[0]}/custom-fields",
                new { values = new Dictionary<string, object> { ["langs"] = new[] { "Klingon" } } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/candidates/{people[0]}/custom-fields",
                new
                {
                    values = new Dictionary<string, object>
                    {
                        ["team"] = "Sales",
                        ["langs"] = new[] { "French", "Hindi" },
                        ["site"] = "https://example.com",
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await admin.PutAsJsonAsync(
                $"/api/candidates/{people[1]}/custom-fields",
                new
                {
                    values = new Dictionary<string, object>
                    {
                        ["team"] = "Support",
                        ["langs"] = new[] { "Hindi" },
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        Ids(await JsonAsync(admin, "/api/candidates?cf=team%3DSales", ct)).ShouldBe([people[0]]);
        Ids(await JsonAsync(admin, "/api/candidates?cf=team%3DSales&cf=team%3DSupport", ct))
            .Order()
            .ShouldBe(people[..2].Order());
        Ids(await JsonAsync(admin, "/api/candidates?cf=langs%3DHindi&cf=team%3DSupport", ct))
            .ShouldBe([people[1]]);
        // The list row carries the answers as text for the custom columns.
        var row = (await JsonAsync(admin, "/api/candidates?cf=langs%3DFrench", ct)).GetProperty(
            "items"
        )[0];
        row.GetProperty("customFields").GetProperty("langs").GetString().ShouldBe("French; Hindi");
    }

    [Fact]
    public async Task Saved_views_are_shared_renamed_pinned_and_counted()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);

        var created = await recruiter.PostAsJsonAsync(
            "/api/saved-views",
            new
            {
                area = "talent",
                name = "Has a resume",
                shared = true,
                paramsJson = JsonSerializer.Serialize(
                    new { listQuery = "hasResume=true", filters = new { } }
                ),
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                "/api/saved-views",
                new
                {
                    area = "reports",
                    name = "x",
                    paramsJson = "{}",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // The team sees it, cannot change it, and can pin it for themselves.
        var theirs = (await JsonAsync(admin, "/api/saved-views?area=talent", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id);
        theirs.GetProperty("mine").GetBoolean().ShouldBeFalse();
        (
            await admin.PutAsJsonAsync($"/api/saved-views/{id}", new { name = "Taken" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await admin.PutAsJsonAsync($"/api/saved-views/{id}/pin", new { }, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await JsonAsync(admin, "/api/saved-views?area=talent", ct))[0]
            .GetProperty("pinned")
            .GetBoolean()
            .ShouldBeTrue();

        // Rename by id (not a second view), make private, and count like the list.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/saved-views/{id}",
                new { name = "Resume read", shared = false },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var mine = (await JsonAsync(recruiter, "/api/saved-views?area=talent", ct))
            .EnumerateArray()
            .ToList();
        mine.Count.ShouldBe(1);
        mine[0].GetProperty("name").GetString().ShouldBe("Resume read");
        (await JsonAsync(admin, "/api/saved-views?area=talent", ct)).GetArrayLength().ShouldBe(0);
        var counts = await JsonAsync(recruiter, "/api/candidates/counts", ct);
        counts
            .GetProperty("views")
            .GetProperty(id.ToString())
            .GetInt32()
            .ShouldBe(
                (await JsonAsync(recruiter, "/api/candidates?hasResume=true", ct))
                    .GetProperty("total")
                    .GetInt32()
            );

        // The jobs list keeps its views on the server too.
        (
            await recruiter.PostAsJsonAsync(
                "/api/saved-views",
                new
                {
                    area = "jobs",
                    name = "Open",
                    paramsJson = "{\"state\":{}}",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Ranking_applies_list_filters_and_suggestions_share_the_number()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jobs = await JsonAsync(recruiter, "/api/requisitions", ct);
        var job = jobs.EnumerateArray()
            .First(x => x.GetProperty("status").GetString() == "Open")
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PutAsJsonAsync(
                $"/api/requisitions/{job}/requirements",
                new
                {
                    required = new[] { "TypeScript", "Kubernetes" },
                    preferred = new[] { "Mentoring engineers" },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        async Task<JsonElement> Rank(string filter) =>
            await (
                await recruiter.PostAsJsonAsync(
                    "/api/talent/rank",
                    new
                    {
                        requisitionId = job,
                        filter,
                        pageSize = 100,
                    },
                    ct
                )
            ).Content.ReadFromJsonAsync<JsonElement>(ct);

        var everyone = await Rank("");
        var withResume = await Rank("hasResume=true");
        var listed = (await JsonAsync(recruiter, "/api/candidates?hasResume=true&pageSize=100", ct))
            .GetProperty("total")
            .GetInt32();
        withResume.GetProperty("total").GetInt32().ShouldBe(listed);
        withResume
            .GetProperty("total")
            .GetInt32()
            .ShouldBeLessThanOrEqualTo(everyone.GetProperty("total").GetInt32());

        // Deterministic order, best first, with the breakdown behind each number.
        var again = await Rank("hasResume=true");
        again
            .GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("candidateId").GetGuid())
            .ShouldBe(
                withResume
                    .GetProperty("items")
                    .EnumerateArray()
                    .Select(x => x.GetProperty("candidateId").GetGuid())
            );
        var scores = withResume
            .GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("score").GetInt32())
            .ToList();
        scores.ShouldBe(scores.OrderByDescending(x => x).ToList());
        var top = withResume.GetProperty("items")[0];
        (
            top.GetProperty("matched").GetArrayLength()
            + top.GetProperty("missing").GetArrayLength()
        ).ShouldBe(3);

        // Bulk "not a fit" hides people from the ranking.
        var hidden = top.GetProperty("candidateId").GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                "/api/candidates/bulk",
                new
                {
                    ids = new[] { hidden },
                    action = "dismiss",
                    requisitionId = job,
                    reason = "Skills mismatch",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Rank("hasResume=true"))
            .GetProperty("items")
            .EnumerateArray()
            .Any(x => x.GetProperty("candidateId").GetGuid() == hidden)
            .ShouldBeFalse();

        // Suggestions from past jobs use the same number as ranking.
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var requisition = await db.Requisitions.SingleAsync(x => x.Id == job, ct);
            requisition.RequirementsEmbedding = [1f, 0f, 0f];
            await db
                .Candidates.Where(x => x.ResumeText != null)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.ResumeEmbedding, new[] { 1f, 0f, 0f }),
                    ct
                );
            await db.SaveChangesAsync(ct);
        }
        var suggested = await JsonAsync(
            recruiter,
            $"/api/requisitions/{job}/suggested-candidates",
            ct
        );
        var ranked = (await Rank(""))
            .GetProperty("items")
            .EnumerateArray()
            .ToDictionary(
                x => x.GetProperty("candidateId").GetGuid(),
                x => x.GetProperty("score").GetInt32()
            );
        foreach (var item in suggested.GetProperty("items").EnumerateArray())
            item.GetProperty("score").GetInt32().ShouldBe(ranked[item.GetProperty("id").GetGuid()]);
    }
}
