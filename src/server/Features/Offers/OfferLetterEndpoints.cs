using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record OfferLetterRequest(string? Name, string? Body);

/// <summary>This offer's letter: start from a template (its body is copied) or save an edited copy.</summary>
public sealed record OfferLetterOnOfferRequest(Guid? TemplateId = null, string? Markdown = null);

public sealed record OfferLetterPreviewRequest(string? Markdown);

/// <summary>
/// Offer letters: templates in the one template store (<see cref="TemplateKind.OfferLetter"/>),
/// filled from the offer's terms with <c>{{detail}}</c> chips. The copy sent is frozen on the offer.
/// </summary>
public static class OfferLetters
{
    private const int MaxBody = 40_000;

    /// <summary>The details a letter can use. Everything comes from the offer, its job and its candidate.</summary>
    public static readonly TemplateDetail[] Details =
    [
        new("candidateName", "Candidate name", "Alex Rivera"),
        new("firstName", "First name", "Alex"),
        new("jobTitle", "Job title", "Senior Engineer"),
        new("company", "Company", "Acme"),
        new("salary", "Salary (number only)", "150,000"),
        new("pay", "Pay, with the currency symbol", "$150,000"),
        new("currency", "Currency", "USD"),
        new("payPeriod", "Pay period", "year"),
        new("bonus", "Bonus", "10% yearly target"),
        new("equity", "Equity", "2,000 stock options over 4 years"),
        new("startDate", "Start date", "January 4, 2027"),
        new("employmentType", "Employment type", "Full-time"),
        new("workMode", "Work mode", "Hybrid"),
        new("location", "Location", "Austin, Texas"),
        new("managerName", "Manager", "Sam Manager"),
        new("expiresOn", "Offer open until", "December 1, 2026"),
        new(
            "terms",
            "All terms (a list)",
            "- **Base salary:** $150,000 per year\n- **Start date:** January 4, 2027"
        ),
        new("senderName", "Your name", "Sam Recruiter"),
    ];

    public const string StandardName = "Standard offer letter";

    public const string StandardBody = """
        Dear {{firstName}},

        We are delighted to offer you the position of **{{jobTitle}}** at {{company}}. Everyone you met enjoyed getting to know you, and we would love to have you on the team.

        ## Your offer

        {{terms}}

        You will report to {{managerName}}.

        ## Next steps

        To accept, choose **Accept offer** on this page. If anything here raises a question, message us and we will get back to you quickly.

        We are excited about what we can do together.

        Warm regards,

        {{senderName}} and the {{company}} team
        """;

    public static string Label(string key) =>
        Details.FirstOrDefault(x => x.Key == key)?.Label ?? EmailTemplates.DetailLabel(key);

    public static string PortalPath(Guid applicationId) =>
        $"/candidate-portal/applications/{applicationId}/offer";

    /// <summary>The offer closes at the end of its last day in the organization's time zone.</summary>
    public static DateTimeOffset ClosesAt(DateOnly lastDay, TimeZoneInfo zone)
    {
        var midnight = lastDay.AddDays(1).ToDateTime(TimeOnly.MinValue);
        // In UTC: Postgres keeps only UTC instants.
        return new DateTimeOffset(midnight, zone.GetUtcOffset(midnight)).ToUniversalTime();
    }

    /// <summary>Details filled in. Unknown placeholders stay as written, so nothing is lost silently.</summary>
    public static string Fill(string markdown, IReadOnlyDictionary<string, string> values) =>
        EmailTemplates.Fill(EmailTemplates.Camel(markdown), values).Trim();

    /// <summary>The template a new offer starts from: the standard letter when it exists, else the first by name.</summary>
    public static Task<EmailTemplate?> DefaultAsync(AtsDbContext db, CancellationToken ct) =>
        db
            .EmailTemplates.AsNoTracking()
            .Where(x => x.Kind == TemplateKind.OfferLetter)
            .OrderBy(x => x.Name == StandardName ? 0 : 1)
            .ThenBy(x => x.Name)
            .FirstOrDefaultAsync(ct);

    /// <summary>
    /// The store starts with the standard letter. The API never deletes the last letter, so this
    /// only ever runs on an empty store.
    /// </summary>
    public static async Task EnsureAsync(AtsDbContext db, CancellationToken ct = default)
    {
        if (await db.EmailTemplates.AnyAsync(x => x.Kind == TemplateKind.OfferLetter, ct))
            return;
        db.EmailTemplates.Add(
            new EmailTemplate
            {
                Kind = TemplateKind.OfferLetter,
                Name = StandardName,
                Subject = "",
                Body = StandardBody,
            }
        );
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Sample values, for the template editor's preview.</summary>
    public static async Task<Dictionary<string, string>> SamplesAsync(
        AtsDbContext db,
        string me,
        CancellationToken ct
    )
    {
        var values = Details.ToDictionary(x => x.Key, x => x.Example);
        values["senderName"] =
            await db
                .Users.Where(x => x.Email == me)
                .Select(x => x.DisplayName)
                .FirstOrDefaultAsync(ct)
            ?? values["senderName"];
        values["company"] =
            await db.Organizations.Select(x => x.Name).FirstOrDefaultAsync(ct) ?? values["company"];
        return values;
    }

    /// <summary>
    /// The offer's own values: terms, job, candidate, manager and sender. Empty terms are left out,
    /// so a letter that uses them shows them as missing. Needs the application with its candidate
    /// and job loaded.
    /// </summary>
    public static async Task<Dictionary<string, string>> ValuesAsync(
        AtsDbContext db,
        Offer offer,
        string senderEmail,
        CancellationToken ct
    )
    {
        var application = offer.Application!;
        var candidate = application.Candidate!;
        var job = application.Requisition!;
        string Day(DateOnly day) => day.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture);
        var values = new Dictionary<string, string>
        {
            ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}".Trim(),
            ["firstName"] = candidate.FirstName,
            ["jobTitle"] = job.Title,
            ["currency"] = offer.Currency,
            ["payPeriod"] = offer.PayPeriod.ToLowerInvariant(),
            ["bonus"] = offer.Bonus,
            ["equity"] = offer.Equity,
            ["employmentType"] = offer.EmploymentType,
            ["workMode"] = offer.WorkMode,
            ["location"] = offer.Location,
            ["terms"] = string.Join(
                "\n",
                AtsEndpoints.OfferTermRows(offer).Select(x => $"- **{x.Label}:** {x.Value}")
            ),
        };
        if (offer.BaseSalary is { } salary)
        {
            values["salary"] = salary.ToString("#,0.##", CultureInfo.InvariantCulture);
            values["pay"] = Currencies.Format(
                salary,
                offer.Currency,
                await CurrencyEndpoints.InfoAsync(db, offer.Currency, ct)
            );
        }
        if (offer.StartDate is { } start)
            values["startDate"] = Day(start);
        if (offer.ExpiresOn is { } expires)
            values["expiresOn"] = Day(expires);
        // The job's first hiring manager, by name when they have an account.
        var manager =
            await db
                .RequisitionMembers.Where(x =>
                    x.RequisitionId == job.Id && x.Role == RequisitionRole.HiringManager
                )
                .OrderBy(x => x.CreatedAt)
                .Select(x => x.User!.DisplayName)
                .FirstOrDefaultAsync(ct)
            ?? await db
                .Users.Where(x => x.Email == job.OwnerEmail)
                .Select(x => x.DisplayName)
                .FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(manager))
            values["managerName"] = manager;
        values["senderName"] =
            await db
                .Users.Where(x => x.Email == senderEmail)
                .Select(x => x.DisplayName)
                .FirstOrDefaultAsync(ct)
            ?? "";
        values["company"] =
            await db.Organizations.Select(x => x.Name).FirstOrDefaultAsync(ct) ?? "The hiring team";
        return values.Where(x => x.Value.Length > 0).ToDictionary(x => x.Key, x => x.Value);
    }

    /// <summary>Details used in a letter that no letter may use.</summary>
    public static string[] Unknown(string markdown) =>
        EmailTemplates.Unknown(markdown, Details.Select(x => x.Key));

    internal static Dictionary<string, string[]>? Validate(string? body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return new() { ["body"] = ["Write the letter."] };
        if (body.Length > MaxBody)
            return new() { ["body"] = ["Keep the letter under 40,000 characters."] };
        var unknown = Unknown(body);
        return unknown.Length == 0
            ? null
            : new()
            {
                ["body"] =
                [
                    $"A letter can't use {string.Join(", ", unknown.Select(x => "{{" + x + "}}"))}. Use the details offered in the editor.",
                ],
            };
    }

    internal static object Missing(string markdown, IReadOnlyDictionary<string, string> values) =>
        EmailTemplates
            .Missing(markdown, values)
            .Select(key => new { Key = key, Label = Label(key) });
}

/// <summary>Why a candidate turned an offer down: a fixed list that reports can group, plus a note.</summary>
public static class OfferDeclines
{
    public const string Other = "Other";

    public static readonly (string Key, string Label)[] All =
    [
        ("Compensation", "Compensation"),
        ("AnotherOffer", "Accepted another offer"),
        ("RoleOrLevel", "Role or level"),
        ("Location", "Location or remote"),
        ("StartDate", "Start date"),
        ("Personal", "Personal"),
        (Other, "Other"),
    ];

    private static readonly string[] Keys = All.Select(x => x.Key).ToArray();

    public static string Label(string key) =>
        All.FirstOrDefault(x => x.Key == key).Label ?? "Other";

    /// <summary>
    /// A known key stays; anything else (older free text) becomes Other with the text as the note.
    /// </summary>
    public static (string Key, string? Note) Normalize(string? reason, string? note)
    {
        var trimmed = note?.Trim();
        var cleanNote = string.IsNullOrEmpty(trimmed)
            ? null
            : trimmed[..Math.Min(trimmed.Length, 1000)];
        var key = reason?.Trim();
        if (key is not null && Keys.Contains(key))
            return (key, cleanNote);
        if (string.IsNullOrWhiteSpace(key))
            return (Other, cleanNote);
        var combined = cleanNote is null ? key : $"{key}. {cleanNote}";
        return (Other, combined[..Math.Min(combined.Length, 1000)]);
    }

    /// <summary>Offers declined before reasons were a list: their text moves to the note under Other. Runs once; later runs change nothing.</summary>
    public static Task<int> BackfillAsync(AtsDbContext db, CancellationToken ct = default) =>
        db
            .Offers.Where(x => x.DeclineReason != null && !Keys.Contains(x.DeclineReason))
            .ExecuteUpdateAsync(
                setters =>
                    setters
                        .SetProperty(x => x.DeclineNote, x => x.DeclineNote ?? x.DeclineReason)
                        .SetProperty(x => x.DeclineReason, Other),
                ct
            );
}

public static partial class AtsEndpoints
{
    private static void MapOfferLetters(RouteGroupBuilder api)
    {
        // Templates: anyone who makes offers reads them; people who may edit templates change them.
        api.MapGet(
                "/offer-letters",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var letters = await db
                        .EmailTemplates.AsNoTracking()
                        .Where(x => x.Kind == TemplateKind.OfferLetter)
                        .OrderBy(x => x.Name)
                        .Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Body,
                            x.Version,
                            x.UpdatedAt,
                            UpdatedByName = db
                                .Users.Where(u => u.Email == x.UpdatedBy)
                                .Select(u => u.DisplayName)
                                .FirstOrDefault(),
                        })
                        .ToListAsync(ct);
                    return Results.Ok(
                        new
                        {
                            CanEdit = await Permissions.HasAsync(
                                db,
                                principal,
                                Permissions.Templates,
                                ct
                            ),
                            Details = OfferLetters.Details,
                            Letters = letters,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/offer-letters",
                async (
                    OfferLetterRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                        return Results.Forbid();
                    if (ValidateLetter(request) is { } errors)
                        return Results.ValidationProblem(errors);
                    var name = request.Name!.Trim();
                    if (
                        await db.EmailTemplates.AnyAsync(
                            x => x.Kind == TemplateKind.OfferLetter && x.Name == name,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["name"] = ["A letter with this name already exists."],
                            }
                        );
                    var letter = new EmailTemplate
                    {
                        Kind = TemplateKind.OfferLetter,
                        Name = name,
                        Subject = "",
                        Body = request.Body!.Trim(),
                        UpdatedBy = principal.Email(),
                    };
                    db.EmailTemplates.Add(letter);
                    TemplateEndpoints.AddVersion(
                        db,
                        letter.Id.ToString(),
                        null,
                        letter,
                        "Saved",
                        principal.Email()
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/offer-letters/{letter.Id}", new { letter.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/offer-letters/{id:guid}",
                async (
                    Guid id,
                    OfferLetterRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                        return Results.Forbid();
                    var letter = await db.EmailTemplates.SingleOrDefaultAsync(
                        x => x.Id == id && x.Kind == TemplateKind.OfferLetter,
                        ct
                    );
                    if (letter is null)
                        return Results.NotFound();
                    if (ValidateLetter(request) is { } errors)
                        return Results.ValidationProblem(errors);
                    var name = request.Name!.Trim();
                    if (
                        await db.EmailTemplates.AnyAsync(
                            x => x.Kind == TemplateKind.OfferLetter && x.Name == name && x.Id != id,
                            ct
                        )
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["name"] = ["A letter with this name already exists."],
                            }
                        );
                    // Offers keep their own copy, so changing a template never changes a letter already written.
                    letter.Name = name;
                    letter.Body = request.Body!.Trim();
                    letter.Version++;
                    letter.UpdatedAt = DateTimeOffset.UtcNow;
                    letter.UpdatedBy = principal.Email();
                    TemplateEndpoints.AddVersion(
                        db,
                        id.ToString(),
                        null,
                        letter,
                        "Saved",
                        principal.Email()
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { letter.Version });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Every saved wording of a letter, newest first. A letter saved before versions were kept
        // shows its current wording as the one entry.
        api.MapGet(
                "/offer-letters/{id:guid}/versions",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var letter = await db
                        .EmailTemplates.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x => x.Id == id && x.Kind == TemplateKind.OfferLetter,
                            ct
                        );
                    if (letter is null)
                        return Results.NotFound();
                    var key = id.ToString();
                    var rows = await db
                        .EmailTemplateVersions.AsNoTracking()
                        .Where(x => x.TemplateRef == key)
                        .OrderByDescending(x => x.Version)
                        .Take(100)
                        .ToListAsync(ct);
                    if (rows.All(x => x.Version != letter.Version))
                        rows.Insert(
                            0,
                            new EmailTemplateVersion
                            {
                                TemplateRef = key,
                                Version = letter.Version,
                                Subject = "",
                                Body = letter.Body,
                                Action = "Saved",
                                EditedBy = letter.UpdatedBy,
                                EditedAt = letter.UpdatedAt,
                            }
                        );
                    var emails = rows.Select(x => x.EditedBy).OfType<string>().Distinct().ToArray();
                    var names = await db
                        .Users.Where(x => emails.Contains(x.Email))
                        .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                    return Results.Ok(
                        rows.Select(x => new
                        {
                            x.Version,
                            x.Body,
                            x.Action,
                            x.EditedAt,
                            EditedByName = x.EditedBy is null
                                ? null
                                : names.GetValueOrDefault(x.EditedBy, x.EditedBy),
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Restoring saves the old wording as a new version; nothing in the history is lost.
        api.MapPost(
                "/offer-letters/{id:guid}/restore",
                async (
                    Guid id,
                    RestoreTemplateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                        return Results.Forbid();
                    var letter = await db.EmailTemplates.SingleOrDefaultAsync(
                        x => x.Id == id && x.Kind == TemplateKind.OfferLetter,
                        ct
                    );
                    var key = id.ToString();
                    var old = await db
                        .EmailTemplateVersions.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x => x.TemplateRef == key && x.Version == request.Version,
                            ct
                        );
                    if (letter is null || old is null)
                        return Results.NotFound();
                    letter.Body = old.Body;
                    letter.Version++;
                    letter.UpdatedAt = DateTimeOffset.UtcNow;
                    letter.UpdatedBy = principal.Email();
                    TemplateEndpoints.AddVersion(
                        db,
                        key,
                        null,
                        letter,
                        "Restored",
                        principal.Email()
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { letter.Version });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapDelete(
                "/offer-letters/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    if (!await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                        return Results.Forbid();
                    var letter = await db.EmailTemplates.SingleOrDefaultAsync(
                        x => x.Id == id && x.Kind == TemplateKind.OfferLetter,
                        ct
                    );
                    if (letter is null)
                        return Results.NotFound();
                    if (
                        await db.EmailTemplates.CountAsync(
                            x => x.Kind == TemplateKind.OfferLetter,
                            ct
                        ) == 1
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "Keep at least one letter, so new offers have one to start from.",
                            }
                        );
                    db.EmailTemplates.Remove(letter);
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // A letter with sample details, for the template editor.
        api.MapPost(
                "/offer-letters/preview",
                async (
                    OfferLetterPreviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var values = await OfferLetters.SamplesAsync(db, principal.Email(), ct);
                    return Results.Ok(
                        new { Markdown = OfferLetters.Fill(request.Markdown ?? "", values) }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // This offer's letter, until it is sent.
        api.MapPut(
                "/offers/{id:guid}/letter",
                async (
                    Guid id,
                    OfferLetterOnOfferRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (
                        offer.Status
                        is not (
                            OfferStatus.Draft
                            or OfferStatus.PendingApproval
                            or OfferStatus.Approved
                        )
                    )
                        return Results.Conflict(
                            new { message = "The letter was sent and can no longer change." }
                        );
                    var markdown = request.Markdown;
                    if (request.TemplateId is { } templateId)
                    {
                        var template = await db
                            .EmailTemplates.AsNoTracking()
                            .SingleOrDefaultAsync(
                                x => x.Id == templateId && x.Kind == TemplateKind.OfferLetter,
                                ct
                            );
                        if (template is null)
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["templateId"] = ["Choose a letter."],
                                }
                            );
                        // Another letter, or this one's wording as it is today: that version.
                        // Changes for this offer keep the version they started from.
                        if (
                            offer.LetterTemplateId != template.Id
                            || markdown is null
                            || markdown.Trim() == template.Body.Trim()
                        )
                            offer.LetterTemplateVersion = template.Version;
                        offer.LetterTemplateId = template.Id;
                        markdown ??= template.Body;
                    }
                    if (OfferLetters.Validate(markdown) is { } errors)
                        return Results.ValidationProblem(errors);
                    offer.LetterMarkdown = markdown!.Trim();
                    offer.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { offer.LetterTemplateId, offer.LetterMarkdown });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The letter as the candidate will read it, with this offer's details, and what is missing.
        api.MapPost(
                "/offers/{id:guid}/letter/preview",
                async (
                    Guid id,
                    OfferLetterPreviewRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var offer = await LoadManagedOfferAsync(db, id, principal, ct);
                    if (offer is null)
                        return Results.NotFound();
                    if (offer.LetterSent is { } sent)
                        return Results.Ok(new { Markdown = sent, Missing = Array.Empty<object>() });
                    var markdown = request.Markdown ?? offer.LetterMarkdown ?? "";
                    var values = await OfferLetters.ValuesAsync(db, offer, principal.Email(), ct);
                    return Results.Ok(
                        new
                        {
                            Markdown = OfferLetters.Fill(markdown, values),
                            Missing = OfferLetters.Missing(markdown, values),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static Dictionary<string, string[]>? ValidateLetter(OfferLetterRequest request)
    {
        var errors = OfferLetters.Validate(request.Body) ?? [];
        if (!errors.ContainsKey("body") && MediaEndpoints.HasImageWithoutAlt(request.Body))
            errors["body"] = [MediaEndpoints.AltRequired];
        if (string.IsNullOrWhiteSpace(request.Name))
            errors["name"] = ["Give the letter a name."];
        else if (request.Name.Trim().Length > 120)
            errors["name"] = ["Keep the name under 120 characters."];
        return errors.Count == 0 ? null : errors;
    }
}
