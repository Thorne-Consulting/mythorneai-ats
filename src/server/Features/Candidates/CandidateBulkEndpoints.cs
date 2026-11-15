using System.Security.Claims;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private const int BulkLimit = 1000;

    private static void MapCandidateBulk(RouteGroupBuilder api)
    {
        // One request per bulk action, on the selected people or on everyone matching the list's filters.
        api.MapPost(
                "/candidates/bulk",
                async (
                    CandidateBulkRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var people = request.Filter is { } filter
                        ? FilterCandidates(
                            new QueryCollection(QueryHelpers.ParseQuery(filter)),
                            principal,
                            db
                        ).People
                        : FilterCandidates(
                            new QueryCollection(
                                new Dictionary<string, StringValues> { ["includeDnc"] = "true" }
                            ),
                            principal,
                            db
                        )
                            .People.Where(x => (request.Ids ?? Array.Empty<Guid>()).Contains(x.Id));
                    var ids = await people.Select(x => x.Id).Take(BulkLimit + 1).ToArrayAsync(ct);
                    if (ids.Length == 0)
                        return Problem("ids", "Choose at least one person.");
                    if (ids.Length > BulkLimit)
                        return Problem(
                            "ids",
                            $"You can change up to {BulkLimit:N0} people at once. Narrow the filters first."
                        );

                    var staff = principal.IsHiringStaff();
                    var now = DateTimeOffset.UtcNow;
                    switch (request.Action)
                    {
                        case "addTags" or "removeTags" when staff:
                        {
                            var tags = NormalizeTags(request.Tags);
                            if (tags.Length == 0)
                                return Problem("tags", "Add at least one tag.");
                            var adding = request.Action == "addTags";
                            var changed = 0;
                            foreach (
                                var candidate in await db
                                    .Candidates.Where(x => ids.Contains(x.Id))
                                    .ToListAsync(ct)
                            )
                            {
                                var next = adding
                                    ? NormalizeTags(candidate.Tags.Concat(tags))
                                    : candidate.Tags.Except(tags).ToArray();
                                if (next.SequenceEqual(candidate.Tags))
                                    continue;
                                candidate.Tags = next;
                                candidate.UpdatedAt = now;
                                Audit.Add(
                                    db,
                                    principal,
                                    "Candidate",
                                    candidate.Id,
                                    "TagsChanged",
                                    new { candidate.Tags }
                                );
                                changed++;
                            }
                            await db.SaveChangesAsync(ct);
                            return Done(
                                changed,
                                ids.Length - changed,
                                adding ? "tagged" : "untagged",
                                adding ? "already had the tags" : "did not have the tags"
                            );
                        }
                        case "doNotContact" or "allowContact" when staff:
                        {
                            var blocked = request.Action == "doNotContact";
                            var reason = blocked ? Clean(request.Reason) : null;
                            var targets = await db
                                .Candidates.Where(x =>
                                    ids.Contains(x.Id) && x.DoNotContact != blocked
                                )
                                .ToListAsync(ct);
                            foreach (var candidate in targets)
                            {
                                candidate.DoNotContact = blocked;
                                candidate.DoNotContactReason = reason;
                                candidate.UpdatedAt = now;
                                Audit.Add(
                                    db,
                                    principal,
                                    "Candidate",
                                    candidate.Id,
                                    blocked ? "MarkedDoNotContact" : "ContactAllowed",
                                    new { Reason = reason }
                                );
                            }
                            await db.SaveChangesAsync(ct);
                            return Done(
                                targets.Count,
                                ids.Length - targets.Count,
                                "changed",
                                "were already set that way"
                            );
                        }
                        case "addToJob":
                        {
                            var requisition = await db
                                .Requisitions.Include(x => x.Stages)
                                .SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                            if (requisition is null || !CanManage(requisition, principal))
                                return Results.NotFound();
                            if (requisition.Status != RequisitionStatus.Open)
                                return Results.Conflict(
                                    new { message = "You can only add people to an open job." }
                                );
                            var stages = requisition.Stages.OrderBy(x => x.SortOrder).ToList();
                            var stage = request.StageId is { } stageId
                                ? stages.SingleOrDefault(x => x.Id == stageId)
                                : stages.First();
                            if (stage is null || IsHiredStage(stage) || stage.IsTerminal)
                                return Problem(
                                    "stageId",
                                    "Choose a stage in this job before Hired."
                                );
                            var already = await db
                                .Applications.Where(x =>
                                    x.RequisitionId == requisition.Id
                                    && ids.Contains(x.CandidateId)
                                    && (
                                        x.Status == ApplicationStatus.Active
                                        || x.Status == ApplicationStatus.PendingVerification
                                    )
                                )
                                .Select(x => x.CandidateId)
                                .ToListAsync(ct);
                            var adding = ids.Except(already).ToArray();
                            foreach (var candidateId in adding)
                            {
                                var application = new Application
                                {
                                    CandidateId = candidateId,
                                    RequisitionId = requisition.Id,
                                    Requisition = requisition,
                                    PipelineStageId = stage.Id,
                                    Source = "Existing candidate",
                                };
                                db.Applications.Add(application);
                                PipelineEvents.RecordMove(
                                    db,
                                    application,
                                    null,
                                    null,
                                    principal.Email()
                                );
                                await PipelineEvents.PublishApplicationAsync(
                                    db,
                                    "application.created",
                                    application,
                                    ct
                                );
                                Audit.Add(
                                    db,
                                    principal,
                                    "Application",
                                    application.Id,
                                    "Created",
                                    new
                                    {
                                        CandidateId = candidateId,
                                        RequisitionId = requisition.Id,
                                    }
                                );
                            }
                            await db.SaveChangesAsync(ct);
                            return Done(
                                adding.Length,
                                already.Count,
                                "added",
                                "were already in this job"
                            );
                        }
                        case "move" or "reject":
                        {
                            var requisition = await db.Requisitions.SingleOrDefaultAsync(
                                x => x.Id == request.RequisitionId,
                                ct
                            );
                            if (requisition is null || !CanManage(requisition, principal))
                                return Results.NotFound();
                            var rejecting = request.Action == "reject";
                            var reason = Clean(request.Reason);
                            if (rejecting && reason is null)
                                return Problem("reason", "Choose a reason.");
                            // A "they decided" reason (Withdrew) closes as Withdrawn and never emails;
                            // the reason's group in Settings decides, else the status sent.
                            var kind = await db
                                .RejectionReasons.Where(x => x.Label == reason)
                                .Select(x => (ApplicationStatus?)x.Kind)
                                .FirstOrDefaultAsync(ct);
                            var withdrawn =
                                rejecting
                                && (
                                    kind == ApplicationStatus.Withdrawn
                                    || kind is null
                                        && request.Status == nameof(ApplicationStatus.Withdrawn)
                                );
                            // The same note rule as closing one application.
                            if (
                                rejecting
                                && await RejectionReasons.NoteProblemAsync(
                                    db,
                                    withdrawn
                                        ? ApplicationStatus.Withdrawn
                                        : ApplicationStatus.Rejected,
                                    reason,
                                    request.DispositionNote,
                                    ct
                                )
                                    is { } noteProblem
                            )
                                return Results.ValidationProblem(noteProblem);
                            if (request.SendAt > now.AddDays(60))
                                return Problem("sendAt", "Pick a time in the next 60 days.");
                            // A time already past means now.
                            var later = request.SendAt > now ? request.SendAt : null;
                            PipelineStage? stage = null;
                            if (!rejecting)
                            {
                                stage = await db.PipelineStages.SingleOrDefaultAsync(
                                    x =>
                                        x.Id == request.StageId
                                        && x.RequisitionId == requisition.Id,
                                    ct
                                );
                                if (stage is null)
                                    return Problem("stageId", "Choose a stage in this job.");
                                if (IsHiredStage(stage))
                                    return Results.Conflict(
                                        new
                                        {
                                            message = "Hiring goes through an acceptance. Start one from each application.",
                                        }
                                    );
                            }
                            var applications = await db
                                .Applications.Include(x => x.Candidate)
                                .Include(x => x.PipelineStage)
                                .Where(x =>
                                    x.RequisitionId == requisition.Id
                                    && ids.Contains(x.CandidateId)
                                    && x.Status == ApplicationStatus.Active
                                )
                                .ToListAsync(ct);
                            foreach (var application in applications)
                            {
                                application.Requisition = requisition;
                                var oldStageId = application.PipelineStageId;
                                var oldStatus = application.Status;
                                if (rejecting)
                                {
                                    application.Status = withdrawn
                                        ? ApplicationStatus.Withdrawn
                                        : ApplicationStatus.Rejected;
                                    application.DispositionReason = reason;
                                    application.DispositionNote = Clean(request.DispositionNote);
                                    // The same email and clean-up as rejecting one application.
                                    var emailed =
                                        request.SendEmail
                                        && !withdrawn
                                        && await QueueRejectionAsync(
                                            db,
                                            application,
                                            null,
                                            ct,
                                            later
                                        )
                                            is not null;
                                    if (request.CancelInterviews)
                                        await CancelUpcomingInterviewsAsync(
                                            db,
                                            integration,
                                            mailer,
                                            principal,
                                            application,
                                            notifyCandidate: !emailed
                                                && !application.Candidate!.DoNotContact,
                                            ct
                                        );
                                    if (request.WithdrawOffer)
                                        foreach (
                                            var offer in await db
                                                .Offers.Where(x =>
                                                    x.ApplicationId == application.Id
                                                    && WithdrawableOfferStatuses.Contains(x.Status)
                                                )
                                                .ToListAsync(ct)
                                        )
                                            await WithdrawOfferAsync(
                                                db,
                                                offer,
                                                principal.Email(),
                                                ct
                                            );
                                }
                                else
                                    application.PipelineStageId = stage!.Id;
                                application.LastActivityAt = now;
                                await PipelineEvents.OnMovedAsync(
                                    db,
                                    application,
                                    oldStageId,
                                    oldStatus,
                                    principal.Email(),
                                    ct
                                );
                                Audit.Add(
                                    db,
                                    principal,
                                    "Application",
                                    application.Id,
                                    "BulkStageChanged",
                                    new
                                    {
                                        StageId = application.PipelineStageId,
                                        application.Status,
                                        application.DispositionReason,
                                    }
                                );
                            }
                            await db.SaveChangesAsync(ct);
                            return Done(
                                applications.Count,
                                ids.Length - applications.Count,
                                withdrawn ? "closed as withdrawn"
                                    : rejecting ? "rejected"
                                    : "moved",
                                "were not active in this job"
                            );
                        }
                        case "addToPool" or "removeFromPool" when staff:
                        {
                            var pool = await db.TalentPools.SingleOrDefaultAsync(
                                x => x.Id == request.PoolId,
                                ct
                            );
                            if (pool is null)
                                return Problem("poolId", "Choose a talent pool.");
                            var members = await db
                                .TalentPoolMembers.Where(x =>
                                    x.PoolId == pool.Id && ids.Contains(x.CandidateId)
                                )
                                .ToListAsync(ct);
                            var adding = request.Action == "addToPool";
                            var changing = adding
                                ? ids.Except(members.Select(x => x.CandidateId)).ToArray()
                                : members.Select(x => x.CandidateId).ToArray();
                            if (adding)
                                db.TalentPoolMembers.AddRange(
                                    changing.Select(candidateId => new TalentPoolMember
                                    {
                                        PoolId = pool.Id,
                                        CandidateId = candidateId,
                                        AddedBy = principal.Email(),
                                    })
                                );
                            else
                                db.TalentPoolMembers.RemoveRange(members);
                            foreach (var candidateId in changing)
                                Audit.Add(
                                    db,
                                    principal,
                                    "Candidate",
                                    candidateId,
                                    adding ? "AddedToPool" : "RemovedFromPool",
                                    new { PoolId = pool.Id, Pool = pool.Name }
                                );
                            await db.SaveChangesAsync(ct);
                            return Done(
                                changing.Length,
                                ids.Length - changing.Length,
                                adding ? $"added to {pool.Name}" : $"removed from {pool.Name}",
                                adding ? "were already in it" : "were not in it"
                            );
                        }
                        case "dismiss" when staff:
                        {
                            var requisition = await db
                                .Requisitions.AsNoTracking()
                                .SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                            if (requisition is null || !CanManage(requisition, principal))
                                return Results.NotFound();
                            var reason = Clean(request.Reason);
                            if (reason is null)
                                return Problem(
                                    "reason",
                                    "Say why they are not a fit for this job."
                                );
                            var already = await db
                                .CandidateDismissals.Where(x =>
                                    x.RequisitionId == requisition.Id && ids.Contains(x.CandidateId)
                                )
                                .Select(x => x.CandidateId)
                                .ToListAsync(ct);
                            var dismissing = ids.Except(already).ToArray();
                            foreach (var candidateId in dismissing)
                            {
                                db.CandidateDismissals.Add(
                                    new CandidateDismissal
                                    {
                                        RequisitionId = requisition.Id,
                                        CandidateId = candidateId,
                                        Reason = reason,
                                        DismissedBy = principal.Email(),
                                    }
                                );
                                Audit.Add(
                                    db,
                                    principal,
                                    "Requisition",
                                    requisition.Id,
                                    "CandidateDismissed",
                                    new { CandidateId = candidateId, Reason = reason }
                                );
                            }
                            await db.SaveChangesAsync(ct);
                            return Done(
                                dismissing.Length,
                                already.Count,
                                "hidden for this job",
                                "were already hidden"
                            );
                        }
                        case "delete" when principal.IsInRole(nameof(UserRole.Admin)):
                        {
                            var stored = await DeleteCandidatesAsync(db, principal, ids, ct) ?? [];
                            foreach (var name in stored)
                                files.Delete(name);
                            return Done(ids.Length, 0, "deleted", "");
                        }
                        case "addTags"
                        or "removeTags"
                        or "addToPool"
                        or "removeFromPool"
                        or "dismiss"
                        or "doNotContact"
                        or "allowContact"
                        or "delete":
                            return Results.Forbid();
                        default:
                            return Problem("action", "That action is not available.");
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static IResult Problem(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    /// <summary>"18 moved. 2 skipped because they were not active in this job."</summary>
    private static IResult Done(int done, int skipped, string verb, string skippedBecause) =>
        Results.Ok(
            new
            {
                Done = done,
                Skipped = skipped,
                Message = $"{People(done)} {verb}."
                    + (
                        skipped > 0
                            ? $" {People(skipped)} skipped because they {skippedBecause}."
                            : ""
                    ),
            }
        );

    private static string People(int count) => count == 1 ? "1 person" : $"{count:N0} people";
}
