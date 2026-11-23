using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Backfill_gives_old_stages_types_labels_and_readable_names_and_jobs_a_team()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            // Rows as they were before stage types: placeholder columns and the old default names.
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""
                UPDATE "PipelineStages" SET "CandidateLabel" = '', "Type" = '', "EmailOnEntry" = '', "Color" = 'indigo',
                  "Name" = CASE "SortOrder" WHEN 3 THEN 'Booked' WHEN 4 THEN 'Offer handoff' ELSE "Name" END
                WHERE "RequisitionId" = {jobId}
                """,
                ct
            );
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"""DELETE FROM "RequisitionMembers" WHERE "RequisitionId" = {jobId}""",
                ct
            );
            db.PipelineTemplates.Add(
                new PipelineTemplate
                {
                    Name = "Legacy",
                    StageNames = ["Applied", "Phone screen", "Booked", "Offer handoff", "Hired"],
                }
            );
            await db.SaveChangesAsync(ct);

            await StageRules.BackfillAsync(db, ct);
            await RequisitionTeam.BackfillAsync(db, ct);
            // Safe to run again.
            await StageRules.BackfillAsync(db, ct);
            await RequisitionTeam.BackfillAsync(db, ct);
        }

        var job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct);
        var stages = job.GetProperty("stages").EnumerateArray().ToList();
        stages
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe(["New", "Review", "Interview", "Interview scheduled", "Offer", "Hired"]);
        stages
            .Select(x => x.GetProperty("type").GetString())
            .ShouldBe(["Applied", "Screen", "Interview", "Interview", "Offer", "Hired"]);
        stages.ShouldAllBe(x => x.GetProperty("candidateLabel").GetString()!.Length > 0);
        stages.ShouldAllBe(x => x.GetProperty("emailOnEntry").GetString() == "Off");
        stages.ShouldAllBe(x => x.GetProperty("color").ValueKind == JsonValueKind.Null);
        var members = job.GetProperty("members").EnumerateArray().ToList();
        members.ShouldContain(x =>
            x.GetProperty("role").GetString() == "HiringManager"
            && x.GetProperty("email").GetString() == job.GetProperty("ownerEmail").GetString()
        );
        members.ShouldContain(x => x.GetProperty("role").GetString() == "Recruiter");

        var legacy = (await admin.GetFromJsonAsync<JsonElement>("/api/pipeline-templates", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Legacy");
        legacy
            .GetProperty("stages")
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe(["Applied", "Phone screen", "Interview scheduled", "Offer"]);
        legacy
            .GetProperty("stages")
            .EnumerateArray()
            .Select(x => x.GetProperty("type").GetString())
            .ShouldBe(["Applied", "Screen", "Interview", "Offer"]);
    }

    [Fact]
    public async Task The_team_is_users_with_roles_and_keeps_the_old_email_fields_in_step()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var people = (await admin.GetFromJsonAsync<JsonElement>("/api/requisitions/people", ct))
            .EnumerateArray()
            .ToDictionary(
                x => x.GetProperty("email").GetString()!,
                x => x.GetProperty("id").GetGuid()
            );
        Guid Id(string email) => people[email];

        // A team without a hiring manager is refused, and so is an interviewer account running the job.
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/members",
                new
                {
                    members = new[]
                    {
                        new { userId = Id("recruiter@example.test"), role = "Recruiter" },
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/members",
                new
                {
                    members = new[]
                    {
                        new { userId = Id("interviewer@example.test"), role = "HiringManager" },
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/members",
                new
                {
                    members = new[]
                    {
                        new { userId = Id("manager@example.test"), role = "HiringManager" },
                        new { userId = Id("recruiter@example.test"), role = "Recruiter" },
                        new { userId = Id("interviewer@example.test"), role = "Interviewer" },
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct);
        job.GetProperty("ownerEmail").GetString().ShouldBe("manager@example.test");
        job.GetProperty("recruiterEmail").GetString().ShouldBe("recruiter@example.test");
        job.GetProperty("viewerEmails")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe(["interviewer@example.test"]);
        job.GetProperty("members").GetArrayLength().ShouldBe(3);
        var listed = (await admin.GetFromJsonAsync<JsonElement>("/api/requisitions", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == jobId);
        listed
            .GetProperty("hiringManager")
            .GetProperty("email")
            .GetString()
            .ShouldBe("manager@example.test");
        listed
            .GetProperty("hiringManager")
            .GetProperty("displayName")
            .GetString()
            .ShouldNotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task A_job_can_change_pipeline_and_people_go_to_the_chosen_new_stages()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var created = await admin.PostAsJsonAsync(
            "/api/admin/pipeline-templates",
            new
            {
                name = "Two step",
                isDefault = false,
                stages = new object[]
                {
                    new
                    {
                        name = "Inbox",
                        type = "Applied",
                        candidateLabel = "Received",
                    },
                    new
                    {
                        name = "Chat",
                        type = "Interview",
                        candidateLabel = "Interview",
                    },
                },
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.OK, await created.Content.ReadAsStringAsync(ct));
        var pipelineId = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        var before = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct)
        )
            .GetProperty("stages")
            .EnumerateArray()
            .ToList();
        var crowded = before
            .Where(x => !x.GetProperty("isTerminal").GetBoolean())
            .Where(x => x.GetProperty("applications").GetArrayLength() > 0)
            .ToList();
        crowded.ShouldNotBeEmpty();
        var people = crowded.Sum(x => x.GetProperty("applications").GetArrayLength());

        // A stage with people needs a place in the new pipeline; a bad position is refused too.
        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{jobId}/pipeline",
                new { pipelineTemplateId = pipelineId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{jobId}/pipeline",
                new
                {
                    pipelineTemplateId = pipelineId,
                    moveTo = crowded.ToDictionary(x => x.GetProperty("id").GetGuid(), _ => 5),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Everyone goes to Chat, the second new stage.
        var changed = await admin.PostAsJsonAsync(
            $"/api/requisitions/{jobId}/pipeline",
            new
            {
                pipelineTemplateId = pipelineId,
                moveTo = crowded.ToDictionary(x => x.GetProperty("id").GetGuid(), _ => 1),
            },
            ct
        );
        changed.StatusCode.ShouldBe(
            HttpStatusCode.NoContent,
            await changed.Content.ReadAsStringAsync(ct)
        );

        var after = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct)
        )
            .GetProperty("stages")
            .EnumerateArray()
            .ToList();
        after.Select(x => x.GetProperty("name").GetString()).ShouldBe(["Inbox", "Chat", "Hired"]);
        after[0].GetProperty("applications").GetArrayLength().ShouldBe(0);
        after[1].GetProperty("applications").GetArrayLength().ShouldBe(people);
        after[2].GetProperty("isTerminal").GetBoolean().ShouldBeTrue();
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct))
            .GetProperty("pipelineTemplateId")
            .GetGuid()
            .ShouldBe(pipelineId);
    }

    [Fact]
    public async Task A_job_s_stages_can_be_edited_and_people_in_a_removed_stage_are_moved()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var board = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{jobId}/board",
            ct
        );
        var stages = board.GetProperty("stages").EnumerateArray().ToList();
        var crowded = stages
            .Where(x => !x.GetProperty("isTerminal").GetBoolean())
            .First(x => x.GetProperty("applications").GetArrayLength() > 0);
        var keep = stages.First(x =>
            x.GetProperty("id").GetGuid() != crowded.GetProperty("id").GetGuid()
            && !x.GetProperty("isTerminal").GetBoolean()
        );
        var hired = stages.Single(x => x.GetProperty("isTerminal").GetBoolean());
        var moved = crowded.GetProperty("applications").GetArrayLength();
        crowded
            .GetProperty("applications")[0]
            .TryGetProperty("enteredStageAt", out _)
            .ShouldBeTrue();

        object Input(JsonElement stage, string? name = null) =>
            new
            {
                id = stage.GetProperty("id").GetGuid(),
                name = name ?? stage.GetProperty("name").GetString(),
                type = stage.GetProperty("type").GetString(),
                candidateLabel = stage.GetProperty("candidateLabel").GetString(),
                emailOnEntry = "Off",
                targetDays = (int?)null,
            };
        var kept = stages
            .Where(x =>
                x.GetProperty("id").GetGuid() != crowded.GetProperty("id").GetGuid()
                && !x.GetProperty("isTerminal").GetBoolean()
            )
            .ToList();
        object[] withoutCrowded =
        [
            new
            {
                id = (Guid?)null,
                name = "Take-home task",
                type = "Other",
                candidateLabel = "Task",
                emailOnEntry = "Ask",
                targetDays = (int?)5,
            },
            .. kept.Select(x => Input(x)),
            Input(hired),
        ];

        // Removing a stage with people in it needs a place for them; Hired must stay last.
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/stages",
                new { stages = withoutCrowded },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/stages",
                new { stages = withoutCrowded.Reverse().ToArray() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var saved = await admin.PutAsJsonAsync(
            $"/api/requisitions/{jobId}/stages",
            new
            {
                stages = withoutCrowded,
                moveTo = new Dictionary<Guid, Guid>
                {
                    [crowded.GetProperty("id").GetGuid()] = keep.GetProperty("id").GetGuid(),
                },
            },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var after = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct)
        )
            .GetProperty("stages")
            .EnumerateArray()
            .ToList();
        after
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe([
                "Take-home task",
                .. kept.Select(x => x.GetProperty("name").GetString()),
                "Hired",
            ]);
        after[0].GetProperty("emailOnEntry").GetString().ShouldBe("Ask");
        after[0].GetProperty("targetDays").GetInt32().ShouldBe(5);
        after
            .Single(x => x.GetProperty("id").GetGuid() == keep.GetProperty("id").GetGuid())
            .GetProperty("applications")
            .GetArrayLength()
            .ShouldBe(keep.GetProperty("applications").GetArrayLength() + moved);
    }

    [Fact]
    public async Task A_stage_email_uses_what_candidates_see_and_undo_takes_it_back()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var stages = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct)
        )
            .GetProperty("stages")
            .EnumerateArray()
            .ToList();
        var application = stages
            .SelectMany(x => x.GetProperty("applications").EnumerateArray())
            .First(x => !x.GetProperty("doNotContact").GetBoolean());
        var applicationId = application.GetProperty("id").GetGuid();
        var offer = stages.First(x => x.GetProperty("type").GetString() == "Offer");

        var preview = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/stage-email?stageId={offer.GetProperty("id").GetGuid()}",
            ct
        );
        preview
            .GetProperty("body")
            .GetString()!
            .ShouldContain(offer.GetProperty("candidateLabel").GetString()!);

        var queued = await admin.PostAsJsonAsync(
            "/api/stage-emails",
            new
            {
                applicationIds = new[] { applicationId },
                stageId = offer.GetProperty("id").GetGuid(),
            },
            ct
        );
        queued.StatusCode.ShouldBe(HttpStatusCode.OK);
        var ids = (await queued.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("ids");
        ids.GetArrayLength().ShouldBe(1);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var item = await db
                .EmailOutbox.AsNoTracking()
                .SingleAsync(x => x.Id == ids[0].GetGuid(), ct);
            // It waits out the undo window.
            item.NextAttemptAt.ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddSeconds(30));
        }
        var cancelled = await admin.PostAsJsonAsync("/api/stage-emails/cancel", new { ids }, ct);
        (await cancelled.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("cancelled")
            .GetInt32()
            .ShouldBe(1);
    }
}
