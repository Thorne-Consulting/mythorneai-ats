using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static class AiEndpoints
{
    public static void MapAiEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/ai/draft-message", async (
            DraftMessageRequest request,
            ClaimsPrincipal principal,
            AtsDbContext db,
            IAiAssistant assistant,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Purpose))
                return Results.ValidationProblem(new Dictionary<string, string[]> {
                    ["purpose"] = ["A message purpose is required."]
                });
            var application = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
                .SingleOrDefaultAsync(x => x.Id == request.ApplicationId, ct);
            if (application?.Requisition is null || !CanManage(application.Requisition, principal))
                return Results.NotFound();
            try
            {
                var draft = await assistant.CompleteAsync(
                    "Draft concise, warm recruiting communication. Never make a hiring decision, invent facts, or mention internal notes. Return only the message body.",
                    $"Purpose: {request.Purpose}\nJob: {application.Requisition.Title}\nCandidate: {application.Candidate!.FirstName}\nNotes: {request.Notes}", ct);
                return Results.Ok(new { draft });
            }
            catch (InvalidOperationException exception) when (exception.Message.Contains("not configured"))
            {
                return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static bool CanManage(Domain.Requisition requisition, ClaimsPrincipal principal) =>
        principal.IsHiringStaff() || (principal.IsInRole(nameof(Domain.UserRole.HiringManager))
            && (requisition.OwnerEmail == principal.Email() || requisition.RecruiterEmail == principal.Email()));
}
