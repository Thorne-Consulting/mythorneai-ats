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
    private static void MapPostingTemplates(RouteGroupBuilder api)
    {
        api.MapGet("/posting-templates", async (AtsDbContext db, CancellationToken ct) =>
            Results.Ok(await db.PostingTemplates.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Name)
                .Select(x => new { x.Id, x.Name, x.Version, x.HeaderMarkdown, x.DescriptionMarkdown, x.BenefitsMarkdown, x.ApplicationQuestionsMarkdown, x.InterviewStagesMarkdown }).ToListAsync(ct)));

        api.MapPost("/posting-templates", async (CreatePostingTemplateRequest request, AtsDbContext db, ClaimsPrincipal principal, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.HeaderMarkdown) || string.IsNullOrWhiteSpace(request.DescriptionMarkdown))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["template"] = ["Name, header, and description Markdown are required."] });
            var name = request.Name.Trim();
            var version = (await db.PostingTemplates.Where(x => x.Name == name).MaxAsync(x => (int?)x.Version, ct) ?? 0) + 1;
            var template = new PostingTemplate { Name = name, Version = version, HeaderMarkdown = request.HeaderMarkdown.Trim(), DescriptionMarkdown = request.DescriptionMarkdown.Trim(), BenefitsMarkdown = request.BenefitsMarkdown?.Trim() ?? "", ApplicationQuestionsMarkdown = request.ApplicationQuestionsMarkdown?.Trim() ?? "", InterviewStagesMarkdown = request.InterviewStagesMarkdown?.Trim() ?? "" };
            db.PostingTemplates.Add(template); Audit.Add(db, principal, "PostingTemplate", template.Id, "Created", new { template.Name, template.Version });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/posting-templates/{template.Id}", new { template.Id });
        }).RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
