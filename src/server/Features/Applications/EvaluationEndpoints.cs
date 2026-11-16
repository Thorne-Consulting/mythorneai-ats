using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Summary (required), optional strengths and concerns, and one rating per kit competency.</summary>
public sealed record SubmitScorecardRequest(
    Recommendation Recommendation,
    string Evidence,
    string? Strengths,
    string? Concerns,
    ScorecardCriterionRatingRequest[]? Criteria,
    string? OnBehalfOf = null
);

public sealed record ScorecardDraftRequest(string Json);

public sealed record RemindRequest(string? Email);

public sealed record AddendumRequest(string Body);

public sealed record SummarizeApplicationRequest(Guid ApplicationId);

public sealed record RecordDecisionRequest(
    HiringDecisionKind Decision,
    string Rationale,
    Guid? StageId,
    string? Reason,
    string? Message,
    // On reject, the same close-out as the reject dialog: cancel upcoming interviews, withdraw an open offer.
    bool? CancelInterviews = null,
    bool? WithdrawOffer = null
);

public static partial class AtsEndpoints
{
    private static void MapEvaluation(RouteGroupBuilder api)
    {
        api.MapPost(
                "/interviews/{id:guid}/scorecards",
                async (
                    Guid id,
                    SubmitScorecardRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (
                        request.Recommendation == Recommendation.Mixed
                        || !Enum.IsDefined(request.Recommendation)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["recommendation"] = ["Choose Strong no, No, Yes or Strong yes."],
                            }
                        );
                    if (string.IsNullOrWhiteSpace(request.Evidence))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["evidence"] = ["Write a short summary."],
                            }
                        );
                    var interview = await db
                        .Interviews.Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .Include(x => x.InterviewKit)
                            .ThenInclude(x => x!.Criteria)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (interview?.Application?.Requisition is null)
                        return Results.NotFound();
                    var me = principal.Email();
                    var onBehalf = request.OnBehalfOf?.Trim().ToLowerInvariant();
                    var email = string.IsNullOrEmpty(onBehalf) ? me : onBehalf;
                    // Recruiters can enter feedback an interviewer sent another way; nobody else can write for someone.
                    if (email != me && !CanManage(interview.Application.Requisition, principal))
                        return Results.Forbid();
                    if (
                        !interview.InterviewerEmails.Contains(
                            email,
                            StringComparer.OrdinalIgnoreCase
                        )
                    )
                        return email == me
                            ? Results.Forbid()
                            : Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["onBehalfOf"] = ["That person is not on this interview."],
                                }
                            );
                    if (interview.Status is InterviewStatus.Cancelled or InterviewStatus.Proposed)
                        return Results.Conflict(
                            new { message = "This interview did not take place." }
                        );
                    if (interview.StartsAt > DateTimeOffset.UtcNow)
                        return Results.Conflict(
                            new
                            {
                                message = "You can write the scorecard once the interview starts.",
                            }
                        );
                    if (
                        await db.Scorecards.AnyAsync(
                            x => x.InterviewId == id && x.InterviewerEmail == email,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new { message = "This scorecard is already submitted and locked." }
                        );

                    var expected = interview.InterviewKit?.Criteria ?? [];
                    var submitted = request.Criteria ?? [];
                    var ids = submitted.Select(x => x.CriterionId).ToArray();
                    if (
                        submitted.Length != expected.Count
                        || ids.Distinct().Count() != ids.Length
                        || expected.Any(x => !ids.Contains(x.Id))
                        || submitted.Any(x => x.Rating is < 1 or > 5)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["criteria"] = ["Rate every competency from 1 to 5."],
                            }
                        );

                    var scorecard = new Scorecard
                    {
                        InterviewId = id,
                        InterviewerEmail = email,
                        SubmittedBy = email == me ? null : me,
                        Recommendation = request.Recommendation,
                        Rating = ScorecardRating(request.Recommendation, submitted, expected),
                        Evidence = request.Evidence.Trim(),
                        Strengths = request.Strengths?.Trim() ?? "",
                        Concerns = request.Concerns?.Trim() ?? "",
                    };
                    scorecard.CriterionRatings.AddRange(
                        submitted.Select(x => new ScorecardCriterionRating
                        {
                            InterviewCriterionId = x.CriterionId,
                            Rating = x.Rating,
                            Evidence = x.Evidence?.Trim() ?? "",
                        })
                    );
                    db.Scorecards.Add(scorecard);
                    db.ScorecardDrafts.RemoveRange(
                        db.ScorecardDrafts.Where(x =>
                            x.InterviewId == id && x.InterviewerEmail == email
                        )
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "ScorecardSubmitted",
                        new
                        {
                            InterviewId = interview.Id,
                            ScorecardId = scorecard.Id,
                            Recommendation = scorecard.Recommendation.ToString(),
                            OnBehalfOf = scorecard.SubmittedBy is null ? null : email,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/interviews/{id}/scorecards/{scorecard.Id}",
                        new { scorecard.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.SubmitScorecard);

        // A submitted scorecard is locked; its author can only add a dated correction under it.
        api.MapPost(
                "/scorecards/{id:guid}/addenda",
                async (
                    Guid id,
                    AddendumRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (string.IsNullOrWhiteSpace(request.Body) || request.Body.Length > 4000)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["body"] = ["Write the correction (up to 4,000 characters)."],
                            }
                        );
                    var me = principal.Email();
                    var scorecard = await db
                        .Scorecards.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        scorecard is null
                        || (scorecard.InterviewerEmail != me && scorecard.SubmittedBy != me)
                    )
                        return Results.NotFound();
                    var applicationId = await db
                        .Interviews.Where(x => x.Id == scorecard.InterviewId)
                        .Select(x => x.ApplicationId)
                        .SingleAsync(ct);
                    db.ScorecardAddenda.Add(
                        new ScorecardAddendum
                        {
                            ScorecardId = id,
                            Body = request.Body.Trim(),
                            AuthorEmail = me,
                        }
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        applicationId,
                        "ScorecardCorrected",
                        new { ScorecardId = id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.SubmitScorecard);

        api.MapGet(
            "/interviews/{id:guid}/scorecard-draft",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var draft = await db
                    .ScorecardDrafts.AsNoTracking()
                    .Where(x => x.InterviewId == id && x.InterviewerEmail == me)
                    .Select(x => new { x.Json, x.UpdatedAt })
                    .SingleOrDefaultAsync(ct);
                // Wrapped, so "no draft yet" is {"draft": null} rather than an empty body.
                return Results.Ok(new { Draft = draft });
            }
        );

        api.MapPut(
            "/interviews/{id:guid}/scorecard-draft",
            async (
                Guid id,
                ScorecardDraftRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (request.Json is null || request.Json.Length > 100_000)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["json"] = ["The draft is too long to save."],
                        }
                    );
                var me = principal.Email();
                var interview = await db
                    .Interviews.AsNoTracking()
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.InterviewerEmails,
                        Submitted = x.Scorecards.Any(s => s.InterviewerEmail == me),
                    })
                    .SingleOrDefaultAsync(ct);
                if (
                    interview is null
                    || !interview.InterviewerEmails.Contains(me, StringComparer.OrdinalIgnoreCase)
                )
                    return Results.NotFound();
                if (interview.Submitted)
                    return Results.Conflict(
                        new { message = "Your scorecard is already submitted." }
                    );
                var draft = await db.ScorecardDrafts.SingleOrDefaultAsync(
                    x => x.InterviewId == id && x.InterviewerEmail == me,
                    ct
                );
                if (draft is null)
                    db.ScorecardDrafts.Add(
                        draft = new ScorecardDraft { InterviewId = id, InterviewerEmail = me }
                    );
                draft.Json = request.Json;
                draft.UpdatedAt = DateTimeOffset.UtcNow;
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { draft.UpdatedAt });
            }
        );

        api.MapPost(
                "/interviews/{id:guid}/remind",
                async (
                    Guid id,
                    RemindRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var interview = await db
                        .Interviews.Include(x => x.Scorecards)
                        .Include(x => x.Application)
                            .ThenInclude(x => x!.Requisition)
                        .Include(x => x.Application)
                            .ThenInclude(x => x!.Candidate)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        interview?.Application?.Requisition is null
                        || !CanManage(interview.Application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        interview.StartsAt > DateTimeOffset.UtcNow
                        || interview.Status is InterviewStatus.Cancelled or InterviewStatus.Proposed
                    )
                        return Results.Conflict(
                            new { message = "Feedback is due only after the interview starts." }
                        );
                    var target = request.Email?.Trim().ToLowerInvariant();
                    var missing = interview
                        .InterviewerEmails.Where(email =>
                            !interview.Scorecards.Any(s =>
                                s.InterviewerEmail.Equals(email, StringComparison.OrdinalIgnoreCase)
                            )
                            && (
                                string.IsNullOrEmpty(target)
                                || email.Equals(target, StringComparison.OrdinalIgnoreCase)
                            )
                        )
                        .ToArray();
                    if (missing.Length == 0)
                        return Results.Conflict(
                            new { message = "There is no missing scorecard to remind about." }
                        );
                    // ponytail: one reminder per person per 6 hours, read from the outbox; a column if this gets busy.
                    var since = DateTimeOffset.UtcNow.AddHours(-6);
                    var recent = await db
                        .EmailOutbox.AsNoTracking()
                        .Where(x =>
                            x.ApplicationId == interview.ApplicationId
                            && x.TemplateKey == "scorecard-reminder"
                            && x.CreatedAt > since
                        )
                        .Select(x => x.Recipient)
                        .ToListAsync(ct);
                    var due = missing
                        .Where(email => !recent.Contains(email, StringComparer.OrdinalIgnoreCase))
                        .ToArray();
                    if (due.Length == 0)
                        return Results.Conflict(
                            new { message = "They were reminded in the last 6 hours." }
                        );
                    foreach (var email in due)
                        await QueueScorecardReminderAsync(db, interview, email, ct);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        interview.ApplicationId,
                        "ScorecardReminderSent",
                        new { InterviewId = id, Recipients = due }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Reminded = due });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/me/scorecards",
            async (
                string? status,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var me = principal.Email();
                var now = DateTimeOffset.UtcNow;
                var mine = db
                    .Interviews.AsNoTracking()
                    .Where(x => x.InterviewerEmails.Contains(me));
                var due = mine.Where(x =>
                    (x.Status == InterviewStatus.Scheduled || x.Status == InterviewStatus.Completed)
                    && x.StartsAt < now
                    && !x.Scorecards.Any(s => s.InterviewerEmail == me)
                );
                var submittedQuery = db
                    .Scorecards.AsNoTracking()
                    .Where(x => x.InterviewerEmail == me);
                var reminderDays = await db
                    .Organizations.Select(x => x.ScorecardReminderDays)
                    .SingleOrDefaultAsync(ct);
                var counts = new
                {
                    Due = await due.CountAsync(ct),
                    Submitted = await submittedQuery.CountAsync(ct),
                };
                if (status == "submitted")
                    return Results.Ok(
                        new
                        {
                            Counts = counts,
                            ReminderDays = reminderDays,
                            Items = await submittedQuery
                                .OrderByDescending(x => x.SubmittedAt)
                                .Take(200)
                                .Select(x => new
                                {
                                    Id = x.InterviewId,
                                    x.Interview!.ApplicationId,
                                    x.Interview.Title,
                                    x.Interview.StartsAt,
                                    x.Interview.EndsAt,
                                    CandidateName = x.Interview.Application!.Candidate!.FirstName
                                        + " "
                                        + x.Interview.Application.Candidate.LastName,
                                    RequisitionTitle = x.Interview.Application.Requisition!.Title,
                                    SubmittedAt = (DateTimeOffset?)x.SubmittedAt,
                                    Recommendation = x.Recommendation.ToString(),
                                })
                                .ToListAsync(ct),
                        }
                    );
                return Results.Ok(
                    new
                    {
                        Counts = counts,
                        ReminderDays = reminderDays,
                        Items = await due.OrderBy(x => x.EndsAt)
                            .Take(500)
                            .Select(x => new
                            {
                                x.Id,
                                x.ApplicationId,
                                x.Title,
                                x.StartsAt,
                                x.EndsAt,
                                CandidateName = x.Application!.Candidate!.FirstName
                                    + " "
                                    + x.Application.Candidate.LastName,
                                RequisitionTitle = x.Application.Requisition!.Title,
                                SubmittedAt = (DateTimeOffset?)null,
                                Recommendation = (string?)null,
                            })
                            .ToListAsync(ct),
                    }
                );
            }
        );

        api.MapPost(
                "/applications/{id:guid}/decision",
                async (
                    Guid id,
                    RecordDecisionRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IWorkplaceIntegration integration,
                    InterviewMailer mailer,
                    CancellationToken ct
                ) =>
                {
                    var application = await db
                        .Applications.Include(x => x.Requisition)
                        .Include(x => x.Candidate)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (application.Status != ApplicationStatus.Active)
                        return Results.Conflict(
                            new
                            {
                                message = "A decision can only be recorded on an active application.",
                            }
                        );
                    if (string.IsNullOrWhiteSpace(request.Rationale))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["rationale"] = ["Say why, so the team can see it later."],
                            }
                        );
                    var oldStage = application.PipelineStageId;
                    var oldStatus = application.Status;
                    Guid? toStage = null;
                    if (request.Decision == HiringDecisionKind.Advance)
                    {
                        var stage = await db.PipelineStages.SingleOrDefaultAsync(
                            x =>
                                x.Id == request.StageId
                                && x.RequisitionId == application.RequisitionId,
                            ct
                        );
                        if (stage is null)
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["stageId"] = ["Choose a stage for this job."],
                                }
                            );
                        if (IsHiredStage(stage))
                            return Results.Conflict(
                                new
                                {
                                    message = "Hiring goes through an offer. Choose Make offer instead.",
                                }
                            );
                        application.PipelineStageId = stage.Id;
                        toStage = stage.Id;
                    }
                    else if (request.Decision == HiringDecisionKind.Reject)
                    {
                        if (string.IsNullOrWhiteSpace(request.Reason))
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["reason"] = ["Choose a reason."],
                                }
                            );
                        application.Status = ApplicationStatus.Rejected;
                        application.DispositionReason = request.Reason.Trim();
                        // The "Why" is the note, so a reason that asks for one (Other) always has it.
                        application.DispositionNote = request.Rationale.Trim();
                        var emailed = await QueueRejectionAsync(
                            db,
                            application,
                            request.Message,
                            ct
                        );
                        await CloseOutAsync(
                            db,
                            integration,
                            mailer,
                            principal,
                            application,
                            request.CancelInterviews == true,
                            request.WithdrawOffer == true,
                            rejectionEmailed: emailed is not null,
                            ct
                        );
                    }
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    if (request.Decision != HiringDecisionKind.Offer)
                        await PipelineEvents.OnMovedAsync(
                            db,
                            application,
                            oldStage,
                            oldStatus,
                            principal.Email(),
                            ct
                        );
                    var decision = new HiringDecision
                    {
                        ApplicationId = id,
                        Decision = request.Decision,
                        ToStageId = toStage,
                        Rationale = request.Rationale.Trim(),
                        DecidedBy = principal.Email(),
                    };
                    db.HiringDecisions.Add(decision);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "DecisionRecorded",
                        new
                        {
                            Decision = request.Decision.ToString(),
                            decision.Rationale,
                            FromStageId = oldStage,
                            ToStageId = toStage,
                            application.DispositionReason,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { decision.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/ai/summarize-application",
                async (
                    SummarizeApplicationRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IAiAssistant assistant,
                    CancellationToken ct
                ) =>
                {
                    var application = await db
                        .Applications.AsNoTracking()
                        .Include(x => x.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == request.ApplicationId, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        (
                            await BlindingInterviewsAsync(db, application.Id, principal.Email(), ct)
                        ).Length > 0
                    )
                        return Results.Conflict(
                            new { message = "Submit your own scorecard first." }
                        );
                    var cards = await db
                        .Scorecards.AsNoTracking()
                        .Where(x => x.Interview!.ApplicationId == application.Id)
                        .OrderBy(x => x.Interview!.StartsAt)
                        .Select(x => new
                        {
                            Interview = x.Interview!.Title,
                            x.InterviewerEmail,
                            Recommendation = x.Recommendation.ToString(),
                            x.Evidence,
                            x.Strengths,
                            x.Concerns,
                            Criteria = x.CriterionRatings.Select(r => new
                            {
                                r.InterviewCriterion!.Name,
                                r.Rating,
                                r.Evidence,
                            }),
                        })
                        .ToListAsync(ct);
                    if (cards.Count == 0)
                        return Results.Conflict(
                            new { message = "No scorecards have been submitted yet." }
                        );
                    var input = string.Join(
                        "\n\n",
                        cards.Select(card =>
                            $"Interview: {card.Interview}\nInterviewer: {card.InterviewerEmail}\nRecommendation: {card.Recommendation}\nSummary: {card.Evidence}\nStrengths: {card.Strengths}\nConcerns: {card.Concerns}\nCompetencies: "
                            + string.Join(
                                "; ",
                                card.Criteria.Select(c => $"{c.Name} {c.Rating}/5 {c.Evidence}")
                            )
                        )
                    );
                    try
                    {
                        var summary = await assistant.CompleteAsync(
                            "Summarize a hiring panel's submitted scorecards for the hiring team. Use only what the scorecards say. Be short and factual. Do not make or suggest a hiring decision. Return plain text in three sections, each starting with a line '## <heading>': ## Where the panel agrees, ## Where the panel differs, ## Open questions.",
                            $"Role: {application.Requisition.Title}\n\n{input[..Math.Min(input.Length, 16000)]}",
                            ct,
                            new AiContext(
                                "summarize-application",
                                principal.Email(),
                                "Application",
                                application.Id.ToString()
                            )
                        );
                        return Results.Ok(new { summary });
                    }
                    catch (AiUnavailableException exception)
                    {
                        return Results.Problem(
                            exception.Message,
                            statusCode: StatusCodes.Status503ServiceUnavailable
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>
    /// The scorecard's single number: competency ratings weighted by the kit, rounded. With no
    /// competencies it is the recommendation on the same 1–5 scale.
    /// </summary>
    internal static int ScorecardRating(
        Recommendation recommendation,
        IReadOnlyCollection<ScorecardCriterionRatingRequest> ratings,
        IReadOnlyCollection<InterviewCriterion> criteria
    )
    {
        var weighted = ratings
            .Join(
                criteria,
                r => r.CriterionId,
                c => c.Id,
                (r, c) => (r.Rating, Weight: Math.Max(c.Weight, 0))
            )
            .Where(x => x.Weight > 0)
            .ToArray();
        if (weighted.Length > 0)
            return (int)
                Math.Round(
                    (double)weighted.Sum(x => x.Rating * x.Weight) / weighted.Sum(x => x.Weight),
                    MidpointRounding.AwayFromZero
                );
        return recommendation switch
        {
            Recommendation.StrongNo => 1,
            Recommendation.No => 2,
            Recommendation.Mixed => 3,
            Recommendation.Yes => 4,
            _ => 5,
        };
    }

    /// <summary>"<path>" on the organization's web address, or empty when it has not set one.</summary>
    internal static async Task<string> AppLinkAsync(
        AtsDbContext db,
        string path,
        CancellationToken ct
    )
    {
        var root = await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct);
        return string.IsNullOrWhiteSpace(root) ? "" : $"{root.TrimEnd('/')}{path}";
    }

    /// <summary>One scorecard reminder with the candidate's name and a link straight to the form.</summary>
    /// <remarks>Needs the interview's Application with its Candidate and Requisition loaded.</remarks>
    public static async Task QueueScorecardReminderAsync(
        AtsDbContext db,
        Interview interview,
        string interviewerEmail,
        CancellationToken ct
    )
    {
        var application = interview.Application!;
        await EmailTemplates.QueueAsync(
            db,
            "scorecard-reminder",
            application.RequisitionId,
            interviewerEmail,
            new Dictionary<string, string>
            {
                ["jobTitle"] = application.Requisition!.Title,
                ["interviewTitle"] = interview.Title,
                ["candidateName"] =
                    $"{application.Candidate!.FirstName} {application.Candidate.LastName}",
                ["scorecardLink"] = await AppLinkAsync(
                    db,
                    $"/applications/{application.Id}/scorecards?interview={interview.Id}",
                    ct
                ),
            },
            application.Id,
            ct
        );
    }
}
