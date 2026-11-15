using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Features.Workflows;

/// <summary>Something that happened to an application, with the details a trigger can filter on.</summary>
public sealed record WorkflowEvent(
    string Kind,
    Guid ApplicationId,
    Dictionary<string, string> Facts
);

/// <summary>
/// Starts workflow runs. Events are read from what a save changes, like WebhookEvents, so no
/// endpoint can forget one; time triggers ("stuck for 5 days") come from <see cref="SweepAsync"/>.
/// </summary>
public static class WorkflowTriggers
{
    /// <summary>Runs started by a workflow's own steps can chain this deep, and no deeper.</summary>
    public const int MaxDepth = 4;

    private sealed record AppFacts(
        Guid Id,
        Guid RequisitionId,
        string Source,
        ApplicationStatus Status
    );

    private sealed record ActiveWorkflow(
        Guid Id,
        string Kind,
        Guid? VersionId,
        bool Once,
        int? Max,
        bool StopWhenClosed,
        string? GraphJson
    );

    /// <summary>Called before every save (ChangeInterceptor): queues a run for each active workflow an event matches.</summary>
    public static async Task CollectAsync(AtsDbContext db, CancellationToken ct)
    {
        var events = await DetectAsync(db, ct);
        events.AddRange(db.PendingWorkflowEvents);
        db.PendingWorkflowEvents.Clear();
        if (events.Count == 0)
            return;
        var kinds = events.Select(x => x.Kind).Distinct().ToList();
        var workflows = await db
            .Workflows.AsNoTracking()
            .Where(x =>
                x.Status == WorkflowStatus.Active
                && x.PublishedVersionId != null
                && x.TriggerKind != null
                && kinds.Contains(x.TriggerKind)
            )
            .Select(x => new ActiveWorkflow(
                x.Id,
                x.TriggerKind!,
                x.PublishedVersionId,
                x.RunsOncePerApplication,
                x.MaxRunsPerApplication,
                x.StopWhenClosed,
                x.PublishedVersion!.GraphJson
            ))
            .ToListAsync(ct);
        if (workflows.Count == 0)
            return;

        var appIds = events.Select(x => x.ApplicationId).Distinct().ToList();
        var apps = (
            await db
                .Applications.AsNoTracking()
                .Where(x => appIds.Contains(x.Id))
                .Select(x => new AppFacts(x.Id, x.RequisitionId, x.Source, x.Status))
                .ToListAsync(ct)
        ).ToDictionary(x => x.Id);
        // What this save is about to write wins over what the database still says.
        foreach (var entry in db.ChangeTracker.Entries<Application>())
            if (appIds.Contains(entry.Entity.Id))
                apps[entry.Entity.Id] = new(
                    entry.Entity.Id,
                    entry.Entity.RequisitionId,
                    entry.Entity.Source,
                    entry.Entity.Status
                );
        var jobIds = apps.Values.Select(x => x.RequisitionId).Distinct().ToList();
        var departments = await db
            .Requisitions.AsNoTracking()
            .Where(x => jobIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Department, ct);
        var stageIds = events
            .Select(x => x.Facts.GetValueOrDefault("stageId"))
            .Where(x => x is not null)
            .Select(x => Guid.Parse(x!))
            .Distinct()
            .ToList();
        var stages = await db
            .PipelineStages.AsNoTracking()
            .Where(x => stageIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => (x.Name, x.Type), ct);
        var counts = await RunCountsAsync(db, workflows.Select(x => x.Id), appIds, ct);

        var running = db.RunningWorkflow;
        var depth = running is null ? 0 : running.Value.Depth + 1;
        if (depth > MaxDepth)
            return;
        foreach (var e in events)
        {
            if (!apps.TryGetValue(e.ApplicationId, out var app))
                continue;
            foreach (var workflow in workflows.Where(x => x.Kind == e.Kind))
            {
                // A workflow's own changes never start it again.
                if (running?.WorkflowId == workflow.Id)
                    continue;
                var trigger = WorkflowGraph.Parse(workflow.GraphJson).Trigger;
                if (trigger is null || workflow.VersionId is null)
                    continue;
                if (
                    workflow.StopWhenClosed
                    && app.Status != ApplicationStatus.Active
                    && e.Kind != "trigger.candidate_rejected"
                )
                    continue;
                if (
                    !Matches(
                        trigger,
                        e,
                        app,
                        departments.GetValueOrDefault(app.RequisitionId),
                        stages
                    )
                )
                    continue;
                var key = (workflow.Id, app.Id);
                var count = counts.GetValueOrDefault(key);
                if (workflow.Once ? count > 0 : count >= (workflow.Max ?? int.MaxValue))
                    continue;
                counts[key] = count + 1;
                db.WorkflowRuns.Add(
                    new WorkflowRun
                    {
                        WorkflowId = workflow.Id,
                        VersionId = workflow.VersionId.Value,
                        ApplicationId = app.Id,
                        TriggerKind = e.Kind,
                        CurrentNodeId = trigger.Id,
                        DedupeKey = workflow.Once ? "once" : null,
                        ContextJson = JsonSerializer.Serialize(e.Facts),
                        Depth = depth,
                    }
                );
            }
        }
    }

    private static bool Matches(
        GraphNode trigger,
        WorkflowEvent e,
        AppFacts app,
        string? department,
        Dictionary<Guid, (string Name, StageType Type)> stages
    )
    {
        if (!WorkflowGraph.JobMatches(trigger.V("job"), app.RequisitionId, department))
            return false;
        string Fact(string key) => e.Facts.GetValueOrDefault(key) ?? "";
        bool AnyOr(string value, string actual) =>
            value is "" or "any" || value.Equals(actual.Trim(), StringComparison.OrdinalIgnoreCase);
        switch (e.Kind)
        {
            case "trigger.application_created":
                return AnyOr(trigger.V("source"), app.Source);
            case "trigger.stage_entered" or "trigger.stage_left":
                var stage =
                    Guid.TryParse(Fact("stageId"), out var id) && stages.TryGetValue(id, out var s)
                        ? s
                        : default;
                return WorkflowGraph.StageMatches(
                    trigger.V("stage"),
                    stage.Name,
                    stage.Name is null ? null : stage.Type
                );
            case "trigger.candidate_rejected":
                return AnyOr(trigger.V("reason"), Fact("reason"));
            case "trigger.scorecard_submitted":
                return trigger.V("recommendation") switch
                {
                    "positive" => Fact("recommendation") is "Yes" or "StrongYes",
                    "mixed" => Fact("recommendation") == "Mixed",
                    "negative" => Fact("recommendation") is "No" or "StrongNo",
                    _ => true,
                };
            case "trigger.tag_added":
                return trigger.V("tag").Equals(Fact("tag"), StringComparison.OrdinalIgnoreCase);
            case "trigger.assessment_completed":
                return WorkflowGraph.AssessmentMatches(
                    trigger.V("assessment"),
                    Fact("assessmentId")
                );
            default:
                return true;
        }
    }

    private static async Task<Dictionary<(Guid, Guid), int>> RunCountsAsync(
        AtsDbContext db,
        IEnumerable<Guid> workflowIds,
        List<Guid> appIds,
        CancellationToken ct
    )
    {
        var ids = workflowIds.ToList();
        var counts = (
            await db
                .WorkflowRuns.AsNoTracking()
                .Where(x => ids.Contains(x.WorkflowId) && appIds.Contains(x.ApplicationId))
                .GroupBy(x => new { x.WorkflowId, x.ApplicationId })
                .Select(x => new
                {
                    x.Key.WorkflowId,
                    x.Key.ApplicationId,
                    Count = x.Count(),
                })
                .ToListAsync(ct)
        ).ToDictionary(x => (x.WorkflowId, x.ApplicationId), x => x.Count);
        // Runs added earlier in this same save count too.
        foreach (var entry in db.ChangeTracker.Entries<WorkflowRun>())
            if (entry.State == EntityState.Added)
                counts[(entry.Entity.WorkflowId, entry.Entity.ApplicationId)] =
                    counts.GetValueOrDefault((entry.Entity.WorkflowId, entry.Entity.ApplicationId))
                    + 1;
        return counts;
    }

    /// <summary>
    /// For events no tracked change shows, published through <c>PipelineEvents.PublishAsync</c>
    /// (today assessment.completed). They wait on the context and start runs when it saves.
    /// </summary>
    public static void Published(AtsDbContext db, string eventType, object data)
    {
        if (eventType != "assessment.completed")
            return;
        var json = JsonSerializer.SerializeToElement(data);
        if (
            !json.TryGetProperty("applicationId", out var app)
            || !app.TryGetGuid(out var applicationId)
        )
            return;
        var facts = new Dictionary<string, string>();
        foreach (var name in new[] { "inviteId", "assessmentId", "percent" })
            if (json.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null)
                facts[name] = value.ToString();
        db.PendingWorkflowEvents.Add(new("trigger.assessment_completed", applicationId, facts));
    }

    /// <summary>The workflow events in the tracked changes of one save.</summary>
    public static async Task<List<WorkflowEvent>> DetectAsync(AtsDbContext db, CancellationToken ct)
    {
        var events = new List<WorkflowEvent>();
        var scorecards = new List<(Guid InterviewId, string Recommendation)>();
        var tagged = new List<(Guid CandidateId, string Tag)>();
        void Add(string kind, Guid applicationId, params (string Key, string? Value)[] facts) =>
            events.Add(
                new(
                    kind,
                    applicationId,
                    facts.Where(x => x.Value is not null).ToDictionary(x => x.Key, x => x.Value!)
                )
            );

        foreach (var entry in db.ChangeTracker.Entries())
        {
            var added = entry.State == EntityState.Added;
            if (!added && entry.State != EntityState.Modified)
                continue;
            // The value before this save, or null when the row is new or the property did not change.
            T? Was<T>(string property)
                where T : struct =>
                !added && entry.Property(property).IsModified
                    ? (T?)entry.Property(property).OriginalValue
                    : null;
            bool Became<T>(string property, T value)
                where T : struct, Enum =>
                EqualityComparer<T>.Default.Equals((T)entry.Property(property).CurrentValue!, value)
                && (
                    added
                    || (
                        Was<T>(property) is { } was
                        && !EqualityComparer<T>.Default.Equals(was, value)
                    )
                );

            switch (entry.Entity)
            {
                case Application a:
                    if (
                        (added && a.Status == ApplicationStatus.Active)
                        || Was<ApplicationStatus>("Status") == ApplicationStatus.PendingVerification
                            && a.Status == ApplicationStatus.Active
                    )
                        Add("trigger.application_created", a.Id);
                    if (Was<Guid>("PipelineStageId") is { } from && from != a.PipelineStageId)
                    {
                        Add("trigger.stage_left", a.Id, ("stageId", from.ToString()));
                        Add(
                            "trigger.stage_entered",
                            a.Id,
                            ("stageId", a.PipelineStageId.ToString())
                        );
                    }
                    if (!added && Became("Status", ApplicationStatus.Rejected))
                        Add("trigger.candidate_rejected", a.Id, ("reason", a.DispositionReason));
                    break;
                case Interview i:
                    var interview = ("interviewId", (string?)i.Id.ToString());
                    var title = ("interviewTitle", (string?)i.Title);
                    if (Became("Status", InterviewStatus.Scheduled))
                        Add("trigger.interview_scheduled", i.ApplicationId, interview, title);
                    if (Became("Status", InterviewStatus.Completed))
                        Add("trigger.interview_completed", i.ApplicationId, interview, title);
                    if (Became("Status", InterviewStatus.NoShow))
                        Add("trigger.interview_no_show", i.ApplicationId, interview, title);
                    break;
                case Scorecard s when added:
                    scorecards.Add((s.InterviewId, s.Recommendation.ToString()));
                    break;
                case Offer o when !added:
                    var offer = ("offerId", (string?)o.Id.ToString());
                    if (Became("Status", OfferStatus.Sent))
                        Add("trigger.offer_sent", o.ApplicationId, offer);
                    if (Became("Status", OfferStatus.Accepted))
                        Add("trigger.offer_accepted", o.ApplicationId, offer);
                    if (Became("Status", OfferStatus.Declined))
                        Add("trigger.offer_declined", o.ApplicationId, offer);
                    break;
                case ApplicationMessage m when added && m.FromCandidate:
                    Add("trigger.candidate_replied", m.ApplicationId);
                    break;
                case Candidate c when !added && entry.Property("Tags").IsModified:
                    var before = (string[]?)entry.Property("Tags").OriginalValue ?? [];
                    foreach (var tag in c.Tags.Except(before, StringComparer.OrdinalIgnoreCase))
                        tagged.Add((c.Id, tag));
                    break;
            }
        }

        if (scorecards.Count > 0)
        {
            var interviewIds = scorecards.Select(x => x.InterviewId).ToList();
            var owners = await db
                .Interviews.AsNoTracking()
                .Where(x => interviewIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id, x => x.ApplicationId, ct);
            foreach (var (interviewId, recommendation) in scorecards)
                if (owners.TryGetValue(interviewId, out var applicationId))
                    Add(
                        "trigger.scorecard_submitted",
                        applicationId,
                        ("interviewId", interviewId.ToString()),
                        ("recommendation", recommendation)
                    );
        }
        if (tagged.Count > 0)
        {
            var candidateIds = tagged.Select(x => x.CandidateId).Distinct().ToList();
            var applications = await db
                .Applications.AsNoTracking()
                .Where(x =>
                    candidateIds.Contains(x.CandidateId) && x.Status == ApplicationStatus.Active
                )
                .Select(x => new { x.Id, x.CandidateId })
                .ToListAsync(ct);
            foreach (var (candidateId, tag) in tagged)
            foreach (var application in applications.Where(x => x.CandidateId == candidateId))
                Add("trigger.tag_added", application.Id, ("tag", tag));
        }
        return events;
    }

    private sealed record TimeHit(
        Guid ApplicationId,
        Guid RequisitionId,
        string? Department,
        string Subject,
        Dictionary<string, string> Facts,
        string? StageName = null,
        StageType? StageType = null,
        int? CooldownDays = null
    );

    /// <summary>
    /// Starts runs for time triggers: stuck in a stage, interview time not picked, feedback overdue.
    /// Each repeats at most once per its day count, up to the workflow's limit.
    /// </summary>
    /// <remarks>ponytail: 500 matches per workflow per sweep; the rest start on the next sweep a minute later.</remarks>
    public static async Task<int> SweepAsync(
        AtsDbContext db,
        DateTimeOffset now,
        bool includeBuiltIns,
        CancellationToken ct
    )
    {
        var workflows = await db
            .Workflows.AsNoTracking()
            .Where(x =>
                x.Status == WorkflowStatus.Active
                && x.PublishedVersionId != null
                && WorkflowGraph.TimeTriggers.Contains(x.TriggerKind!)
                && (includeBuiltIns || x.BuiltInKey == null)
            )
            .Select(x => new ActiveWorkflow(
                x.Id,
                x.TriggerKind!,
                x.PublishedVersionId,
                x.RunsOncePerApplication,
                x.MaxRunsPerApplication,
                x.StopWhenClosed,
                x.PublishedVersion!.GraphJson
            ))
            .ToListAsync(ct);
        var started = 0;
        foreach (var workflow in workflows)
        {
            var trigger = WorkflowGraph.Parse(workflow.GraphJson).Trigger;
            if (trigger is null)
                continue;
            var cutoff = now.AddDays(-WorkflowGraph.Days(trigger));
            var hits = (await TimeHitsAsync(db, workflow.Kind, cutoff, now, ct))
                .Where(x =>
                    WorkflowGraph.JobMatches(trigger.V("job"), x.RequisitionId, x.Department)
                    && WorkflowGraph.AssessmentMatches(
                        trigger.V("assessment"),
                        x.Facts.GetValueOrDefault("assessmentId")
                    )
                    && (
                        workflow.Kind != "trigger.stuck"
                        || WorkflowGraph.StageMatches(trigger.V("stage"), x.StageName, x.StageType)
                    )
                )
                .ToList();
            if (hits.Count == 0)
                continue;
            var appIds = hits.Select(x => x.ApplicationId).Distinct().ToList();
            var previous = await db
                .WorkflowRuns.AsNoTracking()
                .Where(x => x.WorkflowId == workflow.Id && appIds.Contains(x.ApplicationId))
                .GroupBy(x => new { x.ApplicationId, x.Subject })
                .Select(x => new
                {
                    x.Key.ApplicationId,
                    x.Key.Subject,
                    Count = x.Count(),
                    Last = x.Max(r => r.StartedAt),
                })
                .ToListAsync(ct);
            foreach (var hit in hits)
            {
                var runs = previous.Where(x => x.ApplicationId == hit.ApplicationId).ToList();
                var same = runs.FirstOrDefault(x => x.Subject == hit.Subject);
                if (
                    workflow.Once
                        ? runs.Count > 0
                        : same is not null
                            && (
                                same.Count >= (workflow.Max ?? int.MaxValue)
                                || same.Last
                                    > (hit.CooldownDays is { } d ? now.AddDays(-d) : cutoff)
                            )
                )
                    continue;
                db.WorkflowRuns.Add(
                    new WorkflowRun
                    {
                        WorkflowId = workflow.Id,
                        VersionId = workflow.VersionId!.Value,
                        ApplicationId = hit.ApplicationId,
                        TriggerKind = workflow.Kind,
                        Subject = hit.Subject,
                        DedupeKey = workflow.Once
                            ? "once"
                            : $"{hit.Subject}#{(same?.Count ?? 0) + 1}",
                        CurrentNodeId = trigger.Id,
                        ContextJson = JsonSerializer.Serialize(hit.Facts),
                        StartedAt = now,
                        NextRunAt = now,
                    }
                );
                started++;
            }
            await db.SaveChangesAsync(ct);
        }
        return started;
    }

    private static async Task<List<TimeHit>> TimeHitsAsync(
        AtsDbContext db,
        string kind,
        DateTimeOffset cutoff,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        switch (kind)
        {
            case "trigger.assessment_unfinished":
                // Each assessment says after how many days to remind; one with reminders off is skipped.
                return (
                    await db
                        .AssessmentInvites.AsNoTracking()
                        .Where(x =>
                            (
                                x.Status == AssessmentInviteStatus.NotStarted
                                || x.Status == AssessmentInviteStatus.InProgress
                            )
                            && x.ReplacedAt == null
                            && x.ExpiresAt > now.AddHours(2)
                            && x.Assessment!.RemindAfterDays != null
                            && x.Application!.Status == ApplicationStatus.Active
                        )
                        .OrderBy(x => x.InvitedAt)
                        .Take(500)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.AssessmentId,
                            x.Assessment!.Name,
                            Days = x.Assessment.RemindAfterDays!.Value,
                            x.InvitedAt,
                            x.Application!.RequisitionId,
                            x.Application.Requisition!.Department,
                        })
                        .ToListAsync(ct)
                )
                    .Where(x => x.InvitedAt.AddDays(x.Days) <= now)
                    .Select(x => new TimeHit(
                        x.ApplicationId,
                        x.RequisitionId,
                        x.Department,
                        $"invite:{x.Id}",
                        new()
                        {
                            ["inviteId"] = x.Id.ToString(),
                            ["assessmentId"] = x.AssessmentId.ToString(),
                            ["assessmentName"] = x.Name,
                        },
                        CooldownDays: x.Days
                    ))
                    .ToList();
            case "trigger.stuck":
                return (
                    await db
                        .Applications.AsNoTracking()
                        .Where(x =>
                            x.Status == ApplicationStatus.Active
                            && x.LastActivityAt < cutoff
                            && !x.PipelineStage!.IsTerminal
                            // Waiting on the candidate to pick a time is not stuck.
                            && !x.Interviews.Any(i => i.Status == InterviewStatus.Proposed)
                        )
                        .OrderBy(x => x.LastActivityAt)
                        .Take(500)
                        .Select(x => new
                        {
                            x.Id,
                            x.RequisitionId,
                            x.Requisition!.Department,
                            x.PipelineStageId,
                            x.PipelineStage!.Name,
                            x.PipelineStage.Type,
                        })
                        .ToListAsync(ct)
                ).Select(x => new TimeHit(x.Id, x.RequisitionId, x.Department, "", new() { ["stageId"] = x.PipelineStageId.ToString() }, x.Name, x.Type)).ToList();
            case "trigger.booking_unanswered":
                return (
                    await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            x.Status == InterviewStatus.Proposed
                            && x.Application!.Status == ApplicationStatus.Active
                            && x.CreatedAt < cutoff
                        )
                        .OrderBy(x => x.CreatedAt)
                        .Take(500)
                        .Select(x => new
                        {
                            x.ApplicationId,
                            x.Title,
                            x.Application!.RequisitionId,
                            x.Application.Requisition!.Department,
                        })
                        .ToListAsync(ct)
                )
                    // Several offered times belong to one request: one run per application.
                    .GroupBy(x => x.ApplicationId)
                    .Select(g => new TimeHit(
                        g.Key,
                        g.First().RequisitionId,
                        g.First().Department,
                        "",
                        new() { ["interviewTitle"] = g.First().Title }
                    ))
                    .ToList();
            case "trigger.scorecard_overdue":
                return (
                    await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            // Marking an interview completed must not silence the reminders.
                            (
                                x.Status == InterviewStatus.Scheduled
                                || x.Status == InterviewStatus.Completed
                            )
                            && x.EndsAt < cutoff
                        )
                        .OrderByDescending(x => x.EndsAt)
                        .Take(500)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.InterviewerEmails,
                            Submitted = x.Scorecards.Select(s => s.InterviewerEmail).ToList(),
                            x.Application!.RequisitionId,
                            x.Application.Requisition!.Department,
                        })
                        .ToListAsync(ct)
                ).Where(x => x.InterviewerEmails.Any(e => !x.Submitted.Contains(e, StringComparer.OrdinalIgnoreCase))).Select(x => new TimeHit(x.ApplicationId, x.RequisitionId, x.Department, $"interview:{x.Id}", new() { ["interviewId"] = x.Id.ToString(), ["interviewTitle"] = x.Title })).ToList();
            default:
                return [];
        }
    }

    /// <summary>Active applications already in the stage a "moves into a stage" trigger watches.</summary>
    public static async Task<List<Guid>> AlreadyInStageAsync(
        AtsDbContext db,
        GraphNode trigger,
        CancellationToken ct
    )
    {
        if (trigger.Kind != "trigger.stage_entered")
            return [];
        var rows = await db
            .Applications.AsNoTracking()
            .Where(x => x.Status == ApplicationStatus.Active)
            .Select(x => new
            {
                x.Id,
                x.RequisitionId,
                x.Requisition!.Department,
                x.PipelineStage!.Name,
                x.PipelineStage.Type,
            })
            .ToListAsync(ct);
        return rows.Where(x =>
                WorkflowGraph.JobMatches(trigger.V("job"), x.RequisitionId, x.Department)
                && WorkflowGraph.StageMatches(trigger.V("stage"), x.Name, x.Type)
            )
            .Select(x => x.Id)
            .ToList();
    }
}
