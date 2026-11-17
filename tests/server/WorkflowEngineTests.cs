using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Features.Workflows;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>One database and app for the workflow tests, with the workflow worker off so each test moves runs itself.</summary>
public sealed class WorkflowFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_workflow_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();

    public WebApplicationFactory<Program> Factory { get; private set; } = null!;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        Factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureTestServices(services =>
            {
                services.Remove(
                    services.Single(x => x.ImplementationType == typeof(WorkflowWorker))
                );
                services.AddSingleton<Microsoft.Extensions.AI.IChatClient>(new FakeResumeChat());
            });
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                    configuration.AddInMemoryCollection(
                        new Dictionary<string, string?>
                        {
                            ["ConnectionStrings:AtsDatabase"] = _database.GetConnectionString(),
                            ["Auth:Mode"] = "Development",
                            ["FileStorage:RootPath"] = Path.Combine(
                                Path.GetTempPath(),
                                $"ats-wf-{Guid.NewGuid():N}"
                            ),
                        }
                    )
            );
        });
        using var client = Factory.CreateClient();
        (await client.GetAsync("/health")).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    public async ValueTask DisposeAsync()
    {
        await Factory.DisposeAsync();
        await _database.DisposeAsync();
    }
}

public sealed class WorkflowEngineTests(WorkflowFixture fixture) : IClassFixture<WorkflowFixture>
{
    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private AsyncServiceScope Scope(out AtsDbContext db)
    {
        var scope = fixture.Factory.Services.CreateAsyncScope();
        db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        return scope;
    }

    private static GraphNode N(
        string id,
        string kind,
        params (string Key, string Value)[] values
    ) => new(id, kind, values.ToDictionary(x => x.Key, x => x.Value));

    private static Graph G(
        GraphNode[] nodes,
        params (string From, string To, string? Handle)[] edges
    ) =>
        new(
            [.. nodes],
            [.. edges.Select((e, i) => new GraphEdge($"e{i}", e.From, e.To, e.Handle))]
        );

    private static Graph Chain(params GraphNode[] nodes) =>
        G(nodes, [.. nodes.Zip(nodes.Skip(1), (a, b) => (a.Id, b.Id, (string?)null))]);

    /// <summary>Every test starts with no active workflows and no runs, quiet hours off.</summary>
    private async Task ResetAsync()
    {
        await using var scope = Scope(out var db);
        await db.WorkflowRuns.ExecuteDeleteAsync(Ct);
        await db.Workflows.ExecuteUpdateAsync(
            s => s.SetProperty(x => x.Status, WorkflowStatus.Paused),
            Ct
        );
        await db.Organizations.ExecuteUpdateAsync(
            s =>
                s.SetProperty(x => x.QuietHoursStart, 0)
                    .SetProperty(x => x.QuietHoursEnd, 0)
                    .SetProperty(x => x.NotificationWebhookUrl, (string?)null),
            Ct
        );
    }

    private async Task<Guid> PublishAsync(Graph graph, Action<Workflow>? configure = null)
    {
        await using var scope = Scope(out var db);
        var json = WorkflowGraph.Serialize(graph);
        var w = new Workflow
        {
            Name = $"Test {Guid.NewGuid():N}"[..20],
            DraftGraphJson = json,
            Status = WorkflowStatus.Active,
            TriggerKind = graph.Trigger!.Kind,
            CreatedBy = "admin@example.test",
        };
        configure?.Invoke(w);
        var v = new WorkflowVersion
        {
            WorkflowId = w.Id,
            Number = 1,
            GraphJson = json,
            PublishedBy = "admin@example.test",
        };
        db.Workflows.Add(w);
        db.WorkflowVersions.Add(v);
        await db.SaveChangesAsync(Ct);
        w.PublishedVersionId = v.Id;
        await db.SaveChangesAsync(Ct);
        return w.Id;
    }

    /// <summary>An active application whose job has a few stages, with clean tags.</summary>
    private async Task<(Guid App, Guid Job, List<PipelineStage> Stages)> ApplicationAsync(
        int skip = 0
    )
    {
        await using var scope = Scope(out var db);
        var app = await db
            .Applications.Include(x => x.Requisition!.Stages)
            .Include(x => x.Candidate)
            .Where(x =>
                x.Status == ApplicationStatus.Active
                && x.Requisition!.Stages.Count >= 4
                && !x.Candidate!.DoNotContact
            )
            .OrderBy(x => x.Id)
            .Skip(skip)
            .FirstAsync(Ct);
        app.Candidate!.Tags = [];
        app.Candidate.EmailBounced = false;
        app.PipelineStageId = app.Requisition!.Stages.OrderBy(x => x.SortOrder).First().Id;
        await db.SaveChangesAsync(Ct);
        return (
            app.Id,
            app.RequisitionId,
            app.Requisition.Stages.OrderBy(x => x.SortOrder).ToList()
        );
    }

    private async Task MoveAsync(Guid appId, Guid stageId)
    {
        await using var scope = Scope(out var db);
        var app = await db
            .Applications.Include(x => x.Requisition)
            .SingleAsync(x => x.Id == appId, Ct);
        var from = app.PipelineStageId;
        app.PipelineStageId = stageId;
        await PipelineEvents.OnMovedAsync(db, app, from, app.Status, "recruiter@example.test", Ct);
        await db.SaveChangesAsync(Ct);
    }

    private async Task<List<WorkflowRun>> RunsAsync(Guid workflowId)
    {
        await using var scope = Scope(out var db);
        return await db
            .WorkflowRuns.AsNoTracking()
            .Include(x => x.Steps)
            .Where(x => x.WorkflowId == workflowId)
            .ToListAsync(Ct);
    }

    private async Task StepAsync(Guid runId, DateTimeOffset? now = null)
    {
        await using var scope = Scope(out var db);
        await WorkflowEngine.RunAsync(db, runId, now ?? DateTimeOffset.UtcNow, Ct);
    }

    private async Task<List<EmailOutboxItem>> EmailsAsync(Guid appId, DateTimeOffset since)
    {
        await using var scope = Scope(out var db);
        return await db
            .EmailOutbox.AsNoTracking()
            .Where(x => x.ApplicationId == appId && x.CreatedAt >= since)
            .ToListAsync(Ct);
    }

    [Fact]
    public async Task Stage_triggers_match_stage_and_job_and_run_once_per_application()
    {
        await ResetAsync();
        var (app, job, stages) = await ApplicationAsync();
        var target = stages[2];
        var matching = await PublishAsync(
            Chain(
                N(
                    "t",
                    "trigger.stage_entered",
                    ("stage", $"name:{target.Name}"),
                    ("job", $"job:{job}")
                ),
                N("a", "action.add_tag", ("tags", "Seen"))
            )
        );
        var otherJob = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered", ("stage", "any"), ("job", $"job:{Guid.NewGuid()}")),
                N("a", "action.add_tag", ("tags", "Never"))
            )
        );
        var left = await PublishAsync(
            Chain(
                N("t", "trigger.stage_left", ("stage", $"name:{stages[0].Name}")),
                N("a", "action.add_tag", ("tags", "Left"))
            )
        );

        await MoveAsync(app, stages[1].Id);
        (await RunsAsync(matching)).ShouldBeEmpty();
        (await RunsAsync(left)).Count.ShouldBe(1);

        await MoveAsync(app, target.Id);
        await MoveAsync(app, stages[1].Id);
        await MoveAsync(app, target.Id);
        var runs = await RunsAsync(matching);
        runs.Count.ShouldBe(1, "once per application");
        runs[0].DedupeKey.ShouldBe("once");
        (await RunsAsync(otherJob)).ShouldBeEmpty();
    }

    [Fact]
    public async Task Every_time_mode_respects_the_run_limit()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(1);
        var other = stages.First(x => x.Type != stages[0].Type);
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered", ("stage", $"type:{other.Type}")),
                N("a", "action.add_tag", ("tags", "Again"))
            ),
            w =>
            {
                w.RunsOncePerApplication = false;
                w.MaxRunsPerApplication = 2;
            }
        );
        for (var i = 0; i < 3; i++)
        {
            await MoveAsync(app, stages[0].Id);
            await MoveAsync(app, other.Id);
        }
        (await RunsAsync(id)).Count.ShouldBe(2);
    }

    [Fact]
    public async Task Rejection_tag_reply_scorecard_interview_and_offer_events_start_runs()
    {
        await ResetAsync();
        var (app, _, _) = await ApplicationAsync(2);
        var ids = new Dictionary<string, Guid>();
        foreach (
            var (kind, values) in new (string, (string, string)[])[]
            {
                ("trigger.candidate_rejected", [("reason", "Skills mismatch")]),
                ("trigger.tag_added", [("tag", "vip")]),
                ("trigger.candidate_replied", []),
                ("trigger.scorecard_submitted", [("recommendation", "positive")]),
                ("trigger.interview_completed", []),
                ("trigger.offer_sent", []),
            }
        )
            ids[kind] = await PublishAsync(
                Chain(N("t", kind, values), N("a", "action.add_tag", ("tags", "x"))),
                w => w.StopWhenClosed = false
            );

        await using (var scope = Scope(out var db))
        {
            var application = await db
                .Applications.Include(x => x.Candidate)
                .SingleAsync(x => x.Id == app, Ct);
            application.Candidate!.Tags = ["VIP"];
            db.ApplicationMessages.Add(
                new ApplicationMessage
                {
                    ApplicationId = app,
                    FromCandidate = true,
                    Body = "Hello",
                }
            );
            var interview = new Interview
            {
                ApplicationId = app,
                Title = "Screen",
                StartsAt = DateTimeOffset.UtcNow.AddHours(-2),
                EndsAt = DateTimeOffset.UtcNow.AddHours(-1),
                TimeZone = "UTC",
                InterviewerEmails = ["interviewer@example.test"],
            };
            db.Interviews.Add(interview);
            var offer = new Offer
            {
                ApplicationId = app,
                Status = OfferStatus.Approved,
                CreatedBy = "recruiter@example.test",
            };
            db.Offers.Add(offer);
            await db.SaveChangesAsync(Ct);

            interview.Status = InterviewStatus.Completed;
            offer.Status = OfferStatus.Sent;
            db.Scorecards.Add(
                new Scorecard
                {
                    InterviewId = interview.Id,
                    InterviewerEmail = "interviewer@example.test",
                    Recommendation = Recommendation.Yes,
                    Evidence = "e",
                    Strengths = "s",
                    Concerns = "c",
                }
            );
            await db.SaveChangesAsync(Ct);

            application.Status = ApplicationStatus.Rejected;
            application.DispositionReason = "Skills mismatch";
            await db.SaveChangesAsync(Ct);
        }
        foreach (var (kind, id) in ids)
            (await RunsAsync(id)).Count.ShouldBe(1, kind);
    }

    [Fact]
    public async Task A_wait_holds_the_run_until_its_time()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(3);
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered"),
                N("w", "logic.wait", ("duration", "2 days")),
                N("a", "action.add_tag", ("tags", "Waited"))
            )
        );
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        var now = DateTimeOffset.UtcNow;
        await StepAsync(run.Id, now);
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Waiting);
        run.NextRunAt.ShouldBe(now.AddDays(2), TimeSpan.FromSeconds(1));
        run.Steps.Single(x => x.NodeId == "w").Status.ShouldBe("Waiting");

        await using (var scope = Scope(out var db))
            (await WorkflowEngine.RunDueAsync(db, now.AddDays(1), Ct)).ShouldBeFalse("not due yet");
        await using (var scope = Scope(out var db))
            (await WorkflowEngine.RunDueAsync(db, now.AddDays(2).AddMinutes(1), Ct)).ShouldBeTrue();
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Completed);
        run.Steps.Single(x => x.NodeId == "w").Status.ShouldBe("Done");
        await using (var scope = Scope(out var db))
            (
                await db
                    .Applications.Where(x => x.Id == app)
                    .Select(x => x.Candidate!.Tags)
                    .SingleAsync(Ct)
            ).ShouldContain("Waited");
    }

    [Fact]
    public void Business_waits_skip_weekends_and_land_in_working_hours()
    {
        var friday = new DateTimeOffset(2026, 11, 13, 16, 0, 0, TimeSpan.Zero);
        WorkflowEngine
            .WaitUntil(friday, TimeSpan.FromDays(1), true, false, TimeZoneInfo.Utc)
            .DayOfWeek.ShouldBe(DayOfWeek.Monday);
        var late = WorkflowEngine.WaitUntil(
            friday,
            TimeSpan.FromHours(3),
            false,
            true,
            TimeZoneInfo.Utc
        );
        late.ShouldBe(new DateTimeOffset(2026, 11, 16, 9, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public async Task A_failing_step_retries_with_backoff_then_fails_and_can_be_retried()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(4);
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered"),
                N("e", "action.send_email", ("to", "candidate"), ("template", "gone-template"))
            )
        );
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        var now = DateTimeOffset.UtcNow;
        await StepAsync(run.Id, now);
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Running);
        run.Attempts.ShouldBe(1);
        run.NextRunAt.ShouldBe(now.AddMinutes(1), TimeSpan.FromSeconds(1));
        run.Steps.Single(x => x.NodeId == "e").Status.ShouldBe("Failed");
        foreach (var wait in WorkflowEngine.Backoff)
        {
            now += wait + TimeSpan.FromSeconds(1);
            await StepAsync(run.Id, now);
        }
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Failed);
        run.Attempts.ShouldBe(5);
        run.LastError!.ShouldContain("no longer exists");
        run.Steps.Count(x => x.NodeId == "e").ShouldBe(1, "a retry updates the step's row");

        using var admin = await AdminAsync();
        (await admin.PostAsync($"/api/workflow-runs/{run.Id}/retry", null, Ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Running);
        run.Attempts.ShouldBe(0);
    }

    [Fact]
    public async Task A_step_runs_once_even_when_the_run_is_moved_twice_or_is_locked()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(5);
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered"),
                N(
                    "e",
                    "action.send_email",
                    ("to", "recruiter"),
                    ("subject", "Once {{firstName}}"),
                    ("body", "Only one")
                )
            )
        );
        var since = DateTimeOffset.UtcNow;
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();

        // Someone else holds the run: nothing happens.
        await using (var scope = Scope(out var db))
            await db
                .WorkflowRuns.Where(x => x.Id == run.Id)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.LockedUntil, DateTimeOffset.UtcNow.AddMinutes(5)),
                    Ct
                );
        await StepAsync(run.Id);
        (await EmailsAsync(app, since)).Where(x => x.Subject.StartsWith("Once")).ShouldBeEmpty();

        await using (var scope = Scope(out var db))
            await db
                .WorkflowRuns.Where(x => x.Id == run.Id)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.LockedUntil, (DateTimeOffset?)null),
                    Ct
                );
        await Task.WhenAll(StepAsync(run.Id), StepAsync(run.Id));
        await StepAsync(run.Id);
        (await EmailsAsync(app, since)).Count(x => x.Subject.StartsWith("Once")).ShouldBe(1);
        (await RunsAsync(id)).Single().Status.ShouldBe(WorkflowRunStatus.Completed);
    }

    [Fact]
    public async Task Checks_and_splits_take_the_right_path()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(6);
        await using (var scope = Scope(out var db))
        {
            var a = await db
                .Applications.Include(x => x.Candidate)
                .SingleAsync(x => x.Id == app, Ct);
            a.Candidate!.Tags = ["Referral"];
            a.Rating = 4;
            await db.SaveChangesAsync(Ct);
        }
        var graph = G(
            [
                N("t", "trigger.stage_entered"),
                N(
                    "c",
                    "logic.condition",
                    ("field", "rating"),
                    ("operator", "greater than"),
                    ("value", "3")
                ),
                N("s", "logic.split", ("field", "tags"), ("branches", "Agency, Referral")),
                N("yes", "action.add_tag", ("tags", "HighRated")),
                N("no", "action.add_tag", ("tags", "LowRated")),
                N("ref", "action.add_tag", ("tags", "FromReferral")),
                N("other", "action.add_tag", ("tags", "Elsewhere")),
            ],
            ("t", "c", null),
            ("c", "s", "yes"),
            ("c", "no", "no"),
            ("s", "ref", "v:Referral"),
            ("s", "other", "other"),
            ("ref", "yes", null)
        );
        var id = await PublishAsync(graph);
        await MoveAsync(app, stages[1].Id);
        await StepAsync((await RunsAsync(id)).Single().Id);
        var run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Completed);
        run.Steps.Single(x => x.NodeId == "c").Branch.ShouldBe("yes");
        run.Steps.Single(x => x.NodeId == "s").Branch.ShouldBe("v:Referral");
        run.Steps.Select(x => x.NodeId).ShouldNotContain("no");
        await using (var scope2 = Scope(out var db2))
            (
                await db2
                    .Applications.Where(x => x.Id == app)
                    .Select(x => x.Candidate!.Tags)
                    .SingleAsync(Ct)
            ).ShouldBe(["Referral", "FromReferral", "HighRated"], ignoreOrder: true);
    }

    [Fact]
    public async Task Actions_write_to_the_outboxes_move_reject_and_tag()
    {
        await ResetAsync();
        var (app, job, stages) = await ApplicationAsync(7);
        Guid endpointId;
        await using (var scope = Scope(out var db))
        {
            var endpoint = new WebhookEndpoint
            {
                Url = "https://hooks.example.test/in",
                Secret = WebhookEvents.NewSecret(),
            };
            db.WebhookEndpoints.Add(endpoint);
            (await db.Organizations.FirstAsync(Ct)).NotificationWebhookUrl =
                "https://hooks.slack.test/abc";
            await db.SaveChangesAsync(Ct);
            endpointId = endpoint.Id;
        }
        var target = stages[2];
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered", ("stage", "any")),
                N("tpl", "action.send_email", ("to", "candidate"), ("template", "stale-reminder")),
                N(
                    "own",
                    "action.send_email",
                    ("to", "person:lead@example.test"),
                    ("subject", "About {{candidateName}}"),
                    ("body", "{{jobTitle}} needs you")
                ),
                N(
                    "mail",
                    "action.notify",
                    ("who", "hiringManager"),
                    ("channel", "email"),
                    ("message", "Look at {{candidateName}}")
                ),
                N(
                    "team",
                    "action.notify",
                    ("who", "recruiter"),
                    ("channel", "team"),
                    ("message", "Team: {{candidateName}}")
                ),
                N(
                    "bell",
                    "action.notify",
                    ("who", "recruiter"),
                    ("channel", "inapp"),
                    ("message", "Bell for {{candidateName}}")
                ),
                N("tag", "action.add_tag", ("tags", "Auto, Second")),
                N("untag", "action.remove_tag", ("tags", "Second")),
                N("hook", "action.webhook", ("endpoint", endpointId.ToString())),
                N("move", "action.move_stage", ("stage", $"name:{target.Name}")),
                N("reject", "action.reject", ("reason", "Skills mismatch"), ("email", "yes"))
            )
        );
        var since = DateTimeOffset.UtcNow;
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        await StepAsync(run.Id);
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Completed, run.LastError);

        await using var check = Scope(out var db2);
        var application = await db2
            .Applications.AsNoTracking()
            .Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .SingleAsync(x => x.Id == app, Ct);
        var emails = await EmailsAsync(app, since);
        emails.ShouldContain(x =>
            x.TemplateKey == "stale-reminder" && x.Recipient == application.Candidate!.Email
        );
        emails.ShouldContain(x =>
            x.Recipient == "lead@example.test"
            && x.Subject
                == $"About {application.Candidate!.FirstName} {application.Candidate.LastName}"
        );
        emails.ShouldContain(x =>
            x.Recipient == application.Requisition!.OwnerEmail && x.Body.StartsWith("Look at")
        );
        emails.ShouldContain(x => x.TemplateKey == "rejection");
        var deliveries = await db2
            .WebhookDeliveries.AsNoTracking()
            .Where(x => x.CreatedAt >= since)
            .ToListAsync(Ct);
        deliveries.ShouldContain(x =>
            x.EventType == "notification" && x.Payload.Contains("Team: ")
        );
        // The endpoint takes every event, so the stage move and rejection reach it too.
        var hook = deliveries.Single(x =>
            x.EndpointId == endpointId && x.EventType == "workflow.action"
        );
        hook.EventType.ShouldBe("workflow.action");
        hook.Payload.ShouldContain(app.ToString());
        // Signed by the webhook worker with the endpoint's secret, like every other delivery.
        hook.Endpoint = await db2.WebhookEndpoints.FindAsync([endpointId], Ct);
        WebhookWorker
            .Headers(hook, DateTimeOffset.UtcNow)
            .ShouldContain(x => x.Key == "webhook-signature");
        (
            await db2.Notifications.AnyAsync(
                x =>
                    x.Kind == NotificationKinds.WorkflowAlert
                    && x.UserEmail == application.Requisition!.RecruiterEmail.ToLower()
                    && x.Title.StartsWith("Bell for"),
                Ct
            )
        ).ShouldBeTrue();
        application.Candidate!.Tags.ShouldContain("Auto");
        application.Candidate.Tags.ShouldNotContain("Second");
        application.PipelineStageId.ShouldBe(target.Id);
        application.Status.ShouldBe(ApplicationStatus.Rejected);
        application.DispositionReason.ShouldBe("Skills mismatch");
        (
            await db2.StageTransitions.AnyAsync(
                x =>
                    x.ApplicationId == app
                    && x.ToStageId == target.Id
                    && x.ActorEmail == $"workflow:{id}",
                Ct
            )
        ).ShouldBeTrue();
        // Its own move into a stage does not start the same workflow again.
        (await RunsAsync(id)).Count.ShouldBe(1);
    }

    [Fact]
    public async Task A_closed_application_stops_the_run_before_its_next_step()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(8);
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered"),
                N("w", "logic.wait", ("duration", "1 hours")),
                N(
                    "e",
                    "action.send_email",
                    ("to", "candidate"),
                    ("subject", "Hi"),
                    ("body", "Hello")
                )
            )
        );
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        await StepAsync(run.Id);
        await using (var scope = Scope(out var db))
            await db
                .Applications.Where(x => x.Id == app)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.Status, ApplicationStatus.Withdrawn),
                    Ct
                );
        await StepAsync(run.Id, DateTimeOffset.UtcNow.AddHours(2));
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Cancelled);
        run.LastError!.ShouldContain("withdrawn");
    }

    [Fact]
    public async Task Time_triggers_start_runs_once_per_day_count_up_to_the_limit()
    {
        await ResetAsync();
        var (app, job, _) = await ApplicationAsync(9);
        await using (var scope = Scope(out var db))
        {
            await db
                .Applications.Where(x => x.Id == app)
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.LastActivityAt, DateTimeOffset.UtcNow.AddDays(-10)),
                    Ct
                );
            // Waiting on the candidate to pick a time is not stuck.
            await db
                .Interviews.Where(x =>
                    x.ApplicationId == app && x.Status == InterviewStatus.Proposed
                )
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.Status, InterviewStatus.Cancelled),
                    Ct
                );
        }
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stuck", ("days", "3"), ("job", $"job:{job}")),
                N("a", "action.add_tag", ("tags", "Stuck"))
            ),
            w =>
            {
                w.RunsOncePerApplication = false;
                w.MaxRunsPerApplication = 2;
            }
        );
        var now = DateTimeOffset.UtcNow;
        await using (var scope = Scope(out var db))
            await WorkflowTriggers.SweepAsync(db, now, false, Ct);
        await using (var scope = Scope(out var db))
            await WorkflowTriggers.SweepAsync(db, now.AddHours(1), false, Ct);
        (await RunsAsync(id))
            .Count(x => x.ApplicationId == app)
            .ShouldBe(1, "waits its day count before repeating");
        await using (var scope = Scope(out var db))
            await WorkflowTriggers.SweepAsync(db, now.AddDays(4), false, Ct);
        await using (var scope = Scope(out var db))
            await WorkflowTriggers.SweepAsync(db, now.AddDays(8), false, Ct);
        (await RunsAsync(id)).Count(x => x.ApplicationId == app).ShouldBe(2, "stops at the limit");
    }

    [Fact]
    public async Task Built_in_reminders_exist_and_wait_for_the_switch()
    {
        await using var scope = Scope(out var db);
        await BuiltInWorkflows.EnsureAsync(db, Ct);
        var builtIns = await db
            .Workflows.AsNoTracking()
            .Where(x => x.BuiltInKey != null)
            .ToListAsync(Ct);
        builtIns
            .Select(x => x.BuiltInKey)
            .ShouldBe(
                [
                    BuiltInWorkflows.Booking,
                    BuiltInWorkflows.Scorecard,
                    BuiltInWorkflows.Stale,
                    BuiltInWorkflows.Assessment,
                    BuiltInWorkflows.StageAssessment,
                ],
                ignoreOrder: true
            );
        builtIns.ShouldAllBe(x => x.PublishedVersionId != null && !x.RunsOncePerApplication);
        foreach (var w in builtIns)
            WorkflowGraph.Validate(WorkflowGraph.Parse(w.DraftGraphJson)).ShouldBeEmpty(w.Name);

        // Every built-in's time trigger query runs.
        await db
            .Workflows.Where(x => x.BuiltInKey != null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, WorkflowStatus.Active), Ct);
        await WorkflowTriggers.SweepAsync(db, DateTimeOffset.UtcNow, true, Ct);
        await db
            .Workflows.Where(x => x.BuiltInKey != null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Status, WorkflowStatus.Paused), Ct);

        using var admin = await AdminAsync();
        (await admin.DeleteAsync($"/api/workflows/{builtIns[0].Id}", Ct)).StatusCode.ShouldBe(
            HttpStatusCode.Conflict
        );
        (
            await admin.PutAsJsonAsync(
                "/api/workflows/reminders/stale-candidate",
                new
                {
                    enabled = true,
                    days = 5,
                    maxReminders = 2,
                },
                Ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var reminders = await admin.GetFromJsonAsync<JsonElement>("/api/workflows/reminders", Ct);
        var stale = reminders
            .EnumerateArray()
            .Single(x => x.GetProperty("key").GetString() == "stale-candidate");
        stale.GetProperty("days").GetInt32().ShouldBe(5);
        stale.GetProperty("maxReminders").GetInt32().ShouldBe(2);
    }

    [Fact]
    public async Task Assessment_completed_from_PipelineEvents_starts_runs_and_its_score_can_be_checked()
    {
        await ResetAsync();
        var (app, _, _) = await ApplicationAsync(11);
        var assessmentId = Guid.NewGuid();
        var id = await PublishAsync(
            G(
                [
                    N("t", "trigger.assessment_completed", ("assessment", assessmentId.ToString())),
                    N(
                        "c",
                        "logic.condition",
                        ("field", "assessmentScore"),
                        ("operator", "greater than"),
                        ("value", "70")
                    ),
                    N("y", "action.add_tag", ("tags", "Passed test")),
                ],
                ("t", "c", null),
                ("c", "y", "yes")
            )
        );
        await using (var scope = Scope(out var db))
        {
            await PipelineEvents.PublishAsync(
                db,
                "assessment.completed",
                new
                {
                    inviteId = Guid.NewGuid(),
                    assessmentId = Guid.NewGuid(),
                    applicationId = app,
                    percent = 90,
                },
                Ct
            );
            await db.SaveChangesAsync(Ct);
            (await RunsAsync(id)).ShouldBeEmpty("another assessment");
            await PipelineEvents.PublishAsync(
                db,
                "assessment.completed",
                new
                {
                    inviteId = Guid.NewGuid(),
                    assessmentId,
                    applicationId = app,
                    percent = 85,
                },
                Ct
            );
            await db.SaveChangesAsync(Ct);
        }
        var run = (await RunsAsync(id)).Single();
        await StepAsync(run.Id);
        run = (await RunsAsync(id)).Single();
        run.Steps.Single(x => x.NodeId == "c").Branch.ShouldBe("yes");
        await using (var scope = Scope(out var db))
            (
                await db
                    .Applications.Where(x => x.Id == app)
                    .Select(x => x.Candidate!.Tags)
                    .SingleAsync(Ct)
            ).ShouldContain("Passed test");
    }

    [Fact]
    public void The_graph_checks_find_what_would_break_a_run()
    {
        var jobId = Guid.NewGuid();
        var refs = new GraphReferences([jobId], ["review"], ["rejection"], []);
        var graph = G(
            [
                N(
                    "t",
                    "trigger.stage_entered",
                    ("stage", "name:Gone"),
                    ("job", $"job:{Guid.NewGuid()}")
                ),
                N("r", "action.reject"),
                N("e", "action.send_email", ("to", "candidate")),
                N("x", "action.add_tag", ("tags", "a")),
                N("h", "action.webhook", ("endpoint", Guid.NewGuid().ToString())),
                N("o", "action.add_tag", ("tags", "orphan")),
            ],
            ("t", "r", null),
            ("t", "e", null),
            ("e", "x", null),
            ("x", "h", null)
        );
        var text = string.Join("\n", WorkflowGraph.Validate(graph, refs).Select(x => x.Message));
        text.ShouldContain("needs a reason");
        text.ShouldContain("leads to 2 steps from one output");
        text.ShouldContain("needs a subject");
        text.ShouldContain("job that no longer exists");
        text.ShouldContain("“Gone”");
        text.ShouldContain("webhook that was deleted");
        text.ShouldContain("not linked to the start: Add tag");

        var loop = G(
            [
                N("t", "trigger.tag_added", ("tag", "a")),
                N("a", "logic.wait", ("duration", "1 days")),
                N("b", "logic.wait", ("duration", "1 days")),
            ],
            ("t", "a", null),
            ("a", "b", null),
            ("b", "a", null)
        );
        WorkflowGraph.Validate(loop).ShouldContain(x => x.Message.Contains("in a circle"));
        WorkflowGraph
            .Summarize(
                Chain(N("t", "trigger.tag_added", ("tag", "a"))),
                Chain(
                    N("t", "trigger.tag_added", ("tag", "b")),
                    N("w", "logic.wait", ("duration", "1 days"))
                )
            )
            .ShouldBe("Added Wait. Changed Tag added.");
    }

    [Fact]
    public async Task Publish_refuses_problems_and_the_dry_run_changes_nothing()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(10);
        using var admin = await AdminAsync();
        var created = await (
            await admin.PostAsJsonAsync(
                "/api/workflows",
                new
                {
                    name = "Dry",
                    graph = Chain(N("t", "trigger.stage_entered"), N("r", "action.reject")),
                },
                Ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(Ct);
        var id = created.GetProperty("id").GetGuid();
        var refused = await admin.PostAsJsonAsync(
            $"/api/workflows/{id}/publish",
            new { note = "", includeExisting = false },
            Ct
        );
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await refused.Content.ReadAsStringAsync(Ct)).ShouldContain("needs a reason");

        var graph = Chain(
            N("t", "trigger.stage_entered"),
            N("m", "action.move_stage", ("stage", $"name:{stages[2].Name}")),
            N(
                "e",
                "action.send_email",
                ("to", "candidate"),
                ("subject", "Hi {{firstName}}"),
                ("body", "Body")
            )
        );
        var since = DateTimeOffset.UtcNow;
        var test = await admin.PostAsJsonAsync(
            $"/api/workflows/{id}/test",
            new { graph, applicationId = app },
            Ct
        );
        test.StatusCode.ShouldBe(HttpStatusCode.OK);
        var steps = (await test.Content.ReadFromJsonAsync<JsonElement>(Ct)).GetProperty("steps");
        steps.GetArrayLength().ShouldBe(3);
        steps[1].GetProperty("output").GetString()!.ShouldStartWith("Would move");
        steps[2]
            .GetProperty("detail")
            .GetProperty("emails")[0]
            .GetProperty("subject")
            .GetString()!
            .ShouldStartWith("Hi ");
        await using var scope = Scope(out var db);
        (
            await db
                .Applications.Where(x => x.Id == app)
                .Select(x => x.PipelineStageId)
                .SingleAsync(Ct)
        ).ShouldBe(stages[0].Id);
        (await EmailsAsync(app, since)).ShouldBeEmpty();
    }

    private Task<HttpClient> AdminAsync() => LoginAsync("admin@example.test");

    private async Task<HttpClient> LoginAsync(string email)
    {
        var client = fixture.Factory.CreateClient(
            new WebApplicationFactoryClientOptions { HandleCookies = true }
        );
        (
            await client.PostAsJsonAsync("/api/auth/dev-login", new { email }, Ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var csrf = await client.GetFromJsonAsync<JsonElement>("/api/auth/csrf", Ct);
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
        return client;
    }

    private async Task<string[]> TagsAsync(Guid app)
    {
        await using var scope = Scope(out var db);
        return await db
            .Applications.Where(x => x.Id == app)
            .Select(x => x.Candidate!.Tags)
            .SingleAsync(Ct);
    }

    private static Graph ApprovalGraph() =>
        G(
            [
                N("t", "trigger.stage_entered"),
                N(
                    "ask",
                    "action.approval",
                    ("approvers", "person:manager@example.test"),
                    ("mode", "Parallel"),
                    ("question", "Move {{candidateName}} to the onsite")
                ),
                N("yes", "action.add_tag", ("tags", "Approved")),
                N("no", "action.add_tag", ("tags", "Turned down")),
            ],
            ("t", "ask", null),
            ("ask", "yes", "yes"),
            ("ask", "no", "no")
        );

    [Fact]
    public async Task An_approval_step_waits_and_all_three_approval_subjects_decide_correctly()
    {
        await ResetAsync();
        WorkflowGraph.Validate(ApprovalGraph()).ShouldBeEmpty();
        var id = await PublishAsync(ApprovalGraph());
        using var manager = await LoginAsync("manager@example.test");

        async Task<(Guid App, WorkflowRun Run, JsonElement Item)> AskAsync(int skip)
        {
            var (app, _, stages) = await ApplicationAsync(skip);
            await MoveAsync(app, stages[1].Id);
            var run = (await RunsAsync(id)).Single(x => x.ApplicationId == app);
            await StepAsync(run.Id);
            run = (await RunsAsync(id)).Single(x => x.Id == run.Id);
            run.Status.ShouldBe(WorkflowRunStatus.Waiting);
            run.Steps.Single(x => x.NodeId == "ask").Status.ShouldBe("Waiting");
            run.NextRunAt.ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddDays(300), "no clock");
            var waiting = await manager.GetFromJsonAsync<JsonElement>(
                "/api/approvals?scope=waiting",
                Ct
            );
            var item = waiting
                .EnumerateArray()
                .Single(x => x.GetProperty("subjectId").GetGuid() == run.Id);
            return (app, run, item);
        }

        // Approved: the decision wakes the run, which goes down the Yes path.
        var (approvedApp, approvedRun, item) = await AskAsync(12);
        item.GetProperty("type").GetString().ShouldBe("WorkflowRun");
        item.GetProperty("applicationId").GetGuid().ShouldBe(approvedApp);
        item.GetProperty("note").GetString()!.ShouldStartWith("Move ");
        item.GetProperty("requestedByName").GetString()!.ShouldStartWith("Workflow: ");
        item.GetProperty("subject").GetProperty("candidateName").GetString()!.ShouldNotBeEmpty();
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{item.GetProperty("id").GetGuid()}/decide",
                new { decision = "Approved" },
                Ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await RunsAsync(id))
            .Single(x => x.Id == approvedRun.Id)
            .NextRunAt.ShouldBeLessThanOrEqualTo(DateTimeOffset.UtcNow);
        await StepAsync(approvedRun.Id);
        var done = (await RunsAsync(id)).Single(x => x.Id == approvedRun.Id);
        done.Status.ShouldBe(WorkflowRunStatus.Completed, done.LastError);
        done.Steps.Single(x => x.NodeId == "ask").Branch.ShouldBe("yes");
        (await TagsAsync(approvedApp)).ShouldContain("Approved");

        // Rejected: down the No path, with the reason in the log.
        var (rejectedApp, rejectedRun, rejectItem) = await AskAsync(13);
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{rejectItem.GetProperty("id").GetGuid()}/decide",
                new { decision = "Rejected", comment = "Not this quarter" },
                Ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await StepAsync(rejectedRun.Id);
        var no = (await RunsAsync(id)).Single(x => x.Id == rejectedRun.Id);
        no.Steps.Single(x => x.NodeId == "ask").Branch.ShouldBe("no");
        no.Steps.Single(x => x.NodeId == "ask").Output!.ShouldContain("Not this quarter");
        var tags = await TagsAsync(rejectedApp);
        tags.ShouldContain("Turned down");
        tags.ShouldNotContain("Approved");

        // A stopped run takes its request out of the approver's list.
        var (_, stoppedRun, _) = await AskAsync(14);
        using var admin = await AdminAsync();
        (
            await admin.PostAsync($"/api/workflow-runs/{stoppedRun.Id}/cancel", null, Ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await using (var scope = Scope(out var db))
            (await WorkflowEngine.CloseStaleApprovalsAsync(db, DateTimeOffset.UtcNow, Ct)).ShouldBe(
                1
            );
        (await manager.GetFromJsonAsync<JsonElement>("/api/approvals?scope=waiting", Ct))
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("subjectId").GetGuid() == stoppedRun.Id);

        // Jobs and offers decide as before through the same engine.
        Guid jobId,
            offerId,
            jobApproval,
            offerApproval;
        await using (var scope = Scope(out var db))
        {
            var job = await db.Requisitions.FirstAsync(x => x.Status == RequisitionStatus.Open, Ct);
            job.Status = RequisitionStatus.PendingApproval;
            var offer = new Offer
            {
                ApplicationId = rejectedApp,
                Status = OfferStatus.PendingApproval,
                CreatedBy = "recruiter@example.test",
            };
            db.Offers.Add(offer);
            var forJob = new Approval
            {
                SubjectType = "Requisition",
                SubjectId = job.Id,
                ApproverEmail = "manager@example.test",
                RequestedBy = "recruiter@example.test",
            };
            var forOffer = new Approval
            {
                SubjectType = "Offer",
                SubjectId = offer.Id,
                ApproverEmail = "manager@example.test",
                RequestedBy = "recruiter@example.test",
            };
            db.Approvals.AddRange(forJob, forOffer);
            await db.SaveChangesAsync(Ct);
            (jobId, offerId, jobApproval, offerApproval) = (
                job.Id,
                offer.Id,
                forJob.Id,
                forOffer.Id
            );
        }
        var types = (
            await manager.GetFromJsonAsync<JsonElement>("/api/approvals?scope=waiting", Ct)
        )
            .EnumerateArray()
            .Select(x => x.GetProperty("type").GetString())
            .ToList();
        types.ShouldContain("Requisition");
        types.ShouldContain("Offer");
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{jobApproval}/decide",
                new { decision = "Approved" },
                Ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{offerApproval}/decide",
                new { decision = "Rejected", comment = "Too high" },
                Ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await using (var scope = Scope(out var db))
        {
            (await db.Requisitions.SingleAsync(x => x.Id == jobId, Ct)).Status.ShouldBe(
                RequisitionStatus.Open
            );
            (await db.Offers.SingleAsync(x => x.Id == offerId, Ct)).Status.ShouldBe(
                OfferStatus.Draft
            );
        }
    }

    [Fact]
    public async Task Workflow_steps_show_once_in_the_application_history_and_the_candidate_feed()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(15);
        var target = stages[2];
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered", ("stage", $"name:{stages[1].Name}")),
                N(
                    "mail",
                    "action.send_email",
                    ("to", "candidate"),
                    ("subject", "Hi {{firstName}}"),
                    ("body", "Hello")
                ),
                N("tag", "action.add_tag", ("tags", "Fast lane")),
                N("move", "action.move_stage", ("stage", $"name:{target.Name}"))
            ),
            w => w.Name = "Fast lane"
        );
        // The seeded application may have been in the target stage before; only this test's
        // own history counts below.
        var since = DateTimeOffset.UtcNow.AddSeconds(-1);
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        await StepAsync(run.Id);
        (await RunsAsync(id)).Single().Status.ShouldBe(WorkflowRunStatus.Completed);

        using var admin = await AdminAsync();
        var detail = await admin.GetFromJsonAsync<JsonElement>($"/api/applications/{app}", Ct);
        var audit = detail.GetProperty("audit").EnumerateArray().ToList();
        var steps = audit
            .Where(x => x.GetProperty("action").GetString() == WorkflowActivity.Action)
            .Select(x => JsonDocument.Parse(x.GetProperty("details").GetString()!).RootElement)
            .Where(x => x.GetProperty("WorkflowId").GetGuid() == id)
            .ToList();
        steps.Count.ShouldBe(3);
        var stepTitles = steps.Select(x => x.GetProperty("Title").GetString()).ToList();
        stepTitles.ShouldContain("Workflow: Fast lane · Change stage");
        stepTitles.ShouldContain("Workflow: Fast lane · Send email");
        steps.ShouldAllBe(x =>
            x.GetProperty("Href").GetString() == $"/settings/workflows/{id}?tab=runs&run={run.Id}"
        );
        audit.ShouldNotContain(x =>
            x.GetProperty("action").GetString() == "StageChanged"
            && x.GetProperty("actorEmail").GetString() == $"workflow:{id}"
        );

        Guid candidateId;
        await using (var scope = Scope(out var db))
            candidateId = await db
                .Applications.Where(x => x.Id == app)
                .Select(x => x.CandidateId)
                .SingleAsync(Ct);
        var feed = (
            await admin.GetFromJsonAsync<JsonElement>(
                $"/api/candidates/{candidateId}/activity?limit=100",
                Ct
            )
        )
            .GetProperty("items")
            .EnumerateArray()
            .ToList();
        var titles = feed.Select(x => x.GetProperty("title").GetString()!).ToList();
        JsonElement Item(string title) => feed[titles.IndexOf(title)];
        var move = Item("Workflow: Fast lane · Change stage");
        move.GetProperty("type").GetString().ShouldBe("stage");
        move.GetProperty("data")
            .GetProperty("runHref")
            .GetString()!
            .ShouldContain(run.Id.ToString());
        Item("Workflow: Fast lane · Send email").GetProperty("type").GetString().ShouldBe("email");
        titles.ShouldContain("Workflow: Fast lane · Add tag");
        titles.Count(x => x.StartsWith("Workflow: Fast lane")).ShouldBe(3);
        // The step's own effects are not listed a second time.
        feed.Where(x => x.GetProperty("at").GetDateTimeOffset() >= since)
            .Select(x => x.GetProperty("title").GetString())
            .ShouldNotContain($"Moved to {target.Name}");
        titles.Where(x => x.StartsWith("Emailed: Hi ")).ShouldBeEmpty();
        feed.Select(x => x.GetProperty("actorEmail").ToString())
            .Where(x => x.StartsWith("workflow:"))
            .ShouldBeEmpty();
        // The person's own move is still theirs.
        titles.ShouldContain($"Moved to {stages[1].Name}");
    }

    [Fact]
    public async Task A_wait_until_a_date_follows_the_interview_when_it_moves()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(16);
        var graph = Chain(
            N("t", "trigger.stage_entered"),
            N(
                "w",
                "logic.wait",
                ("mode", "date"),
                ("date", "interview"),
                ("offset", "1 days"),
                ("direction", "before")
            ),
            N("a", "action.add_tag", ("tags", "Reminded"))
        );
        WorkflowGraph.Validate(graph).ShouldBeEmpty();
        var id = await PublishAsync(graph);
        var now = DateTimeOffset.UtcNow;
        var startsAt = now.AddDays(3);
        Guid interviewId;
        await using (var scope = Scope(out var db))
        {
            await db
                .Interviews.Where(x =>
                    x.ApplicationId == app && x.Status == InterviewStatus.Scheduled
                )
                .ExecuteUpdateAsync(
                    s => s.SetProperty(x => x.Status, InterviewStatus.Cancelled),
                    Ct
                );
            var interview = new Interview
            {
                ApplicationId = app,
                Title = "Onsite",
                StartsAt = startsAt,
                EndsAt = startsAt.AddHours(1),
                TimeZone = "UTC",
                InterviewerEmails = ["interviewer@example.test"],
            };
            db.Interviews.Add(interview);
            await db.SaveChangesAsync(Ct);
            interviewId = interview.Id;
        }
        await MoveAsync(app, stages[1].Id);
        var run = (await RunsAsync(id)).Single();
        await StepAsync(run.Id, now);
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Waiting);
        run.NextRunAt.ShouldBe(startsAt.AddDays(-1), TimeSpan.FromSeconds(1));

        // The interview moves a day later: at the old time the run waits for the new one.
        await using (var scope = Scope(out var db))
            await db
                .Interviews.Where(x => x.Id == interviewId)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.StartsAt, startsAt.AddDays(1)), Ct);
        await StepAsync(run.Id, startsAt.AddDays(-1).AddMinutes(1));
        run = (await RunsAsync(id)).Single();
        run.Status.ShouldBe(WorkflowRunStatus.Waiting);
        run.NextRunAt.ShouldBe(startsAt, TimeSpan.FromSeconds(1));
        (await TagsAsync(app)).ShouldNotContain("Reminded");

        await StepAsync(run.Id, startsAt.AddMinutes(1));
        (await RunsAsync(id)).Single().Status.ShouldBe(WorkflowRunStatus.Completed);
        (await TagsAsync(app)).ShouldContain("Reminded");

        // A date that does not exist is skipped, not waited on forever.
        WorkflowGraph
            .Validate(
                Chain(
                    N("t", "trigger.tag_added", ("tag", "x")),
                    N("w", "logic.wait", ("mode", "date"))
                )
            )
            .ShouldContain(x => x.Message.Contains("needs the date to wait for"));
    }

    [Fact]
    public async Task Send_assessment_invites_once_and_a_test_email_goes_only_to_me()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(17);
        Guid assessmentId;
        await using (var scope = Scope(out var db))
        {
            var assessment = new Assessment
            {
                Name = $"Take-home {Guid.NewGuid():N}"[..20],
                Status = AssessmentStatus.Active,
                CreatedBy = "admin@example.test",
            };
            var version = new AssessmentVersion
            {
                AssessmentId = assessment.Id,
                Number = 1,
                PublishedBy = "admin@example.test",
            };
            db.Assessments.Add(assessment);
            db.AssessmentVersions.Add(version);
            await db.SaveChangesAsync(Ct);
            assessment.CurrentVersionId = version.Id;
            await db.SaveChangesAsync(Ct);
            assessmentId = assessment.Id;
        }
        var id = await PublishAsync(
            Chain(
                N("t", "trigger.stage_entered"),
                N("send", "action.send_assessment", ("assessment", assessmentId.ToString()))
            ),
            w => w.RunsOncePerApplication = false
        );
        await MoveAsync(app, stages[1].Id);
        await StepAsync((await RunsAsync(id)).Single().Id);
        await MoveAsync(app, stages[2].Id);
        foreach (var run in await RunsAsync(id))
            await StepAsync(run.Id);
        var runs = await RunsAsync(id);
        runs.Count.ShouldBe(2);
        runs.SelectMany(x => x.Steps)
            .Where(x => x.NodeId == "send")
            .Select(x => x.Status)
            .Order()
            .ShouldBe(["Done", "Skipped"]);
        await using (var scope = Scope(out var db))
        {
            (
                await db.AssessmentInvites.CountAsync(
                    x => x.ApplicationId == app && x.AssessmentId == assessmentId,
                    Ct
                )
            ).ShouldBe(1);
            (
                await db.EmailOutbox.AnyAsync(
                    x => x.ApplicationId == app && x.TemplateKey == AssessmentFlow.InviteKey,
                    Ct
                )
            ).ShouldBeTrue();
        }

        using var admin = await AdminAsync();
        var since = DateTimeOffset.UtcNow;
        var test = await admin.PostAsJsonAsync(
            $"/api/workflows/{id}/test-email",
            new
            {
                node = N(
                    "e",
                    "action.send_email",
                    ("to", "candidate"),
                    ("subject", "Hi {{firstName}}"),
                    ("body", "About {{jobTitle}}")
                ),
                applicationId = app,
            },
            Ct
        );
        test.StatusCode.ShouldBe(HttpStatusCode.OK, await test.Content.ReadAsStringAsync(Ct));
        var sent = await test.Content.ReadFromJsonAsync<JsonElement>(Ct);
        sent.GetProperty("recipient").GetString().ShouldBe("admin@example.test");
        sent.GetProperty("subject").GetString()!.ShouldStartWith("Test: Hi ");
        await using (var scope = Scope(out var db))
        {
            var outbox = await db
                .EmailOutbox.AsNoTracking()
                .Where(x => x.CreatedAt >= since && x.Subject.Contains("Hi "))
                .ToListAsync(Ct);
            outbox
                .Select(x => x.Recipient)
                .ShouldBe(["admin@example.test"], "nothing to the candidate");
            outbox[0].Body.ShouldNotContain("{{");
        }
    }

    private async Task<Guid> PublishedAssessmentAsync()
    {
        await using var scope = Scope(out var db);
        var assessment = new Assessment
        {
            Name = $"Stage test {Guid.NewGuid():N}"[..20],
            Status = AssessmentStatus.Active,
            CreatedBy = "admin@example.test",
        };
        var version = new AssessmentVersion
        {
            AssessmentId = assessment.Id,
            Number = 1,
            PublishedBy = "admin@example.test",
        };
        db.Assessments.Add(assessment);
        db.AssessmentVersions.Add(version);
        await db.SaveChangesAsync(Ct);
        assessment.CurrentVersionId = version.Id;
        await db.SaveChangesAsync(Ct);
        return assessment.Id;
    }

    [Fact]
    public async Task The_built_in_stage_assessment_starts_off_and_sends_each_stages_assessment_once()
    {
        await ResetAsync();
        var (app, _, stages) = await ApplicationAsync(12);
        var assessmentId = await PublishedAssessmentAsync();
        Guid id;
        await using (var scope = Scope(out var db))
        {
            await BuiltInWorkflows.EnsureAsync(db, Ct);
            var w = await db.Workflows.SingleAsync(
                x => x.BuiltInKey == BuiltInWorkflows.StageAssessment,
                Ct
            );
            w.Status.ShouldBe(WorkflowStatus.Paused, "off until the organization turns it on");
            w.MaxRunsPerApplication.ShouldBeNull();
            w.RunsOncePerApplication.ShouldBeFalse();
            WorkflowGraph.Validate(WorkflowGraph.Parse(w.DraftGraphJson)).ShouldBeEmpty();
            w.Status = WorkflowStatus.Active;
            var ids = stages.Select(x => x.Id).ToList();
            foreach (
                var stage in await db.PipelineStages.Where(x => ids.Contains(x.Id)).ToListAsync(Ct)
            )
                stage.AssessmentId = stage.Id == stages[1].Id ? assessmentId : null;
            await db.SaveChangesAsync(Ct);
            id = w.Id;
        }

        async Task<WorkflowStepRun> EnterAsync(PipelineStage stage)
        {
            await MoveAsync(app, stage.Id);
            var run = (await RunsAsync(id))
                .Where(x => x.ApplicationId == app)
                .OrderByDescending(x => x.StartedAt)
                .First();
            await StepAsync(run.Id);
            return (await RunsAsync(id))
                .Single(x => x.Id == run.Id)
                .Steps.Single(x => x.NodeId == "send");
        }

        (await EnterAsync(stages[1])).Status.ShouldBe("Done");
        var none = await EnterAsync(stages[2]);
        none.Status.ShouldBe("Skipped");
        none.Output!.ShouldContain("has no assessment");
        var again = await EnterAsync(stages[1]);
        again.Status.ShouldBe("Skipped");
        again.Output!.ShouldContain("already sent");
        await using (var scope = Scope(out var db))
            (
                await db.AssessmentInvites.CountAsync(
                    x => x.ApplicationId == app && x.AssessmentId == assessmentId,
                    Ct
                )
            ).ShouldBe(1);
    }
}
