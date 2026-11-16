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
    private static object AssessmentContent(
        int choicePoints = 2,
        bool timed = true,
        int minutes = 30
    ) =>
        new
        {
            instructions = "Work on your own.",
            minutes,
            timed,
            passMark = 50,
            tabSwitch = true,
            sections = new[]
            {
                new
                {
                    id = "s1",
                    title = "Basics",
                    questions = new object[]
                    {
                        new
                        {
                            id = "q1",
                            type = "single",
                            prompt = "Pick B",
                            points = choicePoints,
                            options = new[]
                            {
                                new
                                {
                                    id = "a",
                                    text = "A",
                                    correct = false,
                                },
                                new
                                {
                                    id = "b",
                                    text = "B",
                                    correct = true,
                                },
                            },
                        },
                        new
                        {
                            id = "q2",
                            type = "long",
                            prompt = "Explain",
                            points = 10,
                            rubric = "Clear and complete",
                        },
                    },
                },
            },
        };

    private static async Task<Guid> PublishedAssessmentAsync(
        HttpClient staff,
        CancellationToken ct,
        object? content = null
    )
    {
        var created = await staff.PostAsJsonAsync(
            "/api/assessments",
            new
            {
                name = "Support writing",
                kind = "Native",
                expiryDays = 7,
                remindAfterDays = 3,
                content = content ?? AssessmentContent(),
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (await staff.PostAsync($"/api/assessments/{id}/publish", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        return id;
    }

    private static async Task<Guid> SendAssessmentAsync(
        HttpClient staff,
        Guid applicationId,
        Guid assessmentId,
        CancellationToken ct
    )
    {
        var sent = await staff.PostAsJsonAsync(
            $"/api/applications/{applicationId}/assessments",
            new { assessmentId, note = "Good luck" },
            ct
        );
        sent.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await sent.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetGuid();
    }

    private async Task<HttpResponseMessage> AsCandidateAsync(
        HttpMethod method,
        string url,
        string? token,
        CancellationToken ct,
        object? body = null
    )
    {
        using var client = _factory!.CreateClient();
        var request = new HttpRequestMessage(method, url)
        {
            Content = body is null ? null : JsonContent.Create(body),
        };
        if (token is not null)
            request.Headers.Add("X-Candidate-Session", token);
        return await client.SendAsync(request, ct);
    }

    private async Task UpdateInviteAsync(
        Guid inviteId,
        Action<AssessmentInvite> change,
        CancellationToken ct
    )
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        change(await db.AssessmentInvites.SingleAsync(x => x.Id == inviteId, ct));
        await db.SaveChangesAsync(ct);
    }

    [Fact]
    public async Task Assessments_score_on_the_server_keep_their_version_and_lock_the_decision()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var assessmentId = await PublishedAssessmentAsync(recruiter, ct);
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        var inviteId = await SendAssessmentAsync(recruiter, applicationId, assessmentId, ct);

        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var email = await db.EmailOutbox.SingleAsync(
                x => x.ApplicationId == applicationId && x.TemplateKey == AssessmentFlow.InviteKey,
                ct
            );
            email.Body.ShouldContain("Good luck");
            email.Body.ShouldContain("Support writing");
        }
        // Sending the same test again is refused: a retake is the way.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/assessments",
                new { assessmentId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        // Before starting: the intro, no questions.
        var intro = await AsCandidateAsync(
            HttpMethod.Get,
            $"/public/assessments/{inviteId}",
            token,
            ct
        );
        intro.StatusCode.ShouldBe(HttpStatusCode.OK);
        var introJson = await intro.Content.ReadFromJsonAsync<JsonElement>(ct);
        introJson.GetProperty("status").GetString().ShouldBe("NotStarted");
        introJson.GetProperty("content").ValueKind.ShouldBe(JsonValueKind.Null);
        introJson.GetProperty("questions").GetInt32().ShouldBe(2);

        // Starting sets the deadline on the server; the questions never carry the answers or the scoring notes.
        var started = await AsCandidateAsync(
            HttpMethod.Post,
            $"/public/assessments/{inviteId}/start",
            token,
            ct
        );
        started.StatusCode.ShouldBe(HttpStatusCode.OK);
        var startedText = await started.Content.ReadAsStringAsync(ct);
        startedText.ShouldNotContain("\"correct\"");
        startedText.ShouldNotContain("rubric");
        var startedJson = JsonDocument.Parse(startedText).RootElement;
        startedJson.GetProperty("status").GetString().ShouldBe("InProgress");
        var deadline = startedJson.GetProperty("deadlineAt").GetDateTimeOffset();
        deadline.ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddMinutes(29));
        // Starting again keeps the same clock.
        var again = await (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/start",
                token,
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        again.GetProperty("deadlineAt").GetDateTimeOffset().ShouldBe(deadline);

        // Autosave: the last save wins and survives a reload.
        foreach (var pick in new[] { "a", "b" })
            (
                await AsCandidateAsync(
                    HttpMethod.Put,
                    $"/public/assessments/{inviteId}/answers/q1",
                    token,
                    ct,
                    new { choiceIds = new[] { pick }, seconds = 12 }
                )
            ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q2",
                token,
                ct,
                new { text = "Because it is clear.", seconds = 90 }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var reloaded = await (
            await AsCandidateAsync(HttpMethod.Get, $"/public/assessments/{inviteId}", token, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var q1 = reloaded
            .GetProperty("answers")
            .EnumerateArray()
            .Single(x => x.GetProperty("questionId").GetString() == "q1");
        q1.GetProperty("choiceIds").EnumerateArray().Select(x => x.GetString()).ShouldBe(["b"]);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/signals",
                token,
                ct,
                new
                {
                    events = new[]
                    {
                        new
                        {
                            type = "left",
                            at = DateTimeOffset.UtcNow,
                            questionId = "q2",
                        },
                        new
                        {
                            type = "nonsense",
                            at = DateTimeOffset.UtcNow,
                            questionId = "q2",
                        },
                    },
                }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // An edit after they started publishes version 2; their attempt keeps version 1.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/assessments/{assessmentId}",
                new
                {
                    name = "Support writing",
                    kind = "Native",
                    expiryDays = 7,
                    content = AssessmentContent(choicePoints: 5),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var detail = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/assessments/{assessmentId}",
            ct
        );
        detail.GetProperty("hasUnpublishedChanges").GetBoolean().ShouldBeTrue();
        (
            await recruiter.PostAsync($"/api/assessments/{assessmentId}/publish", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        detail = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/assessments/{assessmentId}",
            ct
        );
        detail.GetProperty("version").GetProperty("number").GetInt32().ShouldBe(2);
        // Publishing without changes makes no new version.
        (
            await recruiter.PostAsync($"/api/assessments/{assessmentId}/publish", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetFromJsonAsync<JsonElement>($"/api/assessments/{assessmentId}", ct))
            .GetProperty("version")
            .GetProperty("number")
            .GetInt32()
            .ShouldBe(2);

        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/submit",
                token,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        // Nothing is saved after submitting.
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q2",
                token,
                ct,
                new { text = "Changed" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var review = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/assessment-invites/{inviteId}",
            ct
        );
        review.GetProperty("versionNumber").GetInt32().ShouldBe(1);
        review.GetProperty("earned").GetDecimal().ShouldBe(2);
        review.GetProperty("max").GetDecimal().ShouldBe(12);
        review.GetProperty("pending").GetInt32().ShouldBe(1);
        review.GetProperty("integrity").GetArrayLength().ShouldBe(1);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/decision",
                new { decision = "Passed", comment = "Strong" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PutAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/scores",
                new { questionId = "q2", points = 11 },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PutAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/scores",
                new { questionId = "q1", points = 2 },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var scored = await recruiter.PutAsJsonAsync(
            $"/api/assessment-invites/{inviteId}/scores",
            new
            {
                questionId = "q2",
                points = 8,
                note = "Good",
            },
            ct
        );
        scored.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await scored.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("percent")
            .GetInt32()
            .ShouldBe(83);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/decision",
                new { decision = "Passed", comment = "Strong" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // The decision locks the scores; only an admin can reopen, with a reason, and the first decision stays in history.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/scores",
                new { questionId = "q2", points = 2 },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/reopen",
                new { reason = "Wrong click" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        using var admin = await LoginAsync("admin@example.test", ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/reopen",
                new { reason = "" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/reopen",
                new { reason = "Wrong click" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        review = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/assessment-invites/{inviteId}",
            ct
        );
        review.GetProperty("decision").ValueKind.ShouldBe(JsonValueKind.Null);
        var reopened = review
            .GetProperty("history")
            .EnumerateArray()
            .Single(x => x.GetProperty("action").GetString() == "AssessmentGradingReopened");
        reopened.GetProperty("details").GetString()!.ShouldContain("Passed");
        (
            await recruiter.PutAsJsonAsync(
                $"/api/assessment-invites/{inviteId}/scores",
                new { questionId = "q2", points = 9 },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task A_candidate_reaches_only_their_own_assessments()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var assessmentId = await PublishedAssessmentAsync(recruiter, ct);
        var (mine, myToken, _) = await PortalCandidateAsync(recruiter, ct);
        var (_, otherToken, _) = await PortalCandidateAsync(recruiter, ct);
        var inviteId = await SendAssessmentAsync(recruiter, mine, assessmentId, ct);

        (
            await (
                await AsCandidateAsync(HttpMethod.Get, "/public/assessments", myToken, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetArrayLength()
            .ShouldBe(1);
        (
            await (
                await AsCandidateAsync(HttpMethod.Get, "/public/assessments", otherToken, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetArrayLength()
            .ShouldBe(0);
        (
            await AsCandidateAsync(
                HttpMethod.Get,
                $"/public/assessments/{inviteId}",
                otherToken,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/start",
                otherToken,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q1",
                otherToken,
                ct,
                new { choiceIds = new[] { "b" } }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/submit",
                otherToken,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await AsCandidateAsync(HttpMethod.Get, $"/public/assessments/{inviteId}", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);

        // Interviewers never see tests or results.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.GetAsync("/api/assessments", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await interviewer.GetAsync($"/api/assessment-invites/{inviteId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task The_timer_runs_on_the_server_and_late_answers_are_refused()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var assessmentId = await PublishedAssessmentAsync(
            recruiter,
            ct,
            AssessmentContent(minutes: 5)
        );
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        var inviteId = await SendAssessmentAsync(recruiter, applicationId, assessmentId, ct);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"/public/assessments/{inviteId}/start",
                token,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q1",
                token,
                ct,
                new { choiceIds = new[] { "b" } }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        // Inside the grace period a save still lands; after it, it is refused and the attempt submits itself.
        await UpdateInviteAsync(
            inviteId,
            x => x.DeadlineAt = DateTimeOffset.UtcNow.AddSeconds(-10),
            ct
        );
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q2",
                token,
                ct,
                new { text = "Just in time" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await UpdateInviteAsync(
            inviteId,
            x => x.DeadlineAt = DateTimeOffset.UtcNow.AddMinutes(-2),
            ct
        );
        (
            await AsCandidateAsync(
                HttpMethod.Put,
                $"/public/assessments/{inviteId}/answers/q2",
                token,
                ct,
                new { text = "Too late" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        var view = await (
            await AsCandidateAsync(HttpMethod.Get, $"/public/assessments/{inviteId}", token, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        view.GetProperty("status").GetString().ShouldBe("Submitted");
        view.GetProperty("autoSubmitted").GetBoolean().ShouldBeTrue();
        var review = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/assessment-invites/{inviteId}",
            ct
        );
        review.GetProperty("earned").GetDecimal().ShouldBe(2);
        review
            .GetProperty("answers")
            .EnumerateArray()
            .Single(x => x.GetProperty("questionId").GetString() == "q2")
            .GetProperty("text")
            .GetString()
            .ShouldBe("Just in time");

        // The worker's sweep expires links nobody opened.
        var second = await PublishedAssessmentAsync(recruiter, ct);
        var unopened = await SendAssessmentAsync(recruiter, applicationId, second, ct);
        await UpdateInviteAsync(
            unopened,
            x => x.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
            ct
        );
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            await AssessmentFlow.SweepAsync(db, DateTimeOffset.UtcNow, ct);
            (await db.AssessmentInvites.SingleAsync(x => x.Id == unopened, ct)).Status.ShouldBe(
                AssessmentInviteStatus.Expired
            );
        }
        // An expired link can be sent again; the new one is attempt 2.
        var resent = await SendAssessmentAsync(recruiter, applicationId, second, ct);
        var rows = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/assessments",
            ct
        );
        rows.GetProperty("invites")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == resent)
            .GetProperty("attempt")
            .GetInt32()
            .ShouldBe(2);
    }
}
