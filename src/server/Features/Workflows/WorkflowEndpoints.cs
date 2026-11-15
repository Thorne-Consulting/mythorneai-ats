using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Features.Workflows;

public sealed record CreateWorkflowRequest(string Name, Graph? Graph);

public sealed record SaveWorkflowRequest(
    string? Name,
    Graph? Graph,
    bool? RunsOncePerApplication,
    int? MaxRunsPerApplication,
    bool? StopWhenClosed,
    bool? RespectQuietHours
);

public sealed record PublishWorkflowRequest(string? Note, bool IncludeExisting);

public sealed record CheckWorkflowRequest(Graph Graph);

public sealed record TestWorkflowRequest(Graph Graph, Guid ApplicationId);

/// <summary>An email step to send to the person asking. Without an application, the newest active one fills the details.</summary>
public sealed record TestEmailRequest(GraphNode Node, Guid? ApplicationId);

public sealed record SaveReminderRequest(bool Enabled, int? Days, int MaxReminders);

/// <summary>Workflows for admins: the list, the draft and its versions, runs and their logs, the dry run, and lookups.</summary>
public static class WorkflowEndpoints
{
    public static RouteGroupBuilder MapWorkflows(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("").RequireAuthorization(AtsPolicies.Admin);

        group.MapGet("/workflows", ListAsync);
        group.MapPost("/workflows", CreateAsync);
        group.MapGet("/workflows/lookups", LookupsAsync);
        group.MapGet("/workflows/applications", SearchApplicationsAsync);
        group.MapPost("/workflows/check", CheckAsync);
        group.MapGet("/workflows/reminders", RemindersAsync);
        group.MapPut("/workflows/reminders/{key}", SaveReminderAsync);
        group.MapGet("/workflows/{id:guid}", GetAsync);
        group.MapPut("/workflows/{id:guid}", SaveAsync);
        group.MapPost("/workflows/{id:guid}/publish", PublishAsync);
        group.MapPost(
            "/workflows/{id:guid}/pause",
            (Guid id, ClaimsPrincipal p, AtsDbContext db, CancellationToken ct) =>
                SetStatusAsync(id, false, p, db, ct)
        );
        group.MapPost(
            "/workflows/{id:guid}/resume",
            (Guid id, ClaimsPrincipal p, AtsDbContext db, CancellationToken ct) =>
                SetStatusAsync(id, true, p, db, ct)
        );
        group.MapPost("/workflows/{id:guid}/duplicate", DuplicateAsync);
        group.MapPost("/workflows/{id:guid}/restore", RestoreAsync);
        group.MapDelete("/workflows/{id:guid}", DeleteAsync);
        group.MapGet("/workflows/{id:guid}/versions", VersionsAsync);
        group.MapPost(
            "/workflows/{id:guid}/versions/{versionId:guid}/restore",
            RestoreVersionAsync
        );
        group.MapGet("/workflows/{id:guid}/runs", RunsAsync);
        group.MapPost("/workflows/{id:guid}/test", TestAsync);
        group.MapPost("/workflows/{id:guid}/test-email", TestEmailAsync);
        group.MapGet("/workflow-runs/{runId:guid}", RunAsync);
        group.MapPost("/workflow-runs/{runId:guid}/retry", RetryAsync);
        group.MapPost("/workflow-runs/{runId:guid}/cancel", CancelAsync);
        return api;
    }

    private static IResult Missing() =>
        Results.NotFound(new { message = "This workflow no longer exists." });

    private static IResult Problem(string message, List<Problem>? problems = null) =>
        Results.BadRequest(new { message, problems });

    /// <summary>Same steps and connections, ignoring where the boxes sit on the canvas.</summary>
    private static bool SameSteps(Graph a, Graph b) =>
        WorkflowGraph.Serialize(
            new(
                a.Nodes.Select(x => x with { Position = null }).OrderBy(x => x.Id).ToList(),
                [
                    .. a
                        .Edges.OrderBy(x => x.Source)
                        .ThenBy(x => x.Target)
                        .Select(x => x with { Id = "" }),
                ]
            )
        )
        == WorkflowGraph.Serialize(
            new(
                b.Nodes.Select(x => x with { Position = null }).OrderBy(x => x.Id).ToList(),
                [
                    .. b
                        .Edges.OrderBy(x => x.Source)
                        .ThenBy(x => x.Target)
                        .Select(x => x with { Id = "" }),
                ]
            )
        );

    private static async Task<GraphReferences> ReferencesAsync(
        AtsDbContext db,
        CancellationToken ct
    ) =>
        new(
            (await db.Requisitions.Select(x => x.Id).ToListAsync(ct)).ToHashSet(),
            (
                await db.PipelineStages.Select(x => x.Name.ToLower()).Distinct().ToListAsync(ct)
            ).ToHashSet(),
            WorkflowEmails.All.Select(x => x.Key).ToHashSet(),
            (await db.WebhookEndpoints.Select(x => x.Id).ToListAsync(ct)).ToHashSet(),
            (
                await db
                    .Assessments.Where(x =>
                        x.Status == AssessmentStatus.Active && x.CurrentVersionId != null
                    )
                    .Select(x => x.Id)
                    .ToListAsync(ct)
            ).ToHashSet()
        );

    private static async Task<Dictionary<string, string>> NamesAsync(
        AtsDbContext db,
        IEnumerable<string?> emails,
        CancellationToken ct
    )
    {
        var wanted = emails.Where(x => x is not null).Select(x => x!).Distinct().ToList();
        var names = await db
            .Users.AsNoTracking()
            .Where(x => wanted.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        names[BuiltInWorkflows.Owner] = BuiltInWorkflows.Owner;
        return names;
    }

    // ----- List and lifecycle

    private static async Task<IResult> ListAsync(AtsDbContext db, CancellationToken ct)
    {
        await BuiltInWorkflows.EnsureAsync(db, ct);
        var workflows = await db
            .Workflows.AsNoTracking()
            .Include(x => x.PublishedVersion)
            .OrderBy(x => x.Name)
            .ToListAsync(ct);
        var monthAgo = DateTimeOffset.UtcNow.AddDays(-30);
        var stats = await db
            .WorkflowRuns.AsNoTracking()
            .GroupBy(x => x.WorkflowId)
            .Select(g => new
            {
                Id = g.Key,
                Runs30 = g.Count(r => r.StartedAt > monthAgo),
                Failed = g.Count(r => r.Status == WorkflowRunStatus.Failed),
                InProgress = g.Count(r =>
                    r.Status == WorkflowRunStatus.Running || r.Status == WorkflowRunStatus.Waiting
                ),
                LastRunAt = g.Max(r => (DateTimeOffset?)r.StartedAt),
            })
            .ToDictionaryAsync(x => x.Id, ct);
        var lastStatus = await db
            .WorkflowRuns.AsNoTracking()
            .GroupBy(x => x.WorkflowId)
            .Select(g =>
                g.OrderByDescending(r => r.StartedAt)
                    .Select(r => new { r.WorkflowId, r.Status })
                    .First()
            )
            .ToDictionaryAsync(x => x.WorkflowId, x => x.Status, ct);
        var names = await NamesAsync(
            db,
            workflows.SelectMany(x => new[] { x.CreatedBy, x.UpdatedBy }),
            ct
        );
        return Results.Ok(
            workflows.Select(w =>
            {
                var draft = WorkflowGraph.Parse(w.DraftGraphJson);
                var published = w.PublishedVersion is null
                    ? null
                    : WorkflowGraph.Parse(w.PublishedVersion.GraphJson);
                var stat = stats.GetValueOrDefault(w.Id);
                return new
                {
                    w.Id,
                    w.Name,
                    w.Status,
                    w.BuiltInKey,
                    Trigger = (published ?? draft).Trigger,
                    Steps = (published ?? draft).Nodes.Count,
                    PublishedVersion = w.PublishedVersion?.Number,
                    HasUnpublishedChanges = published is null
                        ? draft.Nodes.Count > 0
                        : !SameSteps(draft, published),
                    LastRunAt = stat?.LastRunAt,
                    LastRunStatus = lastStatus.TryGetValue(w.Id, out var s)
                        ? s
                        : (WorkflowRunStatus?)null,
                    Runs30 = stat?.Runs30 ?? 0,
                    Failed = stat?.Failed ?? 0,
                    InProgress = stat?.InProgress ?? 0,
                    Owner = names.GetValueOrDefault(w.CreatedBy, w.CreatedBy),
                    w.UpdatedAt,
                    UpdatedBy = w.UpdatedBy is null
                        ? null
                        : names.GetValueOrDefault(w.UpdatedBy, w.UpdatedBy),
                };
            })
        );
    }

    private static async Task<IResult> CreateAsync(
        CreateWorkflowRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > 160)
            return Problem("Give the workflow a name of up to 160 characters.");
        var workflow = new Workflow
        {
            Name = name,
            DraftGraphJson = WorkflowGraph.Serialize(request.Graph ?? new([], [])),
            CreatedBy = principal.Email(),
            UpdatedBy = principal.Email(),
        };
        db.Workflows.Add(workflow);
        Audit.Add(db, principal, "Workflow", workflow.Id, "Created", new { workflow.Name });
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { workflow.Id });
    }

    private static async Task<IResult> GetAsync(Guid id, AtsDbContext db, CancellationToken ct)
    {
        var w = await db
            .Workflows.AsNoTracking()
            .Include(x => x.PublishedVersion)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        var draft = WorkflowGraph.Parse(w.DraftGraphJson);
        var published = w.PublishedVersion is null
            ? null
            : WorkflowGraph.Parse(w.PublishedVersion.GraphJson);
        var counts = await db
            .WorkflowRuns.AsNoTracking()
            .Where(x => x.WorkflowId == id)
            .GroupBy(x => x.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count, ct);
        var names = await NamesAsync(db, [w.UpdatedBy, w.PublishedVersion?.PublishedBy], ct);
        return Results.Ok(
            new
            {
                w.Id,
                w.Name,
                w.Status,
                w.BuiltInKey,
                Draft = draft,
                PublishedVersion = w.PublishedVersion is { } v
                    ? new
                    {
                        v.Id,
                        v.Number,
                        v.PublishedAt,
                        PublishedBy = names.GetValueOrDefault(v.PublishedBy, v.PublishedBy),
                    }
                    : null,
                HasUnpublishedChanges = published is null
                    ? draft.Nodes.Count > 0
                    : !SameSteps(draft, published),
                w.RunsOncePerApplication,
                w.MaxRunsPerApplication,
                w.StopWhenClosed,
                w.RespectQuietHours,
                w.UpdatedAt,
                UpdatedBy = w.UpdatedBy is null
                    ? null
                    : names.GetValueOrDefault(w.UpdatedBy, w.UpdatedBy),
                Problems = WorkflowGraph.Validate(draft, await ReferencesAsync(db, ct)),
                Runs = new
                {
                    InProgress = counts.GetValueOrDefault(WorkflowRunStatus.Running)
                        + counts.GetValueOrDefault(WorkflowRunStatus.Waiting),
                    Failed = counts.GetValueOrDefault(WorkflowRunStatus.Failed),
                    Total = counts.Values.Sum(),
                },
            }
        );
    }

    /// <summary>Saves the draft (the editor saves as you work) and the entry rules, which apply at once.</summary>
    private static async Task<IResult> SaveAsync(
        Guid id,
        SaveWorkflowRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (request.Name is { } name)
        {
            if (name.Trim().Length is 0 or > 160)
                return Problem("Give the workflow a name of up to 160 characters.");
            w.Name = name.Trim();
        }
        if (request.Graph is { } graph)
        {
            if (graph.Nodes.Count > 100)
                return Problem("A workflow can have up to 100 steps.");
            w.DraftGraphJson = WorkflowGraph.Serialize(graph);
        }
        if (request.MaxRunsPerApplication is { } max)
        {
            if (max is < 0 or > 100)
                return Problem("Choose up to 100 runs, or no limit.");
            w.MaxRunsPerApplication = max == 0 ? null : max;
        }
        w.RunsOncePerApplication = request.RunsOncePerApplication ?? w.RunsOncePerApplication;
        w.StopWhenClosed = request.StopWhenClosed ?? w.StopWhenClosed;
        w.RespectQuietHours = request.RespectQuietHours ?? w.RespectQuietHours;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { w.UpdatedAt });
    }

    /// <summary>Problems in a draft, and how many applications are already where its trigger watches.</summary>
    private static async Task<IResult> CheckAsync(
        CheckWorkflowRequest request,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var graph = request.Graph ?? new([], []);
        var trigger = graph.Trigger;
        return Results.Ok(
            new
            {
                Problems = WorkflowGraph.Validate(graph, await ReferencesAsync(db, ct)),
                AlreadyInStage = trigger is null
                    ? 0
                    : (await WorkflowTriggers.AlreadyInStageAsync(db, trigger, ct)).Count,
            }
        );
    }

    private static async Task<IResult> PublishAsync(
        Guid id,
        PublishWorkflowRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db
            .Workflows.Include(x => x.PublishedVersion)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        var graph = WorkflowGraph.Parse(w.DraftGraphJson);
        var problems = WorkflowGraph.Validate(graph, await ReferencesAsync(db, ct));
        if (problems.Count > 0)
            return Problem(
                problems.Count == 1
                    ? "Fix this problem before you publish."
                    : $"Fix these {problems.Count} problems before you publish.",
                problems
            );
        var previous = w.PublishedVersion is null
            ? null
            : WorkflowGraph.Parse(w.PublishedVersion.GraphJson);
        var number =
            (
                await db
                    .WorkflowVersions.Where(x => x.WorkflowId == id)
                    .MaxAsync(x => (int?)x.Number, ct)
                ?? 0
            ) + 1;
        var version = new WorkflowVersion
        {
            WorkflowId = id,
            Number = number,
            GraphJson = w.DraftGraphJson,
            Note = string.IsNullOrWhiteSpace(request.Note)
                ? null
                : request.Note.Trim()[..Math.Min(request.Note.Trim().Length, 500)],
            Summary = WorkflowGraph.Summarize(previous, graph),
            PublishedBy = principal.Email(),
        };
        db.WorkflowVersions.Add(version);
        await db.SaveChangesAsync(ct);
        w.PublishedVersionId = version.Id;
        w.TriggerKind = graph.Trigger!.Kind;
        if (w.Status is WorkflowStatus.Draft or WorkflowStatus.Archived)
            w.Status = WorkflowStatus.Active;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        var started = 0;
        if (request.IncludeExisting)
        {
            var already = (
                await db
                    .WorkflowRuns.Where(x => x.WorkflowId == id)
                    .Select(x => x.ApplicationId)
                    .Distinct()
                    .ToListAsync(ct)
            ).ToHashSet();
            foreach (
                var applicationId in await WorkflowTriggers.AlreadyInStageAsync(
                    db,
                    graph.Trigger,
                    ct
                )
            )
            {
                if (w.RunsOncePerApplication && already.Contains(applicationId))
                    continue;
                db.WorkflowRuns.Add(
                    new WorkflowRun
                    {
                        WorkflowId = id,
                        VersionId = version.Id,
                        ApplicationId = applicationId,
                        TriggerKind = graph.Trigger.Kind,
                        CurrentNodeId = graph.Trigger.Id,
                        DedupeKey = w.RunsOncePerApplication ? "once" : null,
                    }
                );
                started++;
            }
        }
        Audit.Add(
            db,
            principal,
            "Workflow",
            id,
            "Published",
            new
            {
                Version = number,
                version.Note,
                Started = started,
            }
        );
        await db.SaveChangesAsync(ct);
        return Results.Ok(
            new
            {
                version.Number,
                Started = started,
                w.Status,
            }
        );
    }

    private static async Task<IResult> SetStatusAsync(
        Guid id,
        bool on,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (on && w.PublishedVersionId is null)
            return Results.Conflict(
                new { message = "Publish the workflow first. Then it can run." }
            );
        if (w.Status == WorkflowStatus.Archived)
            return Results.Conflict(new { message = "Restore the workflow first." });
        // Pausing keeps waiting runs where they are; they go on when it is resumed.
        w.Status = on ? WorkflowStatus.Active : WorkflowStatus.Paused;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        Audit.Add(db, principal, "Workflow", id, on ? "Resumed" : "Paused");
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { w.Status });
    }

    private static async Task<IResult> DuplicateAsync(
        Guid id,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        var copy = new Workflow
        {
            Name = $"{w.Name} (copy)"[..Math.Min(w.Name.Length + 7, 160)],
            DraftGraphJson = w.DraftGraphJson,
            RunsOncePerApplication = w.RunsOncePerApplication,
            MaxRunsPerApplication = w.MaxRunsPerApplication,
            StopWhenClosed = w.StopWhenClosed,
            RespectQuietHours = w.RespectQuietHours,
            CreatedBy = principal.Email(),
            UpdatedBy = principal.Email(),
        };
        db.Workflows.Add(copy);
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { copy.Id, copy.Name });
    }

    /// <summary>Deletes a workflow that never ran; one with runs is archived so its history stays.</summary>
    private static async Task<IResult> DeleteAsync(
        Guid id,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (w.BuiltInKey is not null)
            return Results.Conflict(
                new { message = "Built-in reminders can be paused, not deleted." }
            );
        if (!await db.WorkflowRuns.AnyAsync(x => x.WorkflowId == id, ct))
        {
            w.PublishedVersionId = null;
            await db.SaveChangesAsync(ct);
            db.Workflows.Remove(w);
            Audit.Add(db, principal, "Workflow", id, "Deleted", new { w.Name });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { Archived = false });
        }
        w.Status = WorkflowStatus.Archived;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        Audit.Add(db, principal, "Workflow", id, "Archived", new { w.Name });
        await db.SaveChangesAsync(ct);
        var now = DateTimeOffset.UtcNow;
        await db
            .WorkflowRuns.Where(x =>
                x.WorkflowId == id
                && (x.Status == WorkflowRunStatus.Running || x.Status == WorkflowRunStatus.Waiting)
            )
            .ExecuteUpdateAsync(
                s =>
                    s.SetProperty(x => x.Status, WorkflowRunStatus.Cancelled)
                        .SetProperty(x => x.FinishedAt, now)
                        .SetProperty(x => x.LastError, "Stopped: the workflow was archived."),
                ct
            );
        return Results.Ok(new { Archived = true });
    }

    private static async Task<IResult> RestoreAsync(
        Guid id,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (w.Status != WorkflowStatus.Archived)
            return Results.Ok(new { w.Status });
        w.Status = w.PublishedVersionId is null ? WorkflowStatus.Draft : WorkflowStatus.Paused;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        Audit.Add(db, principal, "Workflow", id, "Restored");
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { w.Status });
    }

    // ----- Versions

    private static async Task<IResult> VersionsAsync(Guid id, AtsDbContext db, CancellationToken ct)
    {
        var w = await db.Workflows.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        var versions = await db
            .WorkflowVersions.AsNoTracking()
            .Where(x => x.WorkflowId == id)
            .OrderByDescending(x => x.Number)
            .ToListAsync(ct);
        var names = await NamesAsync(db, versions.Select(x => x.PublishedBy), ct);
        return Results.Ok(
            versions.Select(v => new
            {
                v.Id,
                v.Number,
                v.PublishedAt,
                PublishedBy = names.GetValueOrDefault(v.PublishedBy, v.PublishedBy),
                v.Note,
                v.Summary,
                IsCurrent = v.Id == w.PublishedVersionId,
                Steps = WorkflowGraph.Parse(v.GraphJson).Nodes.Count,
            })
        );
    }

    private static async Task<IResult> RestoreVersionAsync(
        Guid id,
        Guid versionId,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.SingleOrDefaultAsync(x => x.Id == id, ct);
        var v = await db
            .WorkflowVersions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == versionId && x.WorkflowId == id, ct);
        if (w is null || v is null)
            return Missing();
        // It becomes the draft; nothing changes for runs until it is published.
        w.DraftGraphJson = v.GraphJson;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        await db.SaveChangesAsync(ct);
        return Results.Ok(new { Draft = WorkflowGraph.Parse(v.GraphJson) });
    }

    // ----- Runs

    private static async Task<IResult> RunsAsync(
        Guid id,
        string? status,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var query = db.WorkflowRuns.AsNoTracking().Where(x => x.WorkflowId == id);
        if (status == "InProgress")
            query = query.Where(x =>
                x.Status == WorkflowRunStatus.Running || x.Status == WorkflowRunStatus.Waiting
            );
        else if (Enum.TryParse<WorkflowRunStatus>(status, out var parsed))
            query = query.Where(x => x.Status == parsed);
        // Failed runs first: they are the ones that need someone.
        var runs = await query
            .OrderBy(x => x.Status == WorkflowRunStatus.Failed ? 0 : 1)
            .ThenByDescending(x => x.StartedAt)
            .Take(300)
            .Select(x => new
            {
                x.Id,
                x.ApplicationId,
                CandidateName = x.Application!.Candidate!.FirstName
                    + " "
                    + x.Application.Candidate.LastName,
                JobTitle = x.Application.Requisition!.Title,
                x.Status,
                x.StartedAt,
                x.FinishedAt,
                x.NextRunAt,
                x.CurrentNodeId,
                x.LastError,
                x.Attempts,
                x.VersionId,
                VersionNumber = x.Version!.Number,
            })
            .ToListAsync(ct);
        var graphs = await GraphsAsync(db, runs.Select(x => x.VersionId), ct);
        return Results.Ok(
            runs.Select(x => new
            {
                x.Id,
                x.ApplicationId,
                x.CandidateName,
                x.JobTitle,
                x.Status,
                x.StartedAt,
                x.FinishedAt,
                // A run waiting on approvers has no clock to show.
                NextRunAt = x.Status is WorkflowRunStatus.Running or WorkflowRunStatus.Waiting
                && graphs.GetValueOrDefault(x.VersionId)?.Node(x.CurrentNodeId)?.Kind
                    != "action.approval"
                    ? x.NextRunAt
                    : (DateTimeOffset?)null,
                CurrentStep = graphs.GetValueOrDefault(x.VersionId)?.Node(x.CurrentNodeId)
                    is { } node
                    ? WorkflowGraph.Label(node)
                    : null,
                x.LastError,
                x.Attempts,
                x.VersionNumber,
            })
        );
    }

    private static async Task<Dictionary<Guid, Graph>> GraphsAsync(
        AtsDbContext db,
        IEnumerable<Guid> versionIds,
        CancellationToken ct
    )
    {
        var ids = versionIds.Distinct().ToList();
        return (
            await db
                .WorkflowVersions.AsNoTracking()
                .Where(x => ids.Contains(x.Id))
                .Select(x => new { x.Id, x.GraphJson })
                .ToListAsync(ct)
        ).ToDictionary(x => x.Id, x => WorkflowGraph.Parse(x.GraphJson));
    }

    private sealed record StepDetail(List<SentEmail>? Emails, Guid? DeliveryId);

    private static async Task<IResult> RunAsync(Guid runId, AtsDbContext db, CancellationToken ct)
    {
        var run = await db
            .WorkflowRuns.AsNoTracking()
            .Include(x => x.Steps)
            .Include(x => x.Version)
            .Include(x => x.Workflow)
            .Include(x => x.Application!.Candidate)
            .Include(x => x.Application!.Requisition)
            .SingleOrDefaultAsync(x => x.Id == runId, ct);
        if (run is null)
            return Results.NotFound(new { message = "This run no longer exists." });
        var graph = WorkflowGraph.Parse(run.Version!.GraphJson);
        var details = run.Steps.ToDictionary(
            x => x.Id,
            x =>
                x.DetailJson is null
                    ? null
                    : JsonSerializer.Deserialize<StepDetail>(x.DetailJson, WorkflowGraph.Json)
        );
        // Delivery status for what each step wrote, so "was it sent?" has an answer here.
        var emailIds = details.Values.SelectMany(x => x?.Emails ?? []).Select(x => x.Id).ToList();
        var emails = await db
            .EmailOutbox.AsNoTracking()
            .Where(x => emailIds.Contains(x.Id))
            .ToDictionaryAsync(
                x => x.Id,
                x => new
                {
                    x.Status,
                    x.DeliveryStatus,
                    x.LastError,
                },
                ct
            );
        var deliveryIds = details
            .Values.Where(x => x?.DeliveryId is not null)
            .Select(x => x!.DeliveryId!.Value)
            .ToList();
        var deliveries = await db
            .WebhookDeliveries.AsNoTracking()
            .Where(x => deliveryIds.Contains(x.Id))
            .ToDictionaryAsync(
                x => x.Id,
                x => new
                {
                    x.Status,
                    x.LastStatusCode,
                    x.LastError,
                },
                ct
            );
        return Results.Ok(
            new
            {
                run.Id,
                run.WorkflowId,
                WorkflowName = run.Workflow!.Name,
                run.ApplicationId,
                CandidateName = $"{run.Application!.Candidate!.FirstName} {run.Application.Candidate.LastName}",
                JobTitle = run.Application.Requisition!.Title,
                run.Status,
                run.TriggerKind,
                run.StartedAt,
                run.FinishedAt,
                NextRunAt = run.Status is WorkflowRunStatus.Running or WorkflowRunStatus.Waiting
                && graph.Node(run.CurrentNodeId)?.Kind != "action.approval"
                    ? run.NextRunAt
                    : (DateTimeOffset?)null,
                run.CurrentNodeId,
                run.LastError,
                run.Attempts,
                VersionNumber = run.Version.Number,
                Steps = run
                    .Steps.OrderBy(x => x.StartedAt)
                    .ThenBy(x => x.FinishedAt ?? DateTimeOffset.MaxValue)
                    .Select(x => new
                    {
                        x.Id,
                        x.NodeId,
                        x.Kind,
                        Title = graph.Node(x.NodeId) is { } node
                            ? WorkflowGraph.Label(node)
                            : WorkflowGraph.KindLabel(x.Kind),
                        x.Status,
                        Branch = x.Branch is null ? null : WorkflowGraph.OutputLabel(x.Branch),
                        x.Output,
                        x.Error,
                        x.Attempts,
                        x.StartedAt,
                        x.FinishedAt,
                        Emails = details[x.Id]
                            ?.Emails?.Select(e => new
                            {
                                e.Id,
                                e.Recipient,
                                e.Subject,
                                Status = emails.TryGetValue(e.Id, out var m)
                                    ? (m.DeliveryStatus ?? m.Status.ToString())
                                    : null,
                                Error = emails.TryGetValue(e.Id, out var f) ? f.LastError : null,
                            }),
                        Webhook = details[x.Id]?.DeliveryId is { } d
                        && deliveries.TryGetValue(d, out var h)
                            ? h
                            : null,
                    }),
            }
        );
    }

    private static async Task<IResult> RetryAsync(
        Guid runId,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var run = await db.WorkflowRuns.SingleOrDefaultAsync(x => x.Id == runId, ct);
        if (run is null)
            return Results.NotFound(new { message = "This run no longer exists." });
        if (run.Status != WorkflowRunStatus.Failed)
            return Results.Conflict(new { message = "Only a failed run can be tried again." });
        // The failed step runs again; the steps before it are not repeated.
        run.Status = WorkflowRunStatus.Running;
        run.Attempts = 0;
        run.NextRunAt = DateTimeOffset.UtcNow;
        run.FinishedAt = null;
        run.LastError = null;
        Audit.Add(db, principal, "Workflow", run.WorkflowId, "RunRetried", new { RunId = run.Id });
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> CancelAsync(
        Guid runId,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var run = await db.WorkflowRuns.SingleOrDefaultAsync(x => x.Id == runId, ct);
        if (run is null)
            return Results.NotFound(new { message = "This run no longer exists." });
        if (
            run.Status
            is not (
                WorkflowRunStatus.Running
                or WorkflowRunStatus.Waiting
                or WorkflowRunStatus.Failed
            )
        )
            return Results.Conflict(new { message = "This run has already ended." });
        var name = await db
            .Users.Where(x => x.Email == principal.Email())
            .Select(x => x.DisplayName)
            .FirstOrDefaultAsync(ct);
        run.Status = WorkflowRunStatus.Cancelled;
        run.FinishedAt = DateTimeOffset.UtcNow;
        run.LastError = $"Stopped by {name ?? principal.Email()}.";
        Audit.Add(
            db,
            principal,
            "Workflow",
            run.WorkflowId,
            "RunCancelled",
            new { RunId = run.Id }
        );
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>The dry run: the draft walked for one real application, with nothing saved or sent.</summary>
    private static async Task<IResult> TestAsync(
        Guid id,
        TestWorkflowRequest request,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (request.Graph?.Trigger is null)
            return Problem("Add a starting step before you run a test.");
        if (!await db.Applications.AnyAsync(x => x.Id == request.ApplicationId, ct))
            return Problem("Pick an application to test with.");
        var steps = await WorkflowEngine.DryRunAsync(
            db,
            request.Graph,
            request.ApplicationId,
            w,
            ct
        );
        return Results.Ok(new { Steps = steps });
    }

    private static async Task<IResult> TestEmailAsync(
        Guid id,
        TestEmailRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var w = await db.Workflows.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (w is null)
            return Missing();
        if (request.Node?.Kind != "action.send_email")
            return Problem("Pick an email step to test.");
        var problems = WorkflowGraph
            .Validate(new([request.Node], []))
            .Where(x => x.NodeIds.Contains(request.Node.Id) && !x.Message.Contains("not linked"));
        if (problems.FirstOrDefault() is { } problem)
            return Problem(problem.Message);
        var applicationId =
            request.ApplicationId
            ?? await db
                .Applications.AsNoTracking()
                .OrderBy(x => x.Status == ApplicationStatus.Active ? 0 : 1)
                .ThenByDescending(x => x.LastActivityAt)
                .Select(x => (Guid?)x.Id)
                .FirstOrDefaultAsync(ct);
        if (
            applicationId is null
            || !await db.Applications.AnyAsync(x => x.Id == applicationId, ct)
        )
            return Problem("Add an application first. The test fills in its details.");
        var email = await WorkflowEngine.TestEmailAsync(
            db,
            request.Node,
            applicationId.Value,
            w,
            principal.Email(),
            ct
        );
        if (email is null)
            return Problem("This step has nothing to send for that application.");
        var candidate = await db
            .Applications.Where(x => x.Id == applicationId)
            .Select(x => x.Candidate!.FirstName + " " + x.Candidate.LastName)
            .SingleAsync(ct);
        return Results.Ok(
            new
            {
                email.Recipient,
                email.Subject,
                CandidateName = candidate,
            }
        );
    }

    // ----- Lookups

    public static readonly string[] Reasons =
    [
        "Does not meet minimum requirements",
        "Skills mismatch",
        "Experience mismatch",
        "Compensation mismatch",
        "Location or availability",
        "Withdrew",
        "Position closed",
        "Other",
    ];

    private static async Task<IResult> LookupsAsync(AtsDbContext db, CancellationToken ct)
    {
        var jobs = await db
            .Requisitions.AsNoTracking()
            .Where(x => x.Status != RequisitionStatus.Cancelled)
            .OrderBy(x => x.Title)
            .Select(x => new
            {
                x.Id,
                x.Title,
                x.Code,
                x.Department,
                x.Status,
            })
            .ToListAsync(ct);
        var stages = await db
            .PipelineStages.AsNoTracking()
            .Where(x => x.Requisition!.Status != RequisitionStatus.Cancelled)
            .GroupBy(x => x.Name)
            .Select(g => new
            {
                Name = g.Key,
                Jobs = g.Count(),
                Type = g.Min(x => x.Type),
            })
            .OrderBy(x => x.Type)
            .ThenBy(x => x.Name)
            .ToListAsync(ct);
        var usedReasons = await db
            .Applications.AsNoTracking()
            .Where(x => x.DispositionReason != null)
            .Select(x => x.DispositionReason!)
            .Distinct()
            .Take(50)
            .ToListAsync(ct);
        var sources = await db
            .Applications.AsNoTracking()
            .GroupBy(x => x.Source)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .Take(50)
            .ToListAsync(ct);
        var tags = await db
            .Candidates.AsNoTracking()
            .SelectMany(x => x.Tags)
            .Distinct()
            .OrderBy(x => x)
            .Take(300)
            .ToListAsync(ct);
        var people = await db
            .Users.AsNoTracking()
            .Where(x => x.IsActive)
            .OrderBy(x => x.DisplayName)
            .Select(x => new
            {
                x.Email,
                Name = x.DisplayName,
                x.Role,
            })
            .ToListAsync(ct);
        var assessments = await db
            .Assessments.AsNoTracking()
            .Where(x => x.Status != AssessmentStatus.Archived)
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                x.Id,
                x.Name,
                Published = x.Status == AssessmentStatus.Active && x.CurrentVersionId != null,
            })
            .ToListAsync(ct);
        var webhooks = await db
            .WebhookEndpoints.AsNoTracking()
            .OrderBy(x => x.CreatedAt)
            .Select(x => new
            {
                x.Id,
                x.Url,
                x.IsActive,
            })
            .ToListAsync(ct);
        var customFields = await db
            .CustomFieldDefinitions.AsNoTracking()
            .OrderBy(x => x.SortOrder)
            .Select(x => new
            {
                x.Key,
                x.Label,
                x.Type,
                x.Options,
            })
            .ToListAsync(ct);
        var org = await db
            .Organizations.AsNoTracking()
            .Select(x => new
            {
                x.NotificationWebhookUrl,
                x.QuietHoursStart,
                x.QuietHoursEnd,
                x.TimeZone,
            })
            .FirstOrDefaultAsync(ct);
        return Results.Ok(
            new
            {
                Jobs = jobs,
                Departments = jobs.Select(x => x.Department)
                    .Where(x => x.Length > 0)
                    .Distinct()
                    .Order(),
                StageTypes = Enum.GetNames<StageType>(),
                Stages = stages,
                Reasons = Reasons.Union(usedReasons).ToList(),
                Sources = sources,
                Tags = tags,
                People = people,
                Templates = WorkflowEmails.All.Select(x => new
                {
                    x.Key,
                    x.Label,
                    x.Variables,
                }),
                Variables = WorkflowEmails.Variables.Select(x => new
                {
                    Key = x.Key,
                    Label = x.Value,
                }),
                Webhooks = webhooks,
                Assessments = assessments,
                Dates = WorkflowEngine
                    .DateLabels.Select(x => new { Value = x.Key, Label = x.Value })
                    .Concat(
                        customFields
                            .Where(x => x.Type == "date")
                            .Select(x => new { Value = $"custom:{x.Key}", x.Label })
                    ),
                Fields = WorkflowEngine
                    .FieldLabels.Select(x => new
                    {
                        Value = x.Key,
                        Label = x.Value,
                        Type = x.Key is "rating" or "years" or "assessmentScore"
                            ? "number"
                            : "text",
                        Options = (string[]?)null,
                    })
                    .Concat(
                        customFields.Select(x => new
                        {
                            Value = $"custom:{x.Key}",
                            x.Label,
                            Type = x.Type == "number" ? "number" : "text",
                            Options = (string[]?)(x.Options.Length > 0 ? x.Options : null),
                        })
                    ),
                TeamChannel = !string.IsNullOrWhiteSpace(org?.NotificationWebhookUrl),
                QuietHours = org is null || org.QuietHoursStart == org.QuietHoursEnd
                    ? null
                    : new
                    {
                        Start = org.QuietHoursStart,
                        End = org.QuietHoursEnd,
                        org.TimeZone,
                    },
            }
        );
    }

    /// <summary>Applications to test a workflow with, found by candidate name, email or job.</summary>
    private static async Task<IResult> SearchApplicationsAsync(
        string? q,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var query = db.Applications.AsNoTracking();
        var text = q?.Trim().ToLower() ?? "";
        if (text.Length > 0)
            query = query.Where(x =>
                (x.Candidate!.FirstName + " " + x.Candidate.LastName).ToLower().Contains(text)
                || x.Candidate.Email.ToLower().Contains(text)
                || x.Requisition!.Title.ToLower().Contains(text)
            );
        return Results.Ok(
            await query
                .OrderBy(x => x.Status == ApplicationStatus.Active ? 0 : 1)
                .ThenByDescending(x => x.LastActivityAt)
                .Take(20)
                .Select(x => new
                {
                    x.Id,
                    CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                    JobTitle = x.Requisition!.Title,
                    Stage = x.PipelineStage!.Name,
                    x.Status,
                })
                .ToListAsync(ct)
        );
    }

    // ----- Reminders (the simple front for the built-in workflows)

    private static async Task<IResult> RemindersAsync(AtsDbContext db, CancellationToken ct)
    {
        await BuiltInWorkflows.EnsureAsync(db, ct);
        var workflows = await db
            .Workflows.AsNoTracking()
            .Include(x => x.PublishedVersion)
            .Where(x => x.BuiltInKey != null)
            .ToListAsync(ct);
        var monthAgo = DateTimeOffset.UtcNow.AddDays(-30);
        var ids = workflows.Select(x => x.Id).ToList();
        var runs = await db
            .WorkflowRuns.AsNoTracking()
            .Where(x => ids.Contains(x.WorkflowId) && x.StartedAt > monthAgo)
            .GroupBy(x => x.WorkflowId)
            .Select(g => new { g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
        return Results.Ok(
            BuiltInWorkflows
                .All.Where(def => def.Reminder)
                .Select(def =>
                {
                    var w = workflows.FirstOrDefault(x => x.BuiltInKey == def.Key);
                    var trigger = w?.PublishedVersion is null
                        ? null
                        : WorkflowGraph.Parse(w.PublishedVersion.GraphJson).Trigger;
                    return new
                    {
                        def.Key,
                        WorkflowId = w?.Id,
                        Name = w?.Name ?? def.Name,
                        def.Description,
                        Enabled = w?.Status == WorkflowStatus.Active,
                        // Null: the day count lives somewhere else (each assessment has its own).
                        Days = trigger is null || !trigger.Values.ContainsKey("days")
                            ? (int?)null
                            : WorkflowGraph.Days(trigger),
                        MaxReminders = w?.MaxRunsPerApplication ?? 3,
                        Runs30 = w is null ? 0 : runs.GetValueOrDefault(w.Id),
                    };
                })
        );
    }

    private static async Task<IResult> SaveReminderAsync(
        string key,
        SaveReminderRequest request,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        if (request.MaxReminders is < 1 or > 10)
            return Problem("Use 1 to 10 reminders.");
        await BuiltInWorkflows.EnsureAsync(db, ct);
        var w = await db
            .Workflows.Include(x => x.PublishedVersion)
            .SingleOrDefaultAsync(x => x.BuiltInKey == key, ct);
        if (w?.PublishedVersion is null)
            return Results.NotFound(new { message = "That reminder doesn't exist." });
        var published = WorkflowGraph.Parse(w.PublishedVersion.GraphJson);
        var trigger = published.Trigger!;
        var hasDays = trigger.Values.ContainsKey("days");
        if (hasDays && request.Days is not (>= 1 and <= 60))
            return Problem("Use 1 to 60 days.");
        if (hasDays && WorkflowGraph.Days(trigger) != request.Days)
        {
            // The day count changes in the running version and in the draft, leaving other draft edits alone.
            Graph WithDays(Graph g) =>
                g with
                {
                    Nodes = g
                        .Nodes.Select(n =>
                            WorkflowGraph.IsTrigger(n.Kind)
                                ? n with
                                {
                                    Values = new(n.Values) { ["days"] = request.Days.ToString() },
                                }
                                : n
                        )
                        .ToList(),
                };
            var next = WithDays(published);
            var number =
                await db
                    .WorkflowVersions.Where(x => x.WorkflowId == w.Id)
                    .MaxAsync(x => x.Number, ct) + 1;
            var version = new WorkflowVersion
            {
                WorkflowId = w.Id,
                Number = number,
                GraphJson = WorkflowGraph.Serialize(next),
                Note = "Changed on the Reminders page.",
                Summary =
                    $"Changed {WorkflowGraph.Label(trigger)} to {request.Days} {(request.Days == 1 ? "day" : "days")}.",
                PublishedBy = principal.Email(),
            };
            db.WorkflowVersions.Add(version);
            await db.SaveChangesAsync(ct);
            w.PublishedVersionId = version.Id;
            w.DraftGraphJson = WorkflowGraph.Serialize(
                WithDays(WorkflowGraph.Parse(w.DraftGraphJson))
            );
        }
        w.MaxRunsPerApplication = request.MaxReminders;
        w.RunsOncePerApplication = false;
        w.Status = request.Enabled ? WorkflowStatus.Active : WorkflowStatus.Paused;
        w.UpdatedAt = DateTimeOffset.UtcNow;
        w.UpdatedBy = principal.Email();
        // Mirrored into the organization's reminder columns: the daily quiet summary, reports and
        // the dashboard read StaleReminderDays, feedback due dates ScorecardReminderDays, and
        // scheduling-link and approval reminders BookReminderDays and MaxReminders.
        var org = await db.Organizations.FirstOrDefaultAsync(ct);
        if (org is not null && key != BuiltInWorkflows.Assessment)
        {
            switch (key)
            {
                case BuiltInWorkflows.Booking:
                    org.BookReminderDays = request.Days ?? org.BookReminderDays;
                    break;
                case BuiltInWorkflows.Scorecard:
                    org.ScorecardReminderDays = request.Days ?? org.ScorecardReminderDays;
                    break;
                case BuiltInWorkflows.Stale:
                    org.StaleReminderDays = request.Days ?? org.StaleReminderDays;
                    break;
            }
            org.MaxReminders = request.MaxReminders;
        }
        Audit.Add(
            db,
            principal,
            "Workflow",
            w.Id,
            "ReminderChanged",
            new
            {
                request.Enabled,
                request.Days,
                request.MaxReminders,
            }
        );
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}
