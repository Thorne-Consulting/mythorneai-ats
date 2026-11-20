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
                var found = await assistant.CompleteAsync<SearchFilters>(
                    "Turn the recruiter request into search filters. skills are short strings, skillMode is any or all, minYears is a number or null, seniority is one of Intern, Junior, Mid, Senior, Lead, Manager, Director, Executive or null, minDegree is one of HighSchool, Associate, Bachelor, Master, Doctorate or null, company and school are strings or null. q is only for words that fit no other field. Leave a field null or empty when the request doesn't say. Do not rank candidates or make hiring decisions.",
                    $"{jobContext}\nRecruiter request: {request.Query}",
                    ct,
                    new AiContext("search-filters", principal.Email(), "Requisition", request.RequisitionId?.ToString()));
                return Results.Ok(new
                {
                    q = Clean(found.Q),
                    skills = (found.Skills ?? []).Select(x => x.Trim()).Where(x => x.Length > 0)
                        .Distinct(StringComparer.OrdinalIgnoreCase).Take(20).ToArray(),
                    skillMode = Clean(found.SkillMode) is "all" ? "all" : "any",
                    title = Clean(found.Title),
                    location = Clean(found.Location),
                    minYears = found.MinYears is { } years ? Math.Clamp(years, 0, 50) : (decimal?)null,
                    seniority = Clean(found.Seniority),
                    minDegree = Clean(found.MinDegree),
                    company = Clean(found.Company),
                    school = Clean(found.School),
                });
            }
            catch (JsonException)
            {
                return Results.Problem("The search assistant returned an invalid filter set.", statusCode: StatusCodes.Status502BadGateway);
            }
            catch (HttpRequestException)
            {
                return Results.Problem("The AI service didn't respond. Try again in a moment.", statusCode: StatusCodes.Status502BadGateway);
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
            // Blind review: someone who still owes a scorecard here does not get the panel's feedback this way either.
            if ((await AtsEndpoints.BlindingInterviewsAsync(db, interview.ApplicationId, principal.Email(), ct)).Length > 0)
                return Results.Conflict(new { message = "Submit your own scorecard first." });
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

    private static string? Clean(string? value) => value?.Trim();
}

/// <summary>What the model fills in for a natural-language candidate search.</summary>
public sealed record SearchFilters(
    string? Q,
    string[]? Skills,
    string? SkillMode,
    string? Title,
    string? Location,
    decimal? MinYears,
    string? Seniority,
    string? MinDegree,
    string? Company,
    string? School
);
