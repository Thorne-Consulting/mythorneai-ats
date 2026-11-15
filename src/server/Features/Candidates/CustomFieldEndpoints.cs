using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record CustomFieldInput(string Key, string Label, string Type, string[]? Options);

public sealed record SaveCustomFieldsRequest(CustomFieldInput[] Fields);

/// <summary>Values by field key: a string, or a list of strings for pick-many fields.</summary>
public sealed record SaveCustomValuesRequest(Dictionary<string, JsonElement>? Values);

/// <summary>
/// Extra candidate fields the organization defines: text, number, date, pick one (select), pick
/// many (multiselect) and link (url). Values live in <c>Candidate.CustomFieldsJson</c>; pick-many
/// values are arrays. The list filters on pick-one and pick-many fields through the jsonb copy.
/// </summary>
public static partial class AtsEndpoints
{
    public static readonly string[] CustomFieldTypes =
    [
        "text",
        "number",
        "date",
        "select",
        "multiselect",
        "url",
    ];

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]{0,39}$")]
    private static partial Regex CustomFieldKey();

    /// <summary>A value checked against its field's type, or the reason it does not fit.</summary>
    internal static (JsonNode? Value, string? Error) CustomFieldValue(
        CustomFieldDefinition field,
        JsonElement raw
    )
    {
        if (field.Type == "multiselect")
        {
            var picked = (
                raw.ValueKind == JsonValueKind.Array
                    ? raw.EnumerateArray().Select(x => x.ToString())
                    : (raw.ToString() ?? "").Split(';')
            )
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct()
                .ToArray();
            if (picked.Length == 0)
                return (null, null);
            var unknown = picked.FirstOrDefault(x => !field.Options.Contains(x));
            return unknown is null
                ? (new JsonArray([.. picked.Select(x => (JsonNode)JsonValue.Create(x))]), null)
                : (
                    null,
                    $"{field.Label} must use the listed options. \"{unknown}\" is not one of them."
                );
        }
        var value =
            (raw.ValueKind == JsonValueKind.String ? raw.GetString() : raw.ToString())?.Trim()
            ?? "";
        if (value.Length == 0)
            return (null, null);
        if (value.Length > 500)
            return (null, $"{field.Label} is too long.");
        return field.Type switch
        {
            "number"
                when !decimal.TryParse(
                    value,
                    NumberStyles.Number,
                    CultureInfo.InvariantCulture,
                    out _
                ) => (null, $"{field.Label} must be a number."),
            "date" when !DateOnly.TryParse(value, CultureInfo.InvariantCulture, out _) => (
                null,
                $"{field.Label} must be a date."
            ),
            "select" when !field.Options.Contains(value) => (
                null,
                $"{field.Label} must be one of the listed options."
            ),
            "url" when !IsWebLink(value) => (
                null,
                $"{field.Label} must be a full web address that starts with https://."
            ),
            _ => (JsonValue.Create(value), null),
        };
    }

    private static void MapCustomFields(RouteGroupBuilder api)
    {
        api.MapGet(
            "/custom-fields",
            async (AtsDbContext db, CancellationToken ct) =>
                Results.Ok(
                    await db
                        .CustomFieldDefinitions.AsNoTracking()
                        .OrderBy(x => x.SortOrder)
                        .Select(x => new
                        {
                            x.Key,
                            x.Label,
                            x.Type,
                            x.Options,
                        })
                        .ToListAsync(ct)
                )
        );

        api.MapPut(
                "/admin/custom-fields",
                async (
                    SaveCustomFieldsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var fields = request.Fields ?? [];
                    var errors = new List<string>();
                    if (fields.Length > 30)
                        errors.Add("Thirty fields is the most.");
                    if (fields.Select(x => x.Key).Distinct().Count() != fields.Length)
                        errors.Add("Field keys must be unique.");
                    foreach (var field in fields)
                    {
                        if (!CustomFieldKey().IsMatch(field.Key ?? ""))
                            errors.Add(
                                $"\"{field.Key}\" is not a valid key. Use lowercase letters, digits, - or _."
                            );
                        if (string.IsNullOrWhiteSpace(field.Label))
                            errors.Add($"Give \"{field.Key}\" a label.");
                        if (!CustomFieldTypes.Contains(field.Type))
                            errors.Add($"\"{field.Label}\" has an unknown type.");
                        if (
                            field.Type is "select" or "multiselect"
                            && (field.Options ?? []).Count(o => !string.IsNullOrWhiteSpace(o)) == 0
                        )
                            errors.Add($"\"{field.Label}\" needs at least one option.");
                    }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["fields"] = [.. errors] }
                        );
                    // ponytail: replaces every definition; keys stay put, so stored values keep their field.
                    db.CustomFieldDefinitions.RemoveRange(db.CustomFieldDefinitions);
                    await db.SaveChangesAsync(ct);
                    db.CustomFieldDefinitions.AddRange(
                        fields.Select(
                            (x, i) =>
                                new CustomFieldDefinition
                                {
                                    Key = x.Key,
                                    Label = x.Label.Trim(),
                                    Type = x.Type,
                                    SortOrder = i,
                                    Options = x.Type is "select" or "multiselect"
                                        ? (x.Options ?? [])
                                            .Select(o => o.Trim())
                                            .Where(o => o.Length > 0)
                                            .Distinct()
                                            .ToArray()
                                        : [],
                                }
                        )
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Organization",
                        "custom-fields",
                        "CustomFieldsUpdated",
                        new { count = fields.Length }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/candidates/{id:guid}/custom-fields",
                async (
                    Guid id,
                    SaveCustomValuesRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var definitions = await db
                        .CustomFieldDefinitions.AsNoTracking()
                        .ToListAsync(ct);
                    var clean = new JsonObject();
                    var errors = new List<string>();
                    foreach (var (key, raw) in request.Values ?? [])
                    {
                        var definition = definitions.SingleOrDefault(x => x.Key == key);
                        if (definition is null)
                        {
                            errors.Add($"There is no field called {key}.");
                            continue;
                        }
                        var (value, error) = CustomFieldValue(definition, raw);
                        if (error is not null)
                            errors.Add(error);
                        else if (value is not null)
                            clean[key] = value;
                    }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["customFields"] = [.. errors] }
                        );
                    candidate.CustomFieldsJson = clean.ToJsonString();
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "CustomFieldsUpdated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }
}
