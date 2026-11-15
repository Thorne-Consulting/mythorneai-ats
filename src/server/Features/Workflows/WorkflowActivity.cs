using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Features.Workflows;

/// <summary>
/// What a workflow did to an application, in the activity history: one "WorkflowStep" audit row per
/// step that acted, titled "Workflow: {name} · {step}" with a link to the run. The application's
/// history lists it with its other audit rows; the candidate feed merges it with <see cref="MergeAsync"/>.
/// </summary>
public static class WorkflowActivity
{
    public const string Action = "WorkflowStep";

    /// <summary>What the audit row carries. Href opens the run (admins only: workflows are admin pages).</summary>
    public sealed record StepDetails(
        string Title,
        string Workflow,
        Guid WorkflowId,
        Guid RunId,
        string Step,
        string Kind,
        string? Output,
        string Href,
        Guid[]? EmailIds = null,
        string? ToStatus = null
    );

    public static string RunHref(Guid workflowId, Guid runId) =>
        $"/settings/workflows/{workflowId}?tab=runs&run={runId}";

    /// <summary>Adds the row for a step that acted (the engine saves it with the step).</summary>
    public static void Add(
        AtsDbContext db,
        WorkflowRun run,
        string workflowName,
        GraphNode node,
        StepOutcome outcome
    )
    {
        var step = WorkflowGraph.Label(node);
        Guid[]? emails = null;
        string? toStatus = null;
        if (outcome.Detail is not null)
        {
            var detail = JsonSerializer.SerializeToElement(outcome.Detail, WorkflowGraph.Json);
            if (detail.TryGetProperty("emails", out var list))
                emails = [.. list.EnumerateArray().Select(x => x.GetProperty("id").GetGuid())];
            if (detail.TryGetProperty("toStatus", out var status))
                toStatus = status.GetString();
        }
        Audit.Add(
            db,
            $"workflow:{run.WorkflowId}",
            "Application",
            run.ApplicationId,
            Action,
            new StepDetails(
                $"Workflow: {workflowName} · {step}",
                workflowName,
                run.WorkflowId,
                run.Id,
                step,
                node.Kind,
                outcome.Output,
                RunHref(run.WorkflowId, run.Id),
                emails is { Length: > 0 } ? emails : null,
                toStatus
            )
        );
    }

    private static string FeedType(string kind) =>
        kind switch
        {
            "action.move_stage" or "action.reject" => "stage",
            "action.send_email" => "email",
            "action.add_tag" or "action.remove_tag" => "profile",
            _ => "workflow",
        };

    /// <summary>
    /// Puts workflow steps into the candidate feed. A step's own effect (its stage move, its email)
    /// is replaced by the step's row, so each thing shows once and says which workflow did it.
    /// </summary>
    public static async Task MergeAsync(
        AtsDbContext db,
        List<ActivityItem> items,
        IReadOnlyCollection<Guid> appIds,
        IReadOnlyDictionary<Guid, string> jobOf,
        DateTimeOffset cursor,
        int take,
        Func<string, bool> want,
        bool details,
        bool admin,
        CancellationToken ct
    )
    {
        var keys = appIds.Select(x => x.ToString()).ToList();
        var rows = await db
            .AuditEvents.AsNoTracking()
            .Where(e =>
                e.EntityType == "Application"
                && e.Action == Action
                && keys.Contains(e.EntityId)
                && e.OccurredAt < cursor
            )
            .OrderByDescending(e => e.OccurredAt)
            .Take(take)
            .ToListAsync(ct);
        foreach (var row in rows)
        {
            if (
                row.Details is null
                || JsonSerializer.Deserialize<StepDetails>(row.Details) is not { } step
            )
                continue;
            var type = FeedType(step.Kind);
            // Emails, alerts and webhooks name addresses: only for people who see contact details.
            if (!want(type) || (!details && type is "email" or "workflow"))
                continue;
            var appId = Guid.Parse(row.EntityId);
            string? delivery = null;
            if (step.Kind is "action.move_stage" or "action.reject")
                items.RemoveAll(x =>
                    x.Type == "stage"
                    && x.ApplicationId == appId
                    && x.ActorEmail == $"workflow:{step.WorkflowId}"
                    && Math.Abs((x.At - row.OccurredAt).TotalSeconds) < 60
                );
            foreach (var id in step.EmailIds ?? [])
            {
                var email = items.FirstOrDefault(x => x.Id == $"email-{id}");
                if (email is null)
                    continue;
                delivery ??= Read(email.Data, "DeliveryStatus");
                items.Remove(email);
            }
            items.Add(
                new ActivityItem(
                    $"workflow-{row.Id}",
                    type,
                    row.OccurredAt,
                    null,
                    appId,
                    jobOf.GetValueOrDefault(appId),
                    step.Title,
                    step.Output,
                    new
                    {
                        Status = step.ToStatus,
                        DeliveryStatus = delivery,
                        RunHref = admin ? step.Href : null,
                    }
                )
            );
        }
        // Moves a workflow made before this history existed still name no robot address.
        for (var i = 0; i < items.Count; i++)
            if (items[i].ActorEmail?.StartsWith("workflow:", StringComparison.Ordinal) == true)
                items[i] = items[i] with { ActorEmail = null };
    }

    private static string? Read(object? data, string name) =>
        data is null ? null
        : JsonSerializer.SerializeToElement(data).TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
        : null;
}
