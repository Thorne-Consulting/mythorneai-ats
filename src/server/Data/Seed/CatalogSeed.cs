using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

/// <summary>The catalog set: pick-list values for every kind of work the company hires for.</summary>
public static class CatalogSeed
{
    public const string Department = "department";
    public const string Location = "location";
    public const string EmploymentType = "employment-type";

    public static readonly (string Kind, string[] Values)[] Lists =
    [
        (
            Department,
            [
                "Administration",
                "Customer service",
                "Education",
                "Engineering",
                "Facilities",
                "Finance",
                "Healthcare",
                "Human resources",
                "Information technology",
                "Legal",
                "Logistics",
                "Maintenance",
                "Manufacturing",
                "Marketing",
                "Nursing",
                "Operations",
                "Product",
                "Research",
                "Retail",
                "Sales",
                "Security",
                "Trades",
            ]
        ),
        (Location, ["Head office", "Remote"]),
        (
            EmploymentType,
            [
                "Full time",
                "Part time",
                "Contract",
                "Temporary",
                "Internship",
                "Seasonal",
                "Apprenticeship",
            ]
        ),
    ];

    public static async Task RunAsync(AtsDbContext db, SeedRows rows, CancellationToken ct)
    {
        foreach (var (kind, values) in Lists)
            for (var i = 0; i < values.Length; i++)
            {
                var value = values[i];
                var order = i;
                await rows.EnsureAsync<PickListItem>(
                    $"pick:{kind}:{Slug(value)}",
                    x => x.Kind == kind && x.Value == value,
                    () => new PickListItem { Kind = kind, Value = value },
                    x =>
                    {
                        x.Value = value;
                        x.SortOrder = order;
                    },
                    x => Seeding.Fingerprint(x.Value, x.SortOrder),
                    ct
                );
            }
        await db.SaveChangesAsync(ct);
    }

    public static string Slug(string text) =>
        string.Concat(text.ToLowerInvariant().Select(c => char.IsAsciiLetterOrDigit(c) ? c : '-'))
            .Trim('-');
}
