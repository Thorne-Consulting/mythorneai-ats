using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>Stands in for OpenAI: a two-speaker transcript and a summary that cites a time.</summary>
public sealed class FakeTranscriptionAi : IAiAssistant
{
    public int Transcribed;
    public readonly System.Collections.Concurrent.ConcurrentQueue<string> Inputs = new();

    public bool IsConfigured => true;

    public Task<string> CompleteAsync(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null,
        bool json = false
    )
    {
        Inputs.Enqueue(input);
        // Notes on one part of a long transcript keep a time, like the real model is asked to.
        if (instruction.Contains("one part of a long interview transcript"))
            return Task.FromResult("- They described the rollout [0:01].");
        return Task.FromResult(
            input.Contains("[0:01]")
                ? "## Overview\nThe candidate walked through a migration [0:01].\n## Open questions for the next round\n- Testing approach"
                : "## Overview\nNo transcript."
        );
    }

    public Task<float[]> EmbedAsync(string text, CancellationToken ct, AiContext? context = null) =>
        throw new AiUnavailableException("Not in this test.");

    public Task<string> TranscribeAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    ) => throw new NotSupportedException();

    public Task<DetailedTranscript> TranscribeDetailedAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    )
    {
        Interlocked.Increment(ref Transcribed);
        return Task.FromResult(
            new DetailedTranscript(
                "fake-diarize",
                "Tell me about a migration. We moved Postgres with no downtime.",
                [
                    new TranscriptSegment(1.2, 4.0, "A", "Tell me about a migration."),
                    new TranscriptSegment(4.5, 9.0, "B", "We moved Postgres with no downtime."),
                ]
            )
        );
    }
}

/// <summary>The transcription worker end to end with a fake model: segments, captions, the summary, and blinding.</summary>
public sealed class RecordingTranscriptionTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();
    private readonly FakeTranscriptionAi _ai = new();
    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.AddSingleton<IChatClient>(new FakeResumeChat());
                services.AddSingleton<IAiAssistant>(_ai);
            });
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                    configuration.AddInMemoryCollection(
                        new Dictionary<string, string?>
                        {
                            ["ConnectionStrings:AtsDatabase"] = _database.GetConnectionString(),
                            ["Auth:Mode"] = "Development",
                            ["FileStorage:RootPath"] = Path.Combine(
                                Path.GetTempPath(),
                                $"ats-tests-{Guid.NewGuid():N}"
                            ),
                        }
                    )
            );
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null)
            await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    private async Task<HttpClient> LoginAsync(string email, CancellationToken ct)
    {
        var client = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions { HandleCookies = true }
        );
        (
            await client.PostAsJsonAsync("/api/auth/dev-login", new { email }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", ct);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        return client;
    }

    [Fact]
    public async Task A_finished_recording_is_transcribed_and_summarized_off_the_request()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?search=Jordan%20Lee",
            ct
        );
        var candidateId = candidates
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var applicationId = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/candidates/{candidateId}", ct)
        )
            .GetProperty("applications")[0]
            .GetProperty("id")
            .GetGuid();
        var startsAt = DateTimeOffset.UtcNow.AddHours(-2);
        var scheduled = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Recorded",
                startsAt,
                endsAt = startsAt.AddMinutes(45),
                timeZone = "UTC",
                interviewerEmails = new[] { "interviewer@example.test" },
            },
            ct
        );
        var interviewId = (await scheduled.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        var id = (
            await (
                await recruiter.PostAsJsonAsync(
                    $"/api/interviews/{interviewId}/recordings/uploads",
                    new { consentConfirmed = true, fileName = "call.webm" },
                    ct
                )
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("id")
            .GetGuid();
        using (
            var form = new MultipartFormDataContent
            {
                { new ByteArrayContent([0x1A, 0x45, 0xDF, 0xA3, 9, 9]), "file", "part-0" },
            }
        )
            (
                await recruiter.PostAsync($"/api/interview-recordings/{id}/chunks/0", form, ct)
            ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await recruiter.PostAsJsonAsync($"/api/interview-recordings/{id}/complete", new { }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        JsonElement transcript = default;
        for (var wait = 0; wait < 60; wait++)
        {
            await Task.Delay(500, ct);
            transcript = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interview-recordings/{id}/transcript",
                ct
            );
            if (transcript.GetProperty("transcriptStatus").GetString() == "Ready")
                break;
        }
        transcript.GetProperty("transcriptStatus").GetString().ShouldBe("Ready");
        var segments = transcript.GetProperty("segments").EnumerateArray().ToList();
        segments.Count.ShouldBe(2);
        segments[1].GetProperty("speaker").GetString().ShouldBe("B");
        segments[1].GetProperty("start").GetDouble().ShouldBe(4.5);
        _ai.Transcribed.ShouldBe(1);

        var captions = await recruiter.GetStringAsync(
            $"/api/interview-recordings/{id}/captions.vtt",
            ct
        );
        captions.ShouldContain("<v Speaker A>Tell me about a migration.");

        // The summary is written on its own once the transcript is in, and can be edited.
        JsonElement summary = default;
        for (var wait = 0; wait < 20; wait++)
        {
            summary = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interviews/{interviewId}/summary",
                ct
            );
            if (summary.GetProperty("summary").ValueKind == JsonValueKind.Object)
                break;
            await Task.Delay(500, ct);
        }
        summary.GetProperty("summary").GetProperty("body").GetString()!.ShouldContain("[0:01]");
        (
            await recruiter.PutAsJsonAsync(
                $"/api/interviews/{interviewId}/summary",
                new { body = "Edited [0:04]." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interviews/{interviewId}/summary",
                ct
            )
        )
            .GetProperty("summary")
            .GetProperty("editedBy")
            .GetString()
            .ShouldBe("recruiter@example.test");

        // A panelist who has not sent a scorecard reads neither.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (
            await interviewer.GetAsync($"/api/interview-recordings/{id}/transcript", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (
            await interviewer.GetAsync($"/api/interview-recordings/{id}/captions.vtt", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await interviewer.GetFromJsonAsync<JsonElement>(
                $"/api/interviews/{interviewId}/summary",
                ct
            )
        )
            .GetProperty("locked")
            .GetBoolean()
            .ShouldBeTrue();
    }

    private async Task<Guid> InterviewAsync(HttpClient recruiter, CancellationToken ct)
    {
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates?search=Jordan%20Lee",
            ct
        );
        var candidateId = candidates
            .GetProperty("items")
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var applicationId = (
            await recruiter.GetFromJsonAsync<JsonElement>($"/api/candidates/{candidateId}", ct)
        )
            .GetProperty("applications")[0]
            .GetProperty("id")
            .GetGuid();
        var startsAt = DateTimeOffset.UtcNow.AddHours(-2);
        var scheduled = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Recorded elsewhere",
                startsAt,
                endsAt = startsAt.AddMinutes(45),
                timeZone = "UTC",
                interviewerEmails = new[] { "interviewer@example.test" },
            },
            ct
        );
        return (await scheduled.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
    }

    [Fact]
    public async Task An_imported_transcript_gets_speaker_names_and_a_long_one_is_summarized_in_parts()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var interviewId = await InterviewAsync(recruiter, ct);

        using (
            var wrong = new MultipartFormDataContent
            {
                { new StringContent("hello"), "file", "notes.docx" },
            }
        )
            (
                await recruiter.PostAsync($"/api/interviews/{interviewId}/transcripts", wrong, ct)
            ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // About 70,000 characters: more than one careful read, so it is summarized in two parts.
        var vtt = new System.Text.StringBuilder("WEBVTT\n\n");
        for (var i = 0; i < 1200; i++)
            vtt.Append(
                $"{TimeSpan.FromSeconds(i * 5):hh\\:mm\\:ss}.000 --> {TimeSpan.FromSeconds(i * 5 + 4):hh\\:mm\\:ss}.000\n"
                    + $"<v {(i % 2 == 0 ? "Alex Kim" : "Jordan Lee")}>Line {i} {new string('w', 40)}\n\n"
            );
        Guid id;
        using (
            var form = new MultipartFormDataContent
            {
                { new StringContent(vtt.ToString()), "file", "zoom-call.vtt" },
            }
        )
        {
            var imported = await recruiter.PostAsync(
                $"/api/interviews/{interviewId}/transcripts",
                form,
                ct
            );
            imported.StatusCode.ShouldBe(
                HttpStatusCode.Created,
                await imported.Content.ReadAsStringAsync(ct)
            );
            id = (await imported.Content.ReadFromJsonAsync<JsonElement>(ct))
                .GetProperty("id")
                .GetGuid();
        }

        JsonElement transcript = default;
        for (var wait = 0; wait < 60; wait++)
        {
            transcript = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interview-recordings/{id}/transcript",
                ct
            );
            if (transcript.GetProperty("transcriptStatus").GetString() == "Ready")
                break;
            await Task.Delay(500, ct);
        }
        transcript.GetProperty("transcriptStatus").GetString().ShouldBe("Ready");
        transcript.GetProperty("source").GetString().ShouldBe("Transcript");
        var segments = transcript.GetProperty("segments").EnumerateArray().ToList();
        segments.Count.ShouldBe(1200);
        segments[1].GetProperty("speaker").GetString().ShouldBe("Jordan Lee");
        segments[1].GetProperty("start").GetDouble().ShouldBe(5);
        _ai.Transcribed.ShouldBe(0, "an imported transcript is never sent for transcription");

        JsonElement summary = default;
        for (var wait = 0; wait < 40; wait++)
        {
            summary = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interviews/{interviewId}/summary",
                ct
            );
            if (summary.GetProperty("summary").ValueKind == JsonValueKind.Object)
                break;
            await Task.Delay(500, ct);
        }
        summary.GetProperty("summary").GetProperty("body").GetString()!.ShouldContain("[0:01]");
        var inputs = _ai.Inputs.ToList();
        var parts = inputs.Where(x => x.Contains("Transcript part ")).ToList();
        parts.Count.ShouldBeGreaterThan(1);
        inputs.ShouldContain(x => x.Contains($"read in {parts.Count} parts"));
        // Every line was read, none cut off: the first and the last are each in a part.
        parts.ShouldContain(x => x.Contains("Line 0 "));
        parts.ShouldContain(x => x.Contains("Line 1199 "));

        // Naming a speaker shows in the captions; unknown speakers and long names are refused.
        var named = await recruiter.PutAsJsonAsync(
            $"/api/interview-recordings/{id}/speakers",
            new
            {
                names = new Dictionary<string, string> { ["Alex Kim"] = "Alex Kim (interviewer)" },
            },
            ct
        );
        named.StatusCode.ShouldBe(HttpStatusCode.OK, await named.Content.ReadAsStringAsync(ct));
        (
            await recruiter.GetStringAsync($"/api/interview-recordings/{id}/captions.vtt", ct)
        ).ShouldContain("<v Alex Kim (interviewer)>Line 0");
        (
            await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/interview-recordings/{id}/transcript",
                ct
            )
        )
            .GetProperty("speakerNames")
            .GetProperty("Alex Kim")
            .GetString()
            .ShouldBe("Alex Kim (interviewer)");
        (
            await recruiter.PutAsJsonAsync(
                $"/api/interview-recordings/{id}/speakers",
                new { names = new Dictionary<string, string> { ["Nobody"] = "X" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        // A panelist who still owes a scorecard can't read or rename.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (
            await interviewer.PutAsJsonAsync(
                $"/api/interview-recordings/{id}/speakers",
                new { names = new Dictionary<string, string> { ["Alex Kim"] = "Me" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }
}
