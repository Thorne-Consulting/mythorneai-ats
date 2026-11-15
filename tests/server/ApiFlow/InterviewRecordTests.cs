using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private async Task<Guid> InterviewsJordanApplicationAsync(
        HttpClient recruiter,
        CancellationToken ct
    )
    {
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?search=Jordan%20Lee",
            ct
        );
        var id = candidates
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>($"/api/candidates/{id}", ct);
        return candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
    }

    private static async Task<Guid> ScheduleInterviewForTestAsync(
        HttpClient recruiter,
        Guid applicationId,
        string title,
        DateTimeOffset startsAt,
        CancellationToken ct
    )
    {
        var response = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title,
                startsAt,
                endsAt = startsAt.AddMinutes(45),
                timeZone = "America/Chicago",
                meetingLink = (string?)null,
                interviewerEmails = new[] { "interviewer@example.test" },
            },
            ct
        );
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
    }

    [Fact]
    public async Task Interview_page_keeps_notes_from_a_panelist_until_their_scorecard_is_in()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "Notes leak check",
            DateTimeOffset.UtcNow.AddHours(-2),
            ct
        );
        (
            await recruiter.PutAsJsonAsync(
                $"/api/interviews/{interviewId}/meeting-notes",
                new { notes = "Strong on systems, unsure on testing.", source = "Pasted" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        var before = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/interviews/{interviewId}",
            ct
        );
        before.GetProperty("interview").GetProperty("notesVisible").GetBoolean().ShouldBeFalse();
        before
            .GetProperty("interview")
            .GetProperty("meetingNotes")
            .ValueKind.ShouldBe(JsonValueKind.Null);
        var application = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        application
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId)
            .GetProperty("meetingNotes")
            .ValueKind.ShouldBe(JsonValueKind.Null);
        // Nor can they overwrite notes they cannot read.
        (
            await interviewer.PutAsJsonAsync(
                $"/api/interviews/{interviewId}/meeting-notes",
                new { notes = "Overwrite", source = (string?)null },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        // Send scorecards for every interview this person owes on Jordan, so nothing blinds them.
        var owed = application
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Where(x =>
                x.GetProperty("interviewerEmails")
                    .EnumerateArray()
                    .Any(e => e.GetString() == "interviewer@example.test")
                && x.GetProperty("status").GetString() is not ("Cancelled" or "NoShow")
            )
            .Select(x =>
                (
                    Id: x.GetProperty("id").GetGuid(),
                    Future: x.GetProperty("startsAt").GetDateTimeOffset() > DateTimeOffset.UtcNow
                )
            )
            .ToArray();
        foreach (var (id, future) in owed)
            if (future)
                await recruiter.PostAsJsonAsync(
                    $"/api/interviews/{id}/cancel",
                    new { reason = "Test clean-up" },
                    ct
                );
            else
                (
                    await interviewer.PostAsJsonAsync(
                        $"/api/interviews/{id}/scorecards",
                        new
                        {
                            recommendation = "Yes",
                            evidence = "Clear examples.",
                            strengths = "Depth",
                            concerns = "None",
                        },
                        ct
                    )
                ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var after = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/interviews/{interviewId}",
            ct
        );
        after.GetProperty("interview").GetProperty("notesVisible").GetBoolean().ShouldBeTrue();
        after
            .GetProperty("interview")
            .GetProperty("meetingNotes")
            .GetString()
            .ShouldBe("Strong on systems, unsure on testing.");
    }

    [Fact]
    public async Task Cancelling_needs_a_reason_and_tells_people_in_their_own_time_zone()
    {
        var ct = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me/availability",
                new
                {
                    timeZone = "Europe/London",
                    hours = new Dictionary<string, string[][]>
                    {
                        ["1"] =
                        [
                            ["08:00", "12:00"],
                            ["13:00", "17:00"],
                        ],
                    },
                    bufferMinutes = 10,
                    maxInterviewsPerDay = 3,
                    maxInterviewsPerWeek = (int?)null,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var mine = await interviewer.GetFromJsonAsync<JsonElement>("/api/me/availability", ct);
        mine.GetProperty("timeZone").GetString().ShouldBe("Europe/London");
        mine.GetProperty("hours").GetProperty("1").GetArrayLength().ShouldBe(2);
        (
            await interviewer.PutAsJsonAsync(
                "/api/me/availability",
                new
                {
                    timeZone = "Not/AZone",
                    hours = (object?)null,
                    bufferMinutes = 0,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        using (var scope = _factory!.Services.CreateScope())
        {
            // Links in emails need to know where the app lives.
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            await db.Organizations.ExecuteUpdateAsync(
                set => set.SetProperty(x => x.PublicUrl, "https://ats.example.test"),
                ct
            );
        }
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var startsAt = new DateTimeOffset(
            DateTimeOffset.UtcNow.AddDays(5).Date.AddHours(15),
            TimeSpan.Zero
        );
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "Zone check",
            startsAt,
            ct
        );

        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var invite = await db.EmailOutbox.SingleAsync(
                x =>
                    x.ApplicationId == applicationId
                    && x.Recipient == "interviewer@example.test"
                    && x.Body.Contains("Zone check"),
                ct
            );
            invite.Body.ShouldContain(
                TimeText.Range(startsAt, startsAt.AddMinutes(45), TimeText.Zone("Europe/London"))
            );
            invite.Body.ShouldContain($"/interviews/{interviewId}");
            invite.Body.ShouldNotContain(startsAt.ToString("u"));
        }

        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/cancel",
                new { reason = " " },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/outcome",
                new { outcome = "Completed" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/cancel",
                new
                {
                    reason = "An interviewer can't make it",
                    messageToCandidate = "Sorry, we will find a new time.",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var cancelled = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/interviews/{interviewId}",
            ct
        );
        cancelled.GetProperty("interview").GetProperty("status").GetString().ShouldBe("Cancelled");
        cancelled
            .GetProperty("interview")
            .GetProperty("cancelReason")
            .GetString()
            .ShouldBe("An interviewer can't make it");

        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var toCandidate = await db.EmailOutbox.SingleAsync(
                x =>
                    x.ApplicationId == applicationId
                    && x.Subject.Contains("Zone check")
                    && x.Subject.Contains("cancelled"),
                ct
            );
            toCandidate.Body.ShouldContain("Sorry, we will find a new time.");
            toCandidate.Body.ShouldNotContain("can't make it", Case.Insensitive);
        }
    }

    [Fact]
    public async Task A_no_show_is_recorded_once_the_interview_has_started()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "No-show check",
            DateTimeOffset.UtcNow.AddHours(-3),
            ct
        );
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/outcome",
                new { outcome = "NoShow" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/outcome",
                new
                {
                    outcome = "NoShow",
                    noShowParty = "Candidate",
                    notifyCandidate = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var record = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/interviews/{interviewId}",
            ct
        );
        record.GetProperty("interview").GetProperty("status").GetString().ShouldBe("NoShow");
        record
            .GetProperty("interview")
            .GetProperty("noShowParty")
            .GetString()
            .ShouldBe("Candidate");

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        (
            await db.EmailOutbox.CountAsync(
                x => x.ApplicationId == applicationId && x.Subject.StartsWith("We missed you"),
                ct
            )
        ).ShouldBe(1);
    }

    [Fact]
    public async Task A_calendar_change_resets_one_outbox_row_instead_of_adding_another()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "Outbox check",
            DateTimeOffset.UtcNow.AddDays(3),
            ct
        );

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var interview = await db.Interviews.SingleAsync(x => x.Id == interviewId, ct);
        // As if an invite already went out through a calendar that is no longer set up.
        interview.ExternalEventId = "evt-1";
        var disabled = new DisabledWorkplaceIntegration();
        (
            await CalendarOutbox.QueueAsync(
                db,
                disabled,
                interview,
                IntegrationOperation.CreateCalendarEvent,
                ct
            )
        ).ShouldBeTrue();
        await db.SaveChangesAsync(ct);
        (
            await CalendarOutbox.QueueAsync(
                db,
                disabled,
                interview,
                IntegrationOperation.CreateCalendarEvent,
                ct
            )
        ).ShouldBeTrue();
        await db.SaveChangesAsync(ct);
        (
            await db.IntegrationOutbox.CountAsync(
                x =>
                    x.EntityId == interviewId
                    && x.Operation == IntegrationOperation.CreateCalendarEvent,
                ct
            )
        ).ShouldBe(1);

        // With no calendar anywhere, nothing is queued and nothing pretends to be.
        var plain = await db.Interviews.SingleAsync(x => x.Id == interviewId, ct);
        plain.ExternalEventId = null;
        (
            await CalendarOutbox.QueueAsync(
                db,
                disabled,
                plain,
                IntegrationOperation.CreateCalendarEvent,
                ct
            )
        ).ShouldBeFalse();
        plain.CalendarStatus.ShouldBe("NotConfigured");
    }
}
