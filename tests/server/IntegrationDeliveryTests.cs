using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using MyThorneAI.Ats.Api.Integrations;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class IntegrationDeliveryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_integration_delivery_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();
    private readonly FakeWorkplaceIntegration _integration = new();
    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                    configuration.AddInMemoryCollection(
                        new Dictionary<string, string?>
                        {
                            ["ConnectionStrings:AtsDatabase"] = _database.GetConnectionString(),
                            ["Auth:Mode"] = "Development",
                            ["Integrations:Provider"] = "None",
                            ["FileStorage:RootPath"] = Path.Combine(
                                Path.GetTempPath(),
                                $"ats-integration-tests-{Guid.NewGuid():N}"
                            ),
                        }
                    )
            );
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IWorkplaceIntegration>();
                services.AddSingleton<IWorkplaceIntegration>(_integration);
            });
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null)
            await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    [Fact]
    public async Task Calendar_item_is_delivered_and_tracked()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var client = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await client.PostAsJsonAsync(
                "/api/auth/dev-login",
                new { email = "recruiter@example.test" },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", cancellationToken);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        var candidates = await client.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var jordan = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee");
        var candidate = await client.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{jordan.GetProperty("id").GetGuid()}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var title = $"Integration interview {Guid.NewGuid():N}";
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);
        (
            await client.PostAsJsonAsync(
                $"/api/applications/{applicationId}/interviews",
                new
                {
                    title,
                    startsAt,
                    endsAt = startsAt.AddHours(1),
                    timeZone = "America/Chicago",
                    meetingLink = (string?)null,
                    interviewerEmails = new[] { "interviewer@example.test" },
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        JsonElement interview = default;
        for (var attempt = 0; attempt < 40; attempt++)
        {
            var response = await client.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}",
                cancellationToken
            );
            interview = response
                .GetProperty("application")
                .GetProperty("interviews")
                .EnumerateArray()
                .Single(x => x.GetProperty("title").GetString() == title);
            if (interview.GetProperty("calendarStatus").GetString() == "Created")
                break;
            await Task.Delay(250, cancellationToken);
        }
        interview.GetProperty("calendarStatus").GetString().ShouldBe("Created");
        _integration.CalendarEvents.Single().AttendeeEmails.ShouldContain("jordan.lee@example.com");
        _integration
            .CalendarEvents.Single()
            .AttendeeEmails.ShouldContain("interviewer@example.test");

        var interviewId = interview.GetProperty("id").GetGuid();
        (
            await client.PatchAsJsonAsync(
                $"/api/interviews/{interviewId}",
                new
                {
                    title,
                    interviewKitId = (Guid?)null,
                    startsAt,
                    endsAt = startsAt.AddHours(1),
                    timeZone = "America/Chicago",
                    meetingLink = (string?)null,
                    interviewerEmails = new[] { "interviewer@example.test" },
                    status = "Cancelled",
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        for (var attempt = 0; attempt < 40 && _integration.CancelledEventIds.IsEmpty; attempt++)
            await Task.Delay(250, cancellationToken);
        _integration.CancelledEventIds.ShouldContain($"event-{interviewId:N}");
    }

    private sealed class FakeWorkplaceIntegration : IWorkplaceIntegration
    {
        public ConcurrentBag<OutboundCalendarEvent> CalendarEvents { get; } = [];
        public ConcurrentBag<string> CancelledEventIds { get; } = [];
        public string ProviderName => "TestProvider";
        public bool IsEnabled => true;

        public Task<CalendarDeliveryResult> CreateCalendarEventAsync(
            OutboundCalendarEvent calendarEvent,
            CancellationToken cancellationToken
        )
        {
            CalendarEvents.Add(calendarEvent);
            return Task.FromResult(
                new CalendarDeliveryResult(
                    $"event-{calendarEvent.InterviewId:N}",
                    $"https://meet.example.com/{calendarEvent.InterviewId:N}"
                )
            );
        }

        public Task CancelCalendarEventAsync(
            string externalEventId,
            CancellationToken cancellationToken
        )
        {
            CancelledEventIds.Add(externalEventId);
            return Task.CompletedTask;
        }
    }
}
