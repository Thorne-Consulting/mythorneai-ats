using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SaveCurrenciesRequest(string Base, string[] Supported);

/// <summary>
/// Workspace currencies: the base currency, the supported list an admin picks from the catalog, and
/// the rate table. Reading is for everyone signed in; changing it and refreshing rates is for admins.
/// The public endpoint gives the careers site the supported list and the rates, so a visitor can
/// see pay in their own currency.
/// </summary>
public static class CurrencyEndpoints
{
    public static void MapCurrencies(this RouteGroupBuilder api)
    {
        api.MapGet(
            "/currencies",
            async (AtsDbContext db, CurrencyRates rates, CancellationToken ct) =>
                Results.Ok(await ViewAsync(db, rates, ct))
        );

        api.MapPut(
                "/currencies",
                async (
                    SaveCurrenciesRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CurrencyRates rates,
                    CancellationToken ct
                ) =>
                {
                    var organization = await db.Organizations.SingleOrDefaultAsync(ct);
                    if (organization is null)
                        return Results.NotFound();
                    var all = await db.Currencies.ToListAsync(ct);
                    var baseCode = request.Base?.Trim().ToUpperInvariant() ?? "";
                    var supported = (request.Supported ?? [])
                        .Select(x => x.Trim().ToUpperInvariant())
                        .Where(x => x.Length > 0)
                        .Distinct()
                        .ToHashSet();
                    var errors = new Dictionary<string, string[]>();
                    if (all.All(x => x.Code != baseCode))
                        errors["base"] = ["Choose a currency from the list."];
                    if (supported.Any(code => all.All(x => x.Code != code)))
                        errors["supported"] = ["Choose currencies from the list."];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    // The base currency is always supported, so it can be chosen on a job.
                    supported.Add(baseCode);
                    organization.BaseCurrency = baseCode;
                    foreach (var currency in all)
                        currency.IsSupported = supported.Contains(currency.Code);
                    Audit.Add(
                        db,
                        principal,
                        "Organization",
                        organization.Id,
                        "CurrenciesUpdated",
                        new { Base = baseCode, Supported = supported.Order().ToArray() }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(await ViewAsync(db, rates, ct));
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/currencies/refresh",
                async (AtsDbContext db, CurrencyRates rates, CancellationToken ct) =>
                {
                    if (!rates.ConversionEnabled)
                        return Results.Conflict(
                            new
                            {
                                message = "Conversion is turned off on this server (CURRENCY_CONVERSION).",
                            }
                        );
                    var table = await rates.RefreshAsync(ct);
                    return table is null
                        ? Results.Problem(
                            "We could not fetch the rates. The source did not answer, or the address is not public.",
                            statusCode: StatusCodes.Status502BadGateway
                        )
                        : Results.Ok(await ViewAsync(db, rates, ct));
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    /// <summary>GET /public/currencies: what the careers site needs to show pay in the visitor's currency.</summary>
    public static void MapPublicCurrencies(this RouteGroupBuilder api) =>
        api.MapGet(
                "/currencies",
                async (AtsDbContext db, CurrencyRates rates, CancellationToken ct) =>
                {
                    var view = await ViewAsync(db, rates, ct);
                    return Results.Ok(
                        new
                        {
                            view.Base,
                            Currencies = view.Currencies.Where(x => x.Supported).ToArray(),
                            view.Rates,
                        }
                    );
                }
            )
            .RequireRateLimiting(PublicEndpoints.PublicReadPolicy);

    public sealed record CurrencyView(
        string Code,
        string Name,
        string Symbol,
        int Decimals,
        bool Supported
    );

    public sealed record RatesView(
        string Base,
        DateOnly Date,
        DateTimeOffset FetchedAt,
        IReadOnlyDictionary<string, decimal> Rates
    );

    public sealed record CurrenciesView(
        string Base,
        bool ConversionEnabled,
        string Source,
        CurrencyView[] Currencies,
        RatesView? Rates
    );

    public static async Task<CurrenciesView> ViewAsync(
        AtsDbContext db,
        CurrencyRates rates,
        CancellationToken ct
    )
    {
        var baseCode = await BaseAsync(db, ct);
        var currencies = await db
            .Currencies.AsNoTracking()
            .OrderBy(x => x.SortOrder)
            .Select(x => new CurrencyView(x.Code, x.Name, x.Symbol, x.Decimals, x.IsSupported))
            .ToArrayAsync(ct);
        // Before the baseline seed ran, the built-in catalog keeps the pickers working.
        if (currencies.Length == 0)
            currencies = Currencies
                .Catalog.Select(x => new CurrencyView(
                    x.Code,
                    x.Name,
                    x.Symbol,
                    x.Decimals,
                    Currencies.DefaultSupported.Contains(x.Code)
                ))
                .ToArray();
        var table = await rates.GetAsync(ct);
        return new CurrenciesView(
            baseCode,
            rates.ConversionEnabled,
            rates.SourceUrl,
            currencies,
            table is null
                ? null
                : new RatesView(table.Base, table.Date, table.FetchedAt, table.Rates)
        );
    }

    public sealed record MoneyPolicy(string Base, HashSet<string> Supported);

    /// <summary>The base currency and the codes a job or offer may use right now.</summary>
    public static async Task<MoneyPolicy> PolicyAsync(AtsDbContext db, CancellationToken ct)
    {
        return new MoneyPolicy(await BaseAsync(db, ct), await SupportedAsync(db, ct));
    }

    /// <summary>The workspace's base currency; USD before one is set.</summary>
    public static async Task<string> BaseAsync(AtsDbContext db, CancellationToken ct)
    {
        var code = await db
            .Organizations.AsNoTracking()
            .Select(x => x.BaseCurrency)
            .FirstOrDefaultAsync(ct);
        return string.IsNullOrWhiteSpace(code) ? Currencies.DefaultBase : code;
    }

    /// <summary>The codes a job or offer may use right now.</summary>
    public static async Task<HashSet<string>> SupportedAsync(AtsDbContext db, CancellationToken ct)
    {
        var codes = await db
            .Currencies.Where(x => x.IsSupported)
            .Select(x => x.Code)
            .ToListAsync(ct);
        if (codes.Count == 0)
            codes = [.. Currencies.DefaultSupported];
        codes.Add(await BaseAsync(db, ct));
        return codes.ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>How a currency is written, from the workspace list or the built-in catalog.</summary>
    public static async Task<CurrencyInfo?> InfoAsync(
        AtsDbContext db,
        string code,
        CancellationToken ct
    )
    {
        var upper = code.Trim().ToUpperInvariant();
        var row = await db.Currencies.AsNoTracking().FirstOrDefaultAsync(x => x.Code == upper, ct);
        return row is null
            ? Currencies.Find(upper)
            : new CurrencyInfo(row.Code, row.Name, row.Symbol, row.Decimals);
    }
}
