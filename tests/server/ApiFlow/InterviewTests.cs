using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Interview_recordings_require_consent_and_are_private_application_records()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var startsAt = DateTimeOffset.UtcNow.AddDays(2);
        var scheduled = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Recorded interview",
                interviewKitId = (Guid?)null,
                startsAt,
                endsAt = startsAt.AddMinutes(45),
                timeZone = "America/Chicago",
                meetingLink = (string?)null,
                interviewerEmails = new[] { "interviewer@example.test" },
            },
            cancellationToken
        );
        scheduled.StatusCode.ShouldBe(HttpStatusCode.Created);
        var interviewId = (
            await scheduled.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)
        )
            .GetProperty("id")
            .GetGuid();

        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var notesResponse = await interviewer.PutAsJsonAsync(
            $"/api/interviews/{interviewId}/meeting-notes",
            new
            {
                notes = "The candidate explained the tradeoffs and the agreed next steps.",
                source = "Meeting assistant",
            },
            cancellationToken
        );
        notesResponse.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var applicationWithNotes = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var savedInterview = applicationWithNotes
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        savedInterview
            .GetProperty("meetingNotes")
            .GetString()
            .ShouldBe("The candidate explained the tradeoffs and the agreed next steps.");
        savedInterview.GetProperty("meetingNotesSource").GetString().ShouldBe("Meeting assistant");
        savedInterview
            .GetProperty("meetingNotesUpdatedAt")
            .GetDateTimeOffset()
            .ShouldNotBe(default);

        using (var withoutConsent = RecordingUpload())
        {
            var response = await recruiter.PostAsync(
                $"/api/interviews/{interviewId}/recordings?consentConfirmed=false",
                withoutConsent,
                cancellationToken
            );
            response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        }

        Guid recordingId;
        using (var withConsent = RecordingUpload())
        {
            var response = await recruiter.PostAsync(
                $"/api/interviews/{interviewId}/recordings?consentConfirmed=true",
                withConsent,
                cancellationToken
            );
            response.StatusCode.ShouldBe(HttpStatusCode.Created);
            recordingId = (await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken))
                .GetProperty("id")
                .GetGuid();
        }

        var download = await interviewer.GetAsync(
            $"/api/interview-recordings/{recordingId}",
            cancellationToken
        );
        download.StatusCode.ShouldBe(HttpStatusCode.OK);
        download.Content.Headers.ContentType!.MediaType.ShouldBe("video/webm");

        (
            await recruiter.DeleteAsync(
                $"/api/interview-recordings/{recordingId}",
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await interviewer.GetAsync(
                $"/api/interview-recordings/{recordingId}",
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Interview_kits_require_complete_structured_scorecards()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var allCandidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var jordanId = allCandidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var jordan = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{jordanId}",
            cancellationToken
        );
        var jordanApplicationId = jordan.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var jordanApplication = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{jordanApplicationId}",
            cancellationToken
        );
        // The kit has to belong to the same job as the application it is used on.
        var requisitionId = jordanApplication
            .GetProperty("application")
            .GetProperty("requisitionId")
            .GetGuid();

        var kitResponse = await recruiter.PostAsJsonAsync(
            $"/api/requisitions/{requisitionId}/interview-kits",
            new
            {
                name = "Structured technical interview",
                instructions = "Ask the same core questions for every candidate.",
                durationMinutes = 60,
                criteria = new[]
                {
                    new
                    {
                        name = "Technical judgment",
                        question = "How did you choose the approach?",
                        description = "Explains tradeoffs.",
                        weight = 3,
                    },
                    new
                    {
                        name = "Collaboration",
                        question = "How did you resolve a disagreement?",
                        description = "Works across teams.",
                        weight = 2,
                    },
                },
            },
            cancellationToken
        );
        kitResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var kit = await kitResponse.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var kitId = kit.GetProperty("id").GetGuid();

        var applicationId = jordanApplicationId;
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);
        var interviewResponse = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Structured technical interview",
                interviewKitId = kitId,
                startsAt,
                endsAt = startsAt.AddHours(1),
                timeZone = "America/Chicago",
                meetingLink = (string?)null,
                interviewerEmails = new[] { "interviewer@example.test", "manager@example.test" },
            },
            cancellationToken
        );
        interviewResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var interview = await interviewResponse.Content.ReadFromJsonAsync<JsonElement>(
            cancellationToken
        );
        var interviewId = interview.GetProperty("id").GetGuid();

        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var application = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var interviewDetail = application
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        interviewDetail
            .GetProperty("interviewKitName")
            .GetString()
            .ShouldBe("Structured technical interview");
        var criteria = interviewDetail.GetProperty("criteria").EnumerateArray().ToArray();
        criteria.Length.ShouldBe(2);

        var incomplete = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Strong overall evidence.",
                strengths = "Relevant examples.",
                concerns = "None observed.",
                criteria = Array.Empty<object>(),
            },
            cancellationToken
        );
        incomplete.StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var complete = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Strong overall evidence.",
                strengths = "Relevant examples.",
                concerns = "None observed.",
                criteria = criteria.Select(x => new
                {
                    criterionId = x.GetProperty("id").GetGuid(),
                    rating = 4,
                    evidence = $"Evidence for {x.GetProperty("name").GetString()}",
                }),
            },
            cancellationToken
        );
        complete.StatusCode.ShouldBe(HttpStatusCode.Created);

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var blindView = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var blindInterview = blindView
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        blindInterview.GetProperty("submittedScorecards").GetInt32().ShouldBe(1);
        blindInterview.GetProperty("scorecards").GetArrayLength().ShouldBe(0);

        var managerSubmission = await manager.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "StrongYes",
                rating = 5,
                evidence = "Independent manager assessment.",
                strengths = "Strong judgment.",
                concerns = "None observed.",
                criteria = criteria.Select(x => new
                {
                    criterionId = x.GetProperty("id").GetGuid(),
                    rating = 5,
                    evidence = $"Manager evidence for {x.GetProperty("name").GetString()}",
                }),
            },
            cancellationToken
        );
        managerSubmission.StatusCode.ShouldBe(HttpStatusCode.Created);

        var updated = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var visibleScorecards = updated
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId)
            .GetProperty("scorecards");
        visibleScorecards.GetArrayLength().ShouldBe(2);
        visibleScorecards[0].GetProperty("criteria").GetArrayLength().ShouldBe(2);
    }
}
