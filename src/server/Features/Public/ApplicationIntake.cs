using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>What a person typed on the apply page, already trimmed and checked.</summary>
public sealed record ApplyDetails(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? LinkedInUrl,
    string? AnswersMarkdown,
    string? TimeZone,
    string Source,
    string? UtmJson,
    IReadOnlyList<CheckedAnswer>? Answers = null
);

/// <summary>A typed answer already checked against its question; File is the upload for a file question.</summary>
public sealed record CheckedAnswer(
    ApplicationQuestion Question,
    string[] Values,
    ResumeUpload? File
);

/// <summary>A resume file already saved in the file store; <c>UploadId</c> when it came from the upload-first step.</summary>
public sealed record StoredResume(
    string StoredFileName,
    string OriginalFileName,
    string ContentType,
    long Length,
    Guid? UploadId = null
);

/// <summary>
/// Careers-site applications. Submitting is final: the team sees the application at once. The
/// email holds a one-click link and a code that confirm the address. Until then, nothing typed on
/// the form changes a candidate who was already on file.
/// </summary>
public static class ApplicationIntake
{
    public static readonly TimeSpan LinkLifetime = TimeSpan.FromDays(7);
    public static readonly TimeSpan ReminderAfter = TimeSpan.FromDays(1);
    public static readonly TimeSpan CloseAfter = TimeSpan.FromDays(30);
    public static readonly TimeSpan UploadLifetime = TimeSpan.FromDays(1);
    public const string ReceivedKey = "application-received";
    public const string AlreadyAppliedKey = "application-already-applied";
    public const string ReminderKey = "application-confirm-reminder";
    public const string ClosedReason = "Email address never confirmed";

    /// <summary>Emails that carry a sign-in link or code. The portal lists them without their text.</summary>
    public static readonly string[] SecretKeys =
    [
        "verification",
        "portal-code",
        ReceivedKey,
        AlreadyAppliedKey,
        ReminderKey,
        CandidateFacingEndpoints.DocumentRequestKey,
    ];

    /// <summary>Returns the application the email is about, and whether the resume was kept.</summary>
    public static async Task<(Guid ApplicationId, bool ResumeUsed)> SubmitAsync(
        AtsDbContext db,
        LocalFileStore files,
        Requisition job,
        ApplyDetails details,
        StoredResume? resume,
        IHostEnvironment environment,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == details.Email, ct);
        var application = candidate is null
            ? null
            : await db
                .Applications.Where(x => x.CandidateId == candidate.Id && x.RequisitionId == job.Id)
                .OrderByDescending(x => x.AppliedAt)
                .FirstOrDefaultAsync(ct);
        var submission = application is null
            ? null
            : await db.ApplicationSubmissions.SingleOrDefaultAsync(
                x => x.ApplicationId == application.Id,
                ct
            );
        var legacyPending = application?.Status == ApplicationStatus.PendingVerification;
        var awaiting =
            legacyPending
            || (
                application?.Status == ApplicationStatus.Active
                && submission is { ConfirmedAt: null }
            );

        // Applied before: send a way back in, change nothing. The page reads the same either way,
        // so it does not tell a stranger whether this person applied.
        if (application is not null && !awaiting)
        {
            await QueueLinkEmailAsync(
                db,
                application,
                candidate!,
                job.Title,
                AlreadyAppliedKey,
                environment,
                ct
            );
            await db.SaveChangesAsync(ct);
            return (application.Id, false);
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        string? replaced = null;
        var isNewCandidate = candidate is null;
        // The link's ?src= or utm_source picks a managed source by its code or name.
        var link = details.UtmJson is null
            ? null
            : JsonSerializer.Deserialize<Dictionary<string, string?>>(details.UtmJson);
        var source = await Sources.ForCareersAsync(
            db,
            details.Source,
            [link?.GetValueOrDefault("src"), link?.GetValueOrDefault("utm_source")],
            ct
        );
        if (candidate is null)
        {
            candidate = new Candidate
            {
                FirstName = details.FirstName,
                LastName = details.LastName,
                Email = details.Email,
                Source = source,
                Phone = details.Phone,
                Location = details.Location,
                LinkedInUrl = details.LinkedInUrl,
                TimeZone = details.TimeZone,
            };
            db.Candidates.Add(candidate);
        }
        var isNewApplication = application is null || legacyPending;
        if (application is null)
        {
            application = new Application
            {
                Candidate = candidate,
                RequisitionId = job.Id,
                PipelineStageId = job.Stages.OrderBy(x => x.SortOrder).First().Id,
                Source = source,
            };
            db.Applications.Add(application);
        }
        application.Status = ApplicationStatus.Active;
        if (legacyPending)
            application.AppliedAt = now;
        application.LastActivityAt = now;
        application.ApplicationAnswersMarkdown =
            details.AnswersMarkdown ?? application.ApplicationAnswersMarkdown;
        if (details.Answers is { } answers)
            await SaveAnswersAsync(db, application, candidate, answers, details.Email, ct);

        if (submission is null)
        {
            submission = new ApplicationSubmission { ApplicationId = application.Id };
            db.ApplicationSubmissions.Add(submission);
        }
        submission.SubmittedAt = now;
        submission.ReminderSentAt = null;
        submission.UtmJson = details.UtmJson ?? submission.UtmJson;
        var typed = JsonSerializer.Serialize(
            new SubmittedProfile(
                details.FirstName,
                details.LastName,
                details.Phone,
                details.Location,
                details.LinkedInUrl,
                details.TimeZone
            )
        );
        submission.SentProfileJson = typed;

        // A record created by this form has nothing to protect. Anyone already on file keeps their
        // details until the address is confirmed.
        var hold = !isNewCandidate;
        if (hold)
            submission.HeldProfileJson = typed;
        if (resume is not null)
        {
            var attachment = new Attachment
            {
                Candidate = candidate,
                OriginalFileName = resume.OriginalFileName,
                StoredFileName = resume.StoredFileName,
                ContentType = resume.ContentType,
                Length = resume.Length,
                UploadedBy = $"candidate:{details.Email}",
                ScanStatus = "ValidationOnly",
                ParseStatus = hold ? "AwaitingConfirmation" : "Pending",
            };
            db.Attachments.Add(attachment);
            submission.ResumeAttachmentId = attachment.Id;
            // The file now belongs to the candidate, so the upload clean-up must not touch it.
            if (resume.UploadId is { } uploadId)
                await db.ResumeUploads.Where(x => x.Id == uploadId).ExecuteDeleteAsync(ct);
            if (hold)
            {
                // A second try before confirming replaces the first file.
                if (submission.HeldResumeId is { } earlier)
                    replaced = await RemoveAttachmentAsync(db, earlier, ct);
                submission.HeldResumeId = attachment.Id;
            }
            else
                db.ResumeParseJobs.Add(new ResumeParseJob { AttachmentId = attachment.Id });
        }
        await db.SaveChangesAsync(ct);

        if (isNewApplication)
        {
            PipelineEvents.RecordMove(db, application, null, null, null);
            await PipelineEvents.PublishApplicationAsync(
                db,
                "application.created",
                application,
                ct
            );
        }
        await QueueLinkEmailAsync(
            db,
            application,
            candidate,
            job.Title,
            ReceivedKey,
            environment,
            ct
        );
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        if (replaced is not null)
            files.Delete(replaced);
        return (application.Id, resume is not null);
    }

    /// <summary>
    /// Typed answers replace any from an earlier try. A file answer becomes a document on the
    /// candidate. A knockout answer flags the application for review; nothing is rejected
    /// automatically. The Markdown copy keeps older screens readable.
    /// </summary>
    private static async Task SaveAnswersAsync(
        AtsDbContext db,
        Application application,
        Candidate candidate,
        IReadOnlyList<CheckedAnswer> answers,
        string email,
        CancellationToken ct
    )
    {
        await db
            .ApplicationAnswers.Where(x => x.ApplicationId == application.Id)
            .ExecuteDeleteAsync(ct);
        var rows = new List<ApplicationAnswer>();
        foreach (var (answer, index) in answers.Select((a, i) => (a, i)))
        {
            Guid? attachmentId = null;
            if (answer.File is { } upload)
            {
                var attachment = new Attachment
                {
                    Candidate = candidate,
                    OriginalFileName = upload.OriginalFileName,
                    StoredFileName = upload.StoredFileName,
                    ContentType = upload.ContentType,
                    Length = upload.Length,
                    UploadedBy = $"candidate:{email}",
                    Kind = AttachmentKinds.Other,
                    ScanStatus = "ValidationOnly",
                };
                db.Attachments.Add(attachment);
                attachmentId = attachment.Id;
                // The file now belongs to the candidate, so the upload clean-up must not touch it.
                await db.ResumeUploads.Where(x => x.Id == upload.Id).ExecuteDeleteAsync(ct);
            }
            rows.Add(
                new ApplicationAnswer
                {
                    ApplicationId = application.Id,
                    QuestionId = answer.Question.Id,
                    Label = answer.Question.Label,
                    Type = answer.Question.Type,
                    Values = answer.Values,
                    AttachmentId = attachmentId,
                    Flagged = ApplicationQuestions.IsKnockout(answer.Question, answer.Values),
                    SortOrder = index,
                }
            );
        }
        db.ApplicationAnswers.AddRange(rows);
        application.ApplicationAnswersMarkdown = ApplicationQuestions.ToMarkdown(rows);
    }

    /// <summary>
    /// The email address is confirmed (code, link or a signed-in portal): merge what was held and
    /// read the held resume. Safe to call more than once. The caller saves.
    /// </summary>
    public static async Task ConfirmAsync(
        AtsDbContext db,
        Application application,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        application.VerificationCodeHash = null;
        application.VerificationExpiresAt = null;
        application.VerificationAttempts = 0;
        if (application.Status == ApplicationStatus.PendingVerification)
        {
            // From before submitting was final: it only reaches the team now.
            application.Status = ApplicationStatus.Active;
            application.VerifiedAt = now;
            PipelineEvents.RecordMove(db, application, null, null, null);
            await PipelineEvents.PublishApplicationAsync(
                db,
                "application.created",
                application,
                ct
            );
            return;
        }
        var submission = await db.ApplicationSubmissions.SingleOrDefaultAsync(
            x => x.ApplicationId == application.Id,
            ct
        );
        if (submission is null || submission.ConfirmedAt is not null)
            return;
        submission.ConfirmedAt = now;
        application.VerifiedAt = now;
        var candidate =
            application.Candidate
            ?? await db.Candidates.SingleAsync(x => x.Id == application.CandidateId, ct);
        if (
            submission.HeldProfileJson is { } json
            && JsonSerializer.Deserialize<SubmittedProfile>(json) is { } held
        )
        {
            candidate.FirstName = held.FirstName;
            candidate.LastName = held.LastName;
            candidate.Phone = held.Phone ?? candidate.Phone;
            candidate.Location = held.Location ?? candidate.Location;
            candidate.LinkedInUrl = held.LinkedInUrl ?? candidate.LinkedInUrl;
            candidate.TimeZone = held.TimeZone ?? candidate.TimeZone;
            candidate.UpdatedAt = now;
        }
        if (
            submission.HeldResumeId is { } resumeId
            && await db.Attachments.SingleOrDefaultAsync(x => x.Id == resumeId, ct) is { } resume
        )
        {
            resume.ParseStatus = "Pending";
            db.ResumeParseJobs.Add(new ResumeParseJob { AttachmentId = resume.Id });
        }
        submission.HeldProfileJson = null;
        submission.HeldResumeId = null;
        db.AuditEvents.Add(
            new AuditEvent
            {
                EntityType = "Application",
                EntityId = application.Id.ToString(),
                Action = "EmailConfirmed",
                ActorEmail = $"candidate:{candidate.Email}",
            }
        );
    }

    /// <summary>"Send the email again" from the page after applying. At most once a minute per application.</summary>
    public static async Task ResendAsync(
        AtsDbContext db,
        Guid applicationId,
        string email,
        IHostEnvironment environment,
        CancellationToken ct
    )
    {
        var application = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .SingleOrDefaultAsync(x => x.Id == applicationId && x.Candidate!.Email == email, ct);
        if (application is null)
            return;
        var recent = DateTimeOffset.UtcNow.AddMinutes(-1);
        if (
            await db.EmailOutbox.AnyAsync(
                x =>
                    x.ApplicationId == applicationId
                    && x.CreatedAt > recent
                    && x.TemplateKey != null
                    && SecretKeys.Contains(x.TemplateKey),
                ct
            )
        )
            return;
        var awaiting = await db.ApplicationSubmissions.AnyAsync(
            x => x.ApplicationId == applicationId && x.ConfirmedAt == null,
            ct
        );
        await QueueLinkEmailAsync(
            db,
            application,
            application.Candidate!,
            application.Requisition!.Title,
            awaiting ? ReceivedKey : AlreadyAppliedKey,
            environment,
            ct
        );
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// One pass of the follow-up worker: a reminder a day after an unconfirmed application, closing
    /// it after 30 days when the team has not moved it, and clearing expired links and unused uploads.
    /// </summary>
    public static async Task FollowUpAsync(
        AtsDbContext db,
        LocalFileStore files,
        IHostEnvironment environment,
        DateTimeOffset now,
        bool sendReminders,
        CancellationToken ct
    )
    {
        if (sendReminders)
        {
            var remindBefore = now - ReminderAfter;
            var closeBefore = now - CloseAfter;
            var due = await db
                .ApplicationSubmissions.Include(x => x.Application!)
                    .ThenInclude(x => x.Candidate)
                .Include(x => x.Application!)
                    .ThenInclude(x => x.Requisition)
                .Where(x =>
                    x.ConfirmedAt == null
                    && x.ReminderSentAt == null
                    && x.SubmittedAt < remindBefore
                    && x.SubmittedAt > closeBefore
                    && x.Application!.Status == ApplicationStatus.Active
                )
                .OrderBy(x => x.SubmittedAt)
                .Take(100)
                .ToListAsync(ct);
            foreach (var submission in due)
            {
                var application = submission.Application!;
                await QueueLinkEmailAsync(
                    db,
                    application,
                    application.Candidate!,
                    application.Requisition!.Title,
                    ReminderKey,
                    environment,
                    ct
                );
                submission.ReminderSentAt = now;
            }
            await db.SaveChangesAsync(ct);
        }

        // Closed only while still in the first stage: once the team has moved it, it is theirs.
        var staleBefore = now - CloseAfter;
        var stale = await db
            .ApplicationSubmissions.Include(x => x.Application!)
                .ThenInclude(x => x.Requisition)
            .Where(x =>
                x.ConfirmedAt == null
                && x.SubmittedAt < staleBefore
                && x.Application!.Status == ApplicationStatus.Active
                && x.Application.PipelineStageId
                    == db.PipelineStages.Where(s => s.RequisitionId == x.Application.RequisitionId)
                        .OrderBy(s => s.SortOrder)
                        .Select(s => (Guid?)s.Id)
                        .FirstOrDefault()
            )
            .Take(100)
            .ToListAsync(ct);
        var removed = new List<string>();
        foreach (var submission in stale)
        {
            var application = submission.Application!;
            application.Status = ApplicationStatus.Withdrawn;
            application.DispositionReason = ClosedReason;
            application.LastActivityAt = now;
            application.VerificationCodeHash = null;
            application.VerificationExpiresAt = null;
            if (
                submission.HeldResumeId is { } held
                && await RemoveAttachmentAsync(db, held, ct) is { } file
            )
                removed.Add(file);
            submission.HeldResumeId = null;
            submission.HeldProfileJson = null;
            await PipelineEvents.OnMovedAsync(
                db,
                application,
                application.PipelineStageId,
                ApplicationStatus.Active,
                "system:apply-cleanup",
                ct
            );
        }
        await db.SaveChangesAsync(ct);
        removed.ForEach(files.Delete);

        var linksBefore = now - CloseAfter;
        await db.CandidateMagicLinks.Where(x => x.ExpiresAt < linksBefore).ExecuteDeleteAsync(ct);
        await db.CandidatePortalSessions.Where(x => x.ExpiresAt < now).ExecuteDeleteAsync(ct);
        var uploadsBefore = now - UploadLifetime;
        var unused = await db
            .ResumeUploads.Where(x => x.CreatedAt < uploadsBefore)
            .Take(200)
            .ToListAsync(ct);
        foreach (var upload in unused)
            files.Delete(upload.StoredFileName);
        db.ResumeUploads.RemoveRange(unused);
        await db.SaveChangesAsync(ct);
    }

    /// <summary>A fresh code on the application and a one-time link, in the email named by <paramref name="key"/>. The caller saves.</summary>
    private static async Task QueueLinkEmailAsync(
        AtsDbContext db,
        Application application,
        Candidate candidate,
        string jobTitle,
        string key,
        IHostEnvironment environment,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var code = CandidateCodes.New(candidate.Email, environment);
        application.VerificationCodeHash = PublicEndpoints.Hash(code);
        application.VerificationExpiresAt = now + LinkLifetime;
        application.VerificationAttempts = 0;
        var link = await CandidateLinks.CreateAsync(
            db,
            candidate.Id,
            application.Id,
            CandidateLinks.ApplicationPath(application.Id),
            ct,
            key == AlreadyAppliedKey ? CandidateMagicLink.SignIn : CandidateMagicLink.Confirm
        );
        var email = await EmailTemplates.RenderAsync(
            db,
            key,
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["lastName"] = candidate.LastName,
                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                ["jobTitle"] = jobTitle,
                ["confirmLink"] = link ?? "",
                ["code"] = code,
            },
            ct
        );
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = candidate.Email,
                Subject = email.Subject,
                Body = email.Body,
                TemplateKey = key,
                TemplateVersion = email.Version,
            }
        );
    }

    /// <summary>Removes the row; the caller deletes the returned file after saving.</summary>
    private static async Task<string?> RemoveAttachmentAsync(
        AtsDbContext db,
        Guid attachmentId,
        CancellationToken ct
    )
    {
        var attachment = await db.Attachments.SingleOrDefaultAsync(x => x.Id == attachmentId, ct);
        if (attachment is null)
            return null;
        db.Attachments.Remove(attachment);
        return attachment.StoredFileName;
    }
}
