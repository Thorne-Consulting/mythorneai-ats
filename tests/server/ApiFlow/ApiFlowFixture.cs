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

public sealed partial class ApiFlowTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                {
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
                    );
                }
            );
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null)
            await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    private async Task<HttpClient> LoginAsync(
        string email,
        CancellationToken cancellationToken,
        bool addAntiforgeryToken = true
    )
    {
        var client = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await client.PostAsJsonAsync("/api/auth/dev-login", new { email }, cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        if (addAntiforgeryToken)
            await AddAntiforgeryTokenAsync(client, cancellationToken);
        return client;
    }

    private static MultipartFormDataContent RecordingUpload()
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(
            new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x86, 0x81, 0x01 }
        );
        file.Headers.ContentType = new MediaTypeHeaderValue("video/webm");
        content.Add(file, "file", "interview.webm");
        return content;
    }

    private static async Task AddAntiforgeryTokenAsync(
        HttpClient client,
        CancellationToken cancellationToken
    )
    {
        var payload = await client.GetFromJsonAsync<JsonElement>(
            "/api/auth/csrf",
            cancellationToken
        );
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.GetProperty("token").GetString());
    }
}
