using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Pictures in rich text (job postings, emails, offer letters, notes). The team uploads them; anyone
/// can read them at a stable public address, so they work on the careers site, in the portal and in
/// mail apps. Stored as <c>![description](/public/media/{id}.png?size=800x600)</c>; the size in
/// the address lets readers reserve the space before the picture loads.
/// </summary>
public static partial class MediaEndpoints
{
    public const long MaxImageBytes = 5 * 1024 * 1024;
    public const string PublicPath = "/public/media/";

    // A prefix keeps these apart from candidate files in the same folder: only media is ever public.
    private const string StoredPrefix = "media-";

    /// <summary>What the first bytes say the file is. The name and the browser's type are never trusted.</summary>
    public static (string Extension, string ContentType)? ImageType(ReadOnlySpan<byte> head)
    {
        if (head.StartsWith(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }))
            return (".png", "image/png");
        if (head.StartsWith(new byte[] { 0xFF, 0xD8, 0xFF }))
            return (".jpg", "image/jpeg");
        if (head.StartsWith("GIF87a"u8) || head.StartsWith("GIF89a"u8))
            return (".gif", "image/gif");
        if (head.Length >= 12 && head.StartsWith("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8))
            return (".webp", "image/webp");
        return null;
    }

    /// <summary>True when the Markdown has a picture with no description, which saving refuses.</summary>
    public static bool HasImageWithoutAlt(string? markdown) =>
        markdown is not null && ImageWithoutAlt().IsMatch(markdown);

    public const string AltRequired =
        "Describe every picture, so people who use screen readers know what it shows.";

    public static RouteGroupBuilder MapMedia(this RouteGroupBuilder api)
    {
        // Any signed-in teammate who writes rich text can add a picture.
        api.MapPost(
            "/media/images",
            async (IFormFile file, LocalFileStore files, CancellationToken ct) =>
            {
                if (file.Length is <= 0 or > MaxImageBytes)
                    return Invalid("Pictures can be up to 5 MB. Try a smaller one.");
                await using var input = file.OpenReadStream();
                var head = new byte[12];
                var read = await input.ReadAtLeastAsync(head, head.Length, false, ct);
                if (ImageType(head.AsSpan(0, read)) is not { } type)
                    return Invalid("Use a PNG, JPEG, GIF or WebP picture.");
                var id = Guid.NewGuid().ToString("N");
                await using (
                    var output = new FileStream(
                        files.FullPath(StoredPrefix + id + type.Extension),
                        FileMode.CreateNew,
                        FileAccess.Write,
                        FileShare.None,
                        64 * 1024,
                        FileOptions.Asynchronous
                    )
                )
                {
                    await output.WriteAsync(head.AsMemory(0, read), ct);
                    await input.CopyToAsync(output, ct);
                }
                return Results.Ok(new { Url = PublicPath + id + type.Extension });
            }
        );
        return api;
    }

    public static IEndpointRouteBuilder MapPublicMedia(this IEndpointRouteBuilder app)
    {
        app.MapGet(
                PublicPath + "{name}",
                (string name, HttpContext http, LocalFileStore files) =>
                {
                    var match = MediaName().Match(name);
                    if (!match.Success)
                        return Results.NotFound();
                    var stored = StoredPrefix + name;
                    if (!File.Exists(files.FullPath(stored)))
                        return Results.NotFound();
                    // A name is never reused, so browsers, mail apps and proxies can keep it for good.
                    http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
                    return Results.File(
                        files.OpenRead(stored),
                        match.Groups[1].Value switch
                        {
                            "png" => "image/png",
                            "jpg" => "image/jpeg",
                            "gif" => "image/gif",
                            _ => "image/webp",
                        }
                    );
                }
            )
            .RequireRateLimiting(PublicEndpoints.PublicReadPolicy);
        return app;
    }

    /// <summary>
    /// Uploaded pictures that no stored text mentions and that are older than a week (so a picture
    /// in a text still being written survives). Deletes them unless <paramref name="dryRun"/>, and
    /// returns their stored names. Every text column is read, so a picture in a template, a version,
    /// a posting, a kit, a note, an assessment, a letter, the careers site, a draft, a workflow or an
    /// email already sent is kept.
    /// </summary>
    public static async Task<string[]> SweepAsync(
        AtsDbContext db,
        LocalFileStore files,
        DateTimeOffset now,
        bool dryRun,
        CancellationToken ct
    )
    {
        var cutoff = now.AddDays(-7).UtcDateTime;
        var old = files
            .Files(StoredPrefix)
            .Where(x => x.LastWriteTimeUtc < cutoff)
            .Select(x => x.Name)
            .ToList();
        if (old.Count == 0)
            return [];
        var used = await ReferencedAsync(db, ct);
        var unused = old.Where(name =>
                !used.Contains(Path.GetFileNameWithoutExtension(name)[StoredPrefix.Length..])
            )
            .ToArray();
        if (!dryRun)
            foreach (var name in unused)
                files.Delete(name);
        return unused;
    }

    // ponytail: one LIKE scan per table, a few times a day. Keep a table of picture uses if that gets slow.
    private static async Task<HashSet<string>> ReferencedAsync(
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var tables = new Dictionary<string, HashSet<string>>();
        foreach (var entity in db.Model.GetEntityTypes())
        {
            if (entity.GetTableName() is not { } table)
                continue;
            var store = StoreObjectIdentifier.Table(table, entity.GetSchema());
            var name = entity.GetSchema() is { } schema
                ? $"\"{schema}\".\"{table}\""
                : $"\"{table}\"";
            foreach (var property in entity.GetProperties())
                if (
                    property.ClrType == typeof(string)
                    && property.GetColumnName(store) is { } column
                )
                    (tables.TryGetValue(name, out var set) ? set : tables[name] = []).Add(column);
        }
        var ids = new HashSet<string>();
        foreach (var (table, columns) in tables)
        {
            var text = $"concat_ws(' ', {string.Join(", ", columns.Select(c => $"\"{c}\""))})";
            var rows = db.Database.SqlQueryRaw<string>(
                $"SELECT {text} AS \"Value\" FROM {table} WHERE {text} LIKE '%{PublicPath}%'"
            );
            await foreach (var value in rows.AsAsyncEnumerable().WithCancellation(ct))
            foreach (Match match in MediaReference().Matches(value))
                ids.Add(match.Groups[1].Value);
        }
        return ids;
    }

    private static IResult Invalid(string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [message] });

    [GeneratedRegex(@"^[0-9a-f]{32}\.(png|jpg|gif|webp)$")]
    private static partial Regex MediaName();

    [GeneratedRegex(@"!\[\s*\]\(")]
    private static partial Regex ImageWithoutAlt();

    [GeneratedRegex(@"/public/media/([0-9a-f]{32})\.")]
    private static partial Regex MediaReference();
}

/// <summary>Deletes uploaded pictures nothing uses any more (<see cref="MediaEndpoints.SweepAsync"/>), daily.</summary>
public sealed class MediaSweepWorker(IServiceScopeFactory scopes, ILogger<MediaSweepWorker> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Not at startup: restarts stay quick, and the first sweep waits for a calm moment.
        await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromDays(1));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var removed = await MediaEndpoints.SweepAsync(
                    scope.ServiceProvider.GetRequiredService<AtsDbContext>(),
                    scope.ServiceProvider.GetRequiredService<LocalFileStore>(),
                    DateTimeOffset.UtcNow,
                    dryRun: false,
                    stoppingToken
                );
                if (removed.Length > 0)
                    logger.LogInformation("Deleted {Count} unused pictures.", removed.Length);
            }
            catch (Exception error) when (error is not OperationCanceledException)
            {
                logger.LogWarning(error, "Sweeping unused pictures failed; trying again tomorrow.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
