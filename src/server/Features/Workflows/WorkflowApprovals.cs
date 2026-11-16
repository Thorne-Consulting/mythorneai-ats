using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Features.Workflows;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// The approval engine's third subject: a workflow run waiting at an "Ask for approval" step. The
/// round, its order, reminders, email links and reassigning work as for jobs and offers. What a
/// decision does is different: it only wakes the run. The engine reads the round's outcome
/// (approved goes down the Yes path; rejected or withdrawn down the No path), so the decision and
/// the run's next step never disagree.
/// </summary>
public static partial class AtsEndpoints
{
    internal const string WorkflowRunSubject = "WorkflowRun";

    /// <summary>Starts a round for a run's approval step and emails whoever's turn it is. The caller saves.</summary>
    internal static async Task RequestWorkflowApprovalAsync(
        AtsDbContext db,
        Guid runId,
        string requestedBy,
        string[] approvers,
        ApprovalMode mode,
        string question,
        CancellationToken ct
    )
    {
        // The step's list is the chain: every approver is required (FromPolicy), so "any one" settles.
        var rows = await AddRoundAsync(
            db,
            WorkflowRunSubject,
            runId,
            new ResolvedApprovers(approvers, mode, null, approvers),
            requestedBy,
            question,
            ct
        );
        await NotifyEligibleApproversAsync(db, rows, question, requestedBy, ct);
    }

    /// <summary>The live round's answer for a run: Pending, Approved, Rejected or Stopped, with the rows.</summary>
    internal static async Task<(string Outcome, List<Approval> Round)> WorkflowApprovalOutcomeAsync(
        AtsDbContext db,
        Guid runId,
        CancellationToken ct
    )
    {
        var round = LatestRound(await LoadApprovalsAsync(db, WorkflowRunSubject, runId, ct));
        return (RoundOutcome(round), round);
    }

    // Called by ApplyDecisionAsync for this subject: the same round rules, then the run goes on.
    private static async Task<string> ApplyWorkflowDecisionAsync(
        AtsDbContext db,
        List<Approval> all,
        Approval decided,
        string actorEmail,
        CancellationToken ct
    )
    {
        var run = await db.WorkflowRuns.SingleOrDefaultAsync(x => x.Id == decided.SubjectId, ct);
        if (run is not null)
            Audit.Add(
                db,
                actorEmail,
                "Application",
                run.ApplicationId,
                decided.Decision == ApprovalDecision.Approved
                    ? "ApprovalGiven"
                    : "ApprovalRejected",
                new
                {
                    decided.SubjectType,
                    decided.Comment,
                    decided.Round,
                    RunId = run.Id,
                }
            );
        var round = all.Where(x => x.Round == decided.Round && x.Id != decided.Id).ToList();
        var pending = round.Where(x => x.Decision == ApprovalDecision.Pending).ToList();
        var settles =
            decided.Decision == ApprovalDecision.Rejected
            || (decided.AnyOne && SettlesAnyOne(round.Append(decided), decided));
        if (settles)
            foreach (var row in pending)
            {
                row.Decision = ApprovalDecision.Cancelled;
                row.DecidedAt = DateTimeOffset.UtcNow;
            }
        else if (pending.Count > 0)
        {
            var next = pending.Min(x => x.Sequence);
            if (next > decided.Sequence && pending.All(x => x.Sequence >= next))
                await NotifyEligibleApproversAsync(
                    db,
                    pending.Where(x => x.Sequence == next).ToList(),
                    decided.Note ?? "a workflow step",
                    decided.RequestedBy,
                    ct
                );
            return "Approved. Waiting on the other approvers.";
        }
        WakeWorkflowRun(run);
        return decided.Decision == ApprovalDecision.Rejected
            ? "Rejected. The workflow goes on down its No path."
            : "Approved. The workflow goes on.";
    }

    /// <summary>The run moves on at the worker's next pass (the caller saves).</summary>
    internal static void WakeWorkflowRun(WorkflowRun? run)
    {
        if (run is { Status: WorkflowRunStatus.Waiting })
            run.NextRunAt = DateTimeOffset.UtcNow;
    }

    internal static async Task WakeWorkflowRunAsync(
        AtsDbContext db,
        Guid runId,
        CancellationToken ct
    ) => WakeWorkflowRun(await db.WorkflowRuns.SingleOrDefaultAsync(x => x.Id == runId, ct));

    /// <summary>
    /// What the approvals list shows for a run: the candidate, the job and the workflow. Shaped like
    /// an offer's summary (no terms), so the list and the email-link page read it the same way.
    /// </summary>
    private static async Task<(
        string Title,
        string Detail,
        string Status,
        Guid ApplicationId,
        object Summary
    )?> WorkflowApprovalItemAsync(AtsDbContext db, Guid runId, CancellationToken ct)
    {
        var run = await db
            .WorkflowRuns.AsNoTracking()
            .Where(x => x.Id == runId)
            .Select(x => new
            {
                x.Status,
                x.ApplicationId,
                x.WorkflowId,
                Workflow = x.Workflow!.Name,
                x.Application!.Candidate!.FirstName,
                x.Application.Candidate.LastName,
                x.Application.Candidate.CurrentTitle,
                Job = x.Application.Requisition!.Title,
                x.Application.Requisition.Code,
                Stage = x.Application.PipelineStage!.Name,
                x.Application.AppliedAt,
            })
            .SingleOrDefaultAsync(ct);
        if (run is null)
            return null;
        var scores = await db
            .Scorecards.AsNoTracking()
            .Where(s => s.Interview!.ApplicationId == run.ApplicationId)
            .Select(s => s.Recommendation)
            .ToListAsync(ct);
        var name = $"{run.FirstName} {run.LastName}";
        return (
            name,
            $"{run.Job} ({run.Code}) · Workflow: {run.Workflow}",
            run.Status.ToString(),
            run.ApplicationId,
            new
            {
                CandidateName = name,
                run.CurrentTitle,
                JobTitle = run.Job,
                JobCode = run.Code,
                run.Stage,
                run.AppliedAt,
                Terms = Array.Empty<string>(),
                Note = "",
                Scorecards = new
                {
                    Yes = scores.Count(x => x is Recommendation.Yes or Recommendation.StrongYes),
                    No = scores.Count(x => x is Recommendation.No or Recommendation.StrongNo),
                    Total = scores.Count,
                },
                WorkflowId = run.WorkflowId,
                WorkflowName = run.Workflow,
                RunId = runId,
            }
        );
    }
}
