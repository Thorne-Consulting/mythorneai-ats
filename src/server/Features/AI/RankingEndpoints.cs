using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record JobRequirements(
    string[] Required,
    string[] Preferred,
    decimal? MinYears,
    string Location
)
{
    public bool IsEmpty => Required.Length == 0 && Preferred.Length == 0;

    public static JobRequirements Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new([], [], null, "");
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            return Normalize(
                List(root, "required"),
                List(root, "preferred"),
                root.TryGetProperty("minYears", out var years) && years.ValueKind == JsonValueKind.Number
                    ? years.GetDecimal()
                    : null,
                root.TryGetProperty("location", out var place) ? place.GetString() : null
            );
        }
        catch (JsonException)
        {
            return new([], [], null, "");
        }
    }

    public static JobRequirements Normalize(
        IEnumerable<string>? required,
        IEnumerable<string>? preferred,
        decimal? minYears,
        string? location
    )
    {
        static string[] Clean(IEnumerable<string>? values) =>
            (values ?? [])
                .Select(x => x.Trim())
                .Where(x => x.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Take(30)
                .ToArray();
        var requiredList = Clean(required);
        return new(
            requiredList,
            Clean(preferred).Except(requiredList, StringComparer.OrdinalIgnoreCase).ToArray(),
            minYears is >= 0 and <= 60 ? minYears : null,
            location?.Trim() ?? ""
        );
    }

    public string ToJson() =>
        JsonSerializer.Serialize(
            new
            {
                required = Required,
                preferred = Preferred,
                minYears = MinYears,
                location = Location,
            }
        );

    private static string[] List(JsonElement root, string name) =>
        root.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array
            ? value.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray()
            : [];
}

public sealed record SaveRequirementsRequest(
    string[]? Required,
    string[]? Preferred,
    decimal? MinYears,
    string? Location
);

public sealed record RankRequest(
    Guid? RequisitionId,
    string? Query,
    decimal? MinYears,
    string? Location,
    bool IncludeDismissed = false,
    int Page = 1,
    int PageSize = 25
);

public sealed record DismissRequest(Guid CandidateId, string Reason);

public static partial class AtsEndpoints
{
    private static void MapRanking(RouteGroupBuilder api)
    {
        api.MapPost(
                "/requisitions/{id:guid}/requirements/extract",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    return await AiCallAsync(async () =>
                    {
                        var output = await ai.CompleteAsync(
                            "Read the job description and list what the role needs. Respond with JSON only, with exactly these keys: required (array of short requirement strings that are clearly must-haves), preferred (array of nice-to-haves), minYears (number of years of experience stated as a minimum, or null), location (a short location or work-mode rule, or empty string). Keep each requirement under 12 words and do not invent requirements the text doesn't state.",
                            $"Job title: {requisition.Title}\nLocation: {requisition.Location} ({requisition.WorkMode})\n\n{requisition.Description}",
                            ct,
                            new AiContext("extract-requirements", principal.Email(), "Requisition", id.ToString()),
                            json: true
                        );
                        var parsed = JobRequirements.Parse(output);
                        return Results.Ok(new { parsed.Required, parsed.Preferred, parsed.MinYears, parsed.Location });
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/requisitions/{id:guid}/requirements",
                async (
                    Guid id,
                    SaveRequirementsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var requirements = JobRequirements.Normalize(
                        request.Required,
                        request.Preferred,
                        request.MinYears,
                        request.Location
                    );
                    requisition.RequirementsJson = requirements.IsEmpty && requirements.MinYears is null
                        ? ""
                        : requirements.ToJson();
                    requisition.RequirementsEmbedding = null;
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Requisition", id, "RequirementsConfirmed");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/talent/rank",
                async (
                    RankRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var query = request.Query?.Trim() ?? "";
                    if (request.RequisitionId is null && query.Length == 0)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["query"] = ["Pick a job or describe who you're looking for."] }
                        );
                    Requisition? requisition = null;
                    if (request.RequisitionId is not null)
                    {
                        requisition = await db
                            .Requisitions.AsNoTracking()
                            .SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                        if (requisition is null || !CanManage(requisition, principal))
                            return Results.NotFound();
                    }
                    var requirements = JobRequirements.Parse(requisition?.RequirementsJson);
                    var minYears = request.MinYears ?? requirements.MinYears;
                    var location = request.Location?.Trim() ?? "";

                    // ponytail: scores everything in memory, fine into the low thousands of candidates;
                    // move to a vector index when the pool outgrows that.
                    var pool = db.Candidates.AsNoTracking().Where(x => !x.DoNotContact);
                    if (minYears is not null)
                        pool = pool.Where(x => x.ResumeYearsExperience == null || x.ResumeYearsExperience >= minYears);
                    if (location.Length > 0)
                        pool = pool.Where(x => x.Location != null && EF.Functions.ILike(x.Location, $"%{location}%"));
                    var rows = await pool
                        .Take(3000)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                            x.Location,
                            x.CurrentTitle,
                            x.Tags,
                            x.ResumeSkills,
                            x.ResumeYearsExperience,
                            x.ResumeText,
                            x.ResumeEmbedding,
                        })
                        .ToListAsync(ct);

                    var dismissed = requisition is null
                        ? new HashSet<Guid>()
                        : (await db.CandidateDismissals.AsNoTracking().Where(x => x.RequisitionId == requisition.Id).Select(x => x.CandidateId).ToListAsync(ct)).ToHashSet();
                    var applied = requisition is null
                        ? new HashSet<Guid>()
                        : (await db.Applications.AsNoTracking().Where(x => x.RequisitionId == requisition.Id && x.Status != ApplicationStatus.PendingVerification).Select(x => x.CandidateId).ToListAsync(ct)).ToHashSet();
                    var fits = requisition is null
                        ? new Dictionary<Guid, int>()
                        : await db.JobFits.AsNoTracking().Where(x => x.RequisitionId == requisition.Id).ToDictionaryAsync(x => x.CandidateId, x => x.Score, ct);

                    float[]? target = null;
                    var semanticNote = (string?)null;
                    if (ai.IsConfigured)
                    {
                        try
                        {
                            var vectors = new List<float[]>();
                            if (query.Length > 0)
                                vectors.Add(await ai.EmbedAsync(query, ct, new AiContext("embed-query", principal.Email())));
                            if (requisition?.RequirementsEmbedding is not null)
                                vectors.Add(requisition.RequirementsEmbedding);
                            if (vectors.Count > 0)
                                target = vectors[0].Select((_, i) => vectors.Average(v => v[i])).ToArray();
                        }
                        catch (Exception exception) when (exception is HttpRequestException or AiUnavailableException)
                        {
                            semanticNote = "Meaning-based matching is unavailable right now; showing keyword matches only.";
                        }
                    }
                    else
                        semanticNote = "AI isn't configured, so this is keyword matching only.";
                    if (target is null && semanticNote is null)
                        semanticNote = requisition is not null && requirements.IsEmpty
                            ? "Confirm this job's requirements to get better matches."
                            : "This job's requirements are still being indexed. Try again in a minute.";

                    var terms = requirements.Required.Select(x => (Text: x, Weight: 2))
                        .Concat(requirements.Preferred.Select(x => (Text: x, Weight: 1)))
                        .Concat(SearchTerms(query).Select(x => (Text: x, Weight: 2)))
                        .ToList();
                    var scored = rows
                        .Select(row =>
                        {
                            var skills = row.Tags.Concat(row.ResumeSkills).ToArray();
                            var haystack = $"{row.CurrentTitle} {row.ResumeText}";
                            var matched = new List<string>();
                            var missing = new List<string>();
                            foreach (var term in terms)
                            {
                                var hit = skills.Any(skill => skill.Contains(term.Text, StringComparison.OrdinalIgnoreCase)
                                        || (skill.Length >= 3 && term.Text.Contains(skill, StringComparison.OrdinalIgnoreCase)))
                                    || MentionsMostWords(term.Text, haystack, skills);
                                (hit ? matched : missing).Add(term.Text);
                            }
                            var possible = terms.Sum(x => x.Weight);
                            int? keyword = possible == 0
                                ? null
                                : (int)Math.Round(100.0 * terms.Where(x => matched.Contains(x.Text)).Sum(x => x.Weight) / possible);
                            int? semantic = target is null || row.ResumeEmbedding is null
                                ? null
                                : Similarity.ToPercent(Similarity.Cosine(target, row.ResumeEmbedding));
                            var score = (keyword, semantic) switch
                            {
                                (int k, int s) => (int)Math.Round(0.4 * k + 0.6 * s),
                                // Without a readable resume there is no semantic evidence, so keywords alone can't outrank one that has it.
                                (int k, null) => target is null ? k : (int)Math.Round(0.4 * k),
                                (null, int s) => s,
                                _ => 0,
                            };
                            return new
                            {
                                CandidateId = row.Id,
                                row.Name,
                                row.Email,
                                row.Location,
                                row.CurrentTitle,
                                Skills = skills.Distinct(StringComparer.OrdinalIgnoreCase).Take(8).ToArray(),
                                ExperienceYears = row.ResumeYearsExperience,
                                Score = score,
                                KeywordScore = keyword,
                                SemanticScore = semantic,
                                Matched = matched.Take(12).ToArray(),
                                Missing = missing.Take(8).ToArray(),
                                Dismissed = dismissed.Contains(row.Id),
                                AppliedToJob = applied.Contains(row.Id),
                                FitScore = fits.TryGetValue(row.Id, out var fit) ? (int?)fit : null,
                                HasEmbedding = row.ResumeEmbedding is not null,
                            };
                        })
                        .Where(x => request.IncludeDismissed || !x.Dismissed)
                        .OrderByDescending(x => x.Score)
                        .ThenBy(x => x.Name)
                        .ToList();
                    var page = Math.Max(request.Page, 1);
                    var pageSize = Math.Clamp(request.PageSize, 10, 100);
                    return Results.Ok(
                        new
                        {
                            Items = scored.Skip((page - 1) * pageSize).Take(pageSize).ToList(),
                            Total = scored.Count,
                            Page = page,
                            PageSize = pageSize,
                            Semantic = target is not null,
                            Note = semanticNote,
                            Pending = rows.Count(x => x.ResumeText != null && x.ResumeEmbedding is null),
                            Dismissed = dismissed.Count,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/requisitions/{id:guid}/fit/{candidateId:guid}",
                async (
                    Guid id,
                    Guid candidateId,
                    bool? refresh,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var candidate = await db.Candidates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == candidateId, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var requirements = JobRequirements.Parse(requisition.RequirementsJson);
                    if (requirements.IsEmpty)
                        return Results.Conflict(new { message = "Confirm this job's requirements first. The assessment is made against them." });
                    if (string.IsNullOrWhiteSpace(candidate.ResumeText))
                        return Results.Conflict(new { message = "This candidate has no parsed resume to assess." });
                    var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(candidate.ResumeText + "\n" + requisition.RequirementsJson + "\n" + requisition.Title)));
                    var cached = await db.JobFits.SingleOrDefaultAsync(x => x.RequisitionId == id && x.CandidateId == candidateId, ct);
                    if (cached is not null && cached.InputHash == hash && refresh != true)
                        return Results.Ok(FitResponse(cached, true));
                    return await AiCallAsync(async () =>
                    {
                        var output = await ai.CompleteAsync(
                            "You assess how well a resume evidences each job requirement. Respond with JSON only: {\"summary\": string (two or three plain sentences), \"requirements\": [{\"requirement\": string, \"kind\": \"required\" or \"preferred\", \"status\": \"met\" or \"partial\" or \"missing\" or \"unknown\", \"evidence\": string}], \"concerns\": [string]}. Include every listed requirement exactly once, using the given wording. evidence is a short quote or close paraphrase from the resume, or an empty string. Use unknown when the resume doesn't say either way and never guess. Judge only evidence of skills and experience; ignore name, gender, age, nationality and other personal attributes. Do not make a hiring decision.",
                            $"Job: {requisition.Title}\nRequired:\n- {string.Join("\n- ", requirements.Required)}\nPreferred:\n- {string.Join("\n- ", requirements.Preferred)}\nMinimum years: {requirements.MinYears?.ToString() ?? "none stated"}\nLocation rule: {(requirements.Location.Length == 0 ? "none" : requirements.Location)}\n\nResume:\n{candidate.ResumeText[..Math.Min(candidate.ResumeText.Length, 12000)]}",
                            ct,
                            new AiContext("job-fit", principal.Email(), "Candidate", candidateId.ToString()),
                            json: true
                        );
                        var result = ShapeFit(output, requirements);
                        if (cached is null)
                        {
                            cached = new JobFit { RequisitionId = id, CandidateId = candidateId, ResultJson = result.Json, Score = result.Score, InputHash = hash };
                            db.JobFits.Add(cached);
                        }
                        else
                        {
                            cached.ResultJson = result.Json;
                            cached.Score = result.Score;
                            cached.InputHash = hash;
                            cached.CreatedAt = DateTimeOffset.UtcNow;
                        }
                        await db.SaveChangesAsync(ct);
                        return Results.Ok(FitResponse(cached, false));
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/requisitions/{id:guid}/dismissals",
                async (
                    Guid id,
                    DismissRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (string.IsNullOrWhiteSpace(request.Reason))
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["reason"] = ["Say why this candidate isn't a fit."] });
                    if (!await db.Candidates.AnyAsync(x => x.Id == request.CandidateId, ct))
                        return Results.NotFound();
                    var existing = await db.CandidateDismissals.SingleOrDefaultAsync(x => x.RequisitionId == id && x.CandidateId == request.CandidateId, ct);
                    if (existing is null)
                        db.CandidateDismissals.Add(new CandidateDismissal { RequisitionId = id, CandidateId = request.CandidateId, Reason = request.Reason.Trim(), DismissedBy = principal.Email() });
                    else
                        existing.Reason = request.Reason.Trim();
                    Audit.Add(db, principal, "Requisition", id, "CandidateDismissed", new { request.CandidateId, request.Reason });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapDelete(
                "/requisitions/{id:guid}/dismissals/{candidateId:guid}",
                async (Guid id, Guid candidateId, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    await db.CandidateDismissals.Where(x => x.RequisitionId == id && x.CandidateId == candidateId).ExecuteDeleteAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
                "/requisitions/{id:guid}/suggested-candidates",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var requisition = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.RequirementsEmbedding is null)
                        return Results.Ok(new { Items = Array.Empty<object>(), Reason = "Confirm this job's requirements to see past candidates who fit." });
                    var dismissed = await db.CandidateDismissals.Where(x => x.RequisitionId == id).Select(x => x.CandidateId).ToListAsync(ct);
                    var rows = await db
                        .Candidates.AsNoTracking()
                        .Where(x =>
                            !x.DoNotContact
                            && x.ResumeEmbedding != null
                            && !dismissed.Contains(x.Id)
                            && !x.Applications.Any(a => a.RequisitionId == id)
                            && x.Applications.Any()
                        )
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.CurrentTitle,
                            x.ResumeEmbedding,
                            Last = x.Applications.OrderByDescending(a => a.LastActivityAt).Select(a => new { Job = a.Requisition!.Title, Status = a.Status.ToString(), Stage = a.PipelineStage!.Name }).First(),
                        })
                        .Take(3000)
                        .ToListAsync(ct);
                    var items = rows
                        .Select(x => new { x.Id, x.Name, x.CurrentTitle, Score = Similarity.ToPercent(Similarity.Cosine(requisition.RequirementsEmbedding, x.ResumeEmbedding!)), PreviousJob = x.Last.Job, PreviousStatus = x.Last.Status, PreviousStage = x.Last.Stage })
                        .Where(x => x.Score >= 40)
                        .OrderByDescending(x => x.Score)
                        .Take(8)
                        .ToArray();
                    return Results.Ok(new { Items = items, Reason = (string?)null });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
                "/admin/ai/status",
                async (IAiAssistant ai, IConfiguration configuration, AtsDbContext db, CancellationToken ct) =>
                {
                    var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(ct);
                    var since = DateTimeOffset.UtcNow.AddDays(-30);
                    var recent = await db.AiCallLogs.AsNoTracking().Where(x => x.CreatedAt >= since).ToListAsync(ct);
                    return Results.Ok(
                        new
                        {
                            Configured = ai.IsConfigured,
                            Enabled = organization?.AiEnabled ?? true,
                            Model = string.IsNullOrWhiteSpace(organization?.AiModel) ? configuration["OpenAI:Model"] ?? "gpt-4o-mini" : organization.AiModel,
                            EmbeddingModel = configuration["OpenAI:EmbeddingModel"] ?? "text-embedding-3-small",
                            PendingResumes = await db.Candidates.CountAsync(x => x.ResumeText != null && (x.ResumeEmbeddingAt == null || x.ResumeEmbeddingAt < x.UpdatedAt), ct),
                            Calls30Days = recent.Count,
                            Failed30Days = recent.Count(x => x.Error != null),
                            PromptTokens30Days = recent.Sum(x => (long)x.PromptTokens),
                            CompletionTokens30Days = recent.Sum(x => (long)x.CompletionTokens),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/admin/ai/log",
                async (int? page, string? purpose, AtsDbContext db, CancellationToken ct) =>
                {
                    var query = db.AiCallLogs.AsNoTracking().AsQueryable();
                    if (!string.IsNullOrWhiteSpace(purpose))
                        query = query.Where(x => x.Purpose == purpose);
                    var current = Math.Max(page ?? 1, 1);
                    var items = await query
                        .OrderByDescending(x => x.Id)
                        .Skip((current - 1) * 50)
                        .Take(50)
                        .Select(x => new
                        {
                            x.Id, x.Purpose, x.Model, x.UserEmail, x.SubjectType, x.SubjectId,
                            Input = x.Input.Substring(0, Math.Min(x.Input.Length, 600)),
                            Output = x.Output.Substring(0, Math.Min(x.Output.Length, 600)),
                            x.PromptTokens, x.CompletionTokens, x.LatencyMs, x.Error, x.CreatedAt,
                        })
                        .ToListAsync(ct);
                    return Results.Ok(new { Items = items, Total = await query.CountAsync(ct), Page = current });
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    private static readonly HashSet<string> FillerWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "and", "the", "for", "with", "that", "this", "from", "into", "have", "has", "experience", "experienced", "years",
        "year", "ability", "able", "strong", "good", "knowledge", "working", "work", "proven", "track", "record", "using",
    };

    // Requirements are phrases ("Built production web applications"), so a whole-phrase match would almost never
    // hit. A phrase counts as mentioned when most of its meaningful words appear in the skills or resume text.
    private static bool MentionsMostWords(string phrase, string haystack, string[] skills)
    {
        var words = Regex.Split(phrase.ToLowerInvariant(), @"[^a-z0-9#+.]+")
            .Select(w => w.TrimEnd('.'))
            .Where(w => w.Length >= 2 && !FillerWords.Contains(w))
            .Select(w => w.Length > 4 && w.EndsWith('s') ? w[..^1] : w)
            .Distinct()
            .ToArray();
        if (words.Length == 0)
            return false;
        var text = (haystack + " " + string.Join(' ', skills)).ToLowerInvariant();
        return words.Count(w => text.Contains(w)) >= Math.Ceiling(words.Length * 0.6);
    }

    // Runs an AI call and turns "AI isn't available" and provider failures into plain problem responses.
    private static async Task<IResult> AiCallAsync(Func<Task<IResult>> call)
    {
        try
        {
            return await call();
        }
        catch (AiUnavailableException exception)
        {
            return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        catch (JsonException)
        {
            return Results.Problem("The AI assistant returned something unreadable. Try again.", statusCode: StatusCodes.Status502BadGateway);
        }
        catch (HttpRequestException)
        {
            return Results.Problem("The AI service didn't respond. Try again in a moment.", statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static (string Json, int Score) ShapeFit(string output, JobRequirements requirements)
    {
        using var document = JsonDocument.Parse(output);
        var root = document.RootElement;
        var byRequirement = new Dictionary<string, (string Status, string Evidence)>(StringComparer.OrdinalIgnoreCase);
        if (root.TryGetProperty("requirements", out var list) && list.ValueKind == JsonValueKind.Array)
            foreach (var item in list.EnumerateArray())
            {
                var name = item.TryGetProperty("requirement", out var n) ? n.GetString() : null;
                if (name is null)
                    continue;
                var status = item.TryGetProperty("status", out var s) ? s.GetString()?.ToLowerInvariant() : null;
                byRequirement[name.Trim()] = (
                    status is "met" or "partial" or "missing" ? status : "unknown",
                    item.TryGetProperty("evidence", out var e) ? e.GetString() ?? "" : ""
                );
            }
        var rows = requirements
            .Required.Select(x => (Text: x, Kind: "required", Weight: 2.0))
            .Concat(requirements.Preferred.Select(x => (Text: x, Kind: "preferred", Weight: 1.0)))
            .Select(x =>
            {
                var found = byRequirement.GetValueOrDefault(x.Text, ("unknown", ""));
                return new { x.Text, x.Kind, x.Weight, found.Item1, found.Item2 };
            })
            .ToList();
        var total = rows.Sum(x => x.Weight);
        var earned = rows.Sum(x => x.Weight * (x.Item1 == "met" ? 1.0 : x.Item1 == "partial" ? 0.5 : 0));
        var score = total == 0 ? 0 : (int)Math.Round(100 * earned / total);
        var concerns = root.TryGetProperty("concerns", out var c) && c.ValueKind == JsonValueKind.Array
            ? c.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).Take(8).ToArray()
            : [];
        var json = JsonSerializer.Serialize(
            new
            {
                summary = root.TryGetProperty("summary", out var sum) ? sum.GetString() ?? "" : "",
                requirements = rows.Select(x => new { requirement = x.Text, kind = x.Kind, status = x.Item1, evidence = x.Item2 }),
                concerns,
            }
        );
        return (json, score);
    }

    private static object FitResponse(JobFit fit, bool cached)
    {
        using var document = JsonDocument.Parse(fit.ResultJson);
        return new
        {
            fit.Score,
            Cached = cached,
            fit.CreatedAt,
            Result = document.RootElement.Clone(),
        };
    }
}
