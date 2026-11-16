using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Features.Workflows;

/// <summary>What one step did. Status is Done, Skipped or Waiting.</summary>
public sealed record StepOutcome(
    string Status,
    string? Branch,
    string Output,
    object? Detail = null,
    DateTimeOffset? WaitUntil = null
);

/// <summary>One step of a dry run, as the editor's test panel shows it.</summary>
public sealed record DryStep(
    string NodeId,
    string Kind,
    string Title,
    string Status,
    string? Branch,
    string Output,
    object? Detail
);

/// <summary>An email a step wrote to the outbox (or would have, in a test).</summary>
public sealed record SentEmail(Guid Id, string Recipient, string Subject, string Body);

/// <summary>
/// Moves runs through their steps. Every action writes to an existing outbox or record (emails,
/// webhook deliveries, stage moves, tags) in the same save as the step's log row and the run's move
/// to the next step, so a step's effects happen exactly once. The dry run calls the same steps and
/// never saves.
/// </summary>
public static class WorkflowEngine
{
    /// <summary>Waits before retrying a failed step; after the last one the run is marked Failed.</summary>
    public static readonly TimeSpan[] Backoff =
    [
        TimeSpan.FromMinutes(1),
        TimeSpan.FromMinutes(5),
        TimeSpan.FromMinutes(30),
        TimeSpan.FromMinutes(120),
    ];

    private sealed class Ctx
    {
        public required AtsDbContext Db { get; init; }
        public required Application App { get; init; }
        public required Organization? Org { get; init; }
        public required Guid WorkflowId { get; init; }
        public required string WorkflowName { get; init; }

        /// <summary>Empty in a dry run.</summary>
        public Guid RunId { get; init; }
        public required DateTimeOffset StartedAt { get; init; }
        public required DateTimeOffset Now { get; init; }
        public required Dictionary<string, string> Facts { get; init; }
        public bool DryRun { get; init; }
        public Candidate Candidate => App.Candidate!;
        public Requisition Job => App.Requisition!;
        public PipelineStage? Stage => Job.Stages.FirstOrDefault(x => x.Id == App.PipelineStageId);
        public string Actor => $"workflow:{WorkflowId}";
    }

    /// <summary>Runs the oldest due run, if any. Returns whether there was one.</summary>
    public static async Task<bool> RunDueAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var id = await db
            .WorkflowRuns.AsNoTracking()
            .Where(x =>
                (x.Status == WorkflowRunStatus.Running || x.Status == WorkflowRunStatus.Waiting)
                && x.NextRunAt <= now
                && (x.LockedUntil == null || x.LockedUntil <= now)
                // A paused workflow's runs wait where they are and go on when it is resumed.
                && x.Workflow!.Status == WorkflowStatus.Active
            )
            .OrderBy(x => x.NextRunAt)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(ct);
        if (id is null)
            return false;
        await RunAsync(db, id.Value, now, ct);
        return true;
    }

    /// <summary>Claims one run and moves it until it waits, ends or fails.</summary>
    public static async Task RunAsync(
        AtsDbContext db,
        Guid runId,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        // Only one worker moves a run at a time, even with several API instances.
        var claimed = await db
            .WorkflowRuns.Where(x =>
                x.Id == runId && (x.LockedUntil == null || x.LockedUntil <= now)
            )
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.LockedUntil, now.AddMinutes(2)), ct);
        if (claimed == 0)
            return;
        try
        {
            await AdvanceAsync(db, runId, now, ct);
        }
        finally
        {
            db.RunningWorkflow = null;
            db.ChangeTracker.Clear();
            await db
                .WorkflowRuns.Where(x => x.Id == runId)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.LockedUntil, (DateTimeOffset?)null),
                    CancellationToken.None
                );
        }
    }

    private static async Task AdvanceAsync(
        AtsDbContext db,
        Guid runId,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        // The graph is acyclic (checked at publish), so this ends; the bound is a backstop.
        for (var guard = 0; guard < 200; guard++)
        {
            db.ChangeTracker.Clear();
            var run = await db
                .WorkflowRuns.Include(x => x.Workflow)
                .Include(x => x.Version)
                .SingleAsync(x => x.Id == runId, ct);
            if (run.Status is not (WorkflowRunStatus.Running or WorkflowRunStatus.Waiting))
                return;
            var graph = WorkflowGraph.Parse(run.Version!.GraphJson);
            var node = graph.Node(run.CurrentNodeId) ?? graph.Trigger;
            var ctx = await ContextAsync(
                db,
                run.ApplicationId,
                run.Workflow!,
                run.StartedAt,
                now,
                Facts(run.ContextJson),
                false,
                ct,
                run.Id
            );
            if (node is null || ctx is null)
            {
                Stop(
                    run,
                    WorkflowRunStatus.Cancelled,
                    now,
                    ctx is null
                        ? "Stopped: the application was deleted."
                        : "Stopped: the workflow has no steps."
                );
                await db.SaveChangesAsync(ct);
                return;
            }
            // Re-checked before every step, so a wait never ends in an email to someone already rejected.
            if (
                run.Workflow!.StopWhenClosed
                && run.TriggerKind != "trigger.candidate_rejected"
                && ctx.App.Status != ApplicationStatus.Active
            )
            {
                Stop(
                    run,
                    WorkflowRunStatus.Cancelled,
                    now,
                    $"Stopped: the application is {StatusWord(ctx.App.Status)}."
                );
                await db.SaveChangesAsync(ct);
                return;
            }

            var step = await db.WorkflowStepRuns.SingleOrDefaultAsync(
                x => x.RunId == run.Id && x.NodeId == node.Id,
                ct
            );
            // The log's clock: real time, so steps sort in the order they ran (never before "now").
            var stamp = DateTimeOffset.UtcNow > now ? DateTimeOffset.UtcNow : now;
            db.RunningWorkflow = (run.WorkflowId, run.Depth);
            StepOutcome outcome;
            try
            {
                if (step?.Status == "Waiting" && node.Kind == "logic.wait")
                    // A wait for a date looks again, so a moved interview moves the wait with it.
                    outcome =
                        node.V("mode") == "date"
                        && await WaitForDateAsync(ctx, node, ct) is { Status: "Waiting" } again
                        && again.WaitUntil > now
                            ? again
                            : new("Done", null, step.Output ?? "Waited.");
                else if (step?.Status == "Waiting" && node.Kind == "action.approval")
                    outcome = await ApprovalAnswerAsync(ctx, step, ct);
                else if (
                    run.Workflow.RespectQuietHours
                    && node.Kind is "action.send_email" or "action.notify"
                    && ctx.Org is { } org
                    && EmailOutboxWorker.InQuietHours(org, now)
                )
                    outcome = new(
                        "Waiting",
                        null,
                        "Held until quiet hours end.",
                        null,
                        QuietHoursEnd(org, now)
                    );
                else
                    outcome = await ExecuteAsync(ctx, node, ct);

                step ??= db
                    .WorkflowStepRuns.Add(
                        new WorkflowStepRun
                        {
                            RunId = run.Id,
                            NodeId = node.Id,
                            Kind = node.Kind,
                            StartedAt = stamp,
                        }
                    )
                    .Entity;
                step.Status = outcome.Status;
                step.Branch = outcome.Branch;
                step.Output = Clip(outcome.Output);
                step.DetailJson = outcome.Detail is null
                    ? step.DetailJson
                    : JsonSerializer.Serialize(outcome.Detail, WorkflowGraph.Json);
                step.Error = null;
                step.Attempts = run.Attempts + 1;
                step.FinishedAt = outcome.Status == "Waiting" ? null : stamp;
                run.Attempts = 0;
                run.LastError = null;
                if (outcome.Status == "Waiting")
                {
                    run.Status = WorkflowRunStatus.Waiting;
                    run.NextRunAt = outcome.WaitUntil ?? now;
                    await db.SaveChangesAsync(ct);
                    return;
                }
                if (
                    outcome.Status == "Done"
                    && node.Kind.StartsWith("action.", StringComparison.Ordinal)
                )
                    WorkflowActivity.Add(db, run, ctx.WorkflowName, node, outcome);
                var next = graph.Next(node.Id, outcome.Branch);
                if (next is null)
                    Stop(run, WorkflowRunStatus.Completed, now, null);
                else
                {
                    run.CurrentNodeId = next.Id;
                    run.Status = WorkflowRunStatus.Running;
                    run.NextRunAt = now;
                }
                // One transaction: the step's effects, its log row and the move to the next step.
                await db.SaveChangesAsync(ct);
                if (next is null)
                    return;
            }
            catch (Exception exception)
                when (exception is not OperationCanceledException || !ct.IsCancellationRequested)
            {
                db.RunningWorkflow = null;
                db.ChangeTracker.Clear();
                await FailAsync(db, runId, node, exception, now, ct);
                return;
            }
            finally
            {
                db.RunningWorkflow = null;
            }
        }
    }

    private static async Task FailAsync(
        AtsDbContext db,
        Guid runId,
        GraphNode node,
        Exception exception,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var error = Clip(
            exception is DbUpdateException { InnerException: { } inner }
                ? inner.Message
                : exception.Message
        )!;
        var run = await db.WorkflowRuns.SingleAsync(x => x.Id == runId, ct);
        var step =
            await db.WorkflowStepRuns.SingleOrDefaultAsync(
                x => x.RunId == runId && x.NodeId == node.Id,
                ct
            )
            ?? db.WorkflowStepRuns.Add(
                new WorkflowStepRun
                {
                    RunId = runId,
                    NodeId = node.Id,
                    Kind = node.Kind,
                    StartedAt = now,
                }
            ).Entity;
        run.Attempts++;
        run.LastError = error;
        step.Status = "Failed";
        step.Error = error;
        step.Attempts = run.Attempts;
        step.FinishedAt = now;
        if (run.Attempts > Backoff.Length)
            Stop(run, WorkflowRunStatus.Failed, now, error);
        else
        {
            run.Status = WorkflowRunStatus.Running;
            run.NextRunAt = now + Backoff[run.Attempts - 1];
        }
        await db.SaveChangesAsync(ct);
    }

    private static void Stop(
        WorkflowRun run,
        WorkflowRunStatus status,
        DateTimeOffset now,
        string? reason
    )
    {
        run.Status = status;
        run.FinishedAt = now;
        run.LastError = reason;
    }

    /// <summary>Walks a graph for one application without saving anything: what each step would do.</summary>
    public static async Task<List<DryStep>> DryRunAsync(
        AtsDbContext db,
        Graph graph,
        Guid applicationId,
        Workflow workflow,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var ctx =
            await ContextAsync(db, applicationId, workflow, now, now, [], true, ct)
            ?? throw new InvalidOperationException("That application no longer exists.");
        var steps = new List<DryStep>();
        var seen = new HashSet<string>();
        try
        {
            for (var node = graph.Trigger; node is not null && seen.Add(node.Id); )
            {
                StepOutcome outcome;
                try
                {
                    outcome = await ExecuteAsync(ctx, node, ct);
                }
                catch (Exception exception) when (exception is not OperationCanceledException)
                {
                    steps.Add(
                        new(
                            node.Id,
                            node.Kind,
                            WorkflowGraph.Label(node),
                            "Failed",
                            null,
                            exception.Message,
                            null
                        )
                    );
                    break;
                }
                var output =
                    outcome.Status == "Waiting"
                        ? $"{outcome.Output} A test skips the wait."
                        : outcome.Output;
                steps.Add(
                    new(
                        node.Id,
                        node.Kind,
                        WorkflowGraph.Label(node),
                        outcome.Status,
                        outcome.Branch,
                        output,
                        outcome.Detail
                    )
                );
                node = graph.Next(node.Id, outcome.Branch);
            }
        }
        finally
        {
            // Nothing a test does is kept.
            db.ChangeTracker.Clear();
        }
        return steps;
    }

    private static Dictionary<string, string> Facts(string? json) =>
        string.IsNullOrEmpty(json)
            ? []
            : JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];

    private static async Task<Ctx?> ContextAsync(
        AtsDbContext db,
        Guid applicationId,
        Workflow workflow,
        DateTimeOffset startedAt,
        DateTimeOffset now,
        Dictionary<string, string> facts,
        bool dryRun,
        CancellationToken ct,
        Guid runId = default
    )
    {
        var app = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
                .ThenInclude(x => x!.Stages)
            .SingleOrDefaultAsync(x => x.Id == applicationId, ct);
        if (app is null)
            return null;
        return new Ctx
        {
            Db = db,
            App = app,
            Org = await db.Organizations.AsNoTracking().FirstOrDefaultAsync(ct),
            WorkflowId = workflow.Id,
            WorkflowName = workflow.Name,
            RunId = runId,
            StartedAt = startedAt,
            Now = now,
            Facts = facts,
            DryRun = dryRun,
        };
    }

    private static async Task<StepOutcome> ExecuteAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        if (WorkflowGraph.IsTrigger(node.Kind))
            return new(
                "Done",
                null,
                $"Started for {ctx.Candidate.FirstName} {ctx.Candidate.LastName} ({ctx.Job.Title})."
            );
        return node.Kind switch
        {
            "logic.wait" => node.V("mode") == "date"
                ? await WaitForDateAsync(ctx, node, ct)
                : Wait(ctx, node),
            "logic.condition" => await ConditionAsync(ctx, node, ct),
            "logic.split" => await SplitAsync(ctx, node, ct),
            "action.send_email" => await SendEmailAsync(ctx, node, ct),
            "action.notify" => await NotifyAsync(ctx, node, ct),
            "action.move_stage" => await MoveStageAsync(ctx, node, ct),
            "action.reject" => await RejectAsync(ctx, node, ct),
            "action.add_tag" or "action.remove_tag" => Tags(ctx, node),
            "action.webhook" => await WebhookAsync(ctx, node, ct),
            "action.approval" => await AskApprovalAsync(ctx, node, ct),
            "action.send_assessment" => await SendAssessmentAsync(ctx, node, ct),
            _ => throw new InvalidOperationException(
                $"“{WorkflowGraph.Label(node)}” is a kind of step we no longer have."
            ),
        };
    }

    // ----- Logic

    private static StepOutcome Wait(Ctx ctx, GraphNode node)
    {
        if (!WorkflowGraph.TryDuration(node.V("duration"), out var span, out var businessDays))
            throw new InvalidOperationException("The wait has no time set.");
        var until = WaitUntil(
            ctx.Now,
            span,
            businessDays,
            node.V("window") == "business",
            Zone(ctx.Org)
        );
        return new(
            "Waiting",
            null,
            $"Waited {Plural(node.V("duration"))}{(node.V("window") == "business" ? ", then went on in business hours" : "")}.",
            null,
            until
        );
    }

    /// <summary>When a wait ends: business days skip weekends; business hours means 9:00 to 17:00 on a weekday.</summary>
    public static DateTimeOffset WaitUntil(
        DateTimeOffset now,
        TimeSpan span,
        bool businessDays,
        bool businessHours,
        TimeZoneInfo zone
    )
    {
        var local = TimeZoneInfo.ConvertTime(now, zone).DateTime;
        if (businessDays)
            for (var days = (int)span.TotalDays; days > 0; )
            {
                local = local.AddDays(1);
                if (local.DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))
                    days--;
            }
        else
            local += span;
        if (businessHours)
        {
            if (local.Hour >= 17)
                local = local.Date.AddDays(1).AddHours(9);
            else if (local.Hour < 9)
                local = local.Date.AddHours(9);
            while (local.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday)
                local = local.Date.AddDays(1).AddHours(9);
        }
        try
        {
            return TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(local, DateTimeKind.Unspecified),
                zone
            );
        }
        catch (ArgumentException)
        {
            // The local time fell in a daylight-saving gap.
            return new DateTimeOffset(
                TimeZoneInfo.ConvertTimeToUtc(
                    DateTime.SpecifyKind(local.AddHours(1), DateTimeKind.Unspecified),
                    zone
                )
            );
        }
    }

    private static DateTimeOffset QuietHoursEnd(Organization org, DateTimeOffset now)
    {
        var t = new DateTimeOffset(now.Year, now.Month, now.Day, now.Hour, 0, 0, now.Offset);
        for (var i = 0; i < 25; i++)
        {
            t = t.AddHours(1);
            if (!EmailOutboxWorker.InQuietHours(org, t))
                return t;
        }
        return now.AddHours(1);
    }

    private static TimeZoneInfo Zone(Organization? org)
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(org?.TimeZone ?? "UTC");
        }
        catch (Exception exception)
            when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    public static readonly Dictionary<string, string> FieldLabels = new()
    {
        ["stage"] = "Stage",
        ["stageType"] = "Stage type",
        ["status"] = "Status",
        ["source"] = "Source",
        ["rating"] = "Rating",
        ["job"] = "Job",
        ["department"] = "Department",
        ["tags"] = "Tags",
        ["location"] = "Location",
        ["years"] = "Years of experience",
        ["replied"] = "Candidate replied",
        ["assessmentScore"] = "Assessment score (%)",
    };

    private static async Task<string> FactAsync(Ctx ctx, string field, CancellationToken ct)
    {
        var c = ctx.Candidate;
        switch (field)
        {
            case "stage":
                return ctx.Stage?.Name ?? "";
            case "stageType":
                return ctx.Stage?.Type.ToString() ?? "";
            case "status":
                return ctx.App.Status.ToString();
            case "source":
                return ctx.App.Source;
            case "rating":
                return ctx.App.Rating?.ToString() ?? "";
            case "job":
                return ctx.Job.Title;
            case "department":
                return ctx.Job.Department;
            case "tags":
                return string.Join(", ", c.Tags);
            case "location":
                return c.Location ?? "";
            case "years":
                return c.ResumeYearsExperience?.ToString("0.#") ?? "";
            case "replied":
                // Since this run started: a follow-up stops once they answer.
                return await ctx.Db.ApplicationMessages.AnyAsync(
                    x =>
                        x.ApplicationId == ctx.App.Id
                        && x.FromCandidate
                        && x.CreatedAt >= ctx.StartedAt,
                    ct
                )
                    ? "yes"
                    : "no";
            case "assessmentScore":
                // The score that started the run, else the latest scored assessment.
                if (ctx.Facts.TryGetValue("percent", out var percent))
                    return percent;
                return (
                        await ctx
                            .Db.AssessmentInvites.AsNoTracking()
                            .Where(x => x.ApplicationId == ctx.App.Id && x.Percent != null)
                            .OrderByDescending(x => x.SubmittedAt)
                            .Select(x => x.Percent)
                            .FirstOrDefaultAsync(ct)
                    )?.ToString() ?? "";
        }
        if (field.StartsWith("custom:", StringComparison.Ordinal))
        {
            try
            {
                using var doc = JsonDocument.Parse(c.CustomFieldsJson);
                return doc.RootElement.TryGetProperty(field[7..], out var value)
                    ? value.ValueKind == JsonValueKind.String
                        ? value.GetString() ?? ""
                        : value.ToString()
                    : "";
            }
            catch (JsonException)
            {
                return "";
            }
        }
        return "";
    }

    private static string FieldLabel(string field) =>
        FieldLabels.GetValueOrDefault(field)
        ?? (field.StartsWith("custom:", StringComparison.Ordinal) ? field[7..] : field);

    private static async Task<StepOutcome> ConditionAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var field = node.V("field");
        var op = node.V("operator");
        var expected = node.V("value");
        var actual = await FactAsync(ctx, field, ct);
        bool yes;
        if (field == "replied")
            yes =
                actual
                == (expected is "" or "yes" ? "yes" : "no")
                == op is not ("is not" or "does not contain");
        else if (field == "tags")
        {
            var has = ctx.Candidate.Tags.Any(t =>
                op.Contains("contain")
                    ? t.Contains(expected, StringComparison.OrdinalIgnoreCase)
                    : t.Equals(expected, StringComparison.OrdinalIgnoreCase)
            );
            yes = op is "is not" or "does not contain" ? !has : has;
        }
        else
            yes = WorkflowGraph.Compare(actual, op, expected);
        var shown =
            field == "replied" ? (actual == "yes" ? "yes" : "no")
            : actual.Length == 0 ? "empty"
            : actual;
        return new(
            "Done",
            yes ? "yes" : "no",
            $"{FieldLabel(field)} is “{shown}”, so the answer is {(yes ? "Yes" : "No")}."
        );
    }

    private static async Task<StepOutcome> SplitAsync(Ctx ctx, GraphNode node, CancellationToken ct)
    {
        var field = node.V("field");
        var actual = await FactAsync(ctx, field, ct);
        var hit = WorkflowGraph
            .SplitValues(node.V("branches"))
            .FirstOrDefault(b =>
                field == "tags"
                    ? ctx.Candidate.Tags.Contains(b, StringComparer.OrdinalIgnoreCase)
                    : b.Equals(actual.Trim(), StringComparison.OrdinalIgnoreCase)
            );
        return new(
            "Done",
            hit is null ? "other" : $"v:{hit}",
            $"{FieldLabel(field)} is “{(actual.Length == 0 ? "empty" : actual)}”, so it took the {(hit ?? "Other")} path."
        );
    }

    // ----- Actions

    private static async Task<Dictionary<string, string>> VariablesAsync(
        Ctx ctx,
        CancellationToken ct
    )
    {
        var c = ctx.Candidate;
        var vars = new Dictionary<string, string>
        {
            ["firstName"] = c.FirstName,
            ["lastName"] = c.LastName,
            ["candidateName"] = $"{c.FirstName} {c.LastName}",
            ["jobTitle"] = ctx.Job.Title,
            // Candidates only ever see a stage's candidate label; teammates get the real name.
            ["stage"] = ctx.Stage is null ? "" : StageRules.CandidateLabel(ctx.Stage),
            ["stageName"] = ctx.Stage?.Name ?? "",
            ["daysWaiting"] = Math.Max(0, (int)(ctx.Now - ctx.App.LastActivityAt).TotalDays)
                .ToString(),
            ["applicationLink"] = await AtsEndpoints.AppLinkAsync(
                ctx.Db,
                $"/applications/{ctx.App.Id}",
                ct
            ),
        };
        if (ctx.Facts.TryGetValue("interviewTitle", out var interview))
            vars["interviewTitle"] = interview;
        if (ctx.Facts.TryGetValue("assessmentName", out var assessment))
            vars["assessmentName"] = assessment;
        var recruiter = await ctx
            .Db.Users.AsNoTracking()
            .Where(x => x.Email == ctx.Job.RecruiterEmail)
            .Select(x => x.DisplayName)
            .FirstOrDefaultAsync(ct);
        vars["recruiterName"] = recruiter ?? ctx.Job.RecruiterEmail;
        return vars;
    }

    private static List<SentEmail> AddedEmails(AtsDbContext db) =>
        db
            .ChangeTracker.Entries<EmailOutboxItem>()
            .Where(x => x.State == EntityState.Added)
            .Select(x => new SentEmail(
                x.Entity.Id,
                x.Entity.Recipient,
                x.Entity.Subject,
                x.Entity.Body
            ))
            .ToList();

    /// <summary>Who an email or alert goes to. Says why when nobody can get it.</summary>
    private static async Task<(List<string> To, string? Why)> RecipientsAsync(
        Ctx ctx,
        string to,
        CancellationToken ct
    )
    {
        switch (to)
        {
            case "candidate":
                if (ctx.Candidate.DoNotContact)
                    return ([], "the candidate asked not to be contacted");
                if (ctx.Candidate.EmailBounced)
                    return ([], "the candidate’s email address bounced");
                return ([ctx.Candidate.Email], null);
            case "recruiter":
                return ([ctx.Job.RecruiterEmail], null);
            case "hiringManager":
                return ([ctx.Job.OwnerEmail], null);
            case "interviewers":
            {
                var owed = (await OwedScorecardsAsync(ctx, ct))
                    .SelectMany(x => x.Missing)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                return owed.Count == 0
                    ? ([], "every interviewer has sent their feedback")
                    : (owed, null);
            }
            default:
                return to.StartsWith("person:", StringComparison.Ordinal) && to.Contains('@')
                    ? ([to[7..].Trim()], null)
                    : ([], "no one is chosen to receive it");
        }
    }

    private static async Task<List<(Interview Interview, string[] Missing)>> OwedScorecardsAsync(
        Ctx ctx,
        CancellationToken ct
    )
    {
        var only = Guid.TryParse(ctx.Facts.GetValueOrDefault("interviewId"), out var id)
            ? id
            : (Guid?)null;
        var interviews = await ctx
            .Db.Interviews.Include(x => x.Scorecards)
            .Where(x =>
                x.ApplicationId == ctx.App.Id
                && (only == null || x.Id == only)
                && (x.Status == InterviewStatus.Scheduled || x.Status == InterviewStatus.Completed)
                && x.EndsAt < ctx.Now
            )
            .ToListAsync(ct);
        return interviews
            .Select(i =>
                (
                    i,
                    i.InterviewerEmails.Where(e =>
                            !i.Scorecards.Any(s =>
                                s.InterviewerEmail.Equals(e, StringComparison.OrdinalIgnoreCase)
                            )
                        )
                        .ToArray()
                )
            )
            .Where(x => x.Item2.Length > 0)
            .ToList();
    }

    /// <summary>The run's assessment invite, else the application's newest one still open.</summary>
    private static async Task<AssessmentInvite?> OpenInviteAsync(Ctx ctx, CancellationToken ct)
    {
        var only = Guid.TryParse(ctx.Facts.GetValueOrDefault("inviteId"), out var id)
            ? id
            : (Guid?)null;
        return await ctx
            .Db.AssessmentInvites.Include(x => x.Assessment)
            .Include(x => x.Version)
            .Where(x =>
                x.ApplicationId == ctx.App.Id
                && (only == null || x.Id == only)
                && (
                    x.Status == AssessmentInviteStatus.NotStarted
                    || x.Status == AssessmentInviteStatus.InProgress
                )
                && x.ReplacedAt == null
            )
            .OrderByDescending(x => x.InvitedAt)
            .FirstOrDefaultAsync(ct);
    }

    private static async Task<StepOutcome> SendEmailAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var to = node.V("to");
        var (recipients, why) = await RecipientsAsync(ctx, to, ct);
        if (recipients.Count == 0)
            return new("Skipped", null, $"Skipped: {why}.");
        var template = node.V("template");
        var before = AddedEmails(ctx.Db).Select(x => x.Id).ToHashSet();
        var vars = await VariablesAsync(ctx, ct);
        if (template == AssessmentFlow.ReminderKey && to == "candidate")
        {
            // The assessments area builds this email: the link, the due date, the assessment's name.
            var invite = await OpenInviteAsync(ctx, ct);
            if (invite is null)
                return new("Skipped", null, "Skipped: there is no unfinished assessment.");
            invite.Application = ctx.App;
            await AssessmentFlow.QueueEmailAsync(ctx.Db, template, invite, null, ct);
            invite.ReminderCount++;
            invite.LastReminderAt = ctx.Now;
        }
        else if (template == "scorecard-reminder" && to == "interviewers")
        {
            // The reminder links each interviewer to their own scorecard form.
            foreach (var (interview, missing) in await OwedScorecardsAsync(ctx, ct))
            {
                interview.Application = ctx.App;
                foreach (var email in missing)
                    await AtsEndpoints.QueueScorecardReminderAsync(ctx.Db, interview, email, ct);
            }
        }
        else if (template.Length > 0)
        {
            if (!WorkflowEmails.Exists(template))
                throw new InvalidOperationException(
                    "The email template this step uses no longer exists."
                );
            foreach (var recipient in recipients)
                await EmailTemplates.QueueAsync(
                    ctx.Db,
                    template,
                    ctx.Job.Id,
                    recipient,
                    vars,
                    ctx.App.Id,
                    ct
                );
        }
        else
            foreach (var recipient in recipients)
            {
                var (subject, body) = await WorkflowEmails.RenderCustomAsync(
                    ctx.Db,
                    node.V("subject"),
                    node.V("body"),
                    recipient,
                    ctx.App.Id,
                    vars,
                    ct
                );
                ctx.Db.EmailOutbox.Add(
                    new EmailOutboxItem
                    {
                        ApplicationId = ctx.App.Id,
                        Recipient = recipient,
                        Subject = subject,
                        Body = body,
                    }
                );
            }
        var sent = AddedEmails(ctx.Db).Where(x => !before.Contains(x.Id)).ToList();
        if (sent.Count == 0)
            return new("Skipped", null, "Skipped: there was nothing to send.");
        var verb = ctx.DryRun ? "Would email" : "Emailed";
        var output =
            sent.Count == 1
                ? $"{verb} {sent[0].Recipient}: “{sent[0].Subject}”."
                : $"{verb} {sent.Count} people: “{sent[0].Subject}”.";
        return new("Done", null, output, new { emails = sent });
    }

    private static async Task<StepOutcome> NotifyAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var vars = await VariablesAsync(ctx, ct);
        var message = EmailTemplates.Fill(node.V("message"), vars);
        if (node.V("channel") == "team")
        {
            if (string.IsNullOrWhiteSpace(ctx.Org?.NotificationWebhookUrl))
                return new(
                    "Skipped",
                    null,
                    "Skipped: no team channel is set up. Add one in Settings, Reminders and alerts."
                );
            await PipelineEvents.NotifyAsync(ctx.Db, message, ct);
            return new(
                "Done",
                null,
                $"{(ctx.DryRun ? "Would post" : "Posted")} to the team channel: “{message}”."
            );
        }
        var who = node.V("who");
        var (recipients, why) = await RecipientsAsync(
            ctx,
            who == "person" ? $"person:{node.V("person")}" : who,
            ct
        );
        if (recipients.Count == 0)
            return new("Skipped", null, $"Skipped: {why}.");
        var before = AddedEmails(ctx.Db).Select(x => x.Id).ToHashSet();
        if (node.V("channel") != "email")
        {
            // The notification feed: the bell, plus email for people who keep that on in their settings.
            await Notify.AddAsync(
                ctx.Db,
                recipients,
                new NotificationDraft(
                    NotificationKinds.WorkflowAlert,
                    message,
                    $"/applications/{ctx.App.Id}",
                    $"From the workflow “{ctx.WorkflowName}”.",
                    GroupKey: ctx.DryRun
                        ? null
                        : $"workflow:{ctx.WorkflowId}:{ctx.App.Id}:{node.Id}",
                    ApplicationId: ctx.App.Id
                ),
                ct
            );
            var mailed = AddedEmails(ctx.Db).Where(x => !before.Contains(x.Id)).ToList();
            return new(
                "Done",
                null,
                $"{(ctx.DryRun ? "Would alert" : "Alerted")} {string.Join(", ", recipients)}: “{message}”.",
                new { emails = mailed }
            );
        }
        foreach (var recipient in recipients)
            ctx.Db.EmailOutbox.Add(
                new EmailOutboxItem
                {
                    ApplicationId = ctx.App.Id,
                    Recipient = recipient,
                    Subject = $"{vars["candidateName"]}: {ctx.WorkflowName}",
                    Body = EmailTemplates.Tidy(
                        $"{message}\n\nOpen the application: {vars["applicationLink"]}",
                        vars["applicationLink"].Length == 0
                    ),
                }
            );
        var sent = AddedEmails(ctx.Db).Where(x => !before.Contains(x.Id)).ToList();
        return new(
            "Done",
            null,
            $"{(ctx.DryRun ? "Would alert" : "Alerted")} {string.Join(", ", recipients)}: “{message}”.",
            new { emails = sent }
        );
    }

    private static async Task<StepOutcome> MoveStageAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var app = ctx.App;
        if (app.Status != ApplicationStatus.Active)
            return new("Skipped", null, $"Skipped: the application is {StatusWord(app.Status)}.");
        var stage = WorkflowGraph.FindStage(node.V("stage"), ctx.Job.Stages);
        if (stage is null)
            return new("Skipped", null, $"Skipped: {ctx.Job.Title} has no stage like that.");
        if (stage.Type == StageType.Hired)
            return new(
                "Skipped",
                null,
                "Skipped: hiring goes through an offer acceptance, never a workflow."
            );
        if (stage.Id == app.PipelineStageId)
            return new("Skipped", null, $"Skipped: already in {stage.Name}.");
        var from = app.PipelineStageId;
        var fromName = ctx.Stage?.Name;
        app.PipelineStageId = stage.Id;
        app.LastActivityAt = ctx.Now;
        // The same follow-ups as a person's move: history, webhooks, closing a filled job.
        await PipelineEvents.OnMovedAsync(ctx.Db, app, from, app.Status, ctx.Actor, ct);
        // The activity history gets one "Workflow: … · Change stage" row (WorkflowActivity), not a second one here.
        return new(
            "Done",
            null,
            $"{(ctx.DryRun ? "Would move" : "Moved")} from {fromName} to {stage.Name}.",
            new { fromStageId = from, toStageId = stage.Id }
        );
    }

    private static async Task<StepOutcome> RejectAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var app = ctx.App;
        if (app.Status != ApplicationStatus.Active)
            return new(
                "Skipped",
                null,
                $"Skipped: the application is already {StatusWord(app.Status)}."
            );
        var reason = node.V("reason");
        var withdrew = reason == "Withdrew";
        var oldStatus = app.Status;
        app.Status = withdrew ? ApplicationStatus.Withdrawn : ApplicationStatus.Rejected;
        app.DispositionReason = reason;
        app.LastActivityAt = ctx.Now;
        var emailId =
            node.V("email") == "yes" && !withdrew && !ctx.Candidate.DoNotContact
                ? await EmailTemplates.QueueAsync(
                    ctx.Db,
                    "rejection",
                    ctx.Job.Id,
                    ctx.Candidate.Email,
                    new Dictionary<string, string>
                    {
                        ["firstName"] = ctx.Candidate.FirstName,
                        ["jobTitle"] = ctx.Job.Title,
                    },
                    app.Id,
                    ct
                )
                : null;
        var emailed = emailId is not null;
        await PipelineEvents.OnMovedAsync(
            ctx.Db,
            app,
            app.PipelineStageId,
            oldStatus,
            ctx.Actor,
            ct
        );
        return new(
            "Done",
            null,
            $"{(ctx.DryRun ? "Would reject" : "Rejected")} with the reason “{reason}”{(emailed ? ", and emailed the candidate" : "")}.",
            new
            {
                emails = AddedEmails(ctx.Db).Where(x => x.Id == emailId).ToList(),
                toStatus = app.Status.ToString(),
            }
        );
    }

    private static StepOutcome Tags(Ctx ctx, GraphNode node)
    {
        var tags = WorkflowGraph.SplitValues(node.V("tags"));
        var candidate = ctx.Candidate;
        var adding = node.Kind == "action.add_tag";
        var changed = adding
            ? tags.Where(t => !candidate.Tags.Contains(t, StringComparer.OrdinalIgnoreCase))
                .ToArray()
            : tags.Where(t => candidate.Tags.Contains(t, StringComparer.OrdinalIgnoreCase))
                .ToArray();
        if (changed.Length == 0)
            return new(
                "Skipped",
                null,
                adding
                    ? "Skipped: the candidate already has these tags."
                    : "Skipped: the candidate has none of these tags."
            );
        candidate.Tags = adding
            ? [.. candidate.Tags, .. changed]
            : candidate
                .Tags.Where(t => !changed.Contains(t, StringComparer.OrdinalIgnoreCase))
                .ToArray();
        candidate.UpdatedAt = ctx.Now;
        var list = string.Join(", ", changed.Select(t => $"“{t}”"));
        return new(
            "Done",
            null,
            ctx.DryRun
                ? $"Would {(adding ? "add" : "remove")} {list}."
                : $"{(adding ? "Added" : "Removed")} {list}."
        );
    }

    private static async Task<StepOutcome> WebhookAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var id = Guid.TryParse(node.V("endpoint"), out var parsed) ? parsed : Guid.Empty;
        var endpoint = await ctx
            .Db.WebhookEndpoints.AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (endpoint is null)
            return new("Skipped", null, "Skipped: the webhook was deleted.");
        var app = ctx.App;
        var payload = WebhookEvents.Envelope(
            "workflow.action",
            new
            {
                workflow = new { id = ctx.WorkflowId, name = ctx.WorkflowName },
                applicationId = app.Id,
                status = app.Status.ToString(),
                stage = ctx.Stage?.Name,
                candidate = new
                {
                    id = ctx.Candidate.Id,
                    firstName = ctx.Candidate.FirstName,
                    lastName = ctx.Candidate.LastName,
                    email = ctx.Candidate.Email,
                },
                job = new
                {
                    id = ctx.Job.Id,
                    code = ctx.Job.Code,
                    title = ctx.Job.Title,
                    department = ctx.Job.Department,
                },
            }
        );
        // The webhook worker signs it with the endpoint's secret and retries it.
        var delivery = ctx
            .Db.WebhookDeliveries.Add(
                new WebhookDelivery
                {
                    EndpointId = endpoint.Id,
                    Url = endpoint.Url,
                    EventType = "workflow.action",
                    Payload = payload,
                }
            )
            .Entity;
        var paused = endpoint.IsActive ? "" : " It waits until the webhook is turned back on.";
        return new(
            "Done",
            null,
            $"{(ctx.DryRun ? "Would send" : "Sent")} the application to {endpoint.Url}.{paused}",
            new { deliveryId = delivery.Id }
        );
    }

    // ----- Wait until a date

    /// <summary>The dates a wait can be set against. Custom date fields ("custom:{key}") work too.</summary>
    public static readonly Dictionary<string, string> DateLabels = new()
    {
        ["interview"] = "Interview time",
        ["offerExpiry"] = "Offer expiry",
        ["offerStart"] = "Offer start date",
        ["assessmentDue"] = "Assessment due date",
    };

    private static async Task<StepOutcome> WaitForDateAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var key = node.V("date");
        var label = (
            DateLabels.GetValueOrDefault(key)
            ?? (key.StartsWith("custom:", StringComparison.Ordinal) ? key[7..] : "date")
        ).ToLowerInvariant();
        var at = await DateFactAsync(ctx, key, ct);
        if (at is null)
            return new("Skipped", null, $"Skipped: there is no {label}, so it went on.");
        var offset = node.V("offset") is { Length: > 0 } o ? o : "0 hours";
        WorkflowGraph.TryDuration(offset, out var span, out _);
        var before = node.V("direction") == "before";
        var until = at.Value + (before ? -span : span);
        var text =
            span == TimeSpan.Zero
                ? $"until the {label}"
                : $"until {Plural(offset)} {(before ? "before" : "after")} the {label}";
        return until <= ctx.Now
            ? new("Done", null, $"Went on straight away: the time to wait {text} had passed.")
            : new("Waiting", null, $"Waited {text}.", null, until);
    }

    /// <summary>A date about the application, as an instant. Days without a time count from 9:00 in the organization's zone.</summary>
    private static async Task<DateTimeOffset?> DateFactAsync(
        Ctx ctx,
        string key,
        CancellationToken ct
    )
    {
        var zone = Zone(ctx.Org);
        DateTimeOffset At(DateOnly day, int hour) =>
            new(
                TimeZoneInfo.ConvertTimeToUtc(
                    day.ToDateTime(new TimeOnly(hour, 0), DateTimeKind.Unspecified),
                    zone
                ),
                TimeSpan.Zero
            );
        Guid? Fact(string name) =>
            Guid.TryParse(ctx.Facts.GetValueOrDefault(name), out var id) ? id : null;
        switch (key)
        {
            case "interview":
            {
                // The run's own interview, else the next one booked.
                var only = Fact("interviewId");
                return await ctx
                    .Db.Interviews.AsNoTracking()
                    .Where(x =>
                        x.ApplicationId == ctx.App.Id
                        && x.Status == InterviewStatus.Scheduled
                        && (only == null ? x.StartsAt > ctx.Now : x.Id == only)
                    )
                    .OrderBy(x => x.StartsAt)
                    .Select(x => (DateTimeOffset?)x.StartsAt)
                    .FirstOrDefaultAsync(ct);
            }
            case "offerExpiry" or "offerStart":
            {
                var only = Fact("offerId");
                var offer = await ctx
                    .Db.Offers.AsNoTracking()
                    .Where(x =>
                        x.ApplicationId == ctx.App.Id
                        && (only == null || x.Id == only)
                        && x.Status != OfferStatus.Withdrawn
                    )
                    .OrderByDescending(x => x.CreatedAt)
                    .Select(x => new
                    {
                        x.ExpiresAt,
                        x.ExpiresOn,
                        x.StartDate,
                    })
                    .FirstOrDefaultAsync(ct);
                if (key == "offerStart")
                    return offer?.StartDate is { } start ? At(start, 9) : null;
                // An offer closes at the end of its last day.
                return offer?.ExpiresAt
                    ?? (offer?.ExpiresOn is { } last ? At(last.AddDays(1), 0) : null);
            }
            case "assessmentDue":
                return (await OpenInviteAsync(ctx, ct))?.ExpiresAt;
        }
        if (!key.StartsWith("custom:", StringComparison.Ordinal))
            return null;
        var text = await FactAsync(ctx, key, ct);
        if (DateOnly.TryParse(text, System.Globalization.CultureInfo.InvariantCulture, out var day))
            return At(day, 9);
        return DateTimeOffset.TryParse(
            text,
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.AssumeUniversal,
            out var instant
        )
            ? instant
            : null;
    }

    // ----- Ask for approval

    /// <summary>
    /// Asks the step's approvers through the approval engine (subject: this run), then waits. A
    /// decision wakes the run and <see cref="ApprovalAnswerAsync"/> picks the path.
    /// </summary>
    private static async Task<StepOutcome> AskApprovalAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        var wanted = WorkflowGraph
            .SplitValues(node.V("approvers"))
            .Select(key =>
                key switch
                {
                    "recruiter" => ctx.Job.RecruiterEmail,
                    "hiringManager" => ctx.Job.OwnerEmail,
                    _ => key.StartsWith("person:", StringComparison.Ordinal) ? key[7..] : key,
                }
            )
            .Select(x => x.Trim().ToLowerInvariant())
            .Where(x => x.Contains('@'))
            .Distinct()
            .ToList();
        var people = await ctx
            .Db.Users.AsNoTracking()
            .Where(x =>
                wanted.Contains(x.Email.ToLower())
                && x.IsActive
                && (
                    x.Role == UserRole.Admin
                    || x.Role == UserRole.Recruiter
                    || x.Role == UserRole.HiringManager
                )
            )
            .ToDictionaryAsync(x => x.Email.ToLower(), x => x.DisplayName, ct);
        // In the step's order: it matters when they decide one after another.
        var approvers = wanted.Where(people.ContainsKey).ToArray();
        if (approvers.Length == 0)
            throw new InvalidOperationException(
                "Nobody on this step can approve. Choose active admins, recruiters or hiring managers."
            );
        var vars = await VariablesAsync(ctx, ct);
        var question = EmailTemplates.Fill(node.V("question"), vars).Trim();
        if (question.Length == 0)
            question = $"Move {vars["candidateName"]} forward for {ctx.Job.Title}";
        var mode = Enum.TryParse<ApprovalMode>(node.V("mode"), out var parsed)
            ? parsed
            : ApprovalMode.Parallel;
        var names = string.Join(", ", approvers.Select(x => people[x]));
        if (ctx.DryRun)
            return new(
                "Done",
                "yes",
                $"Would ask {names} to approve “{question}”. A test takes the Approved path."
            );
        await AtsEndpoints.RequestWorkflowApprovalAsync(
            ctx.Db,
            ctx.RunId,
            $"Workflow: {ctx.WorkflowName}",
            approvers,
            mode,
            question,
            ct
        );
        return new(
            "Waiting",
            null,
            $"Asked {names} to approve “{question}”.",
            null,
            ApprovalWait(ctx.Now)
        );
    }

    /// <summary>A run waiting on people has no clock; a decision wakes it. This is only a backstop.</summary>
    private static DateTimeOffset ApprovalWait(DateTimeOffset now) => now.AddDays(365);

    private static async Task<StepOutcome> ApprovalAnswerAsync(
        Ctx ctx,
        WorkflowStepRun step,
        CancellationToken ct
    )
    {
        var (outcome, round) = await AtsEndpoints.WorkflowApprovalOutcomeAsync(
            ctx.Db,
            ctx.RunId,
            ct
        );
        if (outcome == "Pending")
            return new("Waiting", null, step.Output ?? "", null, ApprovalWait(ctx.Now));
        var emails = round.Select(x => x.ApproverEmail).ToList();
        var names = await ctx
            .Db.Users.AsNoTracking()
            .Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
        string Name(Approval x) => names.GetValueOrDefault(x.ApproverEmail, x.ApproverEmail);
        var rejected = round.FirstOrDefault(x => x.Decision == ApprovalDecision.Rejected);
        return outcome switch
        {
            "Approved" => new(
                "Done",
                "yes",
                $"Approved by {string.Join(", ", round.Where(x => x.Decision == ApprovalDecision.Approved).Select(Name))}."
            ),
            "Rejected" when rejected is not null => new(
                "Done",
                "no",
                $"Not approved. {Name(rejected)} said: “{rejected.Comment}”"
            ),
            _ => new("Done", "no", "The request was withdrawn, so it took the Not approved path."),
        };
    }

    /// <summary>Requests whose run has ended (stopped, archived, application closed) stop waiting on their approvers.</summary>
    public static Task<int> CloseStaleApprovalsAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    ) =>
        db
            .Approvals.Where(a =>
                a.SubjectType == AtsEndpoints.WorkflowRunSubject
                && a.Decision == ApprovalDecision.Pending
                && !db.WorkflowRuns.Any(r =>
                    r.Id == a.SubjectId
                    && (
                        r.Status == WorkflowRunStatus.Waiting
                        || r.Status == WorkflowRunStatus.Running
                    )
                )
            )
            .ExecuteUpdateAsync(
                s =>
                    s.SetProperty(x => x.Decision, ApprovalDecision.Cancelled)
                        .SetProperty(x => x.DecidedAt, (DateTimeOffset?)now),
                ct
            );

    // ----- Send assessment

    /// <summary>The same invite and email as the Send assessment button (the assessments area makes it).</summary>
    private static async Task<StepOutcome> SendAssessmentAsync(
        Ctx ctx,
        GraphNode node,
        CancellationToken ct
    )
    {
        // "stage": the assessment set on the stage they entered (Job settings, Stages).
        var fromStage = node.V("assessment") == "stage";
        Guid? id = Guid.TryParse(node.V("assessment"), out var picked) ? picked : null;
        if (fromStage)
        {
            var stageId = Guid.TryParse(ctx.Facts.GetValueOrDefault("stageId"), out var entered)
                ? entered
                : ctx.App.PipelineStageId;
            var stage = ctx.Job.Stages.FirstOrDefault(x => x.Id == stageId);
            if (stage?.AssessmentId is null)
                return new(
                    "Skipped",
                    null,
                    $"Skipped: {stage?.Name ?? "the stage"} has no assessment."
                );
            id = stage.AssessmentId;
        }
        var assessment = id is null
            ? null
            : await ctx.Db.Assessments.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (assessment is null)
            throw new InvalidOperationException(
                fromStage
                    ? "The stage's assessment was deleted. Pick another one in the job's stages."
                    : "The assessment this step sends was deleted. Pick another one."
            );
        if (assessment.Status != AssessmentStatus.Active || assessment.CurrentVersionId is null)
            throw new InvalidOperationException(
                $"“{assessment.Name}” is not published, so it can’t be sent. Publish it, then press Try again."
            );
        if (ctx.Candidate.DoNotContact)
            return new("Skipped", null, "Skipped: the candidate asked not to be contacted.");
        // A stage's assessment goes once per application, however often they enter the stage.
        if (
            fromStage
            && await ctx.Db.AssessmentInvites.AnyAsync(
                x => x.ApplicationId == ctx.App.Id && x.AssessmentId == assessment.Id,
                ct
            )
        )
            return new(
                "Skipped",
                null,
                $"Skipped: “{assessment.Name}” was already sent for this application."
            );
        var earlier = await ctx
            .Db.AssessmentInvites.AsNoTracking()
            .Where(x =>
                x.ApplicationId == ctx.App.Id
                && x.AssessmentId == assessment.Id
                && x.ReplacedAt == null
                && x.Status != AssessmentInviteStatus.Revoked
            )
            .ToListAsync(ct);
        if (
            earlier.FirstOrDefault(x =>
                AssessmentFlow.Effective(x, ctx.Now) != AssessmentInviteStatus.Expired
            ) is
            { } open
        )
            return new(
                "Skipped",
                null,
                open.Status == AssessmentInviteStatus.Submitted
                    ? $"Skipped: they already took “{assessment.Name}”."
                    : $"Skipped: they already have “{assessment.Name}” open."
            );
        var before = AddedEmails(ctx.Db).Select(x => x.Id).ToHashSet();
        var (invite, _) = await AtsEndpoints.CreateInviteAsync(
            ctx.Db,
            ctx.Actor,
            ctx.App,
            assessment,
            null,
            null,
            ct
        );
        if (invite is null)
            throw new InvalidOperationException($"“{assessment.Name}” could not be sent.");
        return new(
            "Done",
            null,
            $"{(ctx.DryRun ? "Would send" : "Sent")} “{assessment.Name}”, due in {assessment.ExpiryDays} {(assessment.ExpiryDays == 1 ? "day" : "days")}.",
            new { emails = AddedEmails(ctx.Db).Where(x => !before.Contains(x.Id)).ToList() }
        );
    }

    // ----- Test email

    /// <summary>
    /// "Send a test email to me": the step's email as it reads for a real application, sent only to
    /// the person asking. Nothing else the step would do is kept.
    /// </summary>
    public static async Task<SentEmail?> TestEmailAsync(
        AtsDbContext db,
        GraphNode node,
        Guid applicationId,
        Workflow workflow,
        string me,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var ctx =
            await ContextAsync(db, applicationId, workflow, now, now, [], true, ct)
            ?? throw new InvalidOperationException("That application no longer exists.");
        SentEmail? email;
        try
        {
            var values = new Dictionary<string, string>(node.Values) { ["to"] = $"person:{me}" };
            await SendEmailAsync(ctx, node with { Values = values }, ct);
            email = AddedEmails(db).FirstOrDefault();
        }
        finally
        {
            db.ChangeTracker.Clear();
        }
        if (email is null)
            return null;
        var test = new EmailOutboxItem
        {
            Recipient = me,
            Subject = $"Test: {email.Subject}",
            Body = email.Body,
        };
        db.EmailOutbox.Add(test);
        await db.SaveChangesAsync(ct);
        return email with { Id = test.Id, Recipient = me, Subject = test.Subject };
    }

    private static string StatusWord(ApplicationStatus status) =>
        status switch
        {
            ApplicationStatus.Rejected => "rejected",
            ApplicationStatus.Withdrawn => "withdrawn",
            ApplicationStatus.Hired => "hired",
            ApplicationStatus.PendingVerification => "not confirmed yet",
            _ => "active",
        };

    /// <summary>"1 days" reads as "1 day".</summary>
    private static string Plural(string duration) =>
        duration.StartsWith("1 ", StringComparison.Ordinal) && duration.EndsWith('s')
            ? duration[..^1]
            : duration;

    private static string? Clip(string? text) =>
        text is null || text.Length <= 2000 ? text : text[..2000];
}

/// <summary>
/// The email templates a workflow step can use, and custom wording for steps without one.
/// </summary>
/// <remarks>
/// Every automatic email in the template store (rendered by EmailTemplates.QueueAsync, so edited
/// and per-job wording applies) whose details a workflow can fill. Emails that need something only
/// their own screen has (a booking link, a sign-in code, an approval link) are left out.
/// </remarks>
public static class WorkflowEmails
{
    /// <summary>Details a workflow fills for any application; the template store adds company and portalLink.</summary>
    private static readonly string[] Fillable =
    [
        "firstName",
        "lastName",
        "candidateName",
        "jobTitle",
        "stage",
        "portalLink",
        "interviewTitle",
        "assessmentName",
    ];

    /// <summary>Emails a step builds with its own area's details (the assessment link, each interviewer's form).</summary>
    private static readonly string[] BuiltByTheirArea =
    [
        AssessmentFlow.ReminderKey,
        "scorecard-reminder",
    ];

    public static IEnumerable<(string Key, string Label, string[] Variables)> All =>
        EmailTemplates
            .Defaults.Where(x =>
                BuiltByTheirArea.Contains(x.Key)
                || EmailTemplates.Unknown(x.Value.Subject + x.Value.Body, Fillable).Length == 0
            )
            .Select(x => (x.Key, x.Value.Label, x.Value.Variables));

    public static bool Exists(string key) => All.Any(x => x.Key == key);

    /// <summary>The placeholders a workflow email can use, with what each means.</summary>
    public static readonly Dictionary<string, string> Variables = new()
    {
        ["firstName"] = "First name",
        ["lastName"] = "Last name",
        ["candidateName"] = "Full name",
        ["jobTitle"] = "Job title",
        ["company"] = "Company name",
        ["stage"] = "Stage (as candidates see it)",
        ["stageName"] = "Stage (as your team calls it)",
        ["recruiterName"] = "Recruiter name",
        ["interviewTitle"] = "Interview name",
        ["assessmentName"] = "Assessment name",
        ["daysWaiting"] = "Days with no activity",
        ["portalLink"] = "Candidate portal link",
        ["applicationLink"] = "Link to the application",
    };

    public static async Task<(string Subject, string Body)> RenderCustomAsync(
        AtsDbContext db,
        string subject,
        string body,
        string recipient,
        Guid applicationId,
        IReadOnlyDictionary<string, string> variables,
        CancellationToken ct
    )
    {
        var vars = new Dictionary<string, string>(
            await CandidateLinks.WithPortalLinkAsync(
                db,
                "workflow",
                recipient,
                applicationId,
                variables,
                ct
            )
        );
        var org = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.PublicUrl })
            .FirstOrDefaultAsync(ct);
        vars["company"] = org?.Name ?? "The hiring team";
        vars.TryAdd(
            "portalLink",
            string.IsNullOrWhiteSpace(org?.PublicUrl)
                ? ""
                : $"{org.PublicUrl.TrimEnd('/')}/candidate-portal"
        );
        var missing = vars["portalLink"].Length == 0;
        return (
            EmailTemplates.Tidy(EmailTemplates.Fill(subject, vars), missing),
            EmailTemplates.Tidy(EmailTemplates.Fill(body, vars), missing)
        );
    }
}
