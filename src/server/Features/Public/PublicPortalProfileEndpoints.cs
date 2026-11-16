using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Contact details the candidate keeps up to date. The email address stays: it is how they sign in.</summary>
public sealed record PortalProfileRequest(
    string? FirstName,
    string? LastName,
    string? Phone,
    string? Location,
    string? LinkedInUrl,
    string? TimeZone
);

public static partial class PublicEndpoints
{
    public static string CandidateUploader(string email) => $"candidate:{email}";

    private static void MapPublicPortalProfile(RouteGroupBuilder api)
    {
        api.MapPut(
            "/portal/profile",
            async (
                PortalProfileRequest request,
                [FromHeader(Name = SessionHeader)] string? token,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var session = await CurrentSessionAsync(http, db, token, ct);
                if (session?.Candidate is not { } candidate)
                    return Results.Unauthorized();
                // The same rules as the apply form, so details read the same everywhere.
                var (details, errors) = CheckApplication(
                    new PublicApplyRequest(
                        request.FirstName ?? "",
                        request.LastName ?? "",
                        candidate.Email,
                        request.Phone,
                        request.Location,
                        request.LinkedInUrl,
                        TimeZone: request.TimeZone
                    )
                );
                if (!string.IsNullOrWhiteSpace(request.TimeZone) && Zone(request.TimeZone) is null)
                    errors["timeZone"] = ["Choose a time zone from the list."];
                if (details is null || errors.Count > 0)
                    return Results.ValidationProblem(errors);
                candidate.FirstName = details.FirstName;
                candidate.LastName = details.LastName;
                candidate.Phone = details.Phone;
                candidate.Location = details.Location;
                candidate.LinkedInUrl = details.LinkedInUrl;
                candidate.TimeZone = details.TimeZone ?? candidate.TimeZone;
                candidate.UpdatedAt = DateTimeOffset.UtcNow;
                db.AuditEvents.Add(
                    new AuditEvent
                    {
                        EntityType = "Candidate",
                        EntityId = candidate.Id.ToString(),
                        Action = "DetailsUpdatedByCandidate",
                        ActorEmail = CandidateUploader(candidate.Email),
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        // "What you sent" on the application page: the details and answers from the form, the
        // resume, every document added since, and what the team asked for.
        api.MapGet(
            "/portal/applications/{applicationId:guid}/sent",
            async (
                Guid applicationId,
                [FromHeader(Name = SessionHeader)] string? token,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var session = await CurrentSessionAsync(http, db, token, ct);
                if (session?.Candidate is not { } candidate)
                    return Results.Unauthorized();
                var application = await db
                    .Applications.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == applicationId
                            && x.CandidateId == candidate.Id
                            && x.Status != ApplicationStatus.PendingVerification,
                        ct
                    );
                if (application is null)
                    return Results.NotFound();
                var submission = await db
                    .ApplicationSubmissions.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.ApplicationId == applicationId, ct);
                var resume = submission?.ResumeAttachmentId is { } resumeId
                    ? await db
                        .Attachments.AsNoTracking()
                        .Where(x => x.Id == resumeId)
                        .Select(x => new
                        {
                            x.Id,
                            FileName = x.OriginalFileName,
                            x.Kind,
                            x.Length,
                            x.UploadedAt,
                        })
                        .SingleOrDefaultAsync(ct)
                    : null;
                var uploader = CandidateUploader(candidate.Email);
                var documents = await db
                    .Attachments.AsNoTracking()
                    .Where(x =>
                        x.CandidateId == candidate.Id
                        && x.UploadedBy == uploader
                        && db.ApplicationMessages.Any(m =>
                            m.Id == x.MessageId && m.ApplicationId == applicationId
                        )
                    )
                    .OrderByDescending(x => x.UploadedAt)
                    .Select(x => new
                    {
                        x.Id,
                        FileName = x.OriginalFileName,
                        x.Kind,
                        x.Length,
                        x.UploadedAt,
                    })
                    .ToListAsync(ct);
                var requests = await db
                    .DocumentRequests.AsNoTracking()
                    .Where(x => x.ApplicationId == applicationId)
                    .OrderBy(x => x.FulfilledAt != null)
                    .ThenBy(x => x.RequestedAt)
                    .Select(x => new
                    {
                        x.Id,
                        x.Label,
                        x.Kind,
                        x.Note,
                        x.RequestedAt,
                        x.FulfilledAt,
                    })
                    .ToListAsync(ct);
                var profile = submission?.SentProfileJson is { } json
                    ? JsonSerializer.Deserialize<SubmittedProfile>(json)
                    : null;
                return Results.Ok(
                    new
                    {
                        submittedAt = submission?.SubmittedAt ?? application.AppliedAt,
                        profile,
                        email = candidate.Email,
                        answersMarkdown = application.ApplicationAnswersMarkdown,
                        resume,
                        documents,
                        requests,
                    }
                );
            }
        );

        // Add documents to an application, answer a request for one, or send files with a message
        // (`body`). The team sees it in the conversation like a message, with the files attached.
        api.MapPost(
                "/portal/applications/{applicationId:guid}/documents",
                async (
                    Guid applicationId,
                    [FromHeader(Name = SessionHeader)] string? token,
                    HttpContext http,
                    AtsDbContext db,
                    LocalFileStore files,
                    IConfiguration configuration,
                    IHubContext<InboxHub> hub,
                    CancellationToken ct
                ) =>
                {
                    var session = await CurrentSessionAsync(http, db, token, ct);
                    if (session?.Candidate is not { } candidate)
                        return Results.Unauthorized();
                    var application = await db
                        .Applications.Include(x => x.Candidate)
                        .Include(x => x.Requisition)
                        .SingleOrDefaultAsync(
                            x =>
                                x.Id == applicationId
                                && x.CandidateId == candidate.Id
                                && x.Status == ApplicationStatus.Active,
                            ct
                        );
                    if (application is null)
                        return Results.NotFound();
                    IResult Invalid(string field, string message) =>
                        Results.ValidationProblem(
                            new Dictionary<string, string[]> { [field] = [message] }
                        );
                    if (!http.Request.HasFormContentType)
                        return Invalid("file", "Choose a file to add.");
                    var form = await http.Request.ReadFormAsync(ct);
                    var uploads = form.Files.GetFiles("file");
                    if (uploads.Count == 0)
                        return Invalid("file", "Choose a file to add.");
                    if (uploads.Count > 10)
                        return Invalid("file", "Add up to 10 files at a time.");
                    // A message typed in the conversation, sent with the files.
                    var text = form["body"].ToString().Trim();
                    if (text.Length > EmailInbound.MaxBody)
                        return Invalid("body", "Write a message of up to 10,000 characters.");
                    var request = Guid.TryParse(form["requestId"], out var requestId)
                        ? await db.DocumentRequests.SingleOrDefaultAsync(
                            x =>
                                x.Id == requestId
                                && x.ApplicationId == applicationId
                                && x.FulfilledAt == null,
                            ct
                        )
                        : null;
                    var kind = request?.Kind ?? form["kind"].ToString();
                    if (!AttachmentKinds.All.Contains(kind))
                        return Invalid("kind", "Choose what kind of document this is.");
                    var resume = kind == AttachmentKinds.Resume;
                    if (resume && uploads.Any(f => !ResumeTextExtractor.CanRead(f.FileName)))
                        return Invalid(
                            "file",
                            "Add your resume as a PDF or Word (.docx) file, so the team can read it."
                        );
                    var stored =
                        new List<(IFormFile File, string StoredName, string ContentType)>();
                    try
                    {
                        foreach (var upload in uploads)
                        {
                            var saved = await files.SaveValidatedAsync(
                                upload,
                                ct,
                                allowImages: !resume
                            );
                            stored.Add((upload, saved.StoredName, saved.ContentType));
                        }
                    }
                    catch (InvalidDataException exception)
                    {
                        stored.ForEach(x => files.Delete(x.StoredName));
                        return Invalid("file", exception.Message);
                    }
                    var now = DateTimeOffset.UtcNow;
                    var names = string.Join(
                        ", ",
                        uploads.Select(f => Path.GetFileName(f.FileName))
                    );
                    var message = new ApplicationMessage
                    {
                        ApplicationId = applicationId,
                        FromCandidate = true,
                        Body =
                            text.Length > 0 ? text
                            : request is not null
                                ? $"Here is the {request.Label.ToLowerInvariant()} you asked for ({names})."
                            : kind == AttachmentKinds.Other
                                ? $"I sent {Files(uploads.Count)}: {names}."
                            : $"I added a document: {KindLabel(kind)} ({names}).",
                    };
                    var attachments = stored
                        .Select(x => new Attachment
                        {
                            CandidateId = candidate.Id,
                            OriginalFileName = Path.GetFileName(x.File.FileName),
                            StoredFileName = x.StoredName,
                            ContentType = x.ContentType,
                            Length = x.File.Length,
                            Kind = kind,
                            UploadedBy = CandidateUploader(candidate.Email),
                            ScanStatus = "ValidationOnly",
                            ParseStatus = resume ? "Pending" : "NotParsed",
                            MessageId = message.Id,
                        })
                        .ToList();
                    db.ApplicationMessages.Add(message);
                    db.Attachments.AddRange(attachments);
                    if (resume)
                        db.ResumeParseJobs.Add(
                            new ResumeParseJob { AttachmentId = attachments[^1].Id }
                        );
                    if (request is not null)
                    {
                        request.AttachmentId = attachments[0].Id;
                        request.FulfilledAt = now;
                    }
                    application.LastActivityAt = now;
                    application.ThreadDoneAt = null;
                    await EmailThreads.AlertTeamAsync(db, configuration, application, message, ct);
                    await db.SaveChangesAsync(ct);
                    await hub.ThreadChangedAsync(applicationId, candidate.Id);
                    return Results.Created(
                        $"/public/portal/documents/{attachments[0].Id}",
                        new { attachments[0].Id, ids = attachments.Select(x => x.Id) }
                    );
                }
            )
            .Accepts<IFormFile>("multipart/form-data");

        // Files the candidate sent, and files the team sent them in a message. The team's other
        // files (notes, scorecards, their own copies) stay with the team.
        api.MapGet(
            "/portal/documents/{attachmentId:guid}",
            async (
                Guid attachmentId,
                [FromHeader(Name = SessionHeader)] string? token,
                HttpContext http,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var session = await CurrentSessionAsync(http, db, token, ct);
                if (session?.Candidate is not { } candidate)
                    return Results.Unauthorized();
                var uploader = CandidateUploader(candidate.Email);
                var attachment = await db
                    .Attachments.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == attachmentId
                            && x.CandidateId == candidate.Id
                            && (
                                x.UploadedBy == uploader
                                || db.ApplicationMessages.Any(m =>
                                    m.Id == x.MessageId
                                    && m.Application!.CandidateId == candidate.Id
                                )
                            ),
                        ct
                    );
                return attachment is null
                    ? Results.NotFound()
                    : Results.File(
                        files.OpenRead(attachment.StoredFileName),
                        attachment.ContentType,
                        attachment.OriginalFileName
                    );
            }
        );
    }

    private static string Files(int count) => count == 1 ? "a file" : $"{count} files";

    private static string KindLabel(string kind) =>
        kind switch
        {
            AttachmentKinds.Resume => "updated resume",
            AttachmentKinds.CoverLetter => "cover letter",
            AttachmentKinds.Portfolio => "portfolio",
            _ => "document",
        };
}
