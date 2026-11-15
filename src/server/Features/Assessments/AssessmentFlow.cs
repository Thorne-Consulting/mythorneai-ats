using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Submitting, expiring and emailing invites: shared by the candidate, the staff screens and the worker.</summary>
public static class AssessmentFlow
{
    public const string InviteKey = "assessment-invite";
    public const string ReminderKey = "assessment-reminder";

    /// <summary>Status as people should see it: an unstarted invite past its expiry is expired.</summary>
    public static AssessmentInviteStatus Effective(AssessmentInvite invite, DateTimeOffset now) =>
        invite.Status == AssessmentInviteStatus.NotStarted && invite.ExpiresAt <= now
            ? AssessmentInviteStatus.Expired
            : invite.Status;

    /// <summary>Submits a run-out attempt and expires an unstarted one. Needs <c>Version</c> loaded.</summary>
    public static async Task<bool> SettleAsync(
        AtsDbContext db,
        AssessmentInvite invite,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        if (
            invite.Status == AssessmentInviteStatus.InProgress
            && now > AssessmentScoring.ClosesAt(invite) + AssessmentScoring.Grace
        )
        {
            await SubmitAsync(db, invite, now, auto: true, ct);
            return true;
        }
        if (invite.Status == AssessmentInviteStatus.NotStarted && invite.ExpiresAt <= now)
        {
            invite.Status = AssessmentInviteStatus.Expired;
            return true;
        }
        return false;
    }

    /// <summary>Scores what can be scored and locks the answers. Needs <c>Version</c> loaded; the caller saves.</summary>
    public static async Task SubmitAsync(
        AtsDbContext db,
        AssessmentInvite invite,
        DateTimeOffset now,
        bool auto,
        CancellationToken ct,
        string actor = "candidate"
    )
    {
        var content = AssessmentScoring.Read(invite.Version!.ContentJson);
        var answers = await db
            .AssessmentAnswers.Where(x => x.InviteId == invite.Id)
            .ToListAsync(ct);
        AssessmentScoring.ScoreOnSubmit(content, answers);
        AssessmentScoring.Apply(invite, content, answers);
        invite.Status = AssessmentInviteStatus.Submitted;
        invite.AutoSubmitted = auto;
        // Auto-submits are dated when time ran out, not when the sweep noticed.
        invite.SubmittedAt = auto ? AssessmentScoring.ClosesAt(invite) : now;
        Audit.Add(
            db,
            auto ? "system" : actor,
            "Application",
            invite.ApplicationId,
            auto ? "AssessmentTimeRanOut" : "AssessmentSubmitted",
            new { assessmentId = invite.AssessmentId, inviteId = invite.Id }
        );
        // For webhooks today and workflow triggers once the engine reads PipelineEvents.
        await PipelineEvents.PublishAsync(
            db,
            "assessment.completed",
            new
            {
                inviteId = invite.Id,
                assessmentId = invite.AssessmentId,
                applicationId = invite.ApplicationId,
                submittedAt = invite.SubmittedAt,
                autoSubmitted = auto,
                percent = invite.Percent,
                pending = invite.PendingCount,
            },
            ct
        );
    }

    /// <summary>
    /// Queues the invite or reminder email with a one-click portal link to the assessment. Needs
    /// <c>Application.Candidate</c>, <c>Application.Requisition</c> and <c>Assessment</c> loaded.
    /// </summary>
    public static async Task QueueEmailAsync(
        AtsDbContext db,
        string key,
        AssessmentInvite invite,
        string? note,
        CancellationToken ct
    )
    {
        var (variables, recipient) = await VariablesAsync(db, invite, note, ct);
        var application = invite.Application!;
        await EmailTemplates.QueueAsync(
            db,
            key,
            application.RequisitionId,
            recipient,
            variables,
            application.Id,
            ct
        );
    }

    /// <summary>The email as the candidate will read it, for the send dialog's preview.</summary>
    public static async Task<(string Subject, string Body)> PreviewAsync(
        AtsDbContext db,
        AssessmentInvite invite,
        string? note,
        CancellationToken ct
    )
    {
        var (variables, _) = await VariablesAsync(db, invite, note, ct, preview: true);
        var rendered = await EmailTemplates.RenderAsync(
            db,
            InviteKey,
            invite.Application!.RequisitionId,
            variables,
            ct
        );
        return (rendered.Subject, rendered.Body);
    }

    private static async Task<(
        Dictionary<string, string> Variables,
        string Recipient
    )> VariablesAsync(
        AtsDbContext db,
        AssessmentInvite invite,
        string? note,
        CancellationToken ct,
        bool preview = false
    )
    {
        var application = invite.Application!;
        var candidate = application.Candidate!;
        var assessment = invite.Assessment!;
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new
            {
                x.Name,
                x.TimeZone,
                x.PublicUrl,
            })
            .SingleOrDefaultAsync(ct);
        var minutes = AssessmentScoring.Read(invite.Version?.ContentJson ?? assessment.ContentJson);
        string link;
        if (assessment.Kind == AssessmentKind.External && assessment.ExternalUrl is { } url)
            link = AssessmentScoring.ExternalLink(url, candidate, invite.Id);
        else if (preview)
            link = string.IsNullOrWhiteSpace(organization?.PublicUrl)
                ? ""
                : $"{organization.PublicUrl.TrimEnd('/')}/candidate-portal/assessments/…";
        else
            link =
                await CandidateLinks.CreateAsync(
                    db,
                    candidate.Id,
                    application.Id,
                    $"/candidate-portal/assessments/{invite.Id}",
                    ct
                ) ?? "";
        var zone = TimeText.Zone(candidate.TimeZone, organization?.TimeZone);
        return (
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["jobTitle"] = application.Requisition!.Title,
                ["company"] = organization?.Name ?? "The hiring team",
                ["assessmentName"] = assessment.Name,
                ["dueDate"] = TimeText.DateTime(invite.ExpiresAt, zone),
                ["timeNote"] =
                    assessment.Kind == AssessmentKind.External
                        ? $"It is run by {assessment.ProviderName}."
                    : minutes.Timed ? $"You have {minutes.Minutes} minutes once you start."
                    : "There is no time limit.",
                ["note"] = note?.Trim() ?? "",
                ["portalLink"] = link,
            },
            candidate.Email
        );
    }

    /// <summary>
    /// The worker's sweep: submit attempts whose time ran out and expire unstarted invites. The
    /// reminder is the built-in "Remind candidates to finish an assessment" workflow. Returns how
    /// many invites changed.
    /// </summary>
    public static async Task<int> SweepAsync(
        AtsDbContext db,
        DateTimeOffset now,
        CancellationToken ct
    )
    {
        var cutoff = now - AssessmentScoring.Grace;
        var due = await db
            .AssessmentInvites.Include(x => x.Version)
            .Where(x =>
                (
                    x.Status == AssessmentInviteStatus.InProgress
                    && (x.DeadlineAt ?? x.ExpiresAt) < cutoff
                ) || (x.Status == AssessmentInviteStatus.NotStarted && x.ExpiresAt <= now)
            )
            .Take(200)
            .ToListAsync(ct);
        foreach (var invite in due)
            await SettleAsync(db, invite, now, ct);
        await db.SaveChangesAsync(ct);
        return due.Count;
    }
}

/// <summary>Every minute: <see cref="AssessmentFlow.SweepAsync"/>.</summary>
public sealed class AssessmentWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AssessmentWorker> logger
) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
                await AssessmentFlow.SweepAsync(db, DateTimeOffset.UtcNow, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Assessment sweep failed; trying again in a minute.");
            }
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken).ContinueWith(_ => { });
        }
    }
}
