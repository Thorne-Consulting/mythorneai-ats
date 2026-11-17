namespace MyThorneAI.Ats.Api.Domain;

/// <summary>
/// One row a seed set created, by its seed key. The fingerprint is the content as seeded; a later
/// run only changes the row while its content still matches, so an admin's edits are kept.
/// </summary>
public sealed class SeedRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string SeedKey { get; set; }
    public Guid EntityId { get; set; }
    public required string Fingerprint { get; set; }
    public DateTimeOffset SeededAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A pick-list value: a department, a location or an employment type (the catalog set).</summary>
public sealed class PickListItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>department, location or employment-type.</summary>
    public required string Kind { get; set; }
    public required string Value { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>An ISO 4217 currency the workspace knows. Supported ones can be chosen on jobs and offers.</summary>
public sealed class Currency
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Name { get; set; }
    public required string Symbol { get; set; }
    public int Decimals { get; set; } = 2;
    public bool IsSupported { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>The last good table of daily reference rates, one row. Rates are per one unit of <see cref="Base"/>.</summary>
public sealed class ExchangeRateTable
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Base { get; set; } = "EUR";
    public DateOnly RatesDate { get; set; }

    /// <summary>JSON object: {"USD": 1.08, ...}.</summary>
    public required string RatesJson { get; set; }
    public DateTimeOffset FetchedAt { get; set; } = DateTimeOffset.UtcNow;
}
