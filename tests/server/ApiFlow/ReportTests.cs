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
    [Fact]
    public async Task Every_report_number_drills_into_the_applications_it_counts()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var funnel = await recruiter.GetFromJsonAsync<JsonElement>("/api/reports/funnel", ct);
        var row = funnel.GetProperty("rows")[1];
        var drill = funnel.GetProperty("rowDrill")[1];
        var stage = drill.GetProperty("reached").GetString()!;
        var list = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/reports/applications?report=funnel&reached={Uri.EscapeDataString(stage)}",
            ct
        );
        list.GetProperty("total").GetInt32().ShouldBe(row[1].GetInt32());
        list.GetProperty("criteria")[0].GetString().ShouldBe($"Reached {stage}");
        (
            await recruiter.GetAsync(
                $"/api/reports/applications?report=funnel&reached={Uri.EscapeDataString(stage)}&format=csv",
                ct
            )
        ).Content.Headers.ContentType!.MediaType.ShouldBe("text/csv");

        // Sources match whatever the capitals; the filter list comes from the data.
        var options = await recruiter.GetFromJsonAsync<JsonElement>("/api/reports/options", ct);
        var source = options.GetProperty("sources")[0].GetString()!;
        var exact = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/reports/funnel?source={Uri.EscapeDataString(source)}",
            ct
        );
        var lower = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/reports/funnel?source={Uri.EscapeDataString($" {source.ToLowerInvariant()} ")}",
            ct
        );
        exact.GetProperty("stats")[0].GetProperty("number").GetDouble().ShouldBeGreaterThan(0);
        lower
            .GetProperty("stats")[0]
            .GetProperty("number")
            .GetDouble()
            .ShouldBe(exact.GetProperty("stats")[0].GetProperty("number").GetDouble());

        // Breakdowns replace the rows; the overview is one request with a comparison period.
        var byDepartment = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/reports/hires?groupBy=department",
            ct
        );
        byDepartment.GetProperty("columns")[0].GetString().ShouldBe("Department");
        // Date presets resolve in the organization's zone and still query in UTC.
        foreach (
            var path in new[]
            {
                "/api/reports/funnel?range=30d",
                "/api/reports/hires?range=year",
                "/api/reports/time-to-hire?range=custom&from=2026-01-01&to=2026-12-31",
            }
        )
            (await recruiter.GetAsync(path, ct)).StatusCode.ShouldBe(HttpStatusCode.OK, path);
        var overview = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/reports/overview?range=90d",
            ct
        );
        overview.GetProperty("kpis").GetArrayLength().ShouldBe(4);
        overview.GetProperty("comparison").GetString().ShouldBe("previous 90 days");
        overview.GetProperty("charts").GetArrayLength().ShouldBe(4);
    }

    /// <summary>
    /// Two jobs in their own department whose pipelines name stages differently but share types,
    /// with offers that were accepted, declined, revised, left waiting, expired and withdrawn.
    /// Returns the second job.
    /// </summary>
    private async Task<Guid> SeedReportJobsAsync(string department, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var now = DateTimeOffset.UtcNow;
        Requisition Job(string code, params (string Name, StageType Type)[] stages)
        {
            var job = new Requisition
            {
                Code = code,
                Title = $"Report job {code}",
                Department = department,
                Location = "Remote",
                EmploymentType = "Full time",
                WorkMode = "Remote",
                OwnerEmail = "manager@example.test",
                RecruiterEmail = "recruiter@example.test",
                Status = RequisitionStatus.Open,
            };
            job.Stages = stages
                .Select(
                    (s, i) =>
                        new PipelineStage
                        {
                            Name = s.Name,
                            Type = s.Type,
                            CandidateLabel = s.Name,
                            SortOrder = i,
                            IsTerminal = s.Type == StageType.Hired,
                        }
                )
                .ToList();
            db.Requisitions.Add(job);
            return job;
        }
        var a = Job(
            "RPT-A",
            ("New", StageType.Applied),
            ("Phone screen", StageType.Screen),
            ("Onsite", StageType.Interview),
            ("Offer", StageType.Offer),
            ("Hired", StageType.Hired)
        );
        var b = Job(
            "RPT-B",
            ("Inbox", StageType.Applied),
            ("Recruiter call", StageType.Screen),
            ("Panel", StageType.Interview),
            ("Reference check", StageType.Other),
            ("Offer out", StageType.Offer),
            ("Hired", StageType.Hired)
        );
        var count = 0;
        // Moves the application through every stage up to `stage`, a day apart, then sets its status.
        Application Apply(
            Requisition job,
            int stage,
            ApplicationStatus status = ApplicationStatus.Active,
            string? reason = null
        )
        {
            count++;
            var candidate = new Candidate
            {
                FirstName = "Report",
                LastName = $"Person {count}",
                Email = $"report.person{count}@example.test",
                Source = "Report test",
            };
            var app = new Application
            {
                CandidateId = candidate.Id,
                RequisitionId = job.Id,
                PipelineStageId = job.Stages[stage].Id,
                Status = status,
                Source = "Report test",
                DispositionReason = reason,
                AppliedAt = now.AddDays(-20),
                LastActivityAt = now.AddDays(-20 + stage + 1),
            };
            db.Candidates.Add(candidate);
            db.Applications.Add(app);
            for (var i = 0; i <= stage; i++)
                db.StageTransitions.Add(
                    new StageTransition
                    {
                        ApplicationId = app.Id,
                        RequisitionId = job.Id,
                        FromStageId = i == 0 ? null : job.Stages[i - 1].Id,
                        ToStageId = job.Stages[i].Id,
                        ToStatus =
                            i == stage && status == ApplicationStatus.Hired
                                ? ApplicationStatus.Hired
                                : ApplicationStatus.Active,
                        OccurredAt = now.AddDays(-20 + i),
                    }
                );
            if (status is ApplicationStatus.Rejected)
                db.StageTransitions.Add(
                    new StageTransition
                    {
                        ApplicationId = app.Id,
                        RequisitionId = job.Id,
                        FromStageId = job.Stages[stage].Id,
                        ToStageId = job.Stages[stage].Id,
                        ToStatus = status,
                        OccurredAt = now.AddDays(-19 + stage),
                    }
                );
            return app;
        }
        Offer Sent(
            Application app,
            int sentDaysAgo,
            OfferStatus status,
            int? answeredDaysAgo = null,
            string? reason = null
        )
        {
            var offer = new Offer
            {
                ApplicationId = app.Id,
                CreatedBy = "recruiter@example.test",
                Status = status,
                SentAt = now.AddDays(-sentDaysAgo),
                RespondedAt = answeredDaysAgo is { } days ? now.AddDays(-days) : null,
                DeclineReason = reason,
            };
            db.Offers.Add(offer);
            return offer;
        }

        Apply(a, 0);
        Apply(a, 1);
        var onsite = Apply(a, 2);
        var hiredA = Apply(a, 4, ApplicationStatus.Hired);
        Apply(a, 1, ApplicationStatus.Rejected, "Not enough experience");
        var panel = Apply(b, 2);
        Apply(b, 3);
        var hiredB = Apply(b, 5, ApplicationStatus.Hired);
        var offerOut = Apply(b, 4);

        Sent(onsite, 5, OfferStatus.Sent).ExpiresOn = DateOnly.FromDateTime(
            now.AddDays(-3).UtcDateTime
        );
        Sent(hiredA, 5, OfferStatus.Accepted, answeredDaysAgo: 3);
        var declined = Sent(panel, 4, OfferStatus.Declined, 3, "Took another offer");
        Sent(panel, 1, OfferStatus.Sent).ReplacesOfferId = declined.Id;
        Sent(hiredB, 6, OfferStatus.Accepted, answeredDaysAgo: 2);
        Sent(offerOut, 2, OfferStatus.Withdrawn);
        // Drafted but never sent: not an offer for these reports.
        db.Offers.Add(
            new Offer
            {
                ApplicationId = offerOut.Id,
                CreatedBy = "recruiter@example.test",
                Status = OfferStatus.PendingApproval,
            }
        );
        await db.SaveChangesAsync(ct);
        return b.Id;
    }

    [Fact]
    public async Task Reports_add_up_stages_by_type_across_jobs_and_count_offer_answers()
    {
        var ct = TestContext.Current.CancellationToken;
        const string team = "Report test team";
        var jobB = await SeedReportJobsAsync(team, ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var filter = $"department={Uri.EscapeDataString(team)}";
        async Task<JsonElement> Get(string path) =>
            await admin.GetFromJsonAsync<JsonElement>(path, ct);
        async Task<int> Drill(string query) =>
            (await Get($"/api/reports/applications?{filter}&{query}"))
                .GetProperty("total")
                .GetInt32();
        static string[] Column(JsonElement report, int index = 0) =>
            report.GetProperty("rows").EnumerateArray().Select(r => r[index].ToString()).ToArray();

        // "Onsite" and "Panel" are both Interview; Other stages stay out of a combined funnel.
        var funnel = await Get($"/api/reports/funnel?{filter}");
        Column(funnel).ShouldBe(["Applied", "Screening", "Interview", "Offer", "Hired"]);
        Column(funnel, 1).ShouldBe(["9", "8", "6", "3", "2"]);
        (await Drill("report=funnel&reached=Interview")).ShouldBe(6);
        (await Drill("report=funnel&stage=Screening")).ShouldBe(2);

        // One job keeps its own stage names and order.
        var single = await Get($"/api/reports/funnel?requisitionId={jobB}");
        Column(single)
            .ShouldBe([
                "Inbox",
                "Recruiter call",
                "Panel",
                "Reference check",
                "Offer out",
                "Hired",
            ]);
        (await Drill($"report=funnel&requisitionId={jobB}&reached=Panel")).ShouldBe(4);

        var velocity = await Get($"/api/reports/velocity?{filter}");
        Column(velocity).ShouldContain("Other");
        Column(velocity).ShouldNotContain("Onsite");
        velocity
            .GetProperty("rows")
            .EnumerateArray()
            .Single(r => r[0].GetString() == "Interview")[1]
            .GetInt32()
            .ShouldBe(2);
        var rejections = await Get($"/api/reports/rejections?{filter}&groupBy=stage");
        Column(rejections).ShouldBe(["Screening"]);

        // Reached offer means an offer went out (or they were hired), not a draft.
        var sources = await Get($"/api/reports/sources?{filter}");
        sources.GetProperty("rows")[0][3].GetDouble().ShouldBe(55.6);

        var offers = await Get($"/api/reports/offers?{filter}");
        var stats = offers.GetProperty("stats");
        stats[0].GetProperty("number").GetDouble().ShouldBe(6);
        stats[1].GetProperty("number").GetDouble().ShouldBe(66.7);
        stats[2].GetProperty("number").GetDouble().ShouldBe(2);
        stats[3].GetProperty("number").GetDouble().ShouldBe(1);
        Column(offers, 3)
            .Order()
            .ShouldBe([
                "Accepted",
                "Accepted",
                "Declined",
                "Expired with no answer",
                "Waiting for an answer",
                "Withdrawn by your team",
            ]);
        (await Drill("report=offers&offer=sent")).ShouldBe(5);
        (await Drill("report=offers&offer=expired")).ShouldBe(1);
        (await Drill("report=offers&offer=declined&declineReason=took%20another%20offer")).ShouldBe(
            1
        );
        var criteria = (
            await Get($"/api/reports/applications?{filter}&report=offers&offer=accepted&range=30d")
        )
            .GetProperty("criteria")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ToList();
        criteria.ShouldContain("Offer accepted");
        criteria.ShouldContain("Offer sent in the last 30 days");

        var byJob = await Get($"/api/reports/offers?{filter}&groupBy=job");
        byJob.GetProperty("columns")[0].GetString().ShouldBe("Job");
        var b = byJob
            .GetProperty("rows")
            .EnumerateArray()
            .Single(r => r[0].GetString() == "Report job RPT-B");
        // Sent, accepted, declined, waiting, expired, withdrawn, rate, median days, revised.
        Enumerable
            .Range(1, 9)
            .Select(i => b[i].ToString())
            .ShouldBe(["4", "1", "1", "1", "0", "1", "50", "2.5", "1"]);
        byJob.GetProperty("rowDrill")[0].GetProperty("offer").GetString().ShouldBe("sent");

        // The overview's fourth number is offer acceptance, compared in points.
        var overview = await Get("/api/reports/overview");
        var kpi = overview
            .GetProperty("kpis")
            .EnumerateArray()
            .Single(x => x.GetProperty("key").GetString() == "offers");
        kpi.GetProperty("percent").GetBoolean().ShouldBeTrue();
        kpi.GetProperty("report").GetString().ShouldBe("offers");
    }

    [Fact]
    public async Task Report_reminders_use_the_standard_emails_with_every_detail_filled_in()
    {
        var ct = TestContext.Current.CancellationToken;
        const string team = "Reminder test team";
        await SeedReportJobsAsync(team, ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        Guid[] stuck;
        Guid interviewId;
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            stuck = await db
                .Applications.Where(x =>
                    x.Requisition!.Department == team && x.Status == ApplicationStatus.Active
                )
                .Select(x => x.Id)
                .ToArrayAsync(ct);
            var ended = DateTimeOffset.UtcNow.AddDays(-2);
            var interview = new Interview
            {
                ApplicationId = stuck[0],
                Title = "Panel interview",
                TimeZone = "UTC",
                StartsAt = ended.AddHours(-1),
                EndsAt = ended,
                InterviewerEmails = ["interviewer@example.test"],
            };
            db.Interviews.Add(interview);
            await db.SaveChangesAsync(ct);
            interviewId = interview.Id;
        }

        var scorecards = await admin.PostAsJsonAsync(
            "/api/reports/scorecards/remind",
            new { items = new[] { new { interviewId, interviewer = "interviewer@example.test" } } },
            ct
        );
        (await scorecards.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("sent")
            .GetInt32()
            .ShouldBe(1);
        (
            await admin.PostAsJsonAsync(
                "/api/reports/stuck/remind",
                new { applicationIds = stuck },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var emails = await db
                .EmailOutbox.Where(x =>
                    x.Recipient == "interviewer@example.test"
                    || x.Recipient == "recruiter@example.test"
                )
                .ToListAsync(ct);
            // The background sweep may queue its own reminder for the same interview; both use the helper.
            var mine = emails
                .Where(x =>
                    x.TemplateKey == "scorecard-reminder" && x.ApplicationId == stuck[0]
                    || x.TemplateKey == "notification" && x.Subject.EndsWith("waiting on you")
                )
                .ToList();
            mine.ShouldContain(x =>
                x.TemplateKey == "scorecard-reminder" && x.Subject.Contains("Report Person")
            );
            var nudge = mine.Single(x => x.TemplateKey == "notification");
            nudge.Subject.ShouldBe($"{stuck.Length} applications are waiting on you");
            nudge.Body.ShouldContain("Panel");
            mine.ShouldAllBe(x => !x.Subject.Contains("{{") && !x.Body.Contains("{{"));
        }
    }

    [Fact]
    public async Task Report_views_can_be_shared_pinned_and_emailed_in_each_readers_scope()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var manager = await LoginAsync("manager@example.test", ct);
        var created = await recruiter.PostAsJsonAsync(
            "/api/reports/views",
            new
            {
                name = "Funnel this quarter",
                paramsJson = """{"report":"funnel","range":"quarter"}""",
                shared = true,
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (
            await recruiter.PostAsJsonAsync(
                "/api/reports/views",
                new { name = "Broken", paramsJson = """{"report":"nope"}""" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var seen = (await manager.GetFromJsonAsync<JsonElement>("/api/reports/views", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id);
        seen.GetProperty("mine").GetBoolean().ShouldBeFalse();
        (await manager.PutAsync($"/api/reports/views/{id}/pin", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (
            await manager.PutAsJsonAsync($"/api/reports/views/{id}", new { name = "Mine now" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await recruiter.PutAsJsonAsync(
                $"/api/reports/views/{id}",
                new { name = "Funnel, this quarter" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var pinned = (await manager.GetFromJsonAsync<JsonElement>("/api/reports/views", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id);
        pinned.GetProperty("pinned").GetBoolean().ShouldBeTrue();
        pinned.GetProperty("name").GetString().ShouldBe("Funnel, this quarter");

        // Only people who can see reports can get the email.
        (
            await recruiter.PostAsJsonAsync(
                "/api/reports/subscriptions",
                new
                {
                    savedViewId = id,
                    recipients = new[] { "interviewer@example.test" },
                    frequency = "Weekly",
                    dayOfWeek = 1,
                    dayOfMonth = 1,
                    hour = 8,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                "/api/reports/subscriptions",
                new
                {
                    savedViewId = id,
                    recipients = new[] { "recruiter@example.test", "manager@example.test" },
                    frequency = "Weekly",
                    dayOfWeek = 1,
                    dayOfMonth = 1,
                    hour = 8,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var mine = (await manager.GetFromJsonAsync<JsonElement>("/api/reports/subscriptions", ct))
            .EnumerateArray()
            .Single();
        mine.GetProperty("schedule").GetString()!.ShouldStartWith("every Monday at 8:00 AM");

        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await ReportDigest.SendDueAsync(db, DateTimeOffset.UtcNow.AddDays(8), ct)).ShouldBe(1);
            var emails = await db
                .EmailOutbox.Where(x => x.TemplateKey == "report-digest")
                .ToListAsync(ct);
            emails
                .Select(x => x.Recipient)
                .Order()
                .ShouldBe(["manager@example.test", "recruiter@example.test"]);
            emails.ShouldAllBe(x =>
                x.Body.Contains("Hiring funnel: This quarter") && x.Body.Contains("Applications:")
            );
        }

        // A recipient can stop it for themselves; the owner can delete the view and its schedule.
        var subscriptionId = mine.GetProperty("id").GetGuid();
        (
            await manager.PostAsync(
                $"/api/reports/subscriptions/{subscriptionId}/unsubscribe",
                null,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await manager.GetFromJsonAsync<JsonElement>("/api/reports/subscriptions", ct))
            .GetArrayLength()
            .ShouldBe(0);
        (await recruiter.DeleteAsync($"/api/reports/views/{id}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await recruiter.GetFromJsonAsync<JsonElement>("/api/reports/subscriptions", ct))
            .GetArrayLength()
            .ShouldBe(0);
    }
}
