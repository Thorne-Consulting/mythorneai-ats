using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
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
    private static void MapApplications(RouteGroupBuilder api)
    {
        api.MapPost(
                "/applications",
                async (
                    CreateApplicationRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.Include(x => x.Stages)
                        .SingleOrDefaultAsync(x => x.Id == request.RequisitionId, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (requisition.Status != RequisitionStatus.Open)
                        return Results.Conflict(
                            new
                            {
                                message = "Applications can only be added to an open requisition.",
                            }
                        );
                    if (!await db.Candidates.AnyAsync(x => x.Id == request.CandidateId, ct))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["candidateId"] = ["Candidate not found."],
                            }
                        );
                    if (
                        await db.Applications.AnyAsync(
                            x =>
                                x.CandidateId == request.CandidateId
                                && x.RequisitionId == request.RequisitionId
                                && x.Status == ApplicationStatus.Active,
                            ct
                        )
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "This candidate already has an active application for the requisition.",
                            }
                        );

                    var firstStage = requisition.Stages.OrderBy(x => x.SortOrder).First();
                    var application = new Application
                    {
                        CandidateId = request.CandidateId,
                        RequisitionId = request.RequisitionId,
                        PipelineStageId = firstStage.Id,
                        Source = request.Source.Trim(),
                    };
                    db.Applications.Add(application);
                    PipelineEvents.RecordMove(db, application, null, null, principal.Email());
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
                        new { request.CandidateId, request.RequisitionId }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/applications/{application.Id}",
                        new { application.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPatch(
                "/applications/bulk-stage",
                async (
                    BulkMoveApplicationsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var ids = request.ApplicationIds.Distinct().Take(201).ToArray();
                    if (ids.Length is 0 or > 200)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["applicationIds"] = ["Select between 1 and 200 applications."],
                            }
                        );
                    var applications = await db
                        .Applications.Include(x => x.Requisition)
                        .Include(x => x.Candidate)
                        .Where(x => ids.Contains(x.Id))
                        .ToListAsync(ct);
                    if (
                        applications.Count != ids.Length
                        || applications.Any(x =>
                            x.Requisition is null || !CanManage(x.Requisition, principal)
                        )
                    )
                        return Results.NotFound();
                    var requisitionIds = applications
                        .Select(x => x.RequisitionId)
                        .Distinct()
                        .ToArray();
                    if (requisitionIds.Length != 1)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["applicationIds"] =
                                [
                                    "Bulk actions must stay within one hiring session.",
                                ],
                            }
                        );
                    if (
                        await RejectionReasons.NoteProblemAsync(
                            db,
                            request.Status,
                            request.DispositionReason,
                            request.DispositionNote,
                            ct
                        ) is
                        { } noteProblem
                    )
                        return Results.ValidationProblem(noteProblem);
                    var stage = await db.PipelineStages.SingleOrDefaultAsync(
                        x => x.Id == request.StageId && x.RequisitionId == requisitionIds[0],
                        ct
                    );
                    if (stage is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["stageId"] = ["Stage does not belong to this hiring session."],
                            }
                        );
                    if (
                        request.Status
                        is ApplicationStatus.Hired
                            or ApplicationStatus.PendingVerification
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["status"] =
                                [
                                    "Use Active, Rejected or Withdrawn here. Hiring goes through an approved acceptance.",
                                ],
                            }
                        );
                    if (
                        IsHiredStage(stage)
                        && applications.Any(x => x.Status != ApplicationStatus.Hired)
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "Hiring goes through an acceptance. Start one from each application.",
                            }
                        );
                    var emailIds = new List<Guid>();
                    foreach (var application in applications)
                    {
                        var oldStageId = application.PipelineStageId;
                        var oldStatus = application.Status;
                        application.PipelineStageId = stage.Id;
                        application.Status = request.Status;
                        application.DispositionReason = Clean(request.DispositionReason);
                        application.DispositionNote = Clean(request.DispositionNote);
                        application.LastActivityAt = DateTimeOffset.UtcNow;
                        if (
                            oldStageId != stage.Id
                            && stage.EmailOnEntry == StageEmail.Always
                            && request.SendEmail != false
                            && await QueueStageEntryEmailAsync(
                                db,
                                application,
                                stage,
                                principal,
                                ct
                            )
                                is { } emailId
                        )
                            emailIds.Add(emailId);
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
                                StageId = stage.Id,
                                application.Status,
                                application.DispositionReason,
                            }
                        );
                    }
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { Updated = applications.Count, EmailIds = emailIds });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/applications/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeHiringDetails =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var currentEmail = principal.Email();
                // Blind review: while I owe a scorecard on any interview for this person, I see nobody else's.
                var blindedBy = await BlindingInterviewsAsync(db, id, currentEmail, ct);
                var blinded = blindedBy.Length > 0;
                // The same view of an interview as the interview page, so the two cannot drift apart.
                var interviewView = InterviewProjection.Detail(
                    currentEmail,
                    canSeeHiringDetails,
                    blinded
                );
                var application = await ScopeApplications(db.Applications.AsNoTracking(), principal)
                    .Where(x => x.Id == id)
                    .Select(x => new
                    {
                        x.Id,
                        x.CandidateId,
                        CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                        CandidateEmail = canSeeHiringDetails ? x.Candidate.Email : "Restricted",
                        CandidatePhone = canSeeHiringDetails ? x.Candidate.Phone : null,
                        CandidateLocation = x.Candidate.Location,
                        CandidateTitle = x.Candidate.CurrentTitle,
                        CandidateTags = x.Candidate.Tags,
                        CandidateDoNotContact = x.Candidate.DoNotContact,
                        x.RequisitionId,
                        RequisitionCode = x.Requisition!.Code,
                        RequisitionTitle = x.Requisition.Title,
                        StageId = x.PipelineStageId,
                        Stage = x.PipelineStage!.Name,
                        Status = x.Status.ToString(),
                        x.Source,
                        x.DispositionReason,
                        x.DispositionNote,
                        x.Rating,
                        x.AppliedAt,
                        x.LastActivityAt,
                        // When the application arrived in its current stage (a status change in place does not count).
                        StageEnteredAt = db.StageTransitions.Where(t =>
                                t.ApplicationId == x.Id
                                && t.ToStageId == x.PipelineStageId
                                && (t.FromStageId == null || t.FromStageId != t.ToStageId)
                            )
                            .Max(t => (DateTimeOffset?)t.OccurredAt)
                            ?? x.AppliedAt,
                        x.ApplicationAnswersMarkdown,
                        Resume = new
                        {
                            Summary = x.Candidate.ResumeSummary,
                            YearsExperience = x.Candidate.ResumeYearsExperience,
                            Skills = x.Candidate.ResumeSkills,
                            HasResume = x.Candidate.ResumeParsedAt != null
                                || x.Candidate.Attachments.Any(),
                            Experience = x
                                .Candidate.WorkExperiences.OrderBy(w => w.SortOrder)
                                .Take(3)
                                .Select(w => new
                                {
                                    w.Title,
                                    Company = w.CompanyNameRaw,
                                    w.StartYear,
                                    w.EndYear,
                                    w.IsCurrent,
                                }),
                        },
                        Decisions = db
                            .HiringDecisions.Where(d => d.ApplicationId == x.Id)
                            .OrderByDescending(d => d.DecidedAt)
                            .Select(d => new
                            {
                                d.Id,
                                Decision = d.Decision.ToString(),
                                d.ToStageId,
                                d.Rationale,
                                d.DecidedBy,
                                d.DecidedAt,
                            })
                            .ToList(),
                        Stages = x
                            .Requisition.Stages.OrderBy(s => s.SortOrder)
                            .Select(s => new
                            {
                                s.Id,
                                s.Name,
                                s.Color,
                                s.SortOrder,
                                s.IsTerminal,
                                Type = s.Type.ToString(),
                                s.CandidateLabel,
                                EmailOnEntry = s.EmailOnEntry.ToString(),
                            }),
                        // Kits that can be picked for a new interview: current versions, not archived.
                        InterviewKits = x
                            .Requisition.InterviewKits.Where(k =>
                                k.VersionOfId == null && k.ArchivedAt == null
                            )
                            .OrderBy(k => k.SortOrder)
                            .Select(k => new
                            {
                                k.Id,
                                k.Name,
                                k.PipelineStageId,
                                k.Instructions,
                                k.DurationMinutes,
                                Criteria = k
                                    .Criteria.OrderBy(c => c.SortOrder)
                                    .Select(c => new
                                    {
                                        c.Id,
                                        c.Name,
                                        c.Question,
                                        c.Description,
                                        c.Weight,
                                        c.SortOrder,
                                    }),
                            }),
                        // Notes on this application, and notes about the person that belong to no application.
                        Notes = db
                            .Notes.Where(n =>
                                (
                                    n.ApplicationId == x.Id
                                    || (n.ApplicationId == null && n.CandidateId == x.CandidateId)
                                ) && (canSeeHiringDetails || !n.IsPrivate)
                            )
                            .OrderByDescending(n => n.CreatedAt)
                            .Select(n => new
                            {
                                n.Id,
                                n.Body,
                                n.AuthorEmail,
                                n.IsPrivate,
                                n.CreatedAt,
                                n.EditedAt,
                                n.PinnedAt,
                                n.ApplicationId,
                            })
                            .ToList(),
                        Interviews = x
                            .Interviews.AsQueryable()
                            .OrderByDescending(i => i.StartsAt)
                            .Select(interviewView)
                            .ToList(),
                    })
                    .SingleOrDefaultAsync(ct);
                if (application is null)
                    return Results.NotFound();
                // Corrections to scorecards, by scorecard, for the scorecards this person can see.
                var addenda = (
                    await db
                        .ScorecardAddenda.AsNoTracking()
                        .Where(a =>
                            a.Scorecard!.Interview!.ApplicationId == id
                            && (!blinded || a.Scorecard.InterviewerEmail == currentEmail)
                        )
                        .OrderBy(a => a.CreatedAt)
                        .Select(a => new
                        {
                            a.ScorecardId,
                            a.Id,
                            a.Body,
                            a.AuthorEmail,
                            a.CreatedAt,
                        })
                        .ToListAsync(ct)
                ).GroupBy(a => a.ScorecardId).ToDictionary(g => g.Key, g => g.ToList());
                var interviewsCreatedAt = await db
                    .Interviews.AsNoTracking()
                    .Where(i => i.ApplicationId == id)
                    .ToDictionaryAsync(i => i.Id, i => i.CreatedAt, ct);

                var audits = await db
                    .AuditEvents.AsNoTracking()
                    .Where(x => x.EntityType == "Application" && x.EntityId == id.ToString())
                    .OrderByDescending(x => x.OccurredAt)
                    .Take(50)
                    .ToListAsync(ct);
                var emails = canSeeHiringDetails
                    ? await db
                        .EmailOutbox.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderByDescending(x => x.CreatedAt)
                        .Take(50)
                        .Select(x => new
                        {
                            x.Id,
                            x.Recipient,
                            x.Subject,
                            Status = x.Status.ToString(),
                            x.DeliveryStatus,
                            x.TemplateKey,
                            x.CreatedAt,
                            // In the future for an email sent later, so the record can offer "Cancel".
                            x.NextAttemptAt,
                        })
                        .ToListAsync(ct)
                    : [];
                var rows = canSeeHiringDetails
                    ? await db
                        .ApplicationMessages.AsNoTracking()
                        .Where(x => x.ApplicationId == id)
                        .OrderBy(x => x.CreatedAt)
                        .Select(x => new
                        {
                            x.Id,
                            x.FromCandidate,
                            x.Body,
                            x.AuthorEmail,
                            x.CreatedAt,
                        })
                        .ToListAsync(ct)
                    : [];
                // Read is per person, as in the inbox: up to this person's last read, unless they marked it unread.
                var myThread = await db
                    .MessageThreadStates.AsNoTracking()
                    .Where(x => x.ApplicationId == id && x.UserEmail == currentEmail)
                    .Select(x => new { x.LastReadAt, x.MarkedUnread })
                    .SingleOrDefaultAsync(ct);
                var lastFromCandidate = rows.LastOrDefault(x => x.FromCandidate)?.Id;
                var thread = rows.Select(x => new
                    {
                        x.Id,
                        x.FromCandidate,
                        x.Body,
                        x.AuthorEmail,
                        x.CreatedAt,
                        ReadAt = myThread?.LastReadAt >= x.CreatedAt
                        && !(myThread.MarkedUnread && x.Id == lastFromCandidate)
                            ? myThread.LastReadAt
                            : null,
                    })
                    .ToList();
                var requisition = await db
                    .Requisitions.AsNoTracking()
                    .SingleAsync(x => x.Id == application.RequisitionId, ct);
                // Display names for everyone the page mentions: interviewers, note authors, deciders.
                var emailsShown = application
                    .Interviews.SelectMany(i => i.InterviewerEmails)
                    .Concat(application.Notes.Select(n => n.AuthorEmail))
                    .Concat(application.Decisions.Select(d => d.DecidedBy))
                    .Distinct()
                    .ToArray();
                var people = await db
                    .Users.AsNoTracking()
                    .Where(x => emailsShown.Contains(x.Email))
                    .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                return Results.Ok(
                    new
                    {
                        Application = application,
                        // Typed answers (with knockout flags) when the application has them, else the older Markdown copy.
                        Answers = await ApplicationQuestions.ForApplicationAsync(
                            db,
                            application.Id,
                            application.ApplicationAnswersMarkdown,
                            ct
                        ),
                        CanManage = CanManage(requisition, principal),
                        Blinded = blinded,
                        BlindedBy = blindedBy,
                        Addenda = addenda,
                        InterviewsCreatedAt = interviewsCreatedAt,
                        People = people,
                        Audit = audits,
                        Emails = emails,
                        Messages = thread,
                    }
                );
            }
        );

        api.MapPatch(
                "/applications/{id:guid}/stage",
                async (
                    Guid id,
                    MoveApplicationRequest request,
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
                    var stage = await db.PipelineStages.SingleOrDefaultAsync(
                        x =>
                            x.Id == request.StageId && x.RequisitionId == application.RequisitionId,
                        ct
                    );
                    if (stage is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["stageId"] = ["Stage does not belong to this requisition."],
                            }
                        );
                    if (
                        request.Status is ApplicationStatus.Rejected or ApplicationStatus.Withdrawn
                        && string.IsNullOrWhiteSpace(request.DispositionReason)
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["dispositionReason"] = ["A disposition reason is required."],
                            }
                        );

                    if (
                        await RejectionReasons.NoteProblemAsync(
                            db,
                            request.Status,
                            request.DispositionReason,
                            request.DispositionNote,
                            ct
                        ) is
                        { } noteProblem
                    )
                        return Results.ValidationProblem(noteProblem);

                    // Hired and PendingVerification are set by the acceptance flow and email verification, never by hand.
                    if (
                        request.Status
                        is ApplicationStatus.Hired
                            or ApplicationStatus.PendingVerification
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["status"] =
                                [
                                    "Use Active, Rejected or Withdrawn here. Hiring goes through an approved acceptance.",
                                ],
                            }
                        );
                    // The Hired stage is reached only by sending an acceptance, whatever the approval setting.
                    if (IsHiredStage(stage) && application.Status != ApplicationStatus.Hired)
                        return Results.Conflict(
                            new
                            {
                                message = "Hiring goes through an acceptance. Start one from the application.",
                            }
                        );
                    // Closed applications come back through Reopen, which says so and sends nothing.
                    if (
                        application.Status
                            is ApplicationStatus.Rejected
                                or ApplicationStatus.Withdrawn
                        && request.Status == ApplicationStatus.Active
                    )
                        return Results.Conflict(
                            new { message = "Reopen this application before you move it." }
                        );
                    if (
                        request.SendAt is { } sendAt
                        && (sendAt > DateTimeOffset.UtcNow.AddDays(60))
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["sendAt"] = ["Pick a time in the next 60 days."],
                            }
                        );
                    // A time already past means "now".
                    var later = request.SendAt > DateTimeOffset.UtcNow ? request.SendAt : null;
                    var oldStage = application.PipelineStageId;
                    var oldStatus = application.Status;
                    application.PipelineStageId = stage.Id;
                    application.Status = request.Status;
                    application.DispositionReason = Clean(request.DispositionReason);
                    application.DispositionNote = Clean(request.DispositionNote);
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    var emailId =
                        oldStage != stage.Id
                        && (
                            stage.EmailOnEntry == StageEmail.Always && request.SendEmail != false
                            || stage.EmailOnEntry == StageEmail.Ask && request.SendEmail == true
                        )
                            ? await QueueStageEntryEmailAsync(
                                db,
                                application,
                                stage,
                                principal,
                                ct,
                                later
                            )
                            : null;
                    var closing =
                        application.Status
                            is ApplicationStatus.Rejected
                                or ApplicationStatus.Withdrawn
                        && oldStatus == ApplicationStatus.Active;
                    // Only a new rejection emails the candidate. Stage names are internal, so a move sends nothing.
                    Guid? rejectionId = null;
                    if (
                        application.Status == ApplicationStatus.Rejected
                        && oldStatus != ApplicationStatus.Rejected
                        && request.SendEmail != false
                    )
                        rejectionId = await QueueRejectionAsync(
                            db,
                            application,
                            request.Message,
                            ct,
                            later
                        );
                    if (closing)
                        await CloseOutAsync(
                            db,
                            integration,
                            mailer,
                            principal,
                            application,
                            request.CancelInterviews == true,
                            request.WithdrawOffer == true,
                            rejectionEmailed: rejectionId is not null,
                            ct
                        );
                    await PipelineEvents.OnMovedAsync(
                        db,
                        application,
                        oldStage,
                        oldStatus,
                        principal.Email(),
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "StageChanged",
                        new
                        {
                            FromStageId = oldStage,
                            ToStageId = stage.Id,
                            FromStatus = oldStatus,
                            ToStatus = application.Status,
                            application.DispositionReason,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    // The stage email waits a minute (or until it is due), so it can still be taken back.
                    // A rejection email sent now is not returned: only one sent later can be taken back.
                    Guid[] queued =
                    [
                        .. new[] { emailId, later is null ? null : rejectionId }.OfType<Guid>(),
                    ];
                    return queued.Length > 0
                        ? Results.Ok(new { EmailIds = queued })
                        : Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/reopen",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var application = await db
                        .Applications.Include(x => x.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (
                        application?.Requisition is null
                        || !CanManage(application.Requisition, principal)
                    )
                        return Results.NotFound();
                    if (
                        application.Status
                        is not (ApplicationStatus.Rejected or ApplicationStatus.Withdrawn)
                    )
                        return Results.Conflict(
                            new
                            {
                                message = "Only a rejected or withdrawn application can be reopened.",
                            }
                        );
                    var oldStatus = application.Status;
                    application.Status = ApplicationStatus.Active;
                    application.DispositionReason = null;
                    application.DispositionNote = null;
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    await PipelineEvents.OnMovedAsync(
                        db,
                        application,
                        application.PipelineStageId,
                        oldStatus,
                        principal.Email(),
                        ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "Reopened",
                        new { FromStatus = oldStatus }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Takes back a stage or rejection email that has not gone out yet (sent later, or in its undo minute).
        api.MapPost(
                "/applications/{id:guid}/emails/{emailId:guid}/cancel",
                async (
                    Guid id,
                    Guid emailId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var job = await db
                        .Applications.Where(x => x.Id == id)
                        .Select(x => x.Requisition)
                        .SingleOrDefaultAsync(ct);
                    if (job is null || !CanManage(job, principal))
                        return Results.NotFound();
                    var item = await db.EmailOutbox.SingleOrDefaultAsync(
                        x =>
                            x.Id == emailId
                            && x.ApplicationId == id
                            && x.Status == EmailOutboxStatus.Pending
                            && (x.TemplateKey == "rejection" || x.TemplateKey == "stage-update"),
                        ct
                    );
                    if (item is null)
                        return Results.Conflict(
                            new { message = "This email has already gone out or was cancelled." }
                        );
                    db.EmailOutbox.Remove(item);
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "EmailCancelled",
                        new { item.Subject, item.TemplateKey }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        MapRejectionReasons(api);
        MapApplicationNotes(api);
        MapEvaluation(api);
        MapApplicationCompare(api);
        MapInterviewKits(api);
        MapInterviewLibrary(api);
    }

    /// <summary>Interviews on this application where the person is an interviewer and has not submitted yet.</summary>
    internal static async Task<string[]> BlindingInterviewsAsync(
        AtsDbContext db,
        Guid applicationId,
        string email,
        CancellationToken ct
    ) =>
        await db
            .Interviews.AsNoTracking()
            .Where(i =>
                i.ApplicationId == applicationId
                && i.Status != InterviewStatus.Cancelled
                && i.Status != InterviewStatus.NoShow
                && i.InterviewerEmails.Contains(email)
                && !i.Scorecards.Any(s => s.InterviewerEmail == email)
            )
            .OrderBy(i => i.StartsAt)
            .Select(i => i.Title)
            .ToArrayAsync(ct);

    /// <summary>
    /// The stage's email for someone just moved into it, when the stage emails on entry (callers
    /// decide between "Always" and "Ask") and they are still active. It waits StageEmailDelay so the
    /// move can be undone, or until <c>sendAt</c>, and never goes to people who asked not to be
    /// contacted. Returns the queued email's id.
    /// </summary>
    private static async Task<Guid?> QueueStageEntryEmailAsync(
        AtsDbContext db,
        Application application,
        PipelineStage stage,
        ClaimsPrincipal principal,
        CancellationToken ct,
        DateTimeOffset? sendAt = null
    )
    {
        if (stage.EmailOnEntry == StageEmail.Off || application.Status != ApplicationStatus.Active)
            return null;
        await db.Entry(application).Reference(x => x.Candidate).LoadAsync(ct);
        await db.Entry(application).Reference(x => x.Requisition).LoadAsync(ct);
        if (application.Candidate!.DoNotContact)
            return null;
        var email = await RenderStageEmailAsync(db, application, stage, ct);
        var item = new EmailOutboxItem
        {
            ApplicationId = application.Id,
            Recipient = application.Candidate.Email,
            Subject = email.Subject,
            Body = email.Body,
            TemplateKey = "stage-update",
            TemplateVersion = email.Version,
            NextAttemptAt = sendAt ?? DateTimeOffset.UtcNow + StageEmailDelay,
        };
        db.EmailOutbox.Add(item);
        Audit.Add(
            db,
            principal,
            "Application",
            application.Id,
            "StageEmailQueued",
            new
            {
                StageId = stage.Id,
                Label = StageRules.CandidateLabel(stage),
                SendAt = sendAt,
            }
        );
        return item.Id;
    }

    /// <summary>
    /// The rejection email, unless the candidate asked not to be contacted. Goes out at
    /// <paramref name="sendAt"/> when given. Returns the queued email's id.
    /// </summary>
    private static async Task<Guid?> QueueRejectionAsync(
        AtsDbContext db,
        Application application,
        string? message,
        CancellationToken ct,
        DateTimeOffset? sendAt = null
    )
    {
        await db.Entry(application).Reference(x => x.Candidate).LoadAsync(ct);
        await db.Entry(application).Reference(x => x.Requisition).LoadAsync(ct);
        var candidate = application.Candidate!;
        if (candidate.DoNotContact)
            return null;
        return await EmailTemplates.QueueAsync(
            db,
            "rejection",
            application.RequisitionId,
            candidate.Email,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["jobTitle"] = application.Requisition!.Title,
            },
            application.Id,
            ct,
            message,
            sendAt
        );
    }

    /// <summary>
    /// Closing an application (reject or withdraw) tidies up what is still open, as the person
    /// chose: upcoming interviews are cancelled (interviewers are told, and the candidate too when
    /// no rejection email covers it) and an open offer is withdrawn.
    /// </summary>
    internal static async Task CloseOutAsync(
        AtsDbContext db,
        IWorkplaceIntegration integration,
        InterviewMailer mailer,
        ClaimsPrincipal principal,
        Application application,
        bool cancelInterviews,
        bool withdrawOffer,
        bool rejectionEmailed,
        CancellationToken ct
    )
    {
        if (cancelInterviews)
            await CancelUpcomingInterviewsAsync(
                db,
                integration,
                mailer,
                principal,
                application,
                notifyCandidate: !rejectionEmailed && !application.Candidate!.DoNotContact,
                ct
            );
        if (withdrawOffer)
            foreach (
                var offer in await db
                    .Offers.Where(x =>
                        x.ApplicationId == application.Id
                        && WithdrawableOfferStatuses.Contains(x.Status)
                    )
                    .ToListAsync(ct)
            )
                await WithdrawOfferAsync(db, offer, principal.Email(), ct);
    }

    /// <summary>
    /// Cancels this application's interviews that have not happened yet, through the interview
    /// cancellation path: calendars are updated and interviewers are emailed.
    /// </summary>
    private static async Task CancelUpcomingInterviewsAsync(
        AtsDbContext db,
        IWorkplaceIntegration integration,
        InterviewMailer mailer,
        ClaimsPrincipal principal,
        Application application,
        bool notifyCandidate,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var upcoming = await db
            .Interviews.Include(x => x.Application)
                .ThenInclude(x => x!.Requisition)
            .Include(x => x.Application)
                .ThenInclude(x => x!.Candidate)
            .Where(x =>
                x.ApplicationId == application.Id
                && (x.Status == InterviewStatus.Scheduled || x.Status == InterviewStatus.Proposed)
                && x.EndsAt > now
            )
            .ToListAsync(ct);
        var reason =
            application.Status == ApplicationStatus.Withdrawn
                ? "The candidate withdrew."
                : "The application was closed.";
        foreach (var interview in upcoming)
            await CancelAsync(
                db,
                integration,
                mailer,
                principal,
                interview,
                reason,
                null,
                notifyCandidate,
                ct
            );
    }
}

/// <summary>Reads the apply form's answers back into question and answer pairs.</summary>
public static class ApplicationAnswers
{
    public sealed record Pair(string Question, string Answer);

    // The careers site writes "### Question" then the answer, one block per question.
    public static Pair[] Parse(string? markdown)
    {
        var pairs = new List<Pair>();
        string? question = null;
        var answer = new List<string>();
        void Flush()
        {
            if (question is not null)
                pairs.Add(
                    new(
                        question,
                        string.Join("\n", answer).Trim() is { Length: > 0 } a && a != "_No answer_"
                            ? a
                            : ""
                    )
                );
            answer.Clear();
        }
        foreach (var line in (markdown ?? "").Replace("\r\n", "\n").Split('\n'))
        {
            if (line.StartsWith("### ", StringComparison.Ordinal))
            {
                Flush();
                question = line[4..].Trim();
            }
            else if (question is not null)
                answer.Add(line);
            else if (line.Trim().Length > 0)
            {
                // Older or hand-written answers without headings: keep them as one block.
                question = "Answers";
                answer.Add(line);
            }
        }
        Flush();
        return [.. pairs];
    }
}
