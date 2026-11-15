using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapPipelineTemplates(RouteGroupBuilder api)
    {
        api.MapGet(
            "/pipeline-templates",
            async (AtsDbContext db, CancellationToken ct) =>
                Results.Ok(
                    await db
                        .PipelineTemplates.AsNoTracking()
                        .OrderByDescending(x => x.IsDefault)
                        .ThenBy(x => x.Name)
                        .Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.IsDefault,
                            Stages = x
                                .Stages.OrderBy(s => s.SortOrder)
                                .Select(s => new
                                {
                                    s.Id,
                                    s.Name,
                                    Type = s.Type.ToString(),
                                    s.CandidateLabel,
                                    EmailOnEntry = s.EmailOnEntry.ToString(),
                                    s.TargetDays,
                                    s.AssessmentId,
                                }),
                            // Kept for screens that only show the names.
                            StageNames = x.Stages.OrderBy(s => s.SortOrder).Select(s => s.Name),
                            UsedBy = db.Requisitions.Count(r => r.PipelineTemplateId == x.Id),
                        })
                        .ToListAsync(ct)
                )
        );

        api.MapPut(
                "/admin/pipeline-templates/{id:guid}",
                (
                    Guid id,
                    SavePipelineRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) => SavePipelineAsync(db, principal, id, request, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/admin/pipeline-templates",
                (
                    SavePipelineRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) => SavePipelineAsync(db, principal, null, request, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapDelete(
                "/admin/pipeline-templates/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var deleted = await db
                        .PipelineTemplates.Where(x => x.Id == id)
                        .ExecuteDeleteAsync(ct);
                    if (deleted == 0)
                        return Results.NotFound();
                    // Jobs keep their stages; they just no longer point at the pipeline.
                    await db
                        .Requisitions.Where(x => x.PipelineTemplateId == id)
                        .ExecuteUpdateAsync(
                            x => x.SetProperty(r => r.PipelineTemplateId, (Guid?)null),
                            ct
                        );
                    Audit.Add(db, principal, "PipelineTemplate", id, "Deleted");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    private static async Task<IResult> SavePipelineAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid? id,
        SavePipelineRequest request,
        CancellationToken ct
    )
    {
        // Hired is added to every job at the end, so a pipeline never lists it.
        var stages = (request.Stages ?? [])
            .Where(x =>
                x.Type != StageType.Hired
                && !string.Equals(x.Name?.Trim(), "Hired", StringComparison.OrdinalIgnoreCase)
            )
            .ToList();
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > 120)
            return JobProblem("name", "Give the pipeline a name.");
        if (ValidateStages(stages, 12) is { } problem)
            return JobProblem("stages", problem + " Hired is added at the end for you.");
        if (await ValidateStageAssessmentsAsync(db, stages, ct) is { } missing)
            return JobProblem("stages", missing);
        var template = id is null
            ? new PipelineTemplate { Name = name }
            : await db
                .PipelineTemplates.Include(x => x.Stages)
                .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (template is null)
            return Results.NotFound();
        if (await db.PipelineTemplates.AnyAsync(x => x.Name == name && x.Id != template.Id, ct))
            return Results.Conflict(new { message = "A pipeline with that name already exists." });
        template.Name = name;
        template.IsDefault = request.IsDefault;
        template.StageNames = [.. stages.Select(x => x.Name.Trim())];
        db.PipelineTemplateStages.RemoveRange(template.Stages);
        if (id is null)
            db.PipelineTemplates.Add(template);
        db.PipelineTemplateStages.AddRange(
            stages.Select(
                (x, index) =>
                    new PipelineTemplateStage
                    {
                        PipelineTemplateId = template.Id,
                        Name = x.Name.Trim(),
                        SortOrder = index,
                        Type = x.Type,
                        CandidateLabel = x.CandidateLabel?.Trim() is { Length: > 0 } label
                            ? label
                            : StageRules.DefaultLabel(x.Type),
                        EmailOnEntry = x.EmailOnEntry,
                        TargetDays = x.TargetDays,
                        AssessmentId = x.AssessmentId,
                    }
            )
        );
        if (request.IsDefault)
            await db
                .PipelineTemplates.Where(x => x.Id != template.Id)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsDefault, false), ct);
        Audit.Add(
            db,
            principal,
            "PipelineTemplate",
            template.Id,
            id is null ? "Created" : "Updated",
            new { template.Name }
        );
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { template.Id });
    }
}
