using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Features.Workflows;

/// <summary>
/// The reminders we ship, as ordinary workflows marked built-in: they can be edited, paused and
/// resumed, never deleted. Settings, Reminders and alerts is their simple front.
/// </summary>
public static class BuiltInWorkflows
{
    public const string Booking = "booking-reminder";
    public const string Scorecard = "scorecard-reminder";
    public const string Stale = "stale-candidate";
    public const string Assessment = "assessment-reminder";
    public const string StageAssessment = "stage-assessment";
    public const string Owner = "MyThorneAI";

    /// <param name="Reminder">Shown on Settings, Reminders and alerts, with its day count and limit.</param>
    /// <param name="StartsOff">Added paused: the organization turns it on.</param>
    /// <param name="NoLimit">Every matching event starts a run (the step itself avoids repeats).</param>
    public sealed record Definition(
        string Key,
        string Name,
        string Description,
        bool StopWhenClosed,
        Func<Organization?, Graph> Build,
        int? MaxRuns = null,
        bool Reminder = true,
        bool StartsOff = false,
        bool NoLimit = false
    );

    private static GraphNode Node(
        string id,
        string kind,
        params (string Key, string Value)[] values
    ) => new(id, kind, values.ToDictionary(x => x.Key, x => x.Value));

    private static Graph Chain(params GraphNode[] nodes) =>
        new(
            [.. nodes],
            [.. nodes.Zip(nodes.Skip(1), (a, b) => new GraphEdge($"{a.Id}-{b.Id}", a.Id, b.Id))]
        );

    public static readonly Definition[] All =
    [
        new(
            Booking,
            "Remind candidates to pick an interview time",
            "Emails candidates who were asked to pick an interview time and have not.",
            true,
            org =>
                Chain(
                    Node(
                        "trigger",
                        "trigger.booking_unanswered",
                        ("days", (org?.BookReminderDays ?? 2).ToString()),
                        ("job", "any")
                    ),
                    Node(
                        "email",
                        "action.send_email",
                        ("to", "candidate"),
                        ("template", "booking-reminder")
                    ),
                    Node(
                        "team",
                        "action.notify",
                        ("channel", "team"),
                        ("who", "recruiter"),
                        (
                            "message",
                            "{{candidateName}} hasn’t picked a time for the {{interviewTitle}} interview for {{jobTitle}} yet."
                        )
                    )
                )
        ),
        new(
            Scorecard,
            "Remind interviewers about feedback",
            "Emails interviewers whose interview is over and who have not sent their scorecard.",
            // Feedback is still owed after a rejection.
            false,
            org =>
                Chain(
                    Node(
                        "trigger",
                        "trigger.scorecard_overdue",
                        ("days", (org?.ScorecardReminderDays ?? 2).ToString()),
                        ("job", "any")
                    ),
                    Node(
                        "email",
                        "action.send_email",
                        ("to", "interviewers"),
                        ("template", "scorecard-reminder")
                    ),
                    Node(
                        "team",
                        "action.notify",
                        ("channel", "team"),
                        ("who", "recruiter"),
                        (
                            "message",
                            "Feedback is overdue for {{candidateName}} ({{interviewTitle}}, {{jobTitle}})."
                        )
                    )
                )
        ),
        new(
            Stale,
            "Follow up on stuck applications",
            "Tells the candidate their application is still being reviewed. Recruiters get one daily summary of quiet applications in their notifications.",
            true,
            org =>
                Chain(
                    Node(
                        "trigger",
                        "trigger.stuck",
                        ("days", (org?.StaleReminderDays ?? 3).ToString()),
                        ("stage", "any"),
                        ("job", "any")
                    ),
                    Node(
                        "email",
                        "action.send_email",
                        ("to", "candidate"),
                        ("template", "stale-reminder")
                    )
                )
        ),
        new(
            Assessment,
            "Remind candidates to finish an assessment",
            "Emails candidates who have not finished an assessment, after the days set on each assessment.",
            true,
            _ =>
                Chain(
                    Node(
                        "trigger",
                        "trigger.assessment_unfinished",
                        ("assessment", "any"),
                        ("job", "any")
                    ),
                    Node(
                        "email",
                        "action.send_email",
                        ("to", "candidate"),
                        ("template", "assessment-reminder")
                    )
                ),
            // The assessments area has always sent one reminder per invite.
            MaxRuns: 1
        ),
        new(
            StageAssessment,
            "Send the stage's assessment when someone enters the stage",
            "When a candidate moves into a stage that has an assessment, sends it to them. Stages without one are skipped, and nobody gets the same assessment twice for one application.",
            true,
            _ =>
                Chain(
                    Node("trigger", "trigger.stage_entered", ("stage", "any"), ("job", "any")),
                    Node("send", "action.send_assessment", ("assessment", "stage"))
                ),
            Reminder: false,
            StartsOff: true,
            NoLimit: true
        ),
    ];

    /// <summary>Adds any built-in workflow that is missing, published and on, with the organization's old reminder settings.</summary>
    public static async Task EnsureAsync(AtsDbContext db, CancellationToken ct)
    {
        var have = await db
            .Workflows.Where(x => x.BuiltInKey != null)
            .Select(x => x.BuiltInKey!)
            .ToListAsync(ct);
        var missing = All.Where(x => !have.Contains(x.Key)).ToList();
        if (missing.Count == 0)
            return;
        var org = await db.Organizations.AsNoTracking().FirstOrDefaultAsync(ct);
        foreach (var definition in missing)
        {
            var graph = definition.Build(org);
            var json = WorkflowGraph.Serialize(graph);
            var workflow = new Workflow
            {
                Name = definition.Name,
                BuiltInKey = definition.Key,
                Status =
                    definition.StartsOff || org?.MaxReminders == 0
                        ? WorkflowStatus.Paused
                        : WorkflowStatus.Active,
                DraftGraphJson = json,
                TriggerKind = graph.Trigger!.Kind,
                RunsOncePerApplication = false,
                MaxRunsPerApplication = definition.NoLimit
                    ? null
                    : definition.MaxRuns ?? Math.Max(1, org?.MaxReminders ?? 3),
                StopWhenClosed = definition.StopWhenClosed,
                CreatedBy = Owner,
            };
            var version = new WorkflowVersion
            {
                WorkflowId = workflow.Id,
                Number = 1,
                GraphJson = json,
                Summary = "First version.",
                PublishedBy = Owner,
            };
            try
            {
                // Two saves: the workflow and its version point at each other.
                db.Workflows.Add(workflow);
                db.WorkflowVersions.Add(version);
                await db.SaveChangesAsync(ct);
                workflow.PublishedVersionId = version.Id;
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException)
            {
                // Another instance added it first.
                db.ChangeTracker.Clear();
            }
        }
    }
}
