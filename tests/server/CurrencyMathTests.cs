using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class CurrencyMathTests
{
    private static readonly Dictionary<string, decimal> Rates = new()
    {
        ["USD"] = 1.1m,
        ["GBP"] = 0.85m,
        ["JPY"] = 165m,
    };

    [Fact]
    public void Cross_rates_go_through_the_table_base()
    {
        Currencies.Convert(110m, "USD", "GBP", "EUR", Rates).ShouldBe(85m);
        Currencies.Convert(10m, "EUR", "JPY", "EUR", Rates).ShouldBe(1650m);
        Currencies.Convert(100m, "jpy", "eur", "EUR", Rates)!.Value.ShouldBe(0.6061m, 0.0001m);
        Currencies.Convert(5m, "USD", "USD", "EUR", Rates).ShouldBe(5m);
        Currencies.Convert(5m, "USD", "CHF", "EUR", Rates).ShouldBeNull();
    }

    [Fact]
    public void Amounts_take_the_symbol_and_the_decimals_of_their_currency()
    {
        Currencies.Format(150000m, "USD").ShouldBe("$150,000.00");
        Currencies.Format(5000000.4m, "JPY").ShouldBe("¥5,000,000");
        Currencies.Format(1234.5m, "CHF").ShouldBe("CHF 1,234.50");
        Currencies.Format(1234.5m, "XYZ").ShouldBe("XYZ 1,234.5");
        Currencies.LooksLikeCode("usd").ShouldBeTrue();
        Currencies.LooksLikeCode("US").ShouldBeFalse();
    }

    [Fact]
    public void The_frankfurter_document_parses_to_a_dated_table()
    {
        var table = CurrencyRates.Parse(new FakeRatesHttp().Json);
        table.Base.ShouldBe("EUR");
        // The newest observation dates the table; a stale pair keeps its own rate.
        table.Date.ShouldBe(new DateOnly(2026, 11, 13));
        table.Rates.Keys.ShouldBe(["USD", "GBP", "JPY", "NPR"], ignoreOrder: true);
        table.Convert(220m, "USD", "NPR").ShouldBe(29240m);
        Should.Throw<FormatException>(() => CurrencyRates.Parse("[]"));
    }

    [Fact]
    public void The_ecb_document_parses_to_a_dated_table()
    {
        var table = CurrencyRates.Parse(new FakeRatesHttp().Xml);
        table.Base.ShouldBe("EUR");
        table.Date.ShouldBe(new DateOnly(2026, 11, 13));
        table.Rates["USD"].ShouldBe(1.1m);
        table.Convert(220m, "USD", "GBP").ShouldBe(170m);
        Should.Throw<FormatException>(() => CurrencyRates.Parse("<Envelope/>"));
    }

    [Fact]
    public void Seed_plans_refuse_demo_data_on_production()
    {
        Seeding.Plan("production").ShouldBe([Seeding.Baseline, Seeding.Catalog]);
        Seeding.Plan("staging").ShouldBe(Seeding.AllSets);
        Seeding.Plan("development").ShouldBe(Seeding.AllSets);
        Seeding.Refused("production", ["baseline", "demo"]).ShouldBe(["demo"]);
        Seeding.Refused("staging", ["baseline", "demo"]).ShouldBeEmpty();
        Seeding.ParseSets(" Baseline, demo ").ShouldBe(["baseline", "demo"]);
        Should.Throw<ArgumentException>(() => Seeding.ParseSets("baseline,everything"));
        Should.Throw<ArgumentException>(() => Seeding.Plan("qa"));
        Seeding
            .Fingerprint("a", 1, new[] { "x", "y" })
            .ShouldBe(Seeding.Fingerprint("a", 1, new[] { "x", "y" }));
        Seeding.Fingerprint("a", 1).ShouldNotBe(Seeding.Fingerprint("a", 2));
    }
}
