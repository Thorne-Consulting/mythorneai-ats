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
                    $"Purpose: {request.Purpose}\nJob: {application.Requisition.Title}\nCandidate: {application.Candidate!.FirstName}\nNotes: {request.Notes}", ct,
                    new AiContext("draft-message", principal.Email(), "Application", application.Id.ToString()));
                return Results.Ok(new { draft });
            }
            catch (AiUnavailableException exception)
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
                    ct,
                    new AiContext("search-filters", principal.Email(), "Requisition", request.RequisitionId?.ToString()),
                    json: true);
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
            catch (AiUnavailableException exception)
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
                .Include(x => x.InterviewKit)
                    .ThenInclude(x => x!.Criteria)
                .Include(x => x.Scorecards)
                    .ThenInclude(x => x.CriterionRatings)
                        .ThenInclude(x => x.InterviewCriterion)
                .Include(x => x.Recordings)
                .SingleOrDefaultAsync(x => x.Id == request.InterviewId, ct);
            if (interview?.Application?.Requisition is null || !CanManage(interview.Application.Requisition, principal))
                return Results.NotFound();
            var notes = interview.MeetingNotes ?? "No meeting notes were provided.";
            var transcript = string.Join("\n", interview.Recordings.Where(x => !string.IsNullOrWhiteSpace(x.Transcript)).Select(x => x.Transcript));
            var scorecards = interview.Scorecards.Count == 0
                ? "No scorecards were submitted."
                : string.Join("\n", interview.Scorecards.Select(scorecard =>
                    $"{scorecard.InterviewerEmail}: rating {scorecard.Rating}/5, recommendation {scorecard.Recommendation}. Evidence: {scorecard.Evidence}. Per criterion: "
                    + string.Join("; ", scorecard.CriterionRatings.Select(r => $"{r.InterviewCriterion!.Name} {r.Rating}/5 ({r.Evidence})"))));
            var criteria = interview.InterviewKit is null
                ? "No interview kit was used."
                : string.Join("\n", interview.InterviewKit.Criteria.OrderBy(c => c.SortOrder).Select(c => $"- {c.Name} (weight {c.Weight}): {c.Question}"));
            try
            {
                var summary = await assistant.CompleteAsync(
                    "Summarize interview evidence for a recruiter. Be factual, concise, and separate evidence from uncertainty. Do not make a hiring decision. Return plain text with headings: Summary, Evidence by criterion (one line for each kit criterion, naming what was actually said or scored, or 'no evidence'), Open questions.",
                    $"Role: {interview.Application.Requisition.Title}\nKit criteria:\n{criteria}\nMeeting notes:\n{notes}\nTranscript:\n{(transcript.Length == 0 ? "None." : transcript[..Math.Min(transcript.Length, 12000)])}\nScorecards:\n{scorecards}",
                    ct,
                    new AiContext("summarize-interview", principal.Email(), "Interview", interview.Id.ToString()));
                return Results.Ok(new { summary });
            }
            catch (AiUnavailableException exception)
            {
                return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
        }).RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static bool CanManage(Domain.Requisition requisition, ClaimsPrincipal principal) =>
        AtsEndpoints.CanManage(requisition, principal);

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
