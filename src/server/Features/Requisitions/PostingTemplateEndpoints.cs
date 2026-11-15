using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Posting templates. A template is every version saved under one name: saving makes a new
/// version and retires the one before, so the list and the job wizard show only the latest.
/// </summary>
public static partial class AtsEndpoints
{
    private static void MapPostingTemplates(RouteGroupBuilder api)
    {
        // Latest version of each template. Archived ones only when asked for (the settings list).
        api.MapGet(
            "/posting-templates",
            async (bool? archived, AtsDbContext db, CancellationToken ct) =>
            {
                var rows = await db
                    .PostingTemplates.AsNoTracking()
                    .Where(x => x.IsActive && (archived == true || x.ArchivedAt == null))
                    .OrderBy(x => x.Name)
                    .ToListAsync(ct);
                var names = rows.Select(x => x.Name).ToArray();
                // Jobs made from any version of each template.
                var usedBy = await db
                    .Requisitions.AsNoTracking()
                    .IgnoreAutoIncludes()
                    .Where(r => r.PostingTemplateId != null)
                    .Join(
                        db.PostingTemplates,
                        r => r.PostingTemplateId,
                        t => t.Id,
                        (r, t) => t.Name
                    )
                    .Where(name => names.Contains(name))
                    .GroupBy(name => name)
                    .Select(g => new { g.Key, Count = g.Count() })
                    .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
                var people = await NamesAsync(db, rows.Select(x => x.UpdatedBy), ct);
                return Results.Ok(
                    rows.Select(x => TemplateView(x, people, usedBy.GetValueOrDefault(x.Name)))
                );
            }
        );

        // One version, with the template's version history.
        api.MapGet(
            "/posting-templates/{id:guid}",
            async (Guid id, AtsDbContext db, CancellationToken ct) =>
            {
                var template = await db
                    .PostingTemplates.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (template is null)
                    return Results.NotFound();
                var versions = await db
                    .PostingTemplates.AsNoTracking()
                    .Where(x => x.Name == template.Name)
                    .OrderByDescending(x => x.Version)
                    .ToListAsync(ct);
                var people = await NamesAsync(db, versions.Select(x => x.UpdatedBy), ct);
                return Results.Ok(
                    new
                    {
                        Template = TemplateView(template, people, 0),
                        Versions = versions.Select(x => new
                        {
                            x.Id,
                            x.Version,
                            x.IsActive,
                            x.UpdatedAt,
                            UpdatedByName = x.UpdatedBy is null
                                ? null
                                : people.GetValueOrDefault(x.UpdatedBy, x.UpdatedBy),
                        }),
                    }
                );
            }
        );

        api.MapPost(
                "/posting-templates",
                async (
                    SavePostingTemplateRequest request,
                    AtsDbContext db,
                    ClaimsPrincipal principal,
                    CancellationToken ct
                ) => await SaveTemplateVersionAsync(db, principal, null, request, ct)
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Saving an existing template: a new version, renamed with all its versions if the name changed.
        api.MapPut(
                "/posting-templates/{id:guid}",
                async (
                    Guid id,
                    SavePostingTemplateRequest request,
                    AtsDbContext db,
                    ClaimsPrincipal principal,
                    CancellationToken ct
                ) =>
                {
                    var current = await db.PostingTemplates.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    return current is null
                        ? Results.NotFound()
                        : await SaveTemplateVersionAsync(db, principal, current, request, ct);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Restoring an older version saves its content as the newest version.
        api.MapPost(
                "/posting-templates/{id:guid}/restore",
                async (Guid id, AtsDbContext db, ClaimsPrincipal principal, CancellationToken ct) =>
                {
                    var old = await db.PostingTemplates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    return old is null
                        ? Results.NotFound()
                        : await SaveTemplateVersionAsync(
                            db,
                            principal,
                            old,
                            new SavePostingTemplateRequest(
                                old.Name,
                                old.HeaderMarkdown,
                                old.DescriptionMarkdown,
                                old.BenefitsMarkdown,
                                [.. ApplicationQuestions.FromJson(old.QuestionsJson)]
                            ),
                            ct
                        );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/posting-templates/{id:guid}/duplicate",
                async (Guid id, AtsDbContext db, ClaimsPrincipal principal, CancellationToken ct) =>
                {
                    var source = await db
                        .PostingTemplates.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (source is null)
                        return Results.NotFound();
                    var name = $"{source.Name} (copy)";
                    for (
                        var n = 2;
                        await db.PostingTemplates.AnyAsync(x => x.Name == name, ct);
                        n++
                    )
                        name = $"{source.Name} (copy {n})";
                    return await SaveTemplateVersionAsync(
                        db,
                        principal,
                        null,
                        new SavePostingTemplateRequest(
                            name,
                            source.HeaderMarkdown,
                            source.DescriptionMarkdown,
                            source.BenefitsMarkdown,
                            [.. ApplicationQuestions.FromJson(source.QuestionsJson)]
                        ),
                        ct
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Archive hides every version from the job wizard; jobs made from it keep their posting.
        api.MapPost(
                "/posting-templates/{id:guid}/archive",
                (
                    Guid id,
                    bool? restore,
                    AtsDbContext db,
                    ClaimsPrincipal principal,
                    CancellationToken ct
                ) => ArchiveTemplateAsync(db, principal, id, restore != true, ct)
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static object TemplateView(
        PostingTemplate x,
        IReadOnlyDictionary<string, string> people,
        int usedBy
    ) =>
        new
        {
            x.Id,
            x.Name,
            x.Version,
            x.HeaderMarkdown,
            x.DescriptionMarkdown,
            x.BenefitsMarkdown,
            Questions = ApplicationQuestions.FromJson(x.QuestionsJson),
            x.ArchivedAt,
            x.UpdatedAt,
            UpdatedByName = x.UpdatedBy is null
                ? null
                : people.GetValueOrDefault(x.UpdatedBy, x.UpdatedBy),
            UsedBy = usedBy,
        };

    private static async Task<IResult> SaveTemplateVersionAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        PostingTemplate? current,
        SavePostingTemplateRequest request,
        CancellationToken ct
    )
    {
        var name = request.Name?.Trim() ?? "";
        var errors = new Dictionary<string, string[]>();
        if (name.Length is 0 or > 160)
            errors["name"] = ["Give the template a name, up to 160 characters."];
        if (string.IsNullOrWhiteSpace(request.DescriptionMarkdown))
            errors["descriptionMarkdown"] = ["Write a starting role description."];
        foreach (
            var (key, markdown) in new[]
            {
                ("headerMarkdown", request.HeaderMarkdown),
                ("descriptionMarkdown", request.DescriptionMarkdown),
                ("benefitsMarkdown", request.BenefitsMarkdown),
            }
        )
            if (!errors.ContainsKey(key) && MediaEndpoints.HasImageWithoutAlt(markdown))
                errors[key] = [MediaEndpoints.AltRequired];
        var (questions, questionErrors) = ApplicationQuestions.Normalize(request.Questions);
        foreach (var (key, value) in questionErrors)
            errors[key] = value;
        // A new template can't take a name in use; renaming can't take another template's name.
        if (
            name.Length > 0
            && name != current?.Name
            && await db.PostingTemplates.AnyAsync(x => x.Name == name, ct)
        )
            errors["name"] = ["Another template already has this name."];
        if (errors.Count > 0)
            return Results.ValidationProblem(errors);

        var versions = current is null
            ? []
            : await db.PostingTemplates.Where(x => x.Name == current.Name).ToListAsync(ct);
        foreach (var version in versions)
        {
            version.IsActive = false;
            version.Name = name;
        }
        var template = new PostingTemplate
        {
            Name = name,
            Version = versions.Count == 0 ? 1 : versions.Max(x => x.Version) + 1,
            HeaderMarkdown = request.HeaderMarkdown?.Trim() ?? "",
            DescriptionMarkdown = request.DescriptionMarkdown!.Trim(),
            BenefitsMarkdown = request.BenefitsMarkdown?.Trim() ?? "",
            QuestionsJson = ApplicationQuestions.ToJson(questions),
            ArchivedAt = current?.ArchivedAt,
            UpdatedBy = principal.Email(),
        };
        db.PostingTemplates.Add(template);
        Audit.Add(
            db,
            principal,
            "PostingTemplate",
            template.Id,
            current is null ? "Created" : "Updated",
            new { template.Name, template.Version }
        );
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { template.Id, template.Version });
    }

    private static async Task<IResult> ArchiveTemplateAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid id,
        bool archive,
        CancellationToken ct
    )
    {
        var template = await db.PostingTemplates.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (template is null)
            return Results.NotFound();
        var at = archive ? DateTimeOffset.UtcNow : (DateTimeOffset?)null;
        foreach (
            var version in await db
                .PostingTemplates.Where(x => x.Name == template.Name)
                .ToListAsync(ct)
        )
            version.ArchivedAt = at;
        Audit.Add(
            db,
            principal,
            "PostingTemplate",
            id,
            archive ? "Archived" : "Restored",
            new { template.Name }
        );
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
