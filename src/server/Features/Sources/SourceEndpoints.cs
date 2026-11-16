using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Codes are the words in careers links (<c>?src=</c>, <c>utm_source</c>) that mean this source.</summary>
public sealed record SourceRequest(
    string? Name,
    SourceCategory? Category,
    bool? Active = null,
    string[]? Codes = null
);

public sealed record MergeSourceRequest(Guid IntoId);

/// <summary>
/// The managed list of sources, loaded once per request. Names and codes match ignoring case.
/// </summary>
public sealed class SourceList(AtsDbContext db, List<Source> all)
{
    public static async Task<SourceList> LoadAsync(AtsDbContext db, CancellationToken ct) =>
        new(db, await db.Sources.ToListAsync(ct));

    /// <summary>The source with this name, else the one with this code.</summary>
    public Source? Find(string? value)
    {
        var key = value?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(key))
            return null;
        return all.FirstOrDefault(x => x.Name.ToLowerInvariant() == key)
            ?? all.FirstOrDefault(x => x.Codes.Contains(key));
    }

    /// <summary>
    /// The managed name for a value from a file or the API. An unknown value joins the list (the
    /// caller saves), so nothing is lost and an admin can merge it later.
    /// </summary>
    public string Resolve(string value) => Find(value)?.Name ?? Add(value);

    /// <summary>Adds a value to the list, filed by its words (the caller saves), and returns its name.</summary>
    public string Add(string value)
    {
        var name = value.Trim()[..Math.Min(value.Trim().Length, 100)];
        var added = new Source { Name = name, Category = Sources.Guess(name) };
        all.Add(added);
        db.Sources.Add(added);
        return name;
    }
}

/// <summary>Where candidates come from: the starting list, and names in use that the list lacks.</summary>
public static class Sources
{
    public const string CareerSite = "Career site";

    /// <summary>The list a new workspace starts with. The codes match what the careers site already understood.</summary>
    public static readonly (string Name, SourceCategory Category, string[] Codes)[] Standard =
    [
        (CareerSite, SourceCategory.CareerSite, ["careers", "website"]),
        ("LinkedIn", SourceCategory.JobBoard, ["linkedin", "li"]),
        ("Indeed", SourceCategory.JobBoard, ["indeed"]),
        ("Glassdoor", SourceCategory.JobBoard, ["glassdoor"]),
        ("Google", SourceCategory.JobBoard, ["google"]),
        ("Referral", SourceCategory.Referral, ["referral"]),
        ("Agency", SourceCategory.Agency, ["agency"]),
        ("Sourced", SourceCategory.Sourced, []),
        ("Event", SourceCategory.Event, ["event"]),
        ("Email", SourceCategory.Other, ["email"]),
        ("Newsletter", SourceCategory.Other, ["newsletter"]),
        ("Facebook", SourceCategory.Other, ["facebook"]),
        ("Instagram", SourceCategory.Other, ["instagram"]),
        ("X", SourceCategory.Other, ["x", "twitter"]),
    ];

    /// <summary>A kind for a name nobody filed yet, from its words; Other when nothing fits.</summary>
    public static SourceCategory Guess(string name)
    {
        var text = name.ToLowerInvariant();
        bool Has(params string[] words) => words.Any(text.Contains);
        return Has("referr") ? SourceCategory.Referral
            : Has("agency", "recruiter") ? SourceCategory.Agency
            : Has("fair", "event", "meetup", "conference") ? SourceCategory.Event
            : Has("board", "indeed", "linkedin", "glassdoor") ? SourceCategory.JobBoard
            : Has("career", "website", "direct") ? SourceCategory.CareerSite
            : Has("sourc", "outreach") ? SourceCategory.Sourced
            : SourceCategory.Other;
    }

    /// <summary>
    /// Seeds the starting list once, then adds every name in use on people or applications that the
    /// list lacks, and rewrites names that differ only in case to the list's spelling.
    /// Runs at startup; safe every time.
    /// </summary>
    public static async Task EnsureAsync(AtsDbContext db, CancellationToken ct = default)
    {
        if (!await db.Sources.AnyAsync(ct))
        {
            db.Sources.AddRange(
                Standard.Select(x => new Source
                {
                    Name = x.Name,
                    Category = x.Category,
                    Codes = x.Codes,
                })
            );
            await db.SaveChangesAsync(ct);
        }
        var list = await SourceList.LoadAsync(db, ct);
        var used = (await db.Candidates.Select(x => x.Source).Distinct().ToListAsync(ct))
            .Concat(await db.Applications.Select(x => x.Source).Distinct().ToListAsync(ct))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
        foreach (var value in used)
        {
            // By name only: a value that happens to be a link code is still its own source.
            var name = list.Find(value)?.Name;
            if (name is null || !name.Equals(value.Trim(), StringComparison.OrdinalIgnoreCase))
                list.Add(value);
            else if (name != value)
                await RenameAsync(db, value, name, ct);
        }
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Rewrites a source name on every person and application that has it.</summary>
    internal static async Task<int> RenameAsync(
        AtsDbContext db,
        string from,
        string to,
        CancellationToken ct
    )
    {
        var people = await db
            .Candidates.Where(x => x.Source == from)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Source, to), ct);
        await db
            .Applications.Where(x => x.Source == from)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Source, to), ct);
        return people;
    }

    /// <summary>
    /// The source for a careers application: a managed source whose code or name matches the link's
    /// <c>?src=</c>, then its <c>utm_source</c>; else what the careers page worked out.
    /// </summary>
    public static async Task<string> ForCareersAsync(
        AtsDbContext db,
        string fallback,
        IEnumerable<string?> codes,
        CancellationToken ct
    )
    {
        var list = await SourceList.LoadAsync(db, ct);
        foreach (var code in codes)
            if (list.Find(code) is { } source)
                return source.Name;
        return fallback;
    }
}

public static partial class AtsEndpoints
{
    private static void MapSources(RouteGroupBuilder api)
    {
        // Everyone who adds or filters candidates reads the list; Settings shows how many people each has.
        api.MapGet(
                "/sources",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var sources = await db
                        .Sources.AsNoTracking()
                        .OrderBy(x => x.Name)
                        .ToListAsync(ct);
                    var counts = await db
                        .Candidates.GroupBy(x => x.Source)
                        .Select(g => new { g.Key, Count = g.Count() })
                        .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
                    return Results.Ok(
                        sources.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            Category = x.Category.ToString(),
                            Active = x.IsActive,
                            x.Codes,
                            Candidates = counts.GetValueOrDefault(x.Name),
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/sources",
                async (
                    SourceRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var (name, codes, errors) = await ValidateSourceAsync(db, request, null, ct);
                    if (errors is not null)
                        return Results.ValidationProblem(errors);
                    var source = new Source
                    {
                        Name = name!,
                        Category = request.Category ?? SourceCategory.Other,
                        IsActive = request.Active ?? true,
                        Codes = codes!,
                    };
                    db.Sources.Add(source);
                    Audit.Add(db, principal, "Source", source.Id, "Created", new { source.Name });
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/sources/{source.Id}", new { source.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // A rename rewrites the name on every person and application, so filters and reports keep one group.
        api.MapPut(
                "/sources/{id:guid}",
                async (
                    Guid id,
                    SourceRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var source = await db.Sources.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (source is null)
                        return Results.NotFound();
                    var (name, codes, errors) = await ValidateSourceAsync(db, request, id, ct);
                    if (errors is not null)
                        return Results.ValidationProblem(errors);
                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    var old = source.Name;
                    source.Name = name!;
                    source.Category = request.Category ?? source.Category;
                    source.IsActive = request.Active ?? source.IsActive;
                    source.Codes = codes!;
                    if (old != source.Name)
                        await Sources.RenameAsync(db, old, source.Name, ct);
                    // Only referral sources name a referrer.
                    if (source.Category != SourceCategory.Referral)
                        await db
                            .Candidates.Where(x => x.Source == source.Name && x.ReferrerId != null)
                            .ExecuteUpdateAsync(
                                s => s.SetProperty(x => x.ReferrerId, (Guid?)null),
                                ct
                            );
                    Audit.Add(
                        db,
                        principal,
                        "Source",
                        id,
                        "Updated",
                        new
                        {
                            From = old,
                            To = source.Name,
                            Category = source.Category.ToString(),
                            source.IsActive,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // Merge: everyone with this source gets the other one, its codes move over, and it is removed.
        api.MapPost(
                "/sources/{id:guid}/merge",
                async (
                    Guid id,
                    MergeSourceRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var source = await db.Sources.SingleOrDefaultAsync(x => x.Id == id, ct);
                    var into = await db.Sources.SingleOrDefaultAsync(
                        x => x.Id == request.IntoId,
                        ct
                    );
                    if (source is null || into is null)
                        return Results.NotFound();
                    if (source.Id == into.Id)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["intoId"] = ["Choose a different source to merge into."],
                            }
                        );
                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    var moved = await Sources.RenameAsync(db, source.Name, into.Name, ct);
                    into.Codes = [.. into.Codes.Concat(source.Codes).Distinct()];
                    if (into.Category != SourceCategory.Referral)
                        await db
                            .Candidates.Where(x => x.Source == into.Name && x.ReferrerId != null)
                            .ExecuteUpdateAsync(
                                s => s.SetProperty(x => x.ReferrerId, (Guid?)null),
                                ct
                            );
                    db.Sources.Remove(source);
                    Audit.Add(
                        db,
                        principal,
                        "Source",
                        into.Id,
                        "Merged",
                        new
                        {
                            From = source.Name,
                            Into = into.Name,
                            Candidates = moved,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return Results.Ok(new { Moved = moved });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // Only a source nobody has can go; one in use is merged or turned off instead.
        api.MapDelete(
                "/sources/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var source = await db.Sources.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (source is null)
                        return Results.NotFound();
                    if (
                        await db.Candidates.AnyAsync(x => x.Source == source.Name, ct)
                        || await db.Applications.AnyAsync(x => x.Source == source.Name, ct)
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "People have this source. Merge it into another source, or turn it off.",
                            }
                        );
                    db.Sources.Remove(source);
                    Audit.Add(db, principal, "Source", id, "Deleted", new { source.Name });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    private static async Task<(
        string? Name,
        string[]? Codes,
        Dictionary<string, string[]>? Errors
    )> ValidateSourceAsync(AtsDbContext db, SourceRequest request, Guid? id, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > 100)
            errors["name"] = ["Give the source a name of up to 100 characters."];
        if (request.Category is { } category && !Enum.IsDefined(category))
            errors["category"] = ["Choose a kind of source."];
        var codes = (request.Codes ?? [])
            .Select(x => x.Trim().ToLowerInvariant())
            .Where(x => x.Length > 0)
            .Distinct()
            .ToArray();
        if (codes.Length > 20 || codes.Any(x => x.Length > 60 || x.Any(char.IsWhiteSpace)))
            errors["codes"] = ["Use up to 20 link codes, each one word."];
        if (errors.Count == 0)
        {
            var lower = name.ToLower();
            var others = await db
                .Sources.AsNoTracking()
                .Where(x => x.Id != id)
                .Select(x => new { x.Name, x.Codes })
                .ToListAsync(ct);
            if (others.Any(x => x.Name.ToLower() == lower))
                errors["name"] = ["Another source has this name. Merge the two instead."];
            else if (
                codes.FirstOrDefault(c =>
                    others.Any(x => x.Codes.Contains(c) || x.Name.ToLower() == c)
                ) is
                { } taken
            )
                errors["codes"] = [$"Another source already uses the code \"{taken}\"."];
        }
        return errors.Count > 0 ? (null, null, errors) : (name, codes, null);
    }
}
