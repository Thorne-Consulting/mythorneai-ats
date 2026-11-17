using System.Text.Json;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>A rate table as the app uses it: rates per one unit of <see cref="Base"/>, and the day they are from.</summary>
public sealed record RateTable(
    string Base,
    DateOnly Date,
    IReadOnlyDictionary<string, decimal> Rates,
    DateTimeOffset FetchedAt
)
{
    public decimal? Convert(decimal amount, string from, string to) =>
        Currencies.Convert(amount, from, to, Base, Rates);
}

/// <summary>
/// The daily reference rates: fetched from a public source that needs no key (the European Central
/// Bank by default), kept in memory for <c>Currency:CacheHours</c> and in the database for ever,
/// so a restart or an outage keeps the last good table. Nothing here throws at a caller who only
/// wants to show an amount: with no table, <see cref="GetAsync"/> is null and the amount stays as it is.
/// </summary>
public sealed class CurrencyRates(
    AtsDbContext db,
    IHttpClientFactory http,
    IMemoryCache cache,
    IConfiguration configuration,
    ILogger<CurrencyRates> logger
)
{
    public const string HttpClientName = "currency-rates";
    public const string DefaultUrl =
        "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
    private const string CacheKey = "currency-rates";

    public bool ConversionEnabled => configuration.GetValue("Currency:ConversionEnabled", true);
    public TimeSpan CacheWindow =>
        TimeSpan.FromHours(Math.Max(1, configuration.GetValue("Currency:CacheHours", 6)));
    public string SourceUrl =>
        configuration["Currency:RatesUrl"] is { Length: > 0 } u ? u : DefaultUrl;

    /// <summary>
    /// The table to convert with: the cached one while it is fresh, else a new fetch, else the last
    /// good one from the database. Null only when no table was ever fetched or conversion is off.
    /// </summary>
    public async Task<RateTable?> GetAsync(CancellationToken ct)
    {
        if (!ConversionEnabled)
            return null;
        if (cache.TryGetValue(CacheKey, out RateTable? cached) && cached is not null)
            return cached;
        var stored = await StoredAsync(db, ct);
        if (stored is not null && DateTimeOffset.UtcNow - stored.FetchedAt < CacheWindow)
            return Remember(stored);
        var fresh = await RefreshAsync(ct);
        return fresh ?? (stored is null ? null : Remember(stored));
    }

    /// <summary>Fetches now, stores the table and returns it; null (and a log line) when the source fails.</summary>
    public async Task<RateTable?> RefreshAsync(CancellationToken ct)
    {
        try
        {
            using var client = http.CreateClient(HttpClientName);
            var xml = await client.GetStringAsync(SourceUrl, ct);
            var table = Parse(xml);
            var row = await db.ExchangeRateTables.FirstOrDefaultAsync(ct);
            if (row is null)
                db.ExchangeRateTables.Add(row = new ExchangeRateTable { RatesJson = "{}" });
            row.Base = table.Base;
            row.RatesDate = table.Date;
            row.RatesJson = JsonSerializer.Serialize(table.Rates);
            row.FetchedAt = table.FetchedAt;
            await db.SaveChangesAsync(ct);
            return Remember(table);
        }
        catch (Exception ex)
            when (ex
                    is HttpRequestException
                        or TaskCanceledException
                        or FormatException
                        or InvalidOperationException
            )
        {
            logger.LogWarning(ex, "Could not fetch exchange rates from {Url}", SourceUrl);
            return null;
        }
    }

    private RateTable Remember(RateTable table)
    {
        var left = table.FetchedAt + CacheWindow - DateTimeOffset.UtcNow;
        cache.Set(CacheKey, table, left > TimeSpan.FromMinutes(1) ? left : TimeSpan.FromMinutes(1));
        return table;
    }

    /// <summary>The last good table from the database, whatever its age. Null before the first fetch.</summary>
    public static async Task<RateTable?> StoredAsync(AtsDbContext db, CancellationToken ct)
    {
        var row = await db.ExchangeRateTables.AsNoTracking().FirstOrDefaultAsync(ct);
        if (row is null)
            return null;
        var rates = JsonSerializer.Deserialize<Dictionary<string, decimal>>(row.RatesJson) ?? [];
        return new RateTable(row.Base, row.RatesDate, rates, row.FetchedAt);
    }

    /// <summary>The ECB envelope: one Cube with a time, then one Cube per currency with a rate. EUR is the base.</summary>
    public static RateTable Parse(string xml, DateTimeOffset? fetchedAt = null)
    {
        var doc = XDocument.Parse(xml);
        var cubes = doc.Descendants().Where(x => x.Name.LocalName == "Cube").ToList();
        var day = cubes
            .FirstOrDefault(x => x.Attribute("time") is not null)
            ?.Attribute("time")
            ?.Value;
        if (day is null || !DateOnly.TryParseExact(day, "yyyy-MM-dd", out var date))
            throw new FormatException("The rates document has no date.");
        var rates = cubes
            .Where(x => x.Attribute("currency") is not null && x.Attribute("rate") is not null)
            .ToDictionary(
                x => x.Attribute("currency")!.Value.ToUpperInvariant(),
                x =>
                    decimal.Parse(
                        x.Attribute("rate")!.Value,
                        System.Globalization.CultureInfo.InvariantCulture
                    )
            );
        if (rates.Count == 0)
            throw new FormatException("The rates document has no rates.");
        return new RateTable("EUR", date, rates, fetchedAt ?? DateTimeOffset.UtcNow);
    }
}
