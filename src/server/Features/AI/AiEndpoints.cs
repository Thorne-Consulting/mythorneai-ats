using System.Security.Claims;
using System.Text.Json;
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
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
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

        api.MapPost("/ai/search-filters", async (
            NaturalLanguageSearchRequest request,
            ClaimsPrincipal principal,
            AtsDbContext db,
            IAiAssistant assistant,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Query))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["query"] = ["A search request is required."] });
            var jobContext = "";
            if (request.RequisitionId is not null)
            {
                var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                if (requisition is null || !CanManage(requisition, principal))
                    return Results.NotFound();
                jobContext = $"Job title: {requisition.Title}\nJob requirements: {requisition.Description}";
            }
            try
            {
                var result = await assistant.CompleteAsync(
                    "Turn the recruiter request into JSON only. Use exactly these keys: q, skills, skillMode, title, location, minYears. skills is an array of short strings, skillMode is any or all, minYears is a number or null. Do not rank candidates or make hiring decisions.",
                    $"{jobContext}\nRecruiter request: {request.Query}",
                    ct);
                using var json = JsonDocument.Parse(result);
                return Results.Ok(new
                {
                    q = StringValue(json.RootElement, "q"),
                    skills = ArrayValue(json.RootElement, "skills"),
                    skillMode = StringValue(json.RootElement, "skillMode") is "all" ? "all" : "any",
                    title = StringValue(json.RootElement, "title"),
                    location = StringValue(json.RootElement, "location"),
                    minYears = NumberValue(json.RootElement, "minYears"),
                });
            }
            catch (JsonException)
            {
                return Results.Problem("The search assistant returned an invalid filter set.", statusCode: StatusCodes.Status502BadGateway);
            }
            catch (InvalidOperationException exception) when (exception.Message.Contains("not configured"))
            {
                return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost("/ai/summarize-interview", async (
            SummarizeInterviewRequest request,
            ClaimsPrincipal principal,
            AtsDbContext db,
            IAiAssistant assistant,
            CancellationToken ct) =>
        {
            var interview = await db.Interviews
                .Include(x => x.Application)
                    .ThenInclude(x => x!.Requisition)
                .Include(x => x.Scorecards)
                .SingleOrDefaultAsync(x => x.Id == request.InterviewId, ct);
            if (interview?.Application?.Requisition is null || !CanManage(interview.Application.Requisition, principal))
                return Results.NotFound();
            var notes = interview.MeetingNotes ?? "No meeting notes were provided.";
            var scorecards = interview.Scorecards.Count == 0
                ? "No scorecards were submitted."
                : string.Join("\n", interview.Scorecards.Select(scorecard =>
                    $"{scorecard.InterviewerEmail}: rating {scorecard.Rating}/5, recommendation {scorecard.Recommendation}. Evidence: {scorecard.Evidence}"));
            try
            {
                var summary = await assistant.CompleteAsync(
                    "Summarize interview evidence for a recruiter. Be factual, concise, and separate evidence from uncertainty. Do not make a hiring decision. Return plain text with headings: Summary, Evidence, Open questions.",
                    $"Role: {interview.Application.Requisition.Title}\nMeeting notes:\n{notes}\nScorecards:\n{scorecards}",
                    ct);
                return Results.Ok(new { summary });
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

    private static string? StringValue(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

    private static string[] ArrayValue(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String)
                .Select(item => item.GetString()!.Trim())
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase).Take(20).ToArray()
            : [];

    private static decimal? NumberValue(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number
            && value.TryGetDecimal(out var number) ? Math.Clamp(number, 0, 50) : null;
}
