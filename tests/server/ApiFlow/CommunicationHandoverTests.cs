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

/// <summary>
/// Other areas' emails on the template store, their notifications, the email log and blocked
/// addresses, the team channel and bulk email to a pool.
/// </summary>
public sealed partial class ApiFlowTests
{
    [Fact]
    public void Every_automatic_email_fills_every_detail_it_uses()
    {
        var examples = EmailTemplates.Details.ToDictionary(x => x.Key, x => x.Example);
        foreach (var (key, template) in EmailTemplates.Defaults)
        {
            // Each detail a template uses is declared, and every declared detail is in the registry.
            EmailTemplates
                .Unknown(template.Subject + template.Body, template.Variables)
                .ShouldBeEmpty(key);
            template.Variables.ShouldAllBe(name => examples.ContainsKey(name), key);
            var (subject, body) = EmailTemplates.Render(template.Subject, template.Body, examples);
            subject.ShouldNotContain("{{", customMessage: key);
            body.ShouldNotContain("{{", customMessage: key);
        }
        // The assessments area switches to the template store as soon as these keys exist.
        EmailTemplates.Defaults.ShouldContainKey(AssessmentFlow.InviteKey);
        EmailTemplates.Defaults.ShouldContainKey(AssessmentFlow.ReminderKey);
    }

    [Fact]
    public async Task Reminder_sweeps_run_in_a_non_utc_zone_and_one_failure_does_not_stop_the_rest()
    {
        var ct = TestContext.Current.CancellationToken;
        // Midnight in Chicago, as the UTC instant Postgres accepts.
        var chicago = new Organization
        {
            Name = "Acme",
            OwnerEmail = "admin@example.test",
            TimeZone = "America/Chicago",
        };
        var start = NotificationSweep.DayStart(
            chicago,
            new DateTimeOffset(2026, 11, 14, 15, 0, 0, TimeSpan.Zero)
        );
        start.Offset.ShouldBe(TimeSpan.Zero);
        start.ShouldBe(new DateTimeOffset(2026, 11, 14, 6, 0, 0, TimeSpan.Zero));

        // The whole sweep runs against the database with the organization in that zone.
        await InScopeAsync(async db =>
        {
            await db.Organizations.ExecuteUpdateAsync(
                u => u.SetProperty(x => x.TimeZone, "America/Chicago"),
                ct
            );
            var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
            await NotificationSweep.RunAsync(db, organization, DateTimeOffset.UtcNow, ct);
            return 0;
        });

        // A sweep that throws is logged and the next one still runs.
        var ran = false;
        var failed = await EmailOutboxWorker.RunEachAsync(
            _factory!.Services.GetRequiredService<IServiceScopeFactory>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance,
            [
                ("broken", _ => throw new InvalidOperationException("Broken sweep")),
                (
                    "next",
                    async db =>
                    {
                        ran = await db.Organizations.AnyAsync(ct);
                    }
                ),
            ],
            ct
        );
        failed.ShouldBe(1);
        ran.ShouldBeTrue();
    }

    [Fact]
    public async Task Interview_and_candidate_emails_come_from_templates_with_every_detail_filled()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);

        // Interviews: booked, moved, cancelled, and a link to choose a time.
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "Template check",
            startsAt,
            ct
        );
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/interviews/{interviewId}",
                new
                {
                    title = "Template check",
                    startsAt = startsAt.AddHours(1),
                    endsAt = startsAt.AddHours(1).AddMinutes(45),
                    timeZone = "America/Chicago",
                    interviewerEmails = new[] { "interviewer@example.test" },
                    status = "Scheduled",
                    reason = "The panel moved",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/cancel",
                new { reason = "Filled", messageToCandidate = "Sorry about this." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/scheduling-requests",
                new
                {
                    title = "Phone screen",
                    durationMinutes = 30,
                    interviewerEmails = new[] { "interviewer@example.test" },
                    timeZone = "America/Chicago",
                    windowStart = DateTimeOffset.UtcNow,
                    windowEnd = DateTimeOffset.UtcNow.AddDays(14),
                    minimumNoticeHours = 0,
                    expiresInDays = 7,
                    meetingType = "Phone",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        // Candidate-facing: a document request, applying (twice) and a portal sign-in code.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/document-requests",
                new { label = "References", note = "Two from your last role." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var anonymous = _factory!.CreateClient();
        var jobId = (await PublicJobIdsAsync(anonymous, ct))[0];
        var email = $"tpl.{Guid.NewGuid():N}"[..16] + "@example.test";
        var person = new
        {
            firstName = "Tia",
            lastName = "Template",
            email,
        };
        var applied = await ApplyAsync(anonymous, jobId, person, ct);
        // A day later the unconfirmed application gets a reminder; once confirmed, applying again
        // sends a way back in.
        using (var scope = _factory.Services.CreateScope())
            await ApplicationIntake.FollowUpAsync(
                scope.ServiceProvider.GetRequiredService<AtsDbContext>(),
                scope.ServiceProvider.GetRequiredService<LocalFileStore>(),
                scope.ServiceProvider.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>(),
                DateTimeOffset.UtcNow.AddDays(2),
                true,
                ct
            );
        var reminder = await LastEmailAsync(applied, ct);
        reminder.TemplateKey.ShouldBe(ApplicationIntake.ReminderKey);
        (
            await anonymous.PostAsJsonAsync(
                "/public/applications/verify",
                new { email, code = CodeIn(reminder.Body) },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await ApplyAsync(anonymous, jobId, person, ct);
        (
            await anonymous.PostAsJsonAsync("/public/portal/access-code", new { email }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Accepted);

        string[] moved =
        [
            "interview-booked",
            "interview-rescheduled",
            "interview-cancelled",
            "interview-team-update",
            "interview-choose-time",
            "document-request",
            "application-received",
            "application-already-applied",
            "application-confirm-reminder",
            "portal-code",
        ];
        var emails = await InScopeAsync(db => db.EmailOutbox.AsNoTracking().ToListAsync(ct));
        foreach (var key in moved)
            emails.ShouldContain(x => x.TemplateKey == key, key);
        foreach (
            var sent in emails.Where(x => x.TemplateKey != null && moved.Contains(x.TemplateKey))
        )
        {
            sent.Subject.ShouldNotContain("{{", customMessage: sent.TemplateKey);
            sent.Body.ShouldNotContain("{{", customMessage: sent.TemplateKey);
        }
        // Times read in the reader's zone, and the candidate's emails keep the calendar file.
        var booked = emails.First(x =>
            x.TemplateKey == "interview-booked" && x.ApplicationId == applicationId
        );
        booked.Body.ShouldContain("When: ");
        booked.Body.ShouldNotContain(startsAt.ToString("u"));
        var cancelled = emails.Single(x =>
            x.TemplateKey == "interview-cancelled" && x.ApplicationId == applicationId
        );
        cancelled.Body.ShouldContain("Sorry about this.");
        emails
            .Single(x =>
                x.TemplateKey == "interview-team-update" && x.Subject.StartsWith("New time:")
            )
            .Body.ShouldContain("Reason: The panel moved");
    }

    [Fact]
    public async Task Offer_answers_and_finished_imports_each_notify_once()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var (offerId, recruiters) = await InScopeAsync(async db =>
        {
            var application = await db
                .Applications.Include(x => x.Requisition)
                .SingleAsync(x => x.Id == applicationId, ct);
            var offer = new Offer
            {
                ApplicationId = applicationId,
                Status = OfferStatus.Sent,
                CreatedBy = "recruiter@example.test",
                BaseSalary = 100000,
            };
            db.Offers.Add(offer);
            await db.SaveChangesAsync(ct);
            return (offer.Id, await EmailThreads.RecruitersAsync(db, application.Requisition!, ct));
        });
        recruiters.ShouldNotBeEmpty();

        // Recorded by an admin: each of the job's recruiters hears once; the admin does not.
        (
            await admin.PostAsJsonAsync(
                $"/api/offers/{offerId}/response",
                new { accepted = false, declineReason = "Took another offer" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var told = await InScopeAsync(db =>
            db.Notifications.Where(x => x.Kind == NotificationKinds.OfferResponse)
                .Select(x => x.UserEmail)
                .ToListAsync(ct)
        );
        told.Count.ShouldBe(told.Distinct().Count());
        told.ShouldBe(
            recruiters.Select(x => x.ToLowerInvariant()).Where(x => x != "admin@example.test"),
            ignoreOrder: true
        );
        told.ShouldNotBeEmpty();
        told.ShouldNotContain("admin@example.test");

        // A spreadsheet import tells the person who ran it, once; a dry run tells nobody.
        var csv = "First name,Last name,Email\nIda,Import,ida.import@example.com\n"u8.ToArray();
        (
            await recruiter.PostAsync(
                "/api/candidates/imports?dryRun=true",
                Sheet(csv, "ida.csv"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.PostAsync(
                "/api/candidates/imports?dryRun=false",
                Sheet(csv, "ida.csv"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var imports = await InScopeAsync(db =>
            db.Notifications.Where(x => x.Kind == NotificationKinds.ImportFinished).ToListAsync(ct)
        );
        imports.Count.ShouldBe(1);
        imports[0].UserEmail.ShouldBe("recruiter@example.test");
        imports[0].Title.ShouldContain("ida.csv");
    }

    [Fact]
    public async Task Email_log_retries_and_cancels_and_blocked_addresses_can_be_allowed_again()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var bounced = $"bounce.{Guid.NewGuid():N}"[..18] + "@example.test";
        var (failedId, blockedFailedId, scheduledId, bouncedId, codeId, linkId) =
            await InScopeAsync(async db =>
            {
                db.Candidates.Add(
                    new Candidate
                    {
                        FirstName = "Bo",
                        LastName = "Bounce",
                        Email = bounced,
                        Source = "Test",
                        EmailBounced = true,
                    }
                );
                EmailOutboxItem Item(string to, string subject, Action<EmailOutboxItem> set)
                {
                    var item = new EmailOutboxItem
                    {
                        Recipient = to,
                        Subject = subject,
                        Body = "Hello",
                    };
                    set(item);
                    db.EmailOutbox.Add(item);
                    return item;
                }
                var failed = Item(
                    "someone@example.test",
                    "Failed one",
                    x =>
                    {
                        x.Status = EmailOutboxStatus.Failed;
                        x.Attempts = 5;
                        x.LastError = "The provider was down.";
                    }
                );
                var blockedFailed = Item(
                    bounced,
                    "To a blocked address",
                    x => x.Status = EmailOutboxStatus.Failed
                );
                var scheduled = Item(
                    "later@example.test",
                    "Scheduled one",
                    x =>
                    {
                        x.TemplateKey = "bulk";
                        x.NextAttemptAt = DateTimeOffset.UtcNow.AddDays(1);
                    }
                );
                var bouncedItem = Item(
                    bounced,
                    "Bounced one",
                    x =>
                    {
                        x.Status = EmailOutboxStatus.Succeeded;
                        x.DeliveryStatus = "bounced";
                        x.DeliveryUpdatedAt = DateTimeOffset.UtcNow;
                    }
                );
                var code = Item(
                    "code@example.test",
                    "Your code",
                    x =>
                    {
                        x.TemplateKey = "portal-code";
                        x.Body = "Your sign-in code is **123456**.";
                    }
                );
                var link = Item(
                    "link@example.test",
                    "A message",
                    x =>
                        x.Body =
                            "Read it here: https://jobs.example.test/candidate-portal/link#"
                            + new string('A', 64)
                );
                await db.SaveChangesAsync(ct);
                return (
                    failed.Id,
                    blockedFailed.Id,
                    scheduled.Id,
                    bouncedItem.Id,
                    code.Id,
                    link.Id
                );
            });

        async Task<Guid[]> LogAsync(string status) =>
            (await admin.GetFromJsonAsync<JsonElement>($"/api/admin/email/log?status={status}", ct))
                .GetProperty("items")
                .EnumerateArray()
                .Select(x => x.GetProperty("id").GetGuid())
                .ToArray();
        (await LogAsync("failed")).ShouldContain(failedId);
        (await LogAsync("failed")).ShouldNotContain(scheduledId);
        (await LogAsync("scheduled")).ShouldContain(scheduledId);
        (await LogAsync("scheduled")).ShouldNotContain(failedId);
        (await LogAsync("bounced")).ShouldContain(bouncedId);
        (await recruiter.GetAsync("/api/admin/email/log", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );

        // Sign-in codes are not shown; one-click links are hidden.
        var withCode = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/admin/email/log/{codeId}",
            ct
        );
        withCode.GetProperty("hidden").GetBoolean().ShouldBeTrue();
        withCode.GetProperty("body").ValueKind.ShouldBe(JsonValueKind.Null);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/admin/email/log/{linkId}", ct))
            .GetProperty("body")
            .GetString()!
            .ShouldNotContain(new string('A', 64));

        // Retry a failed email; not one to a blocked address. Cancel a scheduled one.
        (
            await admin.PostAsync($"/api/admin/email/log/{failedId}/retry", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await admin.PostAsync($"/api/admin/email/log/{blockedFailedId}/retry", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await admin.DeleteAsync($"/api/admin/email/log/{scheduledId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await admin.DeleteAsync($"/api/admin/email/log/{bouncedId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Conflict
        );
        await InScopeAsync(async db =>
        {
            var retried = await db
                .EmailOutbox.AsNoTracking()
                .SingleAsync(x => x.Id == failedId, ct);
            retried.Status.ShouldNotBe(EmailOutboxStatus.Failed);
            retried.LastError.ShouldBeNull();
            (await db.EmailOutbox.AnyAsync(x => x.Id == scheduledId, ct)).ShouldBeFalse();
            return 0;
        });

        // The blocked list names the person and why; allowing the address again unblocks it.
        var blocked = await admin.GetFromJsonAsync<JsonElement>("/api/admin/email/blocked", ct);
        var row = blocked
            .EnumerateArray()
            .Single(x => x.GetProperty("email").GetString() == bounced);
        row.GetProperty("name").GetString().ShouldBe("Bo Bounce");
        row.GetProperty("reason").GetString().ShouldBe("Bounced");
        (await admin.DeleteAsync($"/api/admin/email/blocked/{bounced}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (
            await InScopeAsync(db => db.Candidates.SingleAsync(x => x.Email == bounced, ct))
        ).EmailBounced.ShouldBeFalse();

        // The sender name: "Avery at Acme" until an admin picks the team's name.
        (
            await admin.PutAsJsonAsync(
                "/api/admin/email/sender",
                new { senderNameFormat = "CompanyTeam" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement>("/api/admin/email/status", ct))
            .GetProperty("senderNameFormat")
            .GetString()
            .ShouldBe("CompanyTeam");
        EmailThreads.SenderName("CompanyTeam", "Avery Stone", "Acme").ShouldBe("Acme hiring team");
        EmailThreads.SenderName("PersonAtCompany", "Avery Stone", "Acme").ShouldBe("Avery at Acme");
        EmailThreads.SenderName("", null, "Acme").ShouldBe("Acme");
    }

    [Fact]
    public async Task Team_channel_posts_only_chosen_events_in_the_channel_format()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var saved = await (
            await admin.PutAsJsonAsync(
                "/api/admin/team-channel",
                new
                {
                    url = "https://hooks.slack.com/services/T0/B0/x",
                    kinds = new[] { TeamChannel.OfferResponse, "not-a-kind" },
                },
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        saved.GetProperty("format").GetString().ShouldBe("slack");
        saved
            .GetProperty("kinds")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe([TeamChannel.OfferResponse]);

        await InScopeAsync(async db =>
        {
            await db.Organizations.ExecuteUpdateAsync(
                u => u.SetProperty(x => x.PublicUrl, "https://ats.example.test"),
                ct
            );
            await PipelineEvents.NotifyAsync(
                db,
                "Mia wrote.",
                ct,
                TeamChannel.CandidateMessage,
                "/x"
            );
            await PipelineEvents.NotifyAsync(
                db,
                "Mia turned down the offer.",
                ct,
                TeamChannel.OfferResponse,
                "/applications/1/offer"
            );
            await PipelineEvents.NotifyAsync(db, "Approval needed.", ct);
            await db.SaveChangesAsync(ct);
            return 0;
        });
        var posts = await InScopeAsync(db =>
            db.WebhookDeliveries.Where(x => x.EventType == "notification")
                .Select(x => x.Payload)
                .ToListAsync(ct)
        );
        posts.Count.ShouldBe(2);
        posts.ShouldNotContain(x => x.Contains("Mia wrote."));
        var offer = posts.Single(x => x.Contains("turned down"));
        offer.ShouldContain("\"blocks\"");
        offer.ShouldContain("https://ats.example.test/applications/1/offer");

        // Teams gets an Adaptive Card with a button back to the record; anything else plain text.
        var teams = JsonDocument.Parse(
            TeamChannel.Payload("https://acme.webhook.office.com/x", "Hi", "https://a.test/r")
        );
        var card = teams.RootElement.GetProperty("attachments")[0];
        card.GetProperty("contentType")
            .GetString()
            .ShouldBe("application/vnd.microsoft.card.adaptive");
        card.GetProperty("content")
            .GetProperty("actions")[0]
            .GetProperty("url")
            .GetString()
            .ShouldBe("https://a.test/r");
        TeamChannel.Format("https://prod-1.westus.logic.azure.com/workflows/x").ShouldBe("teams");
        JsonDocument
            .Parse(TeamChannel.Payload("https://chat.example.test/hook", "Hi", null))
            .RootElement.GetProperty("text")
            .GetString()
            .ShouldBe("Hi");
    }

    [Fact]
    public async Task Bulk_email_to_a_talent_pool_reaches_exactly_its_members()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (first, _, _) = await PortalCandidateAsync(recruiter, ct);
        await PortalCandidateAsync(recruiter, ct);
        var member = await InScopeAsync(db =>
            db.Applications.Where(x => x.Id == first).Select(x => x.CandidateId).SingleAsync(ct)
        );
        var pool = (
            await (
                await recruiter.PostAsJsonAsync("/api/talent-pools", new { name = "Mailing" }, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                "/api/candidates/bulk",
                new
                {
                    ids = new[] { member },
                    action = "addToPool",
                    poolId = pool,
                },
                ct
            )
        ).IsSuccessStatusCode.ShouldBeTrue();

        var body = new
        {
            poolId = pool,
            subject = "News for {{firstName}}",
            body = "Hi {{firstName}}.",
        };
        var preview = await (
            await recruiter.PostAsJsonAsync("/api/messages/bulk/preview", body, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        preview
            .EnumerateArray()
            .Select(x => x.GetProperty("candidateId").GetGuid())
            .ShouldBe([member]);
        var sent = await (
            await recruiter.PostAsJsonAsync("/api/messages/bulk", body, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        sent.GetProperty("sent").GetInt32().ShouldBe(1);
    }
}
