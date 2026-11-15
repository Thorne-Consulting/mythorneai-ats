using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>Templates, notifications and digests, snooze and assignment, undo send, search and bulk email.</summary>
public sealed partial class ApiFlowTests
{
    private async Task<T> InScopeAsync<T>(Func<AtsDbContext, Task<T>> work)
    {
        using var scope = _factory!.Services.CreateScope();
        return await work(scope.ServiceProvider.GetRequiredService<AtsDbContext>());
    }

    private static async Task<JsonElement[]> NotificationsAsync(
        HttpClient client,
        CancellationToken ct
    ) =>
        (
            await client.GetFromJsonAsync<JsonElement>(
                "/api/notifications?status=unread&limit=100",
                ct
            )
        )
            .GetProperty("items")
            .EnumerateArray()
            .ToArray();

    [Fact]
    public async Task Templates_keep_versions_restore_them_and_let_a_job_override_the_wording()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (
            await admin.GetFromJsonAsync<JsonElement>("/api/requisitions?status=Open", ct)
        )[0]
            .GetProperty("id")
            .GetGuid();

        // Two saves make two versions; the second is in use.
        foreach (
            var body in new[]
            {
                "First wording for {{firstName}}.",
                "Second wording for {{firstName}}.",
            }
        )
            (
                await admin.PutAsJsonAsync(
                    "/api/templates/rejection",
                    new { subject = "About {{jobTitle}}", body },
                    ct
                )
            ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var versions = await admin.GetFromJsonAsync<JsonElement>(
            "/api/templates/rejection/versions",
            ct
        );
        versions.GetArrayLength().ShouldBe(2);
        versions[0].GetProperty("version").GetInt32().ShouldBe(2);

        // Restoring version 1 brings its words back as version 3.
        var restored = await (
            await admin.PostAsJsonAsync("/api/templates/rejection/restore", new { version = 1 }, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        restored.GetProperty("version").GetInt32().ShouldBe(3);
        (await admin.GetFromJsonAsync<JsonElement>("/api/templates/rejection", ct))
            .GetProperty("body")
            .GetString()
            .ShouldBe("First wording for {{firstName}}.");

        // A job's own wording wins for that job only; the organization's wording lists it.
        (
            await admin.PutAsJsonAsync(
                "/api/templates/rejection",
                new
                {
                    subject = "About {{jobTitle}}",
                    body = "Job wording for {{firstName}}.",
                    requisitionId = jobId,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var org = await admin.GetFromJsonAsync<JsonElement>("/api/templates/rejection", ct);
        org.GetProperty("overrides")
            .EnumerateArray()
            .Select(x => x.GetProperty("requisitionId").GetGuid())
            .ShouldContain(jobId);
        await InScopeAsync(async db =>
        {
            var forJob = await EmailTemplates.RenderAsync(
                db,
                "rejection",
                jobId,
                new Dictionary<string, string> { ["firstName"] = "Karen" },
                ct
            );
            forJob.Body.ShouldBe("Job wording for Karen.");
            var elsewhere = await EmailTemplates.RenderAsync(
                db,
                "rejection",
                Guid.NewGuid(),
                new Dictionary<string, string> { ["firstName"] = "Karen" },
                ct
            );
            elsewhere.Body.ShouldBe("First wording for Karen.");
            return 0;
        });

        // Resetting is kept in the history; unknown details are refused.
        (await admin.DeleteAsync("/api/templates/rejection", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await admin.GetFromJsonAsync<JsonElement>("/api/templates/rejection/versions", ct))[0]
            .GetProperty("action")
            .GetString()
            .ShouldBe("Reset");
        (
            await admin.PutAsJsonAsync(
                "/api/templates/rejection",
                new { subject = "Hi", body = "Your salary is {{salary}}" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Saved_replies_are_personal_or_shared_and_fill_in_when_sent()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var mine = await (
            await recruiter.PostAsJsonAsync(
                "/api/templates",
                new
                {
                    name = "Mine",
                    subject = "",
                    body = "Hi {{first_name}}, thanks!",
                },
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var mineId = mine.GetProperty("id").GetString();
        (
            await admin.PostAsJsonAsync(
                "/api/templates",
                new
                {
                    name = "Team",
                    subject = "",
                    body = "Hello {{firstName}}",
                    shared = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        var forAdmin = await admin.GetFromJsonAsync<JsonElement>("/api/templates", ct);
        forAdmin
            .GetProperty("saved")
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ShouldBe(["Team"]);
        var forRecruiter = await recruiter.GetFromJsonAsync<JsonElement>("/api/templates", ct);
        var names = forRecruiter
            .GetProperty("saved")
            .EnumerateArray()
            .Select(x => x.GetProperty("name").GetString())
            .ToArray();
        names.ShouldContain("Mine");
        names.ShouldContain("Team");
        // The old {{first_name}} style was stored as {{firstName}}.
        (await recruiter.GetFromJsonAsync<JsonElement>($"/api/templates/{mineId}", ct))
            .GetProperty("body")
            .GetString()
            .ShouldBe("Hi {{firstName}}, thanks!");
        (await admin.GetAsync($"/api/templates/{mineId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );

        // Sending a saved reply fills its details for this candidate; an unknown one blocks the send.
        var (applicationId, _, _) = await PortalCandidateAsync(recruiter, ct);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Hi {{firstName}}, thanks!" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Your code is {{secret}}" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        thread
            .GetProperty("messages")
            .EnumerateArray()
            .Last()
            .GetProperty("body")
            .GetString()
            .ShouldBe("Hi Mia, thanks!");
    }

    [Fact]
    public async Task Undo_takes_back_a_message_before_its_email_goes_and_scheduled_ones_stay_hidden()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        var sent = await (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Oops, wrong person." },
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var messageId = sent.GetProperty("id").GetGuid();
        (
            await InScopeAsync(db =>
                db.EmailOutbox.Where(x =>
                        x.ApplicationId == applicationId
                        && x.TemplateKey == EmailThreads.MessageTemplateKey
                    )
                    .Select(x => x.NextAttemptAt)
                    .SingleAsync(ct)
            )
        ).ShouldBeGreaterThan(DateTimeOffset.UtcNow);
        var undone = await (
            await recruiter.DeleteAsync($"/api/messages/{messageId}", ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        undone.GetProperty("body").GetString().ShouldBe("Oops, wrong person.");
        (
            await InScopeAsync(db =>
                db.EmailOutbox.CountAsync(
                    x =>
                        x.ApplicationId == applicationId
                        && x.TemplateKey == EmailThreads.MessageTemplateKey,
                    ct
                )
            )
        ).ShouldBe(0);

        // A scheduled message waits in Scheduled and is hidden from the candidate until its time.
        var at = DateTimeOffset.UtcNow.AddDays(1);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "See you tomorrow.", scheduledFor = at },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await InboxRowAsync(recruiter, "scheduled", applicationId, ct)).ShouldNotBeNull();
        using var anonymous = _factory!.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Get, "/public/portal");
        request.Headers.Add("X-Candidate-Session", token);
        var portal = await (
            await anonymous.SendAsync(request, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        portal.GetProperty("applications")[0].GetProperty("thread").GetArrayLength().ShouldBe(0);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Too soon", scheduledFor = DateTimeOffset.UtcNow },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Assignment_and_snooze_route_the_conversation_and_notify_people()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        await CandidateWritesAsync(
            applicationId,
            token,
            "Hello, any news on my visa sponsorship question?",
            ct
        );

        // The recruiter gives it to the admin, who hears about it and sees it in "Assigned to me".
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { assignee = "admin@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await NotificationsAsync(admin, ct)).ShouldContain(x =>
            x.GetProperty("kind").GetString() == NotificationKinds.Assigned
            && x.GetProperty("href").GetString()!.Contains(applicationId.ToString())
        );
        (await InboxRowAsync(admin, "assigned", applicationId, ct)).ShouldNotBeNull();
        (await InboxRowAsync(recruiter, "assigned", applicationId, ct)).ShouldBeNull();
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { assignee = "nobody@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Search finds the conversation by a word in a message and highlights it.
        var found = (await InboxRowAsync(admin, "inbox", applicationId, ct, "visa"))!.Value;
        found.GetProperty("snippet").GetString()!.ShouldContain("<mark>visa</mark>");

        // Snoozed threads leave the inbox; a new candidate message brings them back and notifies the assignee.
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { snoozeUntil = DateTimeOffset.UtcNow.AddDays(2) },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await InboxRowAsync(admin, "inbox", applicationId, ct)).ShouldBeNull();
        (await InboxRowAsync(admin, "snoozed", applicationId, ct)).ShouldNotBeNull();
        await CandidateWritesAsync(applicationId, token, "Following up.", ct);
        (await InboxRowAsync(admin, "inbox", applicationId, ct)).ShouldNotBeNull();
        (await NotificationsAsync(admin, ct)).ShouldContain(x =>
            x.GetProperty("kind").GetString() == NotificationKinds.CandidateMessage
        );

        // A snooze that runs out comes back with a notification for whoever snoozed it.
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { snoozeUntil = DateTimeOffset.UtcNow.AddMinutes(1) },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await InScopeAsync(async db =>
        {
            await NotificationSweep.EndSnoozesAsync(db, DateTimeOffset.UtcNow.AddMinutes(2), ct);
            await db.SaveChangesAsync(ct);
            return 0;
        });
        (await NotificationsAsync(admin, ct)).ShouldContain(x =>
            x.GetProperty("kind").GetString() == NotificationKinds.SnoozeEnded
        );
        (await InboxRowAsync(admin, "inbox", applicationId, ct)).ShouldNotBeNull();

        // Marking everything read clears the bell.
        (
            await admin.PostAsJsonAsync("/api/notifications/read", new { all = true }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>("/api/notifications/count", ct))
            .GetProperty("unread")
            .GetInt32()
            .ShouldBe(0);
    }

    [Fact]
    public async Task Notification_settings_choose_the_bell_email_and_daily_summary()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { assignee = "admin@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // The admin turns off the bell and email for candidate messages, and asks for the daily summary.
        (
            await admin.PutAsJsonAsync(
                "/api/me/notification-preferences",
                new
                {
                    kind = NotificationKinds.CandidateMessage,
                    inApp = false,
                    email = false,
                    digest = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var prefs = await admin.GetFromJsonAsync<JsonElement>(
            "/api/me/notification-preferences",
            ct
        );
        prefs
            .EnumerateArray()
            .Single(x => x.GetProperty("key").GetString() == NotificationKinds.CandidateMessage)
            .GetProperty("digest")
            .GetBoolean()
            .ShouldBeTrue();

        await CandidateWritesAsync(applicationId, token, "Can we move the call?", ct);
        (await NotificationsAsync(admin, ct)).ShouldNotContain(x =>
            x.GetProperty("kind").GetString() == NotificationKinds.CandidateMessage
        );
        (
            await InScopeAsync(db =>
                db.EmailOutbox.CountAsync(
                    x =>
                        x.ApplicationId == applicationId
                        && x.TemplateKey == EmailThreads.AlertTemplateKey,
                    ct
                )
            )
        ).ShouldBe(0);

        // The daily summary carries it, once a day.
        await InScopeAsync(async db =>
        {
            var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
            await NotificationSweep.DigestsAsync(db, organization, DateTimeOffset.UtcNow, ct);
            await db.SaveChangesAsync(ct);
            await NotificationSweep.DigestsAsync(db, organization, DateTimeOffset.UtcNow, ct);
            await db.SaveChangesAsync(ct);
            return 0;
        });
        var digests = await InScopeAsync(db =>
            db.EmailOutbox.Where(x =>
                    x.Recipient == "admin@example.test" && x.TemplateKey == "digest"
                )
                .ToListAsync(ct)
        );
        digests.Count.ShouldBe(1);
        digests[0].Body.ShouldContain("wrote in the candidate portal");
    }

    [Fact]
    public async Task Stalled_applications_become_one_summary_a_day_and_interviews_warn_an_hour_ahead()
    {
        var ct = TestContext.Current.CancellationToken;
        var counts = await InScopeAsync(async db =>
        {
            var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
            var stale = await db
                .Applications.Where(x =>
                    x.Status == ApplicationStatus.Active && !x.PipelineStage!.IsTerminal
                )
                .Take(3)
                .ToListAsync(ct);
            foreach (var application in stale)
                application.LastActivityAt = DateTimeOffset.UtcNow.AddDays(-60);
            var interview = await db
                .Interviews.Where(x => x.InterviewerEmails.Length > 0)
                .FirstAsync(ct);
            interview.Status = InterviewStatus.Scheduled;
            interview.StartsAt = DateTimeOffset.UtcNow.AddMinutes(30);
            interview.EndsAt = DateTimeOffset.UtcNow.AddMinutes(75);
            await db.SaveChangesAsync(ct);
            // Run twice: nothing repeats.
            for (var run = 0; run < 2; run++)
            {
                await NotificationSweep.StalledSummaryAsync(
                    db,
                    organization,
                    DateTimeOffset.UtcNow,
                    ct
                );
                await NotificationSweep.InterviewsSoonAsync(
                    db,
                    organization,
                    DateTimeOffset.UtcNow,
                    ct
                );
                await db.SaveChangesAsync(ct);
            }
            return (
                Stalled: await db
                    .Notifications.Where(x => x.Kind == NotificationKinds.Stalled)
                    .GroupBy(x => x.UserEmail)
                    .Select(g => g.Count())
                    .ToListAsync(ct),
                Soon: await db.Notifications.CountAsync(
                    x => x.GroupKey == $"interview-soon:{interview.Id}",
                    ct
                ),
                Interviewers: interview.InterviewerEmails.Distinct().Count()
            );
        });
        counts.Stalled.ShouldNotBeEmpty();
        counts.Stalled.ShouldAllBe(n => n == 1);
        counts.Soon.ShouldBe(counts.Interviewers);
    }

    [Fact]
    public async Task Bulk_email_messages_each_person_and_skips_people_who_cannot_be_emailed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (first, _, _) = await PortalCandidateAsync(recruiter, ct);
        var (second, _, _) = await PortalCandidateAsync(recruiter, ct);
        await InScopeAsync(async db =>
        {
            var candidate = await db
                .Applications.Where(x => x.Id == second)
                .Select(x => x.Candidate!)
                .SingleAsync(ct);
            candidate.DoNotContact = true;
            await db.SaveChangesAsync(ct);
            return 0;
        });
        var body = new
        {
            applicationIds = new[] { first, second, first },
            subject = "",
            body = "Hi {{firstName}}, quick update on {{jobTitle}}.",
        };
        var preview = await (
            await recruiter.PostAsJsonAsync("/api/messages/bulk/preview", body, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        preview.GetArrayLength().ShouldBe(2);
        preview
            .EnumerateArray()
            .Single(x => x.GetProperty("applicationId").GetGuid() == first)
            .GetProperty("body")
            .GetString()!
            .ShouldStartWith("Hi Mia, quick update on ");
        preview
            .EnumerateArray()
            .Single(x => x.GetProperty("applicationId").GetGuid() == second)
            .GetProperty("skip")
            .GetString()
            .ShouldBe("Asked not to be contacted");

        var result = await (
            await recruiter.PostAsJsonAsync("/api/messages/bulk", body, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        result.GetProperty("sent").GetInt32().ShouldBe(1);
        result.GetProperty("skipped").GetArrayLength().ShouldBe(1);
        (
            await InScopeAsync(db =>
                db.ApplicationMessages.CountAsync(x => x.ApplicationId == first, ct)
            )
        ).ShouldBe(1);
        (
            await InScopeAsync(db =>
                db.ApplicationMessages.CountAsync(x => x.ApplicationId == second, ct)
            )
        ).ShouldBe(0);

        // Picking people (from Candidates or a talent pool) uses their application's conversation.
        var candidateId = await InScopeAsync(db =>
            db.Applications.Where(x => x.Id == first).Select(x => x.CandidateId).SingleAsync(ct)
        );
        var byPerson = await (
            await recruiter.PostAsJsonAsync(
                "/api/messages/bulk/preview",
                new { candidateIds = new[] { candidateId }, subject = "", body = "Hello" },
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        byPerson.GetArrayLength().ShouldBe(1);
        byPerson[0].GetProperty("applicationId").GetGuid().ShouldBe(first);
    }
}
