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
    /// <summary>How long a stage email waits, so Undo on the board can still take it back.</summary>
    public static readonly TimeSpan StageEmailDelay = TimeSpan.FromSeconds(60);

    private static IResult JobProblem(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    /// <summary>Checks a stage list (a job's or a pipeline's) and returns the first problem, if any.</summary>
    internal static string? ValidateStages(IReadOnlyList<StageInput> stages, int max)
    {
        if (stages.Count is 0 || stages.Count > max)
            return $"Use one to {max} stages.";
        var names = stages.Select(x => x.Name?.Trim() ?? "").ToList();
        if (names.Any(x => x.Length is 0 or > 80))
            return "Every stage needs a name of up to 80 characters.";
        if (names.Distinct(StringComparer.OrdinalIgnoreCase).Count() != names.Count)
            return "Give each stage a different name.";
        if (stages.Any(x => (x.CandidateLabel?.Trim().Length ?? 0) > 80))
            return "Keep what candidates see to 80 characters.";
        if (stages.Any(x => x.TargetDays is < 1 or > 365))
            return "Target days must be between 1 and 365.";
        if (stages.Any(x => !Enum.IsDefined(x.Type) || !Enum.IsDefined(x.EmailOnEntry)))
            return "Choose a type and an email setting for every stage.";
        return null;
    }

    /// <summary>Every assessment a stage list names exists and is not archived.</summary>
    internal static async Task<string?> ValidateStageAssessmentsAsync(
        AtsDbContext db,
        IEnumerable<StageInput> stages,
        CancellationToken ct
    )
    {
        var ids = stages.Select(x => x.AssessmentId).OfType<Guid>().Distinct().ToArray();
        if (ids.Length == 0)
            return null;
        var found = await db.Assessments.CountAsync(
            x => ids.Contains(x.Id) && x.Status != AssessmentStatus.Archived,
            ct
        );
        return found == ids.Length
            ? null
            : "Choose an assessment from your library for each stage.";
    }

    private static void MapRequisitionStages(RouteGroupBuilder api)
    {
        // The job's stages, edited in place: add, rename, reorder, set type and targets, remove
        // after saying where the candidates go. The Hired stage stays last and does not change.
        api.MapPut(
                "/requisitions/{id:guid}/stages",
                async (
                    Guid id,
                    SaveStagesRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.Include(x => x.Stages)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var input = request.Stages ?? [];
                    var hired = StageRules.Hired(requisition.Stages);
                    if (hired is null || input.Length == 0 || input[^1].Id != hired.Id)
                        return JobProblem("stages", "Keep the Hired stage last.");
                    var open = input[..^1];
                    if (ValidateStages(open, 20) is { } problem)
                        return JobProblem("stages", problem);
                    if (open.Any(x => x.Type == StageType.Hired))
                        return JobProblem("stages", "Only the last stage can be Hired.");
                    if (await ValidateStageAssessmentsAsync(db, open, ct) is { } missing)
                        return JobProblem("stages", missing);
                    var existing = requisition.Stages.ToDictionary(x => x.Id);
                    if (
                        open.Any(x =>
                            x.Id is { } stageId
                            && (!existing.ContainsKey(stageId) || stageId == hired.Id)
                        )
                    )
                        return JobProblem("stages", "A stage does not belong to this job.");
                    var keptIds = open.Where(x => x.Id is not null)
                        .Select(x => x.Id!.Value)
                        .Append(hired.Id)
                        .ToHashSet();
                    var removed = requisition.Stages.Where(x => !keptIds.Contains(x.Id)).ToList();
                    var removedIds = removed.Select(x => x.Id).ToArray();
                    var moving = await db
                        .Applications.Where(x => removedIds.Contains(x.PipelineStageId))
                        .ToListAsync(ct);
                    var moveTo = request.MoveTo ?? [];
                    foreach (
                        var stage in removed.Where(s => moving.Any(a => a.PipelineStageId == s.Id))
                    )
                        if (
                            !moveTo.TryGetValue(stage.Id, out var target)
                            || !keptIds.Contains(target)
                            || target == hired.Id
                        )
                            return JobProblem(
                                "moveTo",
                                $"Choose where the people in {stage.Name} go before you remove it."
                            );

                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    // (RequisitionId, SortOrder) is unique, so park the survivors out of the way first.
                    foreach (var stage in requisition.Stages)
                        stage.SortOrder += 1000;
                    await db.SaveChangesAsync(ct);
                    var now = DateTimeOffset.UtcNow;
                    foreach (var application in moving)
                    {
                        var from = application.PipelineStageId;
                        application.PipelineStageId = moveTo[from];
                        application.LastActivityAt = now;
                        PipelineEvents.RecordMove(
                            db,
                            application,
                            from,
                            application.Status,
                            principal.Email()
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    db.PipelineStages.RemoveRange(removed);
                    for (var index = 0; index < open.Length; index++)
                    {
                        var item = open[index];
                        var stage = item.Id is { } stageId ? existing[stageId] : null;
                        if (stage is null)
                        {
                            stage = new PipelineStage
                            {
                                RequisitionId = id,
                                Name = item.Name.Trim(),
                            };
                            db.PipelineStages.Add(stage);
                        }
                        stage.Name = item.Name.Trim();
                        stage.Type = item.Type;
                        stage.CandidateLabel = item.CandidateLabel?.Trim() is { Length: > 0 } label
                            ? label
                            : StageRules.DefaultLabel(item.Type);
                        stage.EmailOnEntry = item.EmailOnEntry;
                        stage.TargetDays = item.TargetDays;
                        stage.AssessmentId = item.AssessmentId;
                        stage.IsTerminal = false;
                        stage.SortOrder = index;
                    }
                    hired.SortOrder = open.Length;
                    requisition.UpdatedAt = now;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "StagesUpdated",
                        new
                        {
                            Stages = open.Select(x => x.Name.Trim()).Append(hired.Name).ToArray(),
                            Removed = removed.Select(x => x.Name).ToArray(),
                            Moved = moving.Count,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // What the stage email would say to this person, for the move dialog to show before sending.
        api.MapGet(
                "/applications/{id:guid}/stage-email",
                async (
                    Guid id,
                    Guid stageId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var application = await db
                        .Applications.AsNoTracking()
                        .Include(x => x.Candidate)
                        .Include(x => x.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    var stage = await db
                        .PipelineStages.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x => x.Id == stageId && x.RequisitionId == application.RequisitionId,
                            ct
                        );
                    if (stage is null)
                        return Results.NotFound();
                    var email = await RenderStageEmailAsync(db, application, stage, ct);
                    return Results.Ok(
                        new
                        {
                            To = application.Candidate!.Email,
                            email.Subject,
                            email.Body,
                            application.Candidate.DoNotContact,
                            StageLabel = StageRules.CandidateLabel(stage),
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Queues the stage email for people just moved into a stage. It waits StageEmailDelay so the
        // board's Undo can cancel it. People who asked not to be contacted are skipped.
        api.MapPost(
                "/stage-emails",
                async (
                    StageEmailRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var ids = (request.ApplicationIds ?? []).Distinct().ToArray();
                    if (ids.Length is 0 or > 200)
                        return JobProblem("applicationIds", "Choose between 1 and 200 people.");
                    var custom = request.Subject is not null || request.Body is not null;
                    if (
                        custom
                        && (
                            ids.Length > 1
                            || string.IsNullOrWhiteSpace(request.Subject)
                            || string.IsNullOrWhiteSpace(request.Body)
                        )
                    )
                        return JobProblem(
                            "body",
                            "A written email needs a subject and a message, for one person."
                        );
                    var applications = await db
                        .Applications.Include(x => x.Candidate)
                        .Include(x => x.Requisition)
                        .Where(x => ids.Contains(x.Id))
                        .ToListAsync(ct);
                    if (
                        applications.Count != ids.Length
                        || applications.Any(x => !CanManage(x.Requisition!, principal))
                        || applications.Select(x => x.RequisitionId).Distinct().Count() != 1
                    )
                        return Results.NotFound();
                    var stage = await db
                        .PipelineStages.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x =>
                                x.Id == request.StageId
                                && x.RequisitionId == applications[0].RequisitionId,
                            ct
                        );
                    if (stage is null)
                        return Results.NotFound();
                    var queued = new List<Guid>();
                    foreach (var application in applications.Where(x => !x.Candidate!.DoNotContact))
                    {
                        var email = await RenderStageEmailAsync(db, application, stage, ct);
                        var item = new EmailOutboxItem
                        {
                            ApplicationId = application.Id,
                            Recipient = application.Candidate!.Email,
                            Subject = custom ? request.Subject!.Trim() : email.Subject,
                            Body = custom ? request.Body!.Trim() : email.Body,
                            TemplateKey = "stage-update",
                            TemplateVersion = email.Version,
                            NextAttemptAt = DateTimeOffset.UtcNow + StageEmailDelay,
                        };
                        db.EmailOutbox.Add(item);
                        queued.Add(item.Id);
                        Audit.Add(
                            db,
                            principal,
                            "Application",
                            application.Id,
                            "StageEmailQueued",
                            new
                            {
                                StageId = stage.Id,
                                Label = StageRules.CandidateLabel(stage),
                                Edited = custom,
                            }
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(
                        new { Ids = queued, Skipped = applications.Count - queued.Count }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Undo: takes back stage emails that have not gone out yet.
        api.MapPost(
                "/stage-emails/cancel",
                async (
                    CancelStageEmailsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var ids = (request.Ids ?? []).Take(200).ToArray();
                    var items = await db
                        .EmailOutbox.Where(x =>
                            ids.Contains(x.Id)
                            && x.TemplateKey == "stage-update"
                            && x.Status == EmailOutboxStatus.Pending
                        )
                        .ToListAsync(ct);
                    var applicationIds = items.Select(x => x.ApplicationId).ToArray();
                    var jobs = await db
                        .Applications.Where(x => applicationIds.Contains(x.Id))
                        .Select(x => x.Requisition!)
                        .ToListAsync(ct);
                    if (jobs.Any(x => !CanManage(x, principal)))
                        return Results.NotFound();
                    db.EmailOutbox.RemoveRange(items);
                    foreach (var item in items)
                        Audit.Add(
                            db,
                            principal,
                            "Application",
                            item.ApplicationId ?? item.Id,
                            "StageEmailCancelled"
                        );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Cancelled = items.Count });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>The stage-update template for one person, with what candidates see for the stage.</summary>
    private static Task<EmailTemplates.Rendered> RenderStageEmailAsync(
        AtsDbContext db,
        Application application,
        PipelineStage stage,
        CancellationToken ct
    ) =>
        EmailTemplates.RenderAsync(
            db,
            "stage-update",
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["firstName"] = application.Candidate!.FirstName,
                ["jobTitle"] = application.Requisition!.Title,
                ["stage"] = StageRules.CandidateLabel(stage),
            },
            ct
        );
}
