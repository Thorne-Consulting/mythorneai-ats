using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record InterviewQuestionsRequest(Guid ApplicationId, Guid? InterviewKitId);

public static partial class AtsEndpoints
{
    private static void MapCopilot(RouteGroupBuilder api)
    {
        // Open to assigned interviewers too: ScopeApplications only shows them their own candidates.
        api.MapPost(
            "/ai/interview-questions",
            async (
                InterviewQuestionsRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                IAiAssistant ai,
                CancellationToken ct
            ) =>
            {
                var application = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Include(x => x.Candidate)
                    .Include(x => x.Requisition)
                        .ThenInclude(x => x!.InterviewKits)
                            .ThenInclude(x => x.Criteria)
                    .SingleOrDefaultAsync(x => x.Id == request.ApplicationId, ct);
                if (application?.Requisition is null)
                    return Results.NotFound();
                var kit = request.InterviewKitId is null
                    ? null
                    : application.Requisition.InterviewKits.SingleOrDefault(x => x.Id == request.InterviewKitId);
                var criteria = kit is null
                    ? "None given."
                    : string.Join("\n", kit.Criteria.OrderBy(c => c.SortOrder).Select(c => $"- {c.Name}: {c.Question}"));
                var candidate = application.Candidate!;
                var requirements = JobRequirements.Parse(application.Requisition.RequirementsJson);
                return await AiCallAsync(async () =>
                {
                    var output = await ai.CompleteAsync(
                        "You help an interviewer prepare. Suggest specific interview questions tailored to this candidate's resume and the role. Respond with JSON only: {\"questions\": [{\"criterion\": string (exactly one of the kit criterion names given, or 'General' only if none fits), \"question\": string, \"why\": string (one sentence tying it to the resume or the role)}]}. Give 5 to 8 questions and cover every kit criterion at least once. Probe gaps and verify claims the resume actually makes; don't just restate the resume. If no resume text is given, write questions from the role and the kit criteria alone and say nothing about the candidate's history, gaps or past employers. Do not make a hiring decision.",
                        $"Role: {application.Requisition.Title}\nRequired: {string.Join("; ", requirements.Required)}\nPreferred: {string.Join("; ", requirements.Preferred)}\nKit criteria:\n{criteria}\n\nCandidate title: {candidate.CurrentTitle}\nSkills: {string.Join(", ", candidate.ResumeSkills)}\nExperience: {candidate.ResumeYearsExperience} years\nSummary: {candidate.ResumeSummary}\nResume:\n{(string.IsNullOrWhiteSpace(candidate.ResumeText) ? "No resume text is on file." : candidate.ResumeText[..Math.Min(candidate.ResumeText.Length, 8000)])}",
                        ct,
                        new AiContext("interview-questions", principal.Email(), "Application", application.Id.ToString()),
                        json: true
                    );
                    using var document = JsonDocument.Parse(output);
                    var questions = document.RootElement.TryGetProperty("questions", out var list) && list.ValueKind == JsonValueKind.Array
                        ? list.EnumerateArray().Select(x => new
                        {
                            criterion = x.TryGetProperty("criterion", out var c) ? c.GetString() ?? "General" : "General",
                            question = x.TryGetProperty("question", out var q) ? q.GetString() ?? "" : "",
                            why = x.TryGetProperty("why", out var w) ? w.GetString() ?? "" : "",
                        }).Where(x => x.question.Length > 0).Take(10).ToArray()
                        : [];
                    return Results.Ok(new { questions });
                });
            }
        );

        api.MapPost(
                "/interview-recordings/{id:guid}/transcribe",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var recording = await db
                        .InterviewRecordings.Include(x => x.Interview)
                            .ThenInclude(x => x!.Application)
                                .ThenInclude(x => x!.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (recording?.Interview?.Application?.Requisition is null || !CanManage(recording.Interview.Application.Requisition, principal))
                        return Results.NotFound();
                    if (recording.Length > 25 * 1024 * 1024)
                        return Results.Conflict(new { message = "This recording is over 25 MB, which is the most the transcription service accepts." });
                    return await AiCallAsync(async () =>
                    {
                        await using var stream = files.OpenRead(recording.StoredFileName);
                        recording.Transcript = await ai.TranscribeAsync(
                            stream,
                            recording.OriginalFileName,
                            ct,
                            new AiContext("transcribe-recording", principal.Email(), "InterviewRecording", id.ToString())
                        );
                        Audit.Add(db, principal, "Application", recording.Interview.ApplicationId, "RecordingTranscribed", new { recording.Id });
                        await db.SaveChangesAsync(ct);
                        return Results.Ok(new { recording.Transcript });
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/candidates/{id:guid}/resume-profile/ai",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, IAiAssistant ai, CancellationToken ct) =>
                {
                    var candidate = await db.Candidates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    if (string.IsNullOrWhiteSpace(candidate.ResumeText))
                        return Results.Conflict(new { message = "There is no resume text to read yet." });
                    return await AiCallAsync(async () =>
                    {
                        var output = await ai.CompleteAsync(
                            "Read the resume and extract a profile. Respond with JSON only, with exactly these keys: currentTitle (string), summary (two or three sentences, plain), skills (array of short lowercase skill names), jobTitles (array of titles held), education (array of short strings), certifications (array), languages (array), yearsExperience (number of years of professional experience, or null). Only include what the resume supports.",
                            candidate.ResumeText[..Math.Min(candidate.ResumeText.Length, 14000)],
                            ct,
                            new AiContext("resume-profile", principal.Email(), "Candidate", id.ToString()),
                            json: true
                        );
                        using var document = JsonDocument.Parse(output);
                        var root = document.RootElement;
                        string? Text(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()?.Trim() : null;
                        string[] List(string name, int max) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Array
                            ? v.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!.Trim()).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).Take(max).ToArray()
                            : [];
                        return Results.Ok(new
                        {
                            currentTitle = Text("currentTitle"),
                            summary = Text("summary"),
                            skills = List("skills", 40),
                            jobTitles = List("jobTitles", 20),
                            education = List("education", 20),
                            certifications = List("certifications", 20),
                            languages = List("languages", 20),
                            yearsExperience = root.TryGetProperty("yearsExperience", out var years) && years.ValueKind == JsonValueKind.Number ? Math.Clamp(years.GetDecimal(), 0, 60) : (decimal?)null,
                        });
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }
}
