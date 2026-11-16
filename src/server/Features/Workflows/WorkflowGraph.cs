using System.Text.Json;
using System.Text.Json.Serialization;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Features.Workflows;

public sealed record NodePosition(double X, double Y);

/// <summary>One step. Values are the step's settings as text; their meaning is in <see cref="WorkflowGraph"/>.</summary>
public sealed record GraphNode(
    string Id,
    string Kind,
    Dictionary<string, string> Values,
    NodePosition? Position = null
)
{
    public string V(string key) => Values.GetValueOrDefault(key)?.Trim() ?? "";
}

public sealed record GraphEdge(
    string Id,
    string Source,
    string Target,
    string? SourceHandle = null
);

public sealed record Graph(List<GraphNode> Nodes, List<GraphEdge> Edges)
{
    public GraphNode? Trigger => Nodes.FirstOrDefault(x => WorkflowGraph.IsTrigger(x.Kind));

    public GraphNode? Node(string? id) => Nodes.FirstOrDefault(x => x.Id == id);

    /// <summary>The step after this one along the given path (null follows the plain output).</summary>
    public GraphNode? Next(string nodeId, string? handle) =>
        Node(
            Edges
                .FirstOrDefault(x =>
                    x.Source == nodeId && (x.SourceHandle ?? null) == (handle ?? null)
                )
                ?.Target
        );
}

public sealed record Problem(string Message, string[] NodeIds);

/// <summary>What the checks need to know about the organization: what a step may point at.</summary>
public sealed record GraphReferences(
    HashSet<Guid> Jobs,
    HashSet<string> Stages,
    HashSet<string> Templates,
    HashSet<Guid> Webhooks,
    HashSet<Guid>? Assessments = null
);

/// <summary>
/// The step catalog and the graph rules, shared by publish, the dry run and the worker. The web
/// editor (features/workflows/catalog.tsx) has the same kinds and value formats.
/// </summary>
/// <remarks>
/// Value formats: job is "any", "job:{id}" or "dept:{name}"; stage is "any", "type:{StageType}" or
/// "name:{name}"; durations are "{n} {minutes|hours|days|business days|weeks}"; recipients are
/// "candidate", "recruiter", "hiringManager", "interviewers" or "person:{email}".
/// </remarks>
public static class WorkflowGraph
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static Graph Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new([], []);
        try
        {
            var graph = JsonSerializer.Deserialize<Graph>(json, Json);
            return new(
                graph
                    ?.Nodes?.Where(x => x?.Id is not null && x.Kind is not null)
                    .Select(x => x with { Values = x.Values ?? [] })
                    .ToList()
                    ?? [],
                graph?.Edges?.Where(x => x?.Source is not null && x.Target is not null).ToList()
                    ?? []
            );
        }
        catch (JsonException)
        {
            return new([], []);
        }
    }

    public static string Serialize(Graph graph) => JsonSerializer.Serialize(graph, Json);

    // Event triggers start from what a save changes (WorkflowTriggers.Detect); time triggers from the sweep.
    public static readonly Dictionary<string, string> Triggers = new()
    {
        ["trigger.application_created"] = "New application",
        ["trigger.stage_entered"] = "Moves into a stage",
        ["trigger.stage_left"] = "Leaves a stage",
        ["trigger.candidate_rejected"] = "Candidate rejected",
        ["trigger.interview_scheduled"] = "Interview scheduled",
        ["trigger.interview_completed"] = "Interview finished",
        ["trigger.interview_no_show"] = "Interview no-show",
        ["trigger.scorecard_submitted"] = "Scorecard submitted",
        ["trigger.offer_sent"] = "Offer sent",
        ["trigger.offer_accepted"] = "Candidate accepts offer",
        ["trigger.offer_declined"] = "Candidate declines offer",
        ["trigger.candidate_replied"] = "Candidate replies",
        ["trigger.tag_added"] = "Tag added",
        ["trigger.assessment_completed"] = "Assessment completed",
        ["trigger.assessment_unfinished"] = "Assessment not finished",
        ["trigger.stuck"] = "Stuck in a stage",
        ["trigger.booking_unanswered"] = "Interview time not picked",
        ["trigger.scorecard_overdue"] = "Feedback overdue",
    };

    public static readonly HashSet<string> TimeTriggers =
    [
        "trigger.stuck",
        "trigger.booking_unanswered",
        "trigger.scorecard_overdue",
        "trigger.assessment_unfinished",
    ];

    public static readonly Dictionary<string, string> Steps = new()
    {
        ["logic.condition"] = "Yes or no check",
        ["logic.wait"] = "Wait",
        ["logic.split"] = "Split into paths",
        ["action.send_email"] = "Send email",
        ["action.notify"] = "Alert a teammate",
        ["action.move_stage"] = "Change stage",
        ["action.reject"] = "Reject",
        ["action.add_tag"] = "Add tag",
        ["action.remove_tag"] = "Remove tag",
        ["action.webhook"] = "Send to another app",
        ["action.approval"] = "Ask for approval",
        ["action.send_assessment"] = "Send assessment",
    };

    public static bool IsTrigger(string kind) =>
        kind.StartsWith("trigger.", StringComparison.Ordinal);

    public static string KindLabel(string kind) =>
        Triggers.GetValueOrDefault(kind) ?? Steps.GetValueOrDefault(kind) ?? "Unknown step";

    public static string Label(GraphNode node) =>
        node.V("name") is { Length: > 0 } name ? name : KindLabel(node.Kind);

    public static string[] SplitValues(string text) =>
        text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    /// <summary>The labelled outputs of a step, or null when it has one plain output.</summary>
    public static string[]? Outputs(GraphNode node) =>
        node.Kind switch
        {
            "logic.condition" or "action.approval" => ["yes", "no"],
            "logic.split" => [.. SplitValues(node.V("branches")).Select(x => $"v:{x}"), "other"],
            _ => null,
        };

    public static bool TryDuration(string text, out TimeSpan span, out bool businessDays)
    {
        span = default;
        businessDays = false;
        var parts = text.Trim().Split(' ', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !int.TryParse(parts[0], out var n) || n < 0 || n > 3650)
            return false;
        var unit = parts[1].ToLowerInvariant().TrimEnd('s');
        businessDays = unit == "business day";
        span = unit switch
        {
            "minute" => TimeSpan.FromMinutes(n),
            "hour" => TimeSpan.FromHours(n),
            "day" or "business day" => TimeSpan.FromDays(n),
            "week" => TimeSpan.FromDays(7 * n),
            _ => TimeSpan.MinValue,
        };
        return span != TimeSpan.MinValue;
    }

    public static int Days(GraphNode node, int fallback = 3) =>
        int.TryParse(node.V("days"), out var days) ? Math.Clamp(days, 1, 365) : fallback;

    /// <summary>Everything that stops a graph from being published. Empty means it can run.</summary>
    public static List<Problem> Validate(Graph graph, GraphReferences? refs = null)
    {
        var problems = new List<Problem>();
        var nodes = graph.Nodes;
        var ids = nodes.Select(x => x.Id).ToHashSet();
        var edges = graph
            .Edges.Where(x => ids.Contains(x.Source) && ids.Contains(x.Target))
            .ToList();
        void Add(string message, params GraphNode[] at) =>
            problems.Add(new(message, at.Select(x => x.Id).ToArray()));

        var triggers = nodes.Where(x => IsTrigger(x.Kind)).ToList();
        if (triggers.Count == 0)
            Add("Add a step from the Start when list to begin the workflow.");
        if (triggers.Count > 1)
            Add(
                $"A workflow can have only one starting step. This one has {triggers.Count}.",
                [.. triggers]
            );
        foreach (var trigger in triggers.Where(t => edges.Any(e => e.Target == t.Id)))
            Add($"“{Label(trigger)}” starts the workflow, so no step can lead into it.", trigger);
        foreach (
            var node in nodes.Where(x =>
                !Triggers.ContainsKey(x.Kind) && !Steps.ContainsKey(x.Kind)
            )
        )
            Add($"“{Label(node)}” is a kind of step we no longer have. Delete it.", node);

        var cycle = FindCycle(nodes, edges);
        if (cycle is not null)
            Add(
                $"These steps go around in a circle: {string.Join(" → ", cycle.Select(Label))}.",
                [.. cycle]
            );

        // A path with nothing after it ends the run there, so open paths are fine.
        foreach (var node in nodes)
        {
            // One output leads to one step. Parallel branches would run in no clear order.
            foreach (
                var group in edges
                    .Where(e => e.Source == node.Id)
                    .GroupBy(e => e.SourceHandle ?? "")
            )
                if (group.Count() > 1)
                    Add(
                        $"“{Label(node)}” leads to {group.Count()} steps from one output. Connect it to one step, or add a Split.",
                        node
                    );
            problems.AddRange(CheckValues(node, refs));
        }

        if (triggers.Count == 1 && nodes.Count == 1)
            Add($"Add a step after “{Label(triggers[0])}”.", triggers[0]);

        if (triggers.Count > 0)
        {
            var seen = new HashSet<string>();
            var queue = new Stack<string>(triggers.Select(x => x.Id));
            while (queue.Count > 0)
            {
                var id = queue.Pop();
                if (!seen.Add(id))
                    continue;
                foreach (var e in edges.Where(e => e.Source == id))
                    queue.Push(e.Target);
            }
            var orphans = nodes.Where(x => !seen.Contains(x.Id)).ToList();
            if (orphans.Count > 0)
                Add(
                    $"{(orphans.Count == 1 ? "One step is" : $"{orphans.Count} steps are")} not linked to the start: {string.Join(", ", orphans.Select(Label))}.",
                    [.. orphans]
                );
        }
        return problems;
    }

    public static string OutputLabel(string output) =>
        output switch
        {
            "yes" => "Yes",
            "no" => "No",
            "other" => "Other",
            _ => output.StartsWith("v:", StringComparison.Ordinal) ? output[2..] : output,
        };

    private static IEnumerable<Problem> CheckValues(GraphNode node, GraphReferences? refs)
    {
        var label = Label(node);
        Problem P(string message) => new(message, [node.Id]);
        var job = node.V("job");
        if (refs is not null && job.StartsWith("job:", StringComparison.Ordinal))
            if (!Guid.TryParse(job[4..], out var jobId) || !refs.Jobs.Contains(jobId))
                yield return P(
                    $"“{label}” is set to a job that no longer exists. Pick another job."
                );
        var stage = node.V("stage");
        if (
            refs is not null
            && stage.StartsWith("name:", StringComparison.Ordinal)
            && !refs.Stages.Contains(stage[5..].ToLowerInvariant())
        )
            yield return P($"“{label}” uses the stage “{stage[5..]}”, which no job has any more.");

        switch (node.Kind)
        {
            case "trigger.stuck" or "trigger.booking_unanswered" or "trigger.scorecard_overdue":
                if (!int.TryParse(node.V("days"), out var days) || days < 1 || days > 365)
                    yield return P($"“{label}” needs a number of days from 1 to 365.");
                break;
            case "trigger.tag_added":
                if (node.V("tag").Length == 0)
                    yield return P($"“{label}” needs the tag to watch for.");
                break;
            case "logic.wait" when node.V("mode") == "date":
                if (node.V("date").Length == 0)
                    yield return P($"“{label}” needs the date to wait for.");
                if (
                    node.V("offset").Length > 0
                    && (
                        !TryDuration(node.V("offset"), out _, out var businessOffset)
                        || businessOffset
                    )
                )
                    yield return P(
                        $"“{label}” needs a time before or after the date, for example 1 day."
                    );
                break;
            case "logic.wait":
                if (!TryDuration(node.V("duration"), out var span, out _) || span <= TimeSpan.Zero)
                    yield return P($"“{label}” needs a time to wait, for example 2 days.");
                break;
            case "logic.condition":
                if (node.V("field").Length == 0)
                    yield return P($"“{label}” needs a detail to check.");
                else if (node.V("value").Length == 0 && node.V("field") != "replied")
                    yield return P($"“{label}” needs a value to compare with.");
                break;
            case "logic.split":
                if (SplitValues(node.V("branches")).Length == 0)
                    yield return P($"“{label}” needs at least one path.");
                break;
            case "action.send_email":
            {
                var to = node.V("to");
                if (to.Length == 0 || to == "person:")
                    yield return P($"“{label}” needs someone to send to.");
                var template = node.V("template");
                if (template.Length == 0)
                {
                    if (node.V("subject").Length == 0)
                        yield return P($"“{label}” needs a subject.");
                    if (node.V("body").Length == 0)
                        yield return P($"“{label}” needs a message.");
                    else if (MediaEndpoints.HasImageWithoutAlt(node.V("body")))
                        yield return P($"“{label}” has a picture with no description.");
                }
                else if (refs is not null && !refs.Templates.Contains(template))
                    yield return P($"“{label}” uses an email template that no longer exists.");
                break;
            }
            case "action.notify":
                var who = node.V("who");
                if (
                    node.V("channel") != "team"
                    && (
                        who.Length == 0
                        || (who == "person" && !node.V("person").Contains('@'))
                        || (
                            who.StartsWith("person:", StringComparison.Ordinal)
                            && !who.Contains('@')
                        )
                    )
                )
                    yield return P($"“{label}” needs the person to alert.");
                if (node.V("message").Length == 0)
                    yield return P($"“{label}” needs a message.");
                break;
            case "action.move_stage":
                if (stage.Length == 0 || stage == "any")
                    yield return P($"“{label}” needs the stage to move to.");
                break;
            case "action.reject":
                if (node.V("reason").Length == 0)
                    yield return P($"“{label}” needs a reason. Every rejection keeps one.");
                break;
            case "action.add_tag" or "action.remove_tag":
                if (SplitValues(node.V("tags")).Length == 0)
                    yield return P($"“{label}” needs at least one tag.");
                break;
            case "action.approval":
                if (SplitValues(node.V("approvers")).Length == 0)
                    yield return P($"“{label}” needs at least one person to approve.");
                if (
                    node.V("mode").Length > 0
                    && !Enum.TryParse<ApprovalMode>(node.V("mode"), out _)
                )
                    yield return P($"“{label}” needs a way for the approvers to decide.");
                break;
            case "action.send_assessment" when node.V("assessment") == "stage":
                break;
            case "action.send_assessment":
                if (!Guid.TryParse(node.V("assessment"), out var assessment))
                    yield return P($"“{label}” needs the assessment to send.");
                else if (refs?.Assessments is not null && !refs.Assessments.Contains(assessment))
                    yield return P(
                        $"“{label}” uses an assessment that is not published. Pick another one."
                    );
                break;
            case "action.webhook":
                if (!Guid.TryParse(node.V("endpoint"), out var endpoint))
                    yield return P($"“{label}” needs a webhook to send to.");
                else if (refs is not null && !refs.Webhooks.Contains(endpoint))
                    yield return P($"“{label}” uses a webhook that was deleted. Pick another one.");
                break;
        }
    }

    private static List<GraphNode>? FindCycle(List<GraphNode> nodes, List<GraphEdge> edges)
    {
        var state = new Dictionary<string, bool>(); // false visiting, true done
        var stack = new List<string>();
        List<string>? Visit(string id)
        {
            if (state.TryGetValue(id, out var done))
                return done ? null : stack.Skip(stack.IndexOf(id)).ToList();
            state[id] = false;
            stack.Add(id);
            foreach (var e in edges.Where(e => e.Source == id))
                if (Visit(e.Target) is { } found)
                    return found;
            stack.RemoveAt(stack.Count - 1);
            state[id] = true;
            return null;
        }
        foreach (var node in nodes)
            if (Visit(node.Id) is { } cycle)
                return cycle.Select(id => nodes.First(n => n.Id == id)).ToList();
        return null;
    }

    /// <summary>"Added Wait. Removed Send email. Changed Add tag." against the version before.</summary>
    public static string Summarize(Graph? before, Graph after)
    {
        if (before is null)
            return "First version.";
        var old = before.Nodes.ToDictionary(x => x.Id);
        var now = after.Nodes.ToDictionary(x => x.Id);
        var parts = new List<string>();
        string Names(IEnumerable<GraphNode> nodes) =>
            string.Join(", ", nodes.Select(Label).Distinct());
        var added = after.Nodes.Where(x => !old.ContainsKey(x.Id)).ToList();
        var removed = before.Nodes.Where(x => !now.ContainsKey(x.Id)).ToList();
        var changed = after
            .Nodes.Where(x =>
                old.TryGetValue(x.Id, out var was)
                && (
                    was.Kind != x.Kind
                    || was.Values.Count != x.Values.Count
                    || was.Values.Any(kv => x.V(kv.Key) != kv.Value.Trim())
                )
            )
            .ToList();
        if (added.Count > 0)
            parts.Add($"Added {Names(added)}.");
        if (removed.Count > 0)
            parts.Add($"Removed {Names(removed)}.");
        if (changed.Count > 0)
            parts.Add($"Changed {Names(changed)}.");
        var linksBefore = before
            .Edges.Select(e => $"{e.Source}>{e.Target}>{e.SourceHandle}")
            .ToHashSet();
        var linksAfter = after
            .Edges.Select(e => $"{e.Source}>{e.Target}>{e.SourceHandle}")
            .ToHashSet();
        if (parts.Count == 0 && !linksBefore.SetEquals(linksAfter))
            parts.Add("Changed how the steps connect.");
        return parts.Count == 0 ? "No changes to the steps." : string.Join(" ", parts);
    }

    /// <summary>The stage a value points at in one job, or null.</summary>
    public static PipelineStage? FindStage(string value, IEnumerable<PipelineStage> stages)
    {
        var ordered = stages.OrderBy(x => x.SortOrder);
        if (value.StartsWith("type:", StringComparison.Ordinal))
            return Enum.TryParse<StageType>(value[5..], out var type)
                ? ordered.FirstOrDefault(x => x.Type == type)
                : null;
        if (value.StartsWith("name:", StringComparison.Ordinal))
            return ordered.FirstOrDefault(x =>
                x.Name.Equals(value[5..], StringComparison.OrdinalIgnoreCase)
            );
        return null;
    }

    /// <summary>Whether a stage matches a trigger's stage value ("any", "type:…", "name:…").</summary>
    public static bool StageMatches(string value, string? name, StageType? type) =>
        value is "" or "any"
        || (value.StartsWith("type:", StringComparison.Ordinal) && type?.ToString() == value[5..])
        || (
            value.StartsWith("name:", StringComparison.Ordinal)
            && string.Equals(name, value[5..], StringComparison.OrdinalIgnoreCase)
        );

    /// <summary>Whether an assessment matches a trigger's value ("any" or its id).</summary>
    public static bool AssessmentMatches(string value, string? assessmentId) =>
        value is "" or "any"
        || string.Equals(value, assessmentId, StringComparison.OrdinalIgnoreCase);

    /// <summary>Whether a job matches a trigger's job value ("any", "job:{id}", "dept:{name}").</summary>
    public static bool JobMatches(string value, Guid jobId, string? department) =>
        value is "" or "any"
        || value == $"job:{jobId}"
        || (
            value.StartsWith("dept:", StringComparison.Ordinal)
            && string.Equals(department, value[5..], StringComparison.OrdinalIgnoreCase)
        );

    /// <summary>Condition operators: case-insensitive text, numbers when both sides are numbers.</summary>
    public static bool Compare(string actual, string op, string expected)
    {
        var a = actual.Trim().ToLowerInvariant();
        var e = expected.Trim().ToLowerInvariant();
        var numbers = decimal.TryParse(a, out var x) & decimal.TryParse(e, out var y);
        return op switch
        {
            "is" => numbers ? x == y : a == e,
            "is not" => numbers ? x != y : a != e,
            "contains" => a.Contains(e),
            "does not contain" => !a.Contains(e),
            "greater than" => numbers && x > y,
            "less than" => numbers && x < y,
            _ => false,
        };
    }
}
