using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>The scheduler's loops and emails, self-scheduling links, and chunked recording uploads.</summary>
public sealed partial class ApiFlowTests
{
    private static string TokenOf(string url) => url[(url.LastIndexOf('/') + 1)..];

    [Fact]
    public async Task A_scheduling_link_books_once_moves_and_stops_working_when_it_expires()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);

        // Offering a time the old way now points to the scheduling link.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/interviews",
                new
                {
                    title = "Proposed",
                    startsAt = DateTimeOffset.UtcNow.AddDays(2),
                    endsAt = DateTimeOffset.UtcNow.AddDays(2).AddMinutes(30),
                    timeZone = "America/Chicago",
                    interviewerEmails = new[] { "interviewer@example.test" },
                    status = "Proposed",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var created = await recruiter.PostAsJsonAsync(
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
                messageToCandidate = "Have your portfolio handy.",
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var link = await created.Content.ReadFromJsonAsync<JsonElement>(ct);
        var token = TokenOf(link.GetProperty("url").GetString()!);
        var requestId = link.GetProperty("id").GetGuid();

        // The candidate needs no sign-in: a fresh client with no cookies.
        using var candidate = _factory!.CreateClient();
        var page = await candidate.GetFromJsonAsync<JsonElement>($"/public/scheduling/{token}", ct);
        page.GetProperty("status").GetString().ShouldBe("Open");
        page.GetProperty("durationMinutes").GetInt32().ShouldBe(30);
        page.GetProperty("interviewers")
            .EnumerateArray()
            .ShouldNotContain(x => x.GetString()!.Contains('@'));
        var slots = (
            await candidate.GetFromJsonAsync<JsonElement>($"/public/scheduling/{token}/slots", ct)
        )
            .GetProperty("slots")
            .EnumerateArray()
            .ToList();
        slots.ShouldNotBeEmpty();
        var first = slots[0].GetProperty("startsAt").GetDateTimeOffset();

        // A time nobody offered is refused.
        (
            await candidate.PostAsJsonAsync(
                $"/public/scheduling/{token}/book",
                new { startsAt = first.AddMinutes(7), timeZone = "Europe/London" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var booked = await candidate.PostAsJsonAsync(
            $"/public/scheduling/{token}/book",
            new
            {
                startsAt = first,
                timeZone = "Europe/London",
                note = "Mornings suit me.",
            },
            ct
        );
        booked.StatusCode.ShouldBe(HttpStatusCode.OK);
        var bookedPage = await booked.Content.ReadFromJsonAsync<JsonElement>(ct);
        bookedPage.GetProperty("status").GetString().ShouldBe("Booked");
        // Booking twice (a double click) changes nothing.
        (
            await candidate.PostAsJsonAsync(
                $"/public/scheduling/{token}/book",
                new { startsAt = first, timeZone = "Europe/London" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var interviews = await db
                .Interviews.Where(x => x.SchedulingRequestId == requestId)
                .ToListAsync(ct);
            interviews.Count.ShouldBe(1);
            interviews[0].StartsAt.ShouldBe(first);
            interviews[0].MeetingType.ShouldBe(MeetingTypes.Phone);
            interviews[0].Status.ShouldBe(InterviewStatus.Scheduled);
            var email = await db.EmailOutbox.SingleAsync(
                x => x.Subject.StartsWith("Choose a time for your Phone screen"),
                ct
            );
            // The emailed link is its own key to the same request (each link is sealed afresh).
            var emailed = System
                .Text.RegularExpressions.Regex.Match(email.Body, @"/book/(\S+)")
                .Groups[1]
                .Value;
            emailed.ShouldNotBeEmpty();
            (await candidate.GetAsync($"/public/scheduling/{emailed}", ct)).StatusCode.ShouldBe(
                HttpStatusCode.OK
            );
            email.Body.ShouldContain("Have your portfolio handy.");
            (
                await db.Candidates.SingleAsync(
                    x => x.Applications.Any(a => a.Id == applicationId),
                    ct
                )
            ).TimeZone.ShouldNotBeNull();
        }

        // An expired link no longer offers or takes times.
        var second = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/scheduling-requests",
            new
            {
                title = "Technical",
                durationMinutes = 60,
                interviewerEmails = new[] { "interviewer@example.test" },
                timeZone = "America/Chicago",
                minimumNoticeHours = 0,
                notifyCandidate = false,
            },
            ct
        );
        var secondLink = await second.Content.ReadFromJsonAsync<JsonElement>(ct);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var row = await db.SchedulingRequests.SingleAsync(
                x => x.Id == secondLink.GetProperty("id").GetGuid(),
                ct
            );
            row.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);
        }
        var expiredToken = TokenOf(secondLink.GetProperty("url").GetString()!);
        (await candidate.GetFromJsonAsync<JsonElement>($"/public/scheduling/{expiredToken}", ct))
            .GetProperty("status")
            .GetString()
            .ShouldBe("Expired");
        (
            await candidate.GetAsync($"/public/scheduling/{expiredToken}/slots", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Gone);
        (
            await candidate.PostAsJsonAsync(
                $"/public/scheduling/{expiredToken}/book",
                new { startsAt = first.AddDays(1), timeZone = "UTC" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Gone);

        // A made-up or altered token finds nothing.
        (
            await candidate.GetAsync($"/public/scheduling/{token[..^4]}abcd", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Only_the_people_who_run_the_job_get_a_scheduling_link_address()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/scheduling-requests",
                new
                {
                    title = "Phone screen",
                    durationMinutes = 30,
                    interviewerEmails = new[] { "interviewer@example.test" },
                    timeZone = "UTC",
                    notifyCandidate = false,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var attention = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/interviews/attention",
            ct
        );
        attention
            .GetProperty("openLinks")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("url").GetString()!.Contains("/book/"));

        // A hiring manager who can only view the job sees the application, never the link.
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var job = await db
                .Applications.Where(x => x.Id == applicationId)
                .Select(x => x.Requisition!)
                .SingleAsync(ct);
            // On the job's team as a viewer only.
            var priya = await db.Users.SingleAsync(
                x => x.Email == "priya.manager@example.test",
                ct
            );
            db.RequisitionMembers.RemoveRange(job.Members.Where(m => m.UserId == priya.Id));
            db.RequisitionMembers.Add(
                new RequisitionMember
                {
                    RequisitionId = job.Id,
                    UserId = priya.Id,
                    Role = RequisitionRole.Viewer,
                }
            );
            if (job.OwnerEmail == "priya.manager@example.test")
                job.OwnerEmail = "admin@example.test";
            if (job.RecruiterEmail == "priya.manager@example.test")
                job.RecruiterEmail = "recruiter@example.test";
            await db.SaveChangesAsync(ct);
        }
        using var viewer = await LoginAsync("priya.manager@example.test", ct);
        (await viewer.GetAsync($"/api/applications/{applicationId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.OK
        );
        var theirs = await viewer.GetFromJsonAsync<JsonElement>("/api/interviews/attention", ct);
        theirs
            .GetProperty("openLinks")
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("applicationId").GetGuid() == applicationId);
        (
            await viewer.GetAsync($"/api/applications/{applicationId}/scheduling-requests", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task A_loop_books_back_to_back_with_one_itinerary_and_a_calendar_file()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var start = DateTimeOffset.UtcNow.Date.AddDays(5).AddHours(15);
        var body = new
        {
            sessions = new object[]
            {
                new
                {
                    title = "Systems",
                    startsAt = new DateTimeOffset(start, TimeSpan.Zero),
                    endsAt = new DateTimeOffset(start.AddMinutes(45), TimeSpan.Zero),
                    interviewerEmails = new[] { "interviewer@example.test" },
                },
                new
                {
                    title = "Coding",
                    startsAt = new DateTimeOffset(start.AddMinutes(60), TimeSpan.Zero),
                    endsAt = new DateTimeOffset(start.AddMinutes(120), TimeSpan.Zero),
                    interviewerEmails = new[] { "manager@example.test" },
                },
            },
            timeZone = "America/Chicago",
            meetingType = "Link",
            meetingLink = "https://meet.example.test/loop",
            preview = true,
        };
        // Preview: the emails, nothing saved.
        var preview = await (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/interviews/schedule",
                body,
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var emails = preview.GetProperty("emails").EnumerateArray().ToList();
        emails.Count.ShouldBe(3);
        emails[0].GetProperty("toCandidate").GetBoolean().ShouldBeTrue();
        emails[0].GetProperty("body").GetString()!.ShouldContain("Systems");
        emails[0].GetProperty("body").GetString()!.ShouldContain("Coding");

        var saved = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews/schedule",
            new
            {
                body.sessions,
                body.timeZone,
                body.meetingType,
                body.meetingLink,
            },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.Created);
        var ids = (await saved.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("ids")
            .EnumerateArray()
            .Select(x => x.GetGuid())
            .ToArray();
        ids.Length.ShouldBe(2);

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var sessions = await db.Interviews.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
        sessions.Select(x => x.LoopId).Distinct().Count().ShouldBe(1);
        sessions[0].LoopId.ShouldNotBeNull();
        var candidateEmail = await db
            .Applications.Where(x => x.Id == applicationId)
            .Select(x => x.Candidate!.Email)
            .SingleAsync(ct);
        var itinerary = await db.EmailOutbox.SingleAsync(
            x => x.Recipient == candidateEmail && x.TemplateKey == "interview-booked",
            ct
        );
        itinerary.InlineFileName.ShouldBe("invite.ics");
        itinerary.InlineFileText!.ShouldContain($"interview-{ids[0]:N}@mythorneai");
        itinerary.InlineFileText!.ShouldContain($"interview-{ids[1]:N}@mythorneai");

        // Cancelling one session sends a calendar file that removes it.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{ids[1]}/cancel",
                new { reason = "Interviewer unavailable" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var cancelled = await db.EmailOutbox.FirstAsync(
            x => x.Recipient == candidateEmail && x.Subject.Contains("is cancelled"),
            ct
        );
        cancelled.InlineFileText!.ShouldContain("STATUS:CANCELLED");
        cancelled.InlineFileContentType!.ShouldStartWith("text/calendar");
    }

    [Fact]
    public async Task Recordings_arrive_in_chunks_and_a_retried_chunk_is_not_duplicated()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await InterviewsJordanApplicationAsync(recruiter, ct);
        var interviewId = await ScheduleInterviewForTestAsync(
            recruiter,
            applicationId,
            "Chunked",
            DateTimeOffset.UtcNow.AddHours(-1),
            ct
        );
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/recordings/uploads",
                new { consentConfirmed = false, fileName = "a.webm" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var started = await (
            await recruiter.PostAsJsonAsync(
                $"/api/interviews/{interviewId}/recordings/uploads",
                new
                {
                    consentConfirmed = true,
                    fileName = "a.webm",
                    source = "Browser",
                },
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var id = started.GetProperty("id").GetGuid();
        byte[][] pieces =
        [
            [0x1A, 0x45, 0xDF, 0xA3, 1, 2, 3],
            [4, 5, 6],
            [7, 8, 9, 10],
        ];
        async Task<HttpStatusCode> Send(int index, byte[] bytes)
        {
            using var form = new MultipartFormDataContent
            {
                { new ByteArrayContent(bytes), "file", $"part-{index}" },
            };
            return (
                await recruiter.PostAsync(
                    $"/api/interview-recordings/{id}/chunks/{index}",
                    form,
                    ct
                )
            ).StatusCode;
        }
        // The first piece must look like the file type its name says.
        (await Send(0, [1, 2, 3, 4])).ShouldBe(HttpStatusCode.BadRequest);
        for (var i = 0; i < pieces.Length; i++)
            (await Send(i, pieces[i])).ShouldBe(HttpStatusCode.NoContent);
        (await Send(1, pieces[1])).ShouldBe(HttpStatusCode.NoContent);
        // Someone else cannot add to my recording.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        using (
            var form = new MultipartFormDataContent { { new ByteArrayContent([1]), "file", "x" } }
        )
            (
                await interviewer.PostAsync($"/api/interview-recordings/{id}/chunks/3", form, ct)
            ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/interview-recordings/{id}/complete",
                new { durationSeconds = 95 },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        // The worker joins the pieces in order (no ffmpeg on the test machine), then queues the transcript.
        InterviewRecording? recording = null;
        for (var wait = 0; wait < 60 && recording?.Status != RecordingStatus.Ready; wait++)
        {
            await Task.Delay(500, ct);
            using var scope = _factory!.Services.CreateScope();
            recording = await scope
                .ServiceProvider.GetRequiredService<AtsDbContext>()
                .InterviewRecordings.AsNoTracking()
                .SingleAsync(x => x.Id == id, ct);
        }
        recording!.Status.ShouldBe(RecordingStatus.Ready);
        recording.DurationSeconds.ShouldBe(95);
        var file = await recruiter.GetByteArrayAsync($"/api/interview-recordings/{id}", ct);
        file.ShouldBe(pieces.SelectMany(x => x).ToArray());
        (await Send(3, [11])).ShouldBe(HttpStatusCode.Conflict);
    }
}
