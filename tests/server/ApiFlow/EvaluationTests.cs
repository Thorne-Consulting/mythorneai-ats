using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    /// <summary>Moves an interview into the past so its scorecard can be written.</summary>
    private async Task StartInterviewAsync(Guid interviewId, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var interview = await db.Interviews.SingleAsync(x => x.Id == interviewId, ct);
        interview.StartsAt = DateTimeOffset.UtcNow.AddHours(-2);
        interview.EndsAt = DateTimeOffset.UtcNow.AddHours(-1);
        await db.SaveChangesAsync(ct);
    }

    private async Task<List<EmailOutboxItem>> OutboxAsync(Guid applicationId, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        return await db
            .EmailOutbox.AsNoTracking()
            .Where(x => x.ApplicationId == applicationId)
            .ToListAsync(ct);
    }

    private async Task<(Guid ApplicationId, Guid CompletedInterviewId)> NinaAsync(
        HttpClient client,
        CancellationToken ct
    )
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var interview = await db
            .Interviews.AsNoTracking()
            .Where(x => x.Title == "Technical interview" && x.Scorecards.Count == 2)
            .Select(x => new { x.Id, x.ApplicationId })
            .FirstAsync(ct);
        return (interview.ApplicationId, interview.Id);
    }

    [Fact]
    public void Application_answers_read_back_as_question_and_answer_pairs()
    {
        var pairs = ApplicationAnswers.Parse(
            "### Why us?\n\nThe mission.\n\n### Notice period\n\n_No answer_"
        );
        pairs.Length.ShouldBe(2);
        pairs[0].ShouldBe(new ApplicationAnswers.Pair("Why us?", "The mission."));
        pairs[1].Answer.ShouldBe("");
        ApplicationAnswers.Parse("").ShouldBeEmpty();
        ApplicationAnswers.Parse("Free text")[0].Question.ShouldBe("Answers");
    }

    [Fact]
    public async Task Stage_moves_send_no_email_and_closed_applications_reopen_quietly()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)
        ).GetProperty("application");
        var stages = detail
            .GetProperty("stages")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();
        var current = detail.GetProperty("stageId").GetGuid();
        var next = stages[Array.IndexOf(stages, current) + 1];
        var before = (await OutboxAsync(applicationId, ct)).Count;

        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = next, status = "Active" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await OutboxAsync(applicationId, ct)).Count.ShouldBe(before);

        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new
                {
                    stageId = next,
                    status = "Rejected",
                    dispositionReason = "Skills mismatch",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await OutboxAsync(applicationId, ct)).Count(x => x.TemplateKey == "rejection").ShouldBe(1);
        // A second rejection does not email the candidate again.
        await recruiter.PatchAsJsonAsync(
            $"/api/applications/{applicationId}/stage",
            new
            {
                stageId = next,
                status = "Rejected",
                dispositionReason = "Skills mismatch",
            },
            ct
        );
        (await OutboxAsync(applicationId, ct)).Count(x => x.TemplateKey == "rejection").ShouldBe(1);

        // The stage picker cannot quietly un-reject someone.
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = current, status = "Active" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PostAsync($"/api/applications/{applicationId}/reopen", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var reopened = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)
        ).GetProperty("application");
        reopened.GetProperty("status").GetString().ShouldBe("Active");
        (await OutboxAsync(applicationId, ct)).Count.ShouldBe(before + 1);

        // Do not contact: no rejection email at all.
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var candidateId = await db
                .Applications.Where(x => x.Id == applicationId)
                .Select(x => x.CandidateId)
                .SingleAsync(ct);
            await db
                .Candidates.Where(x => x.Id == candidateId)
                .ExecuteUpdateAsync(x => x.SetProperty(c => c.DoNotContact, true), ct);
        }
        await recruiter.PatchAsJsonAsync(
            $"/api/applications/{applicationId}/stage",
            new
            {
                stageId = next,
                status = "Rejected",
                dispositionReason = "Position closed",
            },
            ct
        );
        (await OutboxAsync(applicationId, ct)).Count(x => x.TemplateKey == "rejection").ShouldBe(1);
    }

    [Fact]
    public async Task An_interviewer_who_still_owes_feedback_sees_no_scorecards_on_the_application()
    {
        var ct = TestContext.Current.CancellationToken;
        using var manager = await LoginAsync("manager@example.test", ct);
        var (applicationId, completedId) = await NinaAsync(manager, ct);

        // The manager's own interview is tomorrow, so the panel's scorecards stay hidden.
        var blind = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        blind.GetProperty("blinded").GetBoolean().ShouldBeTrue();
        var completed = blind
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == completedId);
        completed.GetProperty("submittedScorecards").GetInt32().ShouldBe(2);
        completed.GetProperty("scorecards").GetArrayLength().ShouldBe(0);
        (
            await manager.PostAsJsonAsync(
                "/api/ai/summarize-application",
                new { applicationId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        // Before the interview starts there is nothing to submit.
        var mine = blind
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x =>
                x.GetProperty("interviewerEmails")
                    .EnumerateArray()
                    .Any(e => e.GetString() == "manager@example.test")
            );
        var mineId = mine.GetProperty("id").GetGuid();
        var scorecard = new { recommendation = "Yes", evidence = "Clear examples throughout." };
        (
            await manager.PostAsJsonAsync($"/api/interviews/{mineId}/scorecards", scorecard, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await StartInterviewAsync(mineId, ct);
        (
            await manager.PostAsJsonAsync(
                $"/api/interviews/{mineId}/scorecards",
                new { recommendation = "Mixed", evidence = "Unsure." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await manager.PostAsJsonAsync($"/api/interviews/{mineId}/scorecards", scorecard, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        var open = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        open.GetProperty("blinded").GetBoolean().ShouldBeFalse();
        open.GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == completedId)
            .GetProperty("scorecards")
            .GetArrayLength()
            .ShouldBe(2);
        var own = open.GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == mineId)
            .GetProperty("scorecards")[0];
        // No kit on this interview: the number comes from the recommendation.
        own.GetProperty("rating").GetInt32().ShouldBe(4);
        own.GetProperty("strengths").GetString().ShouldBe("");
    }

    [Fact]
    public async Task Scorecard_drafts_are_kept_on_the_server_until_submit()
    {
        var ct = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var interview = detail
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .First(x => x.GetProperty("title").GetString() == "Engineering screen");
        var interviewId = interview.GetProperty("id").GetGuid();

        (
            await interviewer.PutAsJsonAsync(
                $"/api/interviews/{interviewId}/scorecard-draft",
                new { json = "{\"evidence\":\"Half done\"}" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var draft = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/interviews/{interviewId}/scorecard-draft",
            ct
        );
        draft
            .GetProperty("draft")
            .GetProperty("json")
            .GetString()
            .ShouldBe("{\"evidence\":\"Half done\"}");
        // Someone else's draft is not theirs to write.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/interviews/{interviewId}/scorecard-draft",
                new { json = "{}" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // The feedback queue lists it once the interview has started.
        (await interviewer.GetFromJsonAsync<JsonElement>("/api/me/scorecards", ct))
            .GetProperty("items")
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("id").GetGuid() == interviewId);
        await StartInterviewAsync(interviewId, ct);
        (await interviewer.GetFromJsonAsync<JsonElement>("/api/me/scorecards", ct))
            .GetProperty("items")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("id").GetGuid() == interviewId);

        // A recruiter can be reminded about it, with a link straight to the form.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/remind",
                new { email = (string?)null },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/remind",
                new { email = (string?)null },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var reminder = (await OutboxAsync(applicationId, ct)).Single(x =>
            x.TemplateKey == "scorecard-reminder" && x.Recipient == "interviewer@example.test"
        );
        reminder.Subject.ShouldContain("Jordan Lee");

        var criteria = interview
            .GetProperty("criteria")
            .EnumerateArray()
            .Select(x => new { criterionId = x.GetProperty("id").GetGuid(), rating = 4 })
            .ToArray();
        (
            await interviewer.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/scorecards",
                new
                {
                    recommendation = "StrongYes",
                    evidence = "Strong.",
                    criteria,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        (
            await interviewer.GetFromJsonAsync<JsonElement>(
                $"/api/interviews/{interviewId}/scorecard-draft",
                ct
            )
        )
            .GetProperty("draft")
            .ValueKind.ShouldBe(JsonValueKind.Null);
        var submitted = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/me/scorecards?status=submitted",
            ct
        );
        submitted
            .GetProperty("items")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("id").GetGuid() == interviewId);

        // Locked, but its author can add a dated correction; nobody else can.
        var mine = (
            await interviewer.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}",
                ct
            )
        )
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId)
            .GetProperty("scorecards")[0];
        var scorecardId = mine.GetProperty("id").GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                $"/api/scorecards/{scorecardId}/addenda",
                new { body = "Not mine" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await interviewer.PostAsJsonAsync(
                $"/api/scorecards/{scorecardId}/addenda",
                new { body = "I meant 3 on craft." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var after = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var corrected = after
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId)
            .GetProperty("scorecards")[0];
        // Corrections come back beside the application, by scorecard.
        after
            .GetProperty("addenda")
            .GetProperty(scorecardId.ToString())[0]
            .GetProperty("body")
            .GetString()
            .ShouldBe("I meant 3 on craft.");
        corrected.GetProperty("evidence").GetString().ShouldBe("Strong.");
    }

    [Fact]
    public async Task A_stage_that_always_emails_queues_one_email_that_can_be_skipped()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)
        ).GetProperty("application");
        var stages = detail.GetProperty("stages").EnumerateArray().ToArray();
        var current = detail.GetProperty("stageId").GetGuid();
        var index = Array.FindIndex(stages, x => x.GetProperty("id").GetGuid() == current);
        var next = stages[index + 1].GetProperty("id").GetGuid();
        async Task SetAsync(Func<AtsDbContext, Task> change)
        {
            using var scope = _factory!.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            await change(db);
            await db.SaveChangesAsync(ct);
        }
        await SetAsync(async db =>
            (await db.PipelineStages.SingleAsync(x => x.Id == next, ct)).EmailOnEntry =
                StageEmail.Always
        );
        int Queued(List<EmailOutboxItem> items) =>
            items.Count(x => x.TemplateKey == "stage-update");
        var before = Queued(await OutboxAsync(applicationId, ct));
        try
        {
            var moved = await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = next, status = "Active" },
                ct
            );
            moved.StatusCode.ShouldBe(HttpStatusCode.OK);
            (await moved.Content.ReadFromJsonAsync<JsonElement>(ct))
                .GetProperty("emailIds")
                .GetArrayLength()
                .ShouldBe(1);
            var outbox = await OutboxAsync(applicationId, ct);
            Queued(outbox).ShouldBe(before + 1);
            // It waits, so the move can be undone before it goes.
            outbox
                .Where(x => x.TemplateKey == "stage-update")
                .Max(x => x.NextAttemptAt)
                .ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddSeconds(30));

            // Back to a quiet stage, then forward again without the email.
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = current, status = "Active" },
                ct
            );
            (
                await recruiter.PatchAsJsonAsync(
                    $"/api/applications/{applicationId}/stage",
                    new
                    {
                        stageId = next,
                        status = "Active",
                        sendEmail = false,
                    },
                    ct
                )
            ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
            Queued(await OutboxAsync(applicationId, ct)).ShouldBe(before + 1);

            // Never to someone who asked not to be contacted.
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = current, status = "Active" },
                ct
            );
            await SetAsync(async db =>
                (
                    await db
                        .Applications.Include(x => x.Candidate)
                        .SingleAsync(x => x.Id == applicationId, ct)
                )
                    .Candidate!
                    .DoNotContact = true
            );
            (
                await recruiter.PatchAsJsonAsync(
                    $"/api/applications/{applicationId}/stage",
                    new { stageId = next, status = "Active" },
                    ct
                )
            ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
            Queued(await OutboxAsync(applicationId, ct)).ShouldBe(before + 1);
        }
        finally
        {
            await SetAsync(async db =>
            {
                (await db.PipelineStages.SingleAsync(x => x.Id == next, ct)).EmailOnEntry =
                    StageEmail.Off;
                var application = await db
                    .Applications.Include(x => x.Candidate)
                    .SingleAsync(x => x.Id == applicationId, ct);
                application.Candidate!.DoNotContact = false;
                application.PipelineStageId = current;
            });
        }
    }

    [Fact]
    public async Task A_decision_records_who_why_and_moves_the_application()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)
        ).GetProperty("application");
        var stages = detail.GetProperty("stages").EnumerateArray().ToArray();
        var hired = stages
            .Single(x => x.GetProperty("name").GetString() == "Hired")
            .GetProperty("id")
            .GetGuid();
        var target = stages[^2].GetProperty("id").GetGuid();

        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/decision",
                new
                {
                    decision = "Advance",
                    stageId = target,
                    rationale = "",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/decision",
                new
                {
                    decision = "Advance",
                    stageId = hired,
                    rationale = "Great panel",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/decision",
                new
                {
                    decision = "Advance",
                    stageId = target,
                    rationale = "Great panel",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        var after = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        after.GetProperty("application").GetProperty("stageId").GetGuid().ShouldBe(target);
        var decision = after.GetProperty("application").GetProperty("decisions")[0];
        decision.GetProperty("decision").GetString().ShouldBe("Advance");
        decision.GetProperty("rationale").GetString().ShouldBe("Great panel");
        decision.GetProperty("decidedBy").GetString().ShouldBe("recruiter@example.test");
    }

    [Fact]
    public async Task Sending_an_offer_does_not_hire_and_a_decline_makes_room_for_a_revision()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var organization = await admin.GetFromJsonAsync<JsonElement>("/api/organization", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/organization",
                new
                {
                    name = organization.GetProperty("name").GetString(),
                    timeZone = "UTC",
                    allowedEmailDomains = Array.Empty<string>(),
                    requireOfferApproval = false,
                    defaultApproverEmails = Array.Empty<string>(),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var applicationId = await JordanApplicationAsync(recruiter, ct);

        // A new offer starts from the job's terms.
        (
            await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/offer", new { }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var offer = (
            await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        ).GetProperty("offer");
        var offerId = offer.GetProperty("id").GetGuid();
        offer.GetProperty("workMode").GetString().ShouldNotBeNullOrEmpty();
        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{offerId}/submit",
                new { approvers = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PutAsJsonAsync(
                $"/api/offers/{offerId}",
                new
                {
                    baseSalary = 120000m,
                    currency = "eur",
                    payPeriod = "year",
                    startDate = "2027-03-01",
                    note = "Strong panel",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{offerId}/submit",
                new { approvers = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // Editing an approved offer sends it back to draft.
        var edit = await recruiter.PutAsJsonAsync(
            $"/api/offers/{offerId}",
            new
            {
                baseSalary = 120000m,
                currency = "EUR",
                payPeriod = "Year",
                startDate = "2027-03-01",
                bonus = "10% target",
            },
            ct
        );
        (await edit.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("reset")
            .GetBoolean()
            .ShouldBeTrue();
        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{offerId}/submit",
                new { approvers = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{offerId}/send",
                new { notifyCandidate = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var sent = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        sent.GetProperty("application").GetProperty("status").GetString().ShouldBe("Active");
        var view = (
            await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        ).GetProperty("offer");
        view.GetProperty("status").GetString().ShouldBe("Sent");
        view.GetProperty("currency").GetString().ShouldBe("EUR");
        view.GetProperty("baseSalary").GetDecimal().ShouldBe(120000m);

        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{offerId}/response",
                new { accepted = false, declineReason = "Took another offer" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/offer", new { }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var revised = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/offer",
            ct
        );
        revised.GetProperty("offer").GetProperty("replacesOfferId").GetGuid().ShouldBe(offerId);
        revised.GetProperty("offer").GetProperty("baseSalary").GetDecimal().ShouldBe(120000m);
        revised.GetProperty("history")[0].GetProperty("status").GetString().ShouldBe("Declined");

        // Accepting is what hires, and it can be undone.
        var revisedId = revised.GetProperty("offer").GetProperty("id").GetGuid();
        await recruiter.PostAsJsonAsync(
            $"/api/offers/{revisedId}/submit",
            new { approvers = Array.Empty<string>() },
            ct
        );
        await recruiter.PostAsJsonAsync(
            $"/api/offers/{revisedId}/send",
            new { notifyCandidate = false },
            ct
        );
        (
            await recruiter.PostAsJsonAsync(
                $"/api/offers/{revisedId}/response",
                new { accepted = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct))
            .GetProperty("application")
            .GetProperty("status")
            .GetString()
            .ShouldBe("Hired");
        (
            await recruiter.PostAsync($"/api/offers/{revisedId}/reverse", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct))
            .GetProperty("application")
            .GetProperty("status")
            .GetString()
            .ShouldBe("Active");
        (
            await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        )
            .GetProperty("offer")
            .GetProperty("status")
            .GetString()
            .ShouldBe("Sent");
    }
}
