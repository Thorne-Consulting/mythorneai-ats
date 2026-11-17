using System.Linq.Expressions;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

/// <summary>
/// Seed sets and the environments that may run them. A set says what the rows are, not where they
/// go: <c>baseline</c> is what every workspace needs, <c>catalog</c> the pick-lists, <c>demo</c>
/// sample hiring data and development accounts. Running a set twice changes nothing; a later run
/// adds new rows and only rewrites rows nobody edited (see <see cref="SeedRows"/>).
/// </summary>
public static class Seeding
{
    public const string Baseline = "baseline";
    public const string Catalog = "catalog";
    public const string Demo = "demo";
    public static readonly string[] AllSets = [Baseline, Catalog, Demo];

    /// <summary>The sets an environment gets by default, and the only ones it may run.</summary>
    public static string[] Plan(string environment) =>
        environment.ToLowerInvariant() switch
        {
            "development" => AllSets,
            "staging" => AllSets,
            "production" => [Baseline, Catalog],
            _ => throw new ArgumentException(
                $"Unknown seed environment '{environment}'. Use development, staging or production."
            ),
        };

    /// <summary>The requested sets the environment refuses (demo on production). Empty means go ahead.</summary>
    public static string[] Refused(string environment, IEnumerable<string> sets) =>
        sets.Except(Plan(environment), StringComparer.OrdinalIgnoreCase).ToArray();

    /// <summary>"baseline,demo" to set names; an unknown name throws.</summary>
    public static string[] ParseSets(string? text)
    {
        var names = (text ?? "")
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.ToLowerInvariant())
            .Distinct()
            .ToArray();
        var unknown = names.Except(AllSets).ToArray();
        if (unknown.Length > 0)
            throw new ArgumentException(
                $"Unknown seed set '{unknown[0]}'. Use {string.Join(", ", AllSets)}."
            );
        return names;
    }

    /// <summary>
    /// The seed environment: <c>Seed:Environment</c> (SEED_ENVIRONMENT) when set, else the host's
    /// environment. Both hosts run as Production, so staging names itself through the variable.
    /// </summary>
    public static string Environment(IConfiguration configuration, IHostEnvironment host) =>
        configuration["Seed:Environment"] is { Length: > 0 } named ? named.ToLowerInvariant()
        : host.IsDevelopment() ? "development"
        : "production";

    /// <summary>Runs the sets in order (baseline, catalog, demo), then the private seed file when there is one.</summary>
    public static async Task RunAsync(
        AtsDbContext db,
        LocalFileStore files,
        IConfiguration configuration,
        string environment,
        IReadOnlyCollection<string> sets,
        ILogger logger,
        CancellationToken ct = default
    )
    {
        var refused = Refused(environment, sets);
        if (refused.Length > 0)
            throw new InvalidOperationException(
                $"The {environment} environment does not take the {string.Join(", ", refused)} seed set."
            );
        var rows = await SeedRows.LoadAsync(db, ct);
        if (sets.Contains(Baseline))
        {
            await BaselineSeed.RunAsync(db, rows, ct);
            logger.LogInformation("Seed set {Set} done", Baseline);
        }
        if (sets.Contains(Catalog))
        {
            await CatalogSeed.RunAsync(db, rows, ct);
            logger.LogInformation("Seed set {Set} done", Catalog);
        }
        if (sets.Contains(Demo))
        {
            await SeedData.DemoAsync(db, files, configuration, ct);
            logger.LogInformation("Seed set {Set} done", Demo);
        }
        await RunPrivateAsync(db, configuration, logger, ct);
    }

    /// <summary>
    /// The private seed: a SQL file named by <c>Seed:PrivatePath</c> (SEED_PRIVATE_PATH), never
    /// committed, for the company's own interview kits, scorecards and pay bands. Skipped when the
    /// variable is empty or the file is missing. Write its statements so they can run twice.
    /// </summary>
    private static async Task RunPrivateAsync(
        AtsDbContext db,
        IConfiguration configuration,
        ILogger logger,
        CancellationToken ct
    )
    {
        var path = configuration["Seed:PrivatePath"];
        if (string.IsNullOrWhiteSpace(path))
            return;
        if (!File.Exists(path))
        {
            logger.LogWarning("Private seed file {Path} not found; skipped", path);
            return;
        }
        var sql = await File.ReadAllTextAsync(path, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync(sql, ct);
        await tx.CommitAsync(ct);
        logger.LogInformation("Private seed file {Path} done", path);
    }

    /// <summary>A short hash of the parts, in order. Null parts count as empty.</summary>
    public static string Fingerprint(params object?[] parts)
    {
        var text = string.Join(
            "\u001f",
            parts.Select(x =>
                x switch
                {
                    null => "",
                    IEnumerable<string> list => string.Join("\u001e", list),
                    _ => Convert.ToString(x, System.Globalization.CultureInfo.InvariantCulture),
                }
            )
        );
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..32];
    }
}

/// <summary>
/// The seed markers (<see cref="SeedRecord"/>) and the one rule for every seeded row: insert when
/// missing, adopt a row that already exists by its natural key, rewrite a row only while its content
/// still matches what the seed wrote, and never bring back a row an admin deleted.
/// </summary>
public sealed class SeedRows
{
    private readonly AtsDbContext _db;
    private readonly Dictionary<string, SeedRecord> _records;

    private SeedRows(AtsDbContext db, Dictionary<string, SeedRecord> records)
    {
        _db = db;
        _records = records;
    }

    public static async Task<SeedRows> LoadAsync(AtsDbContext db, CancellationToken ct) =>
        new(db, await db.SeedRecords.ToDictionaryAsync(x => x.SeedKey, ct));

    /// <summary>
    /// <paramref name="natural"/> finds a row that was there before the markers (or came from an
    /// older seed) so it is adopted, not duplicated. <paramref name="apply"/> writes the seed content
    /// on a new or unmodified row; <paramref name="fingerprint"/> hashes the content the seed owns.
    /// Returns the row, or null when an admin deleted it.
    /// </summary>
    public async Task<T?> EnsureAsync<T>(
        string key,
        Expression<Func<T, bool>> natural,
        Func<T> create,
        Action<T> apply,
        Func<T, string> fingerprint,
        CancellationToken ct
    )
        where T : class
    {
        var set = _db.Set<T>();
        if (_records.TryGetValue(key, out var record))
        {
            var id = record.EntityId;
            var row = await set.FirstOrDefaultAsync(e => EF.Property<Guid>(e, "Id") == id, ct);
            if (row is null)
                return null; // deleted on purpose; stays deleted
            if (fingerprint(row) == record.Fingerprint)
            {
                apply(row);
                record.Fingerprint = fingerprint(row);
            }
            return row;
        }
        var existing = await set.FirstOrDefaultAsync(natural, ct);
        if (existing is null)
        {
            existing = create();
            apply(existing);
            set.Add(existing);
        }
        record = new SeedRecord
        {
            SeedKey = key,
            EntityId = (Guid)typeof(T).GetProperty("Id")!.GetValue(existing)!,
            Fingerprint = fingerprint(existing),
        };
        _db.SeedRecords.Add(record);
        _records[key] = record;
        return existing;
    }
}
