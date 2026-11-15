using System.Security.Claims;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Turns a spreadsheet's header row into our fields: auto-matched names, or the person's choice.</summary>
public static class ImportColumns
{
    public static readonly string[] Fields =
    [
        "firstName",
        "lastName",
        "email",
        "phone",
        "location",
        "currentTitle",
        "linkedInUrl",
        "source",
        "tags",
    ];

    private static readonly Dictionary<string, string[]> Aliases = new()
    {
        ["firstName"] = ["firstname", "first", "givenname", "forename"],
        ["lastName"] = ["lastname", "last", "surname", "familyname"],
        ["email"] = ["email", "emailaddress", "mail", "e-mail"],
        ["phone"] = ["phone", "phonenumber", "mobile", "cell", "telephone"],
        ["location"] = ["location", "city", "address"],
        ["currentTitle"] = ["currenttitle", "title", "jobtitle", "position", "role"],
        ["linkedInUrl"] = ["linkedin", "linkedinurl", "linkedinprofile"],
        ["source"] = ["source", "origin", "channel"],
        ["tags"] = ["tags", "labels"],
    };

    private static string Squash(string value) =>
        new(value.Trim().ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray());

    /// <summary>Column index → field ("custom:key" for an extra field), for the headers we recognize.</summary>
    public static Dictionary<int, string> AutoMatch(
        IReadOnlyList<string> headers,
        IEnumerable<(string Key, string Label)> custom
    )
    {
        var customByName = custom
            .SelectMany(field =>
                new[]
                {
                    (Squash(field.Key), $"custom:{field.Key}"),
                    (Squash(field.Label), $"custom:{field.Key}"),
                }
            )
            .GroupBy(x => x.Item1)
            .ToDictionary(x => x.Key, x => x.First().Item2);
        var mapping = new Dictionary<int, string>();
        for (var i = 0; i < headers.Count; i++)
        {
            var name = Squash(headers[i]);
            var field =
                Aliases.FirstOrDefault(x => x.Value.Contains(name)).Key
                ?? customByName.GetValueOrDefault(name);
            if (field is not null && !mapping.ContainsValue(field))
                mapping[i] = field;
        }
        return mapping;
    }
}

public static partial class AtsEndpoints
{
    private const int ImportRowLimit = 2000;

    private static void MapCandidateImport(RouteGroupBuilder api)
    {
        // Spreadsheet import (CSV or Excel): the columns, a dry run, then the import. Form fields:
        // file; mapping (JSON {"0":"email","3":"custom:notice"}; auto-matched when missing);
        // duplicates ("skip" or "fill" empty fields); tags (comma separated) for every row.
        api.MapPost(
                "/candidates/imports",
                async (
                    HttpRequest request,
                    bool? dryRun,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Import, ct))
                        return Results.Forbid();
                    var form = await request.ReadFormAsync(ct);
                    var file = form.Files.GetFile("file");
                    if (file is null || file.Length == 0)
                        return Problem("file", "Choose a spreadsheet (CSV or Excel).");
                    if (file.Length > 5 * 1024 * 1024)
                        return Problem(
                            "file",
                            "That file is over 5 MB. Split it into smaller files."
                        );
                    List<List<string>> rows;
                    try
                    {
                        rows = await ReadSheetAsync(file, ct);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        return Problem(
                            "file",
                            "We could not read that file. Save it as CSV or Excel (.xlsx) and try again."
                        );
                    }
                    rows = rows.Where(row => row.Any(cell => !string.IsNullOrWhiteSpace(cell)))
                        .ToList();
                    if (rows.Count < 2)
                        return Problem(
                            "file",
                            "The file needs a header row and at least one candidate."
                        );
                    if (rows.Count - 1 > ImportRowLimit)
                        return Problem(
                            "file",
                            $"Import {ImportRowLimit:N0} candidates or fewer at a time."
                        );

                    var headers = rows[0].Select(x => x.Trim()).ToList();
                    var custom = await db
                        .CustomFieldDefinitions.AsNoTracking()
                        .OrderBy(x => x.SortOrder)
                        .Select(x => new
                        {
                            x.Key,
                            x.Label,
                            x.Type,
                        })
                        .ToListAsync(ct);
                    var pickMany = custom
                        .Where(x => x.Type == "multiselect")
                        .Select(x => x.Key)
                        .ToHashSet();
                    Dictionary<int, string> mapping;
                    try
                    {
                        mapping = form["mapping"].ToString() is { Length: > 0 } json
                            ? JsonSerializer
                                .Deserialize<Dictionary<string, string?>>(json)!
                                .Where(x =>
                                    int.TryParse(x.Key, out var column)
                                    && column >= 0
                                    && column < headers.Count
                                    && !string.IsNullOrEmpty(x.Value)
                                )
                                .ToDictionary(x => int.Parse(x.Key), x => x.Value!)
                            : ImportColumns.AutoMatch(
                                headers,
                                custom.Select(x => (x.Key, x.Label))
                            );
                    }
                    catch (JsonException)
                    {
                        return Problem(
                            "mapping",
                            "The column choices could not be read. Choose them again."
                        );
                    }
                    var known = ImportColumns
                        .Fields.Concat(custom.Select(x => $"custom:{x.Key}"))
                        .ToHashSet();
                    mapping = mapping.Where(x => known.Contains(x.Value)).ToDictionary();
                    int Col(string field) =>
                        mapping.FirstOrDefault(x => x.Value == field, new(-1, "")).Key;
                    string Cell(List<string> row, int col) =>
                        col >= 0 && col < row.Count ? row[col].Trim() : "";
                    var (firstCol, lastCol, emailCol) = (
                        Col("firstName"),
                        Col("lastName"),
                        Col("email")
                    );
                    var columns = new
                    {
                        Headers = headers,
                        Mapping = mapping.ToDictionary(x => x.Key.ToString(), x => x.Value),
                        Fields = ImportColumns
                            .Fields.Select(x => new { Value = x, Label = FieldLabel(x) })
                            .Concat(
                                custom.Select(x => new
                                {
                                    Value = $"custom:{x.Key}",
                                    Label = x.Label,
                                })
                            ),
                    };
                    if (firstCol < 0 || lastCol < 0 || emailCol < 0)
                        return Results.Ok(
                            new
                            {
                                Columns = columns,
                                NeedsMapping = true,
                                Message = "Choose which columns hold the first name, last name and email.",
                            }
                        );

                    var fillEmpty = form["duplicates"].ToString() == "fill";
                    // A Source column wins; rows without one get the source chosen for the file.
                    var sources = await SourceList.LoadAsync(db, ct);
                    var fileSource = Clean(form["source"].ToString()) ?? "Spreadsheet import";
                    var extraTags = NormalizeTags(
                        form["tags"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries)
                    );
                    var emails = rows.Skip(1)
                        .Select(r => Cell(r, emailCol).ToLowerInvariant())
                        .Where(e => e.Length > 0)
                        .Distinct()
                        .ToArray();
                    var existing = await db
                        .Candidates.Where(c => emails.Contains(c.Email))
                        .ToDictionaryAsync(c => c.Email, ct);
                    var seen = new HashSet<string>();
                    var outcomes = new List<object>();
                    var created = new List<Candidate>();
                    var (updated, duplicates, invalid) = (0, 0, 0);
                    for (var i = 1; i < rows.Count; i++)
                    {
                        var row = rows[i];
                        var email = Cell(row, emailCol).ToLowerInvariant();
                        var (first, last) = (Cell(row, firstCol), Cell(row, lastCol));
                        string? Value(string field) => Clean(Cell(row, Col(field)));
                        var tags = NormalizeTags(
                            Cell(row, Col("tags"))
                                .Split([';', ','], StringSplitOptions.RemoveEmptyEntries)
                                .Concat(extraTags)
                        );
                        var customValues = mapping
                            .Where(x => x.Value.StartsWith("custom:"))
                            .Select(x =>
                                (Key: x.Value["custom:".Length..], Value: Cell(row, x.Key))
                            )
                            .Where(x => x.Value.Length > 0)
                            .ToList();
                        string status,
                            message;
                        if (first.Length == 0 || last.Length == 0 || !LooksLikeEmail(email))
                        {
                            (status, message) = (
                                "invalid",
                                "Needs a first name, a last name and a valid email."
                            );
                            invalid++;
                        }
                        else if (!seen.Add(email))
                        {
                            (status, message) = (
                                "duplicate",
                                "This email is on an earlier row of the file."
                            );
                            duplicates++;
                        }
                        else if (existing.TryGetValue(email, out var person))
                        {
                            if (fillEmpty)
                            {
                                person.Phone ??= Value("phone");
                                person.Location ??= Value("location");
                                person.CurrentTitle ??= Value("currentTitle");
                                person.LinkedInUrl ??= Value("linkedInUrl");
                                person.Tags = NormalizeTags(person.Tags.Concat(tags));
                                person.CustomFieldsJson = MergeCustom(
                                    person.CustomFieldsJson,
                                    customValues,
                                    pickMany,
                                    onlyEmpty: true
                                );
                                person.UpdatedAt = DateTimeOffset.UtcNow;
                                (status, message) = (
                                    "update",
                                    "Already here. We fill in their empty fields."
                                );
                                updated++;
                            }
                            else
                            {
                                (status, message) = (
                                    "duplicate",
                                    "Already here, so this row is skipped."
                                );
                                duplicates++;
                            }
                        }
                        else
                        {
                            (status, message) = ("create", "");
                            created.Add(
                                new Candidate
                                {
                                    FirstName = first,
                                    LastName = last,
                                    Email = email,
                                    Phone = Value("phone"),
                                    Location = Value("location"),
                                    CurrentTitle = Value("currentTitle"),
                                    LinkedInUrl = Value("linkedInUrl"),
                                    Source = sources.Resolve(Value("source") ?? fileSource),
                                    Tags = tags,
                                    CustomFieldsJson = MergeCustom(
                                        "{}",
                                        customValues,
                                        pickMany,
                                        onlyEmpty: false
                                    ),
                                }
                            );
                        }
                        outcomes.Add(
                            new
                            {
                                Line = i + 1,
                                Name = $"{first} {last}".Trim(),
                                Email = email,
                                Status = status,
                                Message = message,
                            }
                        );
                    }
                    Guid? batchId = null;
                    if (dryRun != true && created.Count + updated > 0)
                    {
                        db.Candidates.AddRange(created);
                        var batch = new ImportBatch
                        {
                            FileName = file.FileName,
                            CreatedBy = principal.Email(),
                            Created = created.Count,
                            Updated = updated,
                            Skipped = duplicates + invalid,
                            CandidateIds = [.. created.Select(x => x.Id)],
                        };
                        db.ImportBatches.Add(batch);
                        batchId = batch.Id;
                        Audit.Add(
                            db,
                            principal,
                            "Candidate",
                            "import",
                            "BulkImported",
                            new
                            {
                                file = file.FileName,
                                created = created.Count,
                                updated,
                                duplicates,
                                invalid,
                            }
                        );
                        await Notify.AddAsync(
                            db,
                            [principal.Email()],
                            new NotificationDraft(
                                NotificationKinds.ImportFinished,
                                $"Your import of {file.FileName} is done: {created.Count} added, {updated} updated",
                                "/candidates",
                                Body: (duplicates + invalid) switch
                                {
                                    0 => null,
                                    1 => "1 row was skipped.",
                                    var skipped => $"{skipped} rows were skipped.",
                                }
                            ),
                            ct
                        );
                        await db.SaveChangesAsync(ct);
                    }
                    else
                        db.ChangeTracker.Clear();
                    return Results.Ok(
                        new
                        {
                            Columns = columns,
                            NeedsMapping = false,
                            DryRun = dryRun == true,
                            Created = dryRun == true ? 0 : created.Count,
                            WouldCreate = created.Count,
                            Updated = dryRun == true ? 0 : updated,
                            WouldUpdate = updated,
                            Duplicates = duplicates,
                            Invalid = invalid,
                            CreatedIds = dryRun == true ? [] : created.Select(x => x.Id).ToArray(),
                            BatchId = batchId,
                            Rows = outcomes,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // The latest imports, with who ran them and what they did.
        api.MapGet(
                "/candidates/imports",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var batches = await db
                        .ImportBatches.AsNoTracking()
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(20)
                        .ToListAsync(ct);
                    var emails = batches.Select(x => x.CreatedBy).Distinct().ToList();
                    var names = await db
                        .Users.AsNoTracking()
                        .Where(u => emails.Contains(u.Email.ToLower()))
                        .ToDictionaryAsync(u => u.Email.ToLower(), u => u.DisplayName, ct);
                    var undoBefore = DateTimeOffset.UtcNow.AddHours(-ImportUndoHours);
                    return Results.Ok(
                        batches.Select(x => new
                        {
                            x.Id,
                            x.FileName,
                            By = names.GetValueOrDefault(x.CreatedBy, x.CreatedBy.Split('@')[0]),
                            x.Created,
                            x.Updated,
                            x.Skipped,
                            x.CreatedAt,
                            x.UndoneAt,
                            CanUndo = x.UndoneAt == null
                                && x.Created > 0
                                && x.CreatedAt > undoBefore,
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Within a day, delete the people an import added (with anything added to them since).
        // Filled-in fields on people who were already here stay.
        api.MapPost(
                "/candidates/imports/{id:guid}/undo",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Import, ct))
                        return Results.Forbid();
                    var batch = await db.ImportBatches.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (batch is null)
                        return Results.NotFound();
                    if (batch.UndoneAt is not null)
                        return Results.Conflict(
                            new { message = "This import was already undone." }
                        );
                    if (batch.CreatedAt < DateTimeOffset.UtcNow.AddHours(-ImportUndoHours))
                        return Results.Conflict(
                            new
                            {
                                message = $"Imports can be undone for {ImportUndoHours} hours. Delete people from the list instead.",
                            }
                        );
                    var stored =
                        await DeleteCandidatesAsync(db, principal, batch.CandidateIds, ct) ?? [];
                    foreach (var name in stored)
                        files.Delete(name);
                    batch.UndoneAt = DateTimeOffset.UtcNow;
                    batch.UndoneBy = principal.Email();
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Deleted = batch.CandidateIds.Length });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }

    private const int ImportUndoHours = 24;

    private static async Task<List<List<string>>> ReadSheetAsync(
        IFormFile file,
        CancellationToken ct
    )
    {
        await using var stream = file.OpenReadStream();
        if (Path.GetExtension(file.FileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase))
        {
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, ct);
            using var workbook = new XLWorkbook(buffer);
            var used = workbook.Worksheets.First().RangeUsed();
            if (used is null)
                return [];
            var width = used.ColumnCount();
            return used.Rows()
                .Select(row =>
                    Enumerable
                        .Range(1, width)
                        .Select(i => row.Cell(i).GetFormattedString())
                        .ToList()
                )
                .ToList();
        }
        using var reader = new StreamReader(stream, Encoding.UTF8, true);
        return Csv.Parse(await reader.ReadToEndAsync(ct));
    }

    private static string MergeCustom(
        string json,
        List<(string Key, string Value)> values,
        HashSet<string> pickMany,
        bool onlyEmpty
    )
    {
        var current =
            (string.IsNullOrWhiteSpace(json) ? null : System.Text.Json.Nodes.JsonNode.Parse(json))
                as System.Text.Json.Nodes.JsonObject
            ?? [];
        foreach (var (key, value) in values)
            if (!onlyEmpty || string.IsNullOrWhiteSpace(current[key]?.ToString()))
                // Pick-many cells list their options with semicolons: "Sales; Support".
                current[key] = pickMany.Contains(key)
                    ? new System.Text.Json.Nodes.JsonArray([
                        .. value
                            .Split(
                                ';',
                                StringSplitOptions.TrimEntries
                                    | StringSplitOptions.RemoveEmptyEntries
                            )
                            .Select(x =>
                                (System.Text.Json.Nodes.JsonNode)
                                    System.Text.Json.Nodes.JsonValue.Create(x)
                            ),
                    ])
                    : System.Text.Json.Nodes.JsonValue.Create(value);
        return current.ToJsonString();
    }

    private static string FieldLabel(string field) =>
        field switch
        {
            "firstName" => "First name",
            "lastName" => "Last name",
            "email" => "Email",
            "phone" => "Phone",
            "location" => "Location",
            "currentTitle" => "Current title",
            "linkedInUrl" => "LinkedIn",
            "source" => "Source",
            "tags" => "Tags",
            _ => field,
        };
}
