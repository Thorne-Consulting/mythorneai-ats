using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record KitTemplateRequest(
    string? Name,
    string? Summary,
    int DurationMinutes,
    string? Instructions,
    KitCompetencyRequest[]? Competencies
);

public sealed record QuestionBankRequest(
    string? Name,
    string? Question,
    string? FollowUps,
    string? GoodLooksLike,
    int Weight = 3,
    string[]? Tags = null
);

/// <summary>
/// The interview library: kit templates and a question bank shared by every job. Anyone who builds
/// kits can read it; admins and recruiters change it.
/// </summary>
public static partial class AtsEndpoints
{
    private static IResult LibraryProblem(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    private static string[] CleanTags(string[]? tags) =>
        [
            .. (tags ?? [])
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .DistinctBy(x => x.ToLowerInvariant())
                .Take(10),
        ];

    private static string? CheckQuestion(QuestionBankRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
            return "Name the competency in up to 120 characters.";
        if (string.IsNullOrWhiteSpace(request.Question) || request.Question.Trim().Length > 1000)
            return "Write a question of up to 1,000 characters.";
        if (request.FollowUps?.Trim().Length > 2000 || request.GoodLooksLike?.Trim().Length > 2000)
            return "Follow-ups and what a good answer shows are up to 2,000 characters each.";
        if (request.Weight is < 1 or > 5)
            return "Weights go from 1 to 5.";
        if (CleanTags(request.Tags).Any(x => x.Length > 40))
            return "Tags are up to 40 characters.";
        return null;
    }

    private static void FillQuestion(QuestionBankItem item, QuestionBankRequest request)
    {
        item.Name = request.Name!.Trim();
        item.Question = request.Question!.Trim();
        item.FollowUps = request.FollowUps?.Trim() ?? "";
        item.GoodLooksLike = request.GoodLooksLike?.Trim() ?? "";
        item.Weight = request.Weight;
        item.Tags = CleanTags(request.Tags);
        item.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static string? CheckTemplate(KitTemplateRequest request)
    {
        var errors = InterviewKits.Validate(
            new SaveInterviewKitRequest(
                request.Name,
                request.Instructions,
                request.DurationMinutes,
                request.Competencies
            )
        );
        if (errors is not null)
            return errors["interviewKit"][0];
        return request.Summary?.Trim().Length > 200 ? "Keep the summary to 200 characters." : null;
    }

    private static void FillTemplate(KitTemplate template, KitTemplateRequest request)
    {
        template.Name = request.Name!.Trim();
        template.Summary = request.Summary?.Trim() ?? "";
        template.DurationMinutes = request.DurationMinutes;
        template.Instructions = request.Instructions?.Trim() ?? "";
        template.CompetenciesJson = JsonSerializer.Serialize(
            request.Competencies!.Select(x => new KitTemplateCompetency(
                x.Name!.Trim(),
                x.Question!.Trim(),
                x.FollowUps?.Trim() ?? "",
                x.Description?.Trim() ?? "",
                x.Weight
            )),
            JsonSerializerOptions.Web
        );
        template.UpdatedAt = DateTimeOffset.UtcNow;
    }

    private static object TemplateView(KitTemplate x) =>
        new
        {
            x.Id,
            x.Name,
            x.Summary,
            x.DurationMinutes,
            x.Instructions,
            Competencies = JsonSerializer.Deserialize<KitTemplateCompetency[]>(
                x.CompetenciesJson,
                JsonSerializerOptions.Web
            ) ?? [],
            x.UpdatedAt,
            x.ArchivedAt,
        };

    private static void MapInterviewLibrary(RouteGroupBuilder api)
    {
        var library = api.MapGroup("/interview-library");

        // ponytail: the whole library in one response, searched in the browser. Page it if a library passes a few thousand rows.
        library
            .MapGet(
                "/templates",
                async (bool? archived, AtsDbContext db, CancellationToken ct) =>
                {
                    var rows = await db
                        .KitTemplates.AsNoTracking()
                        .Where(x => (x.ArchivedAt != null) == (archived ?? false))
                        .OrderBy(x => x.Name)
                        .ToListAsync(ct);
                    return Results.Ok(rows.Select(TemplateView));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        library
            .MapPost(
                "/templates",
                async (
                    KitTemplateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.Forbid();
                    if (CheckTemplate(request) is { } error)
                        return LibraryProblem("template", error);
                    var template = new KitTemplate { Name = "", CreatedBy = principal.Email() };
                    FillTemplate(template, request);
                    db.KitTemplates.Add(template);
                    Audit.Add(
                        db,
                        principal,
                        "InterviewLibrary",
                        template.Id,
                        "KitTemplateCreated",
                        new { template.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interview-library/templates/{template.Id}",
                        TemplateView(template)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        library
            .MapPut(
                "/templates/{id:guid}",
                async (
                    Guid id,
                    KitTemplateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.Forbid();
                    if (CheckTemplate(request) is { } error)
                        return LibraryProblem("template", error);
                    var template = await db.KitTemplates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (template is null)
                        return Results.NotFound();
                    FillTemplate(template, request);
                    Audit.Add(
                        db,
                        principal,
                        "InterviewLibrary",
                        id,
                        "KitTemplateUpdated",
                        new { template.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(TemplateView(template));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        library
            .MapGet(
                "/questions",
                async (bool? archived, AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .QuestionBankItems.AsNoTracking()
                            .Where(x => (x.ArchivedAt != null) == (archived ?? false))
                            .OrderBy(x => x.Name)
                            .Select(x => new
                            {
                                x.Id,
                                x.Name,
                                x.Question,
                                x.FollowUps,
                                x.GoodLooksLike,
                                x.Weight,
                                x.Tags,
                                x.UpdatedAt,
                                x.ArchivedAt,
                            })
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        library
            .MapPost(
                "/questions",
                async (
                    QuestionBankRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.Forbid();
                    if (CheckQuestion(request) is { } error)
                        return LibraryProblem("question", error);
                    var name = request.Name!.Trim();
                    var question = request.Question!.Trim();
                    if (
                        await db.QuestionBankItems.AnyAsync(
                            x => x.ArchivedAt == null && x.Name == name && x.Question == question,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new { message = "This question is already in the question bank." }
                        );
                    var item = new QuestionBankItem
                    {
                        Name = "",
                        Question = "",
                        CreatedBy = principal.Email(),
                    };
                    FillQuestion(item, request);
                    db.QuestionBankItems.Add(item);
                    Audit.Add(
                        db,
                        principal,
                        "InterviewLibrary",
                        item.Id,
                        "QuestionAdded",
                        new { item.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interview-library/questions/{item.Id}",
                        new { item.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        library
            .MapPut(
                "/questions/{id:guid}",
                async (
                    Guid id,
                    QuestionBankRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (!principal.IsHiringStaff())
                        return Results.Forbid();
                    if (CheckQuestion(request) is { } error)
                        return LibraryProblem("question", error);
                    var item = await db.QuestionBankItems.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (item is null)
                        return Results.NotFound();
                    FillQuestion(item, request);
                    Audit.Add(
                        db,
                        principal,
                        "InterviewLibrary",
                        id,
                        "QuestionUpdated",
                        new { item.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Archive and restore, for templates and questions alike. Kits made from them are not touched.
        foreach (var (path, archive) in new[] { ("archive", true), ("restore", false) })
        {
            library
                .MapPost(
                    $"/templates/{{id:guid}}/{path}",
                    async (
                        Guid id,
                        ClaimsPrincipal principal,
                        AtsDbContext db,
                        CancellationToken ct
                    ) =>
                    {
                        if (!principal.IsHiringStaff())
                            return Results.Forbid();
                        var template = await db.KitTemplates.SingleOrDefaultAsync(
                            x => x.Id == id,
                            ct
                        );
                        if (template is null)
                            return Results.NotFound();
                        template.ArchivedAt = archive ? DateTimeOffset.UtcNow : null;
                        await db.SaveChangesAsync(ct);
                        return Results.NoContent();
                    }
                )
                .RequireAuthorization(AtsPolicies.ManageHiring);
            library
                .MapPost(
                    $"/questions/{{id:guid}}/{path}",
                    async (
                        Guid id,
                        ClaimsPrincipal principal,
                        AtsDbContext db,
                        CancellationToken ct
                    ) =>
                    {
                        if (!principal.IsHiringStaff())
                            return Results.Forbid();
                        var item = await db.QuestionBankItems.SingleOrDefaultAsync(
                            x => x.Id == id,
                            ct
                        );
                        if (item is null)
                            return Results.NotFound();
                        item.ArchivedAt = archive ? DateTimeOffset.UtcNow : null;
                        await db.SaveChangesAsync(ct);
                        return Results.NoContent();
                    }
                )
                .RequireAuthorization(AtsPolicies.ManageHiring);
        }
    }
}
