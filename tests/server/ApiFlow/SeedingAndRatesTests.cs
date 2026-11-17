using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Seeding twice changes nothing and keeps an admin's edit; the rate table is cached and falls back.
public sealed partial class ApiFlowTests
{
    private async Task RunSeedAsync(string environment, string[] sets)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        await Seeding.RunAsync(
            db,
            scope.ServiceProvider.GetRequiredService<LocalFileStore>(),
            scope.ServiceProvider.GetRequiredService<IConfiguration>(),
            environment,
            sets,
            NullLogger.Instance
        );
    }

    [Fact]
    public async Task Seeding_twice_changes_nothing_and_keeps_an_edited_row()
    {
        var ct = TestContext.Current.CancellationToken;
        // The Development start already seeded everything once.
        await RunSeedAsync("development", Seeding.AllSets);
        async Task<(
            int Records,
            int Reasons,
            int Sources,
            int Templates,
            int Currencies,
            int Picks,
            int Jobs
        )> Counts()
        {
            using var scope = _factory!.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            return (
                await db.SeedRecords.CountAsync(ct),
                await db.RejectionReasons.CountAsync(ct),
                await db.Sources.CountAsync(ct),
                await db.EmailTemplates.CountAsync(ct),
                await db.Currencies.CountAsync(ct),
                await db.PickListItems.CountAsync(ct),
                await db.Requisitions.CountAsync(ct)
            );
        }
        var before = await Counts();
        before.Records.ShouldBeGreaterThan(50);
        before.Currencies.ShouldBe(Currencies.Catalog.Length);

        // An admin renames a seeded reason; the seed must leave it alone.
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var reason = await db.RejectionReasons.SingleAsync(
                x => x.Label == "Shift or schedule does not fit",
                ct
            );
            reason.Label = "Hours do not fit";
            await db.SaveChangesAsync(ct);
        }

        await RunSeedAsync("development", Seeding.AllSets);
        (await Counts()).ShouldBe(before);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (
                await db.RejectionReasons.AnyAsync(x => x.Label == "Hours do not fit", ct)
            ).ShouldBeTrue();
            (
                await db.RejectionReasons.AnyAsync(
                    x => x.Label == "Shift or schedule does not fit",
                    ct
                )
            ).ShouldBeFalse();
        }

        // Production takes baseline and catalog, never demo.
        await Should.ThrowAsync<InvalidOperationException>(() =>
            RunSeedAsync("production", ["baseline", "demo"])
        );
        await RunSeedAsync("production", ["baseline", "catalog"]);
        (await Counts()).ShouldBe(before);
    }

    [Fact]
    public async Task Rates_are_cached_for_the_window_and_the_last_table_survives_an_outage()
    {
        var ct = TestContext.Current.CancellationToken;
        var http = (FakeRatesHttp)_factory!.Services.GetRequiredService<IHttpClientFactory>();
        var cache = _factory.Services.GetRequiredService<IMemoryCache>();
        http.Fail = false;
        cache.Remove("currency-rates");
        var start = http.Calls;

        async Task<RateTable?> Get()
        {
            using var scope = _factory!.Services.CreateScope();
            return await scope.ServiceProvider.GetRequiredService<CurrencyRates>().GetAsync(ct);
        }
        async Task Age(TimeSpan by)
        {
            using var scope = _factory!.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var row = await db.ExchangeRateTables.SingleAsync(ct);
            row.FetchedAt -= by;
            await db.SaveChangesAsync(ct);
            cache.Remove("currency-rates");
        }

        (await Get())!.Date.ShouldBe(new DateOnly(2026, 11, 13));
        http.Calls.ShouldBe(start + 1);
        // Within the window: from memory, then from the database copy, no new fetch.
        (await Get()).ShouldNotBeNull();
        cache.Remove("currency-rates");
        (await Get()).ShouldNotBeNull();
        http.Calls.ShouldBe(start + 1);
        // Past the window: fetched again.
        await Age(TimeSpan.FromHours(25));
        (await Get()).ShouldNotBeNull();
        http.Calls.ShouldBe(start + 2);
        // Past the window and the source is down: the last good table, not null.
        await Age(TimeSpan.FromHours(25));
        http.Fail = true;
        var stale = await Get();
        stale.ShouldNotBeNull();
        stale.Rates["USD"].ShouldBe(1.1m);
        http.Calls.ShouldBe(start + 3);

        // The public endpoint and the settings endpoint keep answering; refresh says why it failed.
        using var client = _factory.CreateClient();
        (await client.GetAsync("/public/currencies", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var admin = await LoginAsync("admin@example.test", ct);
        (await admin.PostAsync("/api/currencies/refresh", null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.BadGateway
        );
        http.Fail = false;
        var refreshed = await admin.PostAsync("/api/currencies/refresh", null, ct);
        refreshed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await refreshed.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("rates")
            .GetProperty("date")
            .GetString()
            .ShouldBe("2026-11-13");

        // Only an admin changes the base and the supported list; the base is always supported.
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (
            await recruiter.PutAsJsonAsync(
                "/api/currencies",
                new { @base = "EUR", supported = new[] { "USD" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var saved = await admin.PutAsJsonAsync(
            "/api/currencies",
            new { @base = "EUR", supported = new[] { "USD", "GBP" } },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.OK);
        var view = await saved.Content.ReadFromJsonAsync<JsonElement>(ct);
        view.GetProperty("base").GetString().ShouldBe("EUR");
        view.GetProperty("currencies")
            .EnumerateArray()
            .Where(x => x.GetProperty("supported").GetBoolean())
            .Select(x => x.GetProperty("code").GetString())
            .ShouldBe(["USD", "EUR", "GBP"], ignoreOrder: true);
        (
            await admin.PutAsJsonAsync(
                "/api/currencies",
                new { @base = "XXX", supported = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        // Back to the defaults for the other tests.
        (
            await admin.PutAsJsonAsync(
                "/api/currencies",
                new { @base = "USD", supported = Currencies.DefaultSupported },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
    }
}
