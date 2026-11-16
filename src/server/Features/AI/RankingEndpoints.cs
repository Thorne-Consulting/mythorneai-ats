using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
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
                root.TryGetProperty("minYears", out var years)
                && years.ValueKind == JsonValueKind.Number
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
            ? value
                .EnumerateArray()
                .Where(x => x.ValueKind == JsonValueKind.String)
                .Select(x => x.GetString()!)
                .ToArray()
            : [];
}

public sealed record SaveRequirementsRequest(
    string[]? Required,
    string[]? Preferred,
    decimal? MinYears,
    string? Location
);

/// <summary>Rank for a job or a description. <see cref="Filter"/> is the candidate list's query string; every filter in it applies before ranking.</summary>
public sealed record RankRequest(
    Guid? RequisitionId,
    string? Query,
    decimal? MinYears,
    string? Location,
    bool IncludeDismissed = false,
    int Page = 1,
    int PageSize = 25,
    string? Filter = null
);

public sealed record FitBatchRequest(Guid[]? CandidateIds);

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
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    return await AiCallAsync(async () =>
                    {
                        var output = await ai.CompleteAsync(
                            "Read the job description and list what the role needs. Respond with JSON only, with exactly these keys: required (array of short requirement strings that are clearly must-haves), preferred (array of nice-to-haves), minYears (number of years of experience stated as a minimum, or null), location (a short location or work-mode rule, or empty string). Keep each requirement under 12 words and do not invent requirements the text doesn't state.",
                            $"Job title: {requisition.Title}\nLocation: {requisition.Location} ({requisition.WorkMode})\n\n{requisition.Description}",
                            ct,
                            new AiContext(
                                "extract-requirements",
                                principal.Email(),
                                "Requisition",
                                id.ToString()
                            ),
                            json: true
                        );
                        var parsed = JobRequirements.Parse(output);
                        return Results.Ok(
                            new
                            {
                                parsed.Required,
                                parsed.Preferred,
                                parsed.MinYears,
                                parsed.Location,
                            }
                        );
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
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var requirements = JobRequirements.Normalize(
                        request.Required,
                        request.Preferred,
                        request.MinYears,
                        request.Location
                    );
                    requisition.RequirementsJson =
                        requirements.IsEmpty && requirements.MinYears is null
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
                            new Dictionary<string, string[]>
                            {
                                ["query"] = ["Pick a job or describe who you are looking for."],
                            }
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

                    // Every list filter applies first, in SQL. The job being ranked for is not a filter.
                    var filter = QueryHelpers.ParseQuery(request.Filter ?? "");
                    foreach (
                        var key in new[]
                        {
                            "requisitionId",
                            "stageId",
                            "minRating",
                            "page",
                            "pageSize",
                            "sort",
                        }
                    )
                        filter.Remove(key);
                    if (request.MinYears is { } years)
                        filter["minYears"] = years.ToString(
                            System.Globalization.CultureInfo.InvariantCulture
                        );
                    if (!string.IsNullOrWhiteSpace(request.Location))
                        filter["location"] = request.Location.Trim();
                    var pool = FilterCandidates(new QueryCollection(filter), principal, db).People;
                    // The job's own minimum keeps people whose years we could not read.
                    if (!filter.ContainsKey("minYears") && requirements.MinYears is { } floor)
                        pool = pool.Where(x =>
                            x.ResumeYearsExperience == null || x.ResumeYearsExperience >= floor
                        );
                    var dismissedIds = requisition is null
                        ? db.CandidateDismissals.Where(_ => false).Select(x => x.CandidateId)
                        : db
                            .CandidateDismissals.Where(x => x.RequisitionId == requisition.Id)
                            .Select(x => x.CandidateId);
                    if (!request.IncludeDismissed)
                        pool = pool.Where(x => !dismissedIds.Contains(x.Id));

                    var ranked = await RankAsync(db, ai, principal, requisition, query, pool, ct);
                    var page = Math.Max(request.Page, 1);
                    var pageSize = Math.Clamp(request.PageSize, 10, 100);
                    var rows = ranked.Rows.Skip((page - 1) * pageSize).Take(pageSize).ToList();
                    var ids = rows.Select(x => x.Id).ToList();
                    var people = await db
                        .Candidates.AsNoTracking()
                        .Where(x => ids.Contains(x.Id))
                        .Select(x => new
                        {
                            x.Id,
                            x.Email,
                            x.Location,
                            x.CurrentTitle,
                            x.ResumeSkills,
                            x.ResumeYearsExperience,
                        })
                        .ToDictionaryAsync(x => x.Id, ct);
                    var rid = requisition?.Id;
                    var dismissed = (
                        await dismissedIds.Where(x => ids.Contains(x)).ToListAsync(ct)
                    ).ToHashSet();
                    var applied = rid is null
                        ? []
                        : (
                            await db
                                .Applications.AsNoTracking()
                                .Where(x =>
                                    x.RequisitionId == rid
                                    && ids.Contains(x.CandidateId)
                                    && x.Status != ApplicationStatus.PendingVerification
                                )
                                .Select(x => x.CandidateId)
                                .ToListAsync(ct)
                        ).ToHashSet();
                    var fits = rid is null
                        ? []
                        : await db
                            .JobFits.AsNoTracking()
                            .Where(x => x.RequisitionId == rid && ids.Contains(x.CandidateId))
                            .ToDictionaryAsync(
                                x => x.CandidateId,
                                x => new { x.Score, x.CreatedAt },
                                ct
                            );
                    return Results.Ok(
                        new
                        {
                            Items = rows.Select(row =>
                            {
                                var person = people[row.Id];
                                var fit = fits.GetValueOrDefault(row.Id);
                                return new
                                {
                                    CandidateId = row.Id,
                                    row.Name,
                                    person.Email,
                                    person.Location,
                                    person.CurrentTitle,
                                    Skills = person
                                        .ResumeSkills.Distinct(StringComparer.OrdinalIgnoreCase)
                                        .Take(8)
                                        .ToArray(),
                                    ExperienceYears = person.ResumeYearsExperience,
                                    row.Score,
                                    row.KeywordScore,
                                    row.SemanticScore,
                                    Matched = row.Matched.Take(12).ToArray(),
                                    Missing = row.Missing.Take(8).ToArray(),
                                    Dismissed = dismissed.Contains(row.Id),
                                    AppliedToJob = applied.Contains(row.Id),
                                    FitScore = fit?.Score,
                                    FitAt = fit?.CreatedAt,
                                    row.HasEmbedding,
                                };
                            }),
                            Total = ranked.Rows.Count,
                            Page = page,
                            PageSize = pageSize,
                            ranked.Semantic,
                            ranked.Note,
                            ranked.Pending,
                            Dismissed = await dismissedIds.CountAsync(ct),
                            // The ids in order, so "Check fit for the top 25" and bulk actions need no second call.
                            TopIds = ranked.Rows.Take(50).Select(x => x.Id),
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
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var candidate = await db
                        .Candidates.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == candidateId, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    return await AiCallAsync(async () =>
                    {
                        var (fit, cached, problem) = await CheckFitAsync(
                            db,
                            ai,
                            requisition,
                            candidate,
                            principal.Email(),
                            refresh == true,
                            ct
                        );
                        return problem is not null
                            ? Results.Conflict(new { message = problem })
                            : Results.Ok(FitResponse(fit!, cached));
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // "Check fit for the top 25": queue checks to run in the background, skipping fresh ones.
        api.MapPost(
                "/requisitions/{id:guid}/fit/batch",
                async (
                    Guid id,
                    FitBatchRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (!ai.IsConfigured)
                        return Results.Problem(
                            "AI is not set up, so fit checks cannot run.",
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );
                    if (JobRequirements.Parse(requisition.RequirementsJson).IsEmpty)
                        return Results.Conflict(
                            new
                            {
                                message = "Confirm this job's requirements first. The check is made against them.",
                            }
                        );
                    var ids = (request.CandidateIds ?? []).Distinct().Take(50).ToArray();
                    var waiting = await db
                        .FitJobs.Where(x =>
                            x.RequisitionId == id
                            && ids.Contains(x.CandidateId)
                            && (x.Status == "Pending" || x.Status == "Running")
                        )
                        .Select(x => x.CandidateId)
                        .ToListAsync(ct);
                    var readable = await db
                        .Candidates.Where(x => ids.Contains(x.Id) && x.ResumeText != null)
                        .Select(x => x.Id)
                        .ToListAsync(ct);
                    var queue = readable.Except(waiting).ToList();
                    db.FitJobs.AddRange(
                        queue.Select(candidateId => new FitJob
                        {
                            RequisitionId = id,
                            CandidateId = candidateId,
                            RequestedBy = principal.Email(),
                        })
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(
                        new { Queued = queue.Count, Skipped = ids.Length - queue.Count }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
                "/requisitions/{id:guid}/fit/batch",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        new
                        {
                            Waiting = await db.FitJobs.CountAsync(
                                x =>
                                    x.RequisitionId == id
                                    && (x.Status == "Pending" || x.Status == "Running"),
                                ct
                            ),
                        }
                    )
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
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (string.IsNullOrWhiteSpace(request.Reason))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["reason"] = ["Say why this candidate isn't a fit."],
                            }
                        );
                    if (!await db.Candidates.AnyAsync(x => x.Id == request.CandidateId, ct))
                        return Results.NotFound();
                    var existing = await db.CandidateDismissals.SingleOrDefaultAsync(
                        x => x.RequisitionId == id && x.CandidateId == request.CandidateId,
                        ct
                    );
                    if (existing is null)
                        db.CandidateDismissals.Add(
                            new CandidateDismissal
                            {
                                RequisitionId = id,
                                CandidateId = request.CandidateId,
                                Reason = request.Reason.Trim(),
                                DismissedBy = principal.Email(),
                            }
                        );
                    else
                        existing.Reason = request.Reason.Trim();
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "CandidateDismissed",
                        new { request.CandidateId, request.Reason }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapDelete(
                "/requisitions/{id:guid}/dismissals/{candidateId:guid}",
                async (
                    Guid id,
                    Guid candidateId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    await db
                        .CandidateDismissals.Where(x =>
                            x.RequisitionId == id && x.CandidateId == candidateId
                        )
                        .ExecuteDeleteAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // People from this person's other jobs who fit this one, with the same match number as ranking.
        api.MapGet(
                "/requisitions/{id:guid}/suggested-candidates",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant ai,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.RequirementsEmbedding is null)
                        return Results.Ok(
                            new
                            {
                                Items = Array.Empty<object>(),
                                Reason = "Confirm this job's requirements to see past candidates who fit.",
                            }
                        );
                    var dismissed = db
                        .CandidateDismissals.Where(x => x.RequisitionId == id)
                        .Select(x => x.CandidateId);
                    // "Where we saw them before" only mentions applications on jobs this person may see.
                    var visibleApplicationIds = ScopeApplications(
                            db.Applications.AsNoTracking(),
                            principal
                        )
                        .Select(a => a.Id);
                    var pool = db
                        .Candidates.AsNoTracking()
                        .Where(x =>
                            !x.DoNotContact
                            && x.ResumeEmbedding != null
                            && !dismissed.Contains(x.Id)
                            && !x.Applications.Any(a => a.RequisitionId == id)
                            && x.Applications.Any(a => visibleApplicationIds.Contains(a.Id))
                        );
                    var ranked = await RankAsync(db, ai, principal, requisition, "", pool, ct);
                    var top = ranked.Rows.Where(x => x.Score >= 40).Take(8).ToList();
                    var ids = top.Select(x => x.Id).ToList();
                    var seen = await db
                        .Candidates.AsNoTracking()
                        .Where(x => ids.Contains(x.Id))
                        .Select(x => new
                        {
                            x.Id,
                            x.CurrentTitle,
                            Last = x
                                .Applications.Where(a => visibleApplicationIds.Contains(a.Id))
                                .OrderByDescending(a => a.LastActivityAt)
                                .Select(a => new
                                {
                                    Job = a.Requisition!.Title,
                                    Status = a.Status.ToString(),
                                    Stage = a.PipelineStage!.Name,
                                })
                                .First(),
                        })
                        .ToDictionaryAsync(x => x.Id, ct);
                    var items = top.Select(x => new
                    {
                        x.Id,
                        x.Name,
                        seen[x.Id].CurrentTitle,
                        x.Score,
                        x.Matched,
                        x.Missing,
                        PreviousJob = seen[x.Id].Last.Job,
                        PreviousStatus = seen[x.Id].Last.Status,
                        PreviousStage = seen[x.Id].Last.Stage,
                    });
                    return Results.Ok(new { Items = items, Reason = (string?)null });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
                "/admin/ai/status",
                async (
                    IAiAssistant ai,
                    IConfiguration configuration,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var organization = await db
                        .Organizations.AsNoTracking()
                        .SingleOrDefaultAsync(ct);
                    var since = DateTimeOffset.UtcNow.AddDays(-30);
                    var recent = await db
                        .AiCallLogs.AsNoTracking()
                        .Where(x => x.CreatedAt >= since)
                        .ToListAsync(ct);
                    return Results.Ok(
                        new
                        {
                            Configured = ai.IsConfigured,
                            Enabled = organization?.AiEnabled ?? true,
                            Model = string.IsNullOrWhiteSpace(organization?.AiModel)
                                ? configuration["OpenAI:Model"] ?? "gpt-4o-mini"
                                : organization.AiModel,
                            EmbeddingModel = configuration["OpenAI:EmbeddingModel"]
                                ?? "text-embedding-3-small",
                            PendingResumes = await db.Candidates.CountAsync(
                                x =>
                                    x.ResumeText != null
                                    && (
                                        x.ResumeEmbeddingAt == null
                                        || x.ResumeEmbeddingAt < x.ResumeParsedAt
                                    ),
                                ct
                            ),
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
                            x.Id,
                            x.Purpose,
                            x.Model,
                            x.UserEmail,
                            x.SubjectType,
                            x.SubjectId,
                            Input = x.Input.Substring(0, Math.Min(x.Input.Length, 600)),
                            Output = x.Output.Substring(0, Math.Min(x.Output.Length, 600)),
                            x.PromptTokens,
                            x.CompletionTokens,
                            x.LatencyMs,
                            x.Error,
                            x.CreatedAt,
                        })
                        .ToListAsync(ct);
                    return Results.Ok(
                        new
                        {
                            Items = items,
                            Total = await query.CountAsync(ct),
                            Page = current,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
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
            return Results.Problem(
                exception.Message,
                statusCode: StatusCodes.Status503ServiceUnavailable
            );
        }
        catch (JsonException)
        {
            return Results.Problem(
                "The AI assistant returned something unreadable. Try again.",
                statusCode: StatusCodes.Status502BadGateway
            );
        }
        catch (HttpRequestException)
        {
            return Results.Problem(
                "The AI service didn't respond. Try again in a moment.",
                statusCode: StatusCodes.Status502BadGateway
            );
        }
    }

    private static (string Json, int Score) ShapeFit(string output, JobRequirements requirements)
    {
        using var document = JsonDocument.Parse(output);
        var root = document.RootElement;
        var byRequirement = new Dictionary<string, (string Status, string Evidence)>(
            StringComparer.OrdinalIgnoreCase
        );
        if (
            root.TryGetProperty("requirements", out var list)
            && list.ValueKind == JsonValueKind.Array
        )
            foreach (var item in list.EnumerateArray())
            {
                var name = item.TryGetProperty("requirement", out var n) ? n.GetString() : null;
                if (name is null)
                    continue;
                var status = item.TryGetProperty("status", out var s)
                    ? s.GetString()?.ToLowerInvariant()
                    : null;
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
                return new
                {
                    x.Text,
                    x.Kind,
                    x.Weight,
                    found.Item1,
                    found.Item2,
                };
            })
            .ToList();
        var total = rows.Sum(x => x.Weight);
        var earned = rows.Sum(x =>
            x.Weight
            * (
                x.Item1 == "met" ? 1.0
                : x.Item1 == "partial" ? 0.5
                : 0
            )
        );
        var score = total == 0 ? 0 : (int)Math.Round(100 * earned / total);
        var concerns =
            root.TryGetProperty("concerns", out var c) && c.ValueKind == JsonValueKind.Array
                ? c.EnumerateArray()
                    .Where(x => x.ValueKind == JsonValueKind.String)
                    .Select(x => x.GetString()!)
                    .Take(8)
                    .ToArray()
                : [];
        var json = JsonSerializer.Serialize(
            new
            {
                summary = root.TryGetProperty("summary", out var sum) ? sum.GetString() ?? "" : "",
                requirements = rows.Select(x => new
                {
                    requirement = x.Text,
                    kind = x.Kind,
                    status = x.Item1,
                    evidence = x.Item2,
                }),
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
