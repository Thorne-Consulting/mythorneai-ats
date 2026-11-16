using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapCandidateAttachments(RouteGroupBuilder api)
    {
        // Upload a file with its kind (form field `kind`, default Resume). Only resumes are read into the profile.
        api.MapPost(
                "/candidates/{id:guid}/attachments",
                async (
                    Guid id,
                    IFormFile file,
                    HttpRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    if (await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct) is null)
                        return Results.NotFound();
                    var kind = request.HasFormContentType ? request.Form["kind"].ToString() : "";
                    kind = kind.Length == 0 ? AttachmentKinds.Resume : kind;
                    if (!AttachmentKinds.All.Contains(kind))
                        return Problem("kind", "Choose what kind of file this is.");
                    if (
                        kind == AttachmentKinds.Resume
                        && !ResumeTextExtractor.CanRead(file.FileName)
                    )
                        return Problem(
                            "file",
                            "We can read resumes in PDF or Word (.docx) files. Save it as one of those and upload it again."
                        );
                    try
                    {
                        var stored = await files.SaveValidatedAsync(file, ct);
                        var resume = kind == AttachmentKinds.Resume;
                        var attachment = new Attachment
                        {
                            CandidateId = id,
                            OriginalFileName = Path.GetFileName(file.FileName),
                            StoredFileName = stored.StoredName,
                            ContentType = stored.ContentType,
                            Length = file.Length,
                            Kind = kind,
                            UploadedBy = principal.Email(),
                            ScanStatus = "ValidationOnly",
                            ParseStatus = resume ? "Pending" : "NotParsed",
                        };
                        db.Attachments.Add(attachment);
                        if (resume)
                            db.ResumeParseJobs.Add(
                                new ResumeParseJob { AttachmentId = attachment.Id }
                            );
                        Audit.Add(
                            db,
                            principal,
                            "Candidate",
                            id,
                            "AttachmentUploaded",
                            new
                            {
                                attachment.Id,
                                attachment.OriginalFileName,
                                attachment.Length,
                                attachment.Kind,
                            }
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.Created(
                            $"/api/attachments/{attachment.Id}",
                            new { attachment.Id }
                        );
                    }
                    catch (InvalidDataException exception)
                    {
                        return Problem("file", exception.Message);
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
            "/attachments/{id:guid}",
            async (
                Guid id,
                bool inline,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var attachment = await db
                    .Attachments.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && (
                                principal.IsHiringStaff()
                                || allowedCandidateIds.Contains(x.CandidateId)
                            ),
                        ct
                    );
                return attachment is null
                    ? Results.NotFound()
                    : Results.File(
                        files.OpenRead(attachment.StoredFileName),
                        attachment.ContentType,
                        inline ? null : attachment.OriginalFileName,
                        attachment.UploadedAt,
                        enableRangeProcessing: true
                    );
            }
        );

        // Rename a file or change its kind. Changing the kind never re-reads it; "Use as the resume" does.
        api.MapPatch(
                "/attachments/{id:guid}",
                async (
                    Guid id,
                    AttachmentUpdateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var attachment = await db.Attachments.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (attachment is null)
                        return Results.NotFound();
                    if (request.Name is { } name)
                    {
                        name = Path.GetFileName(name.Trim());
                        if (name.Length is 0 or > 200)
                            return Problem("name", "Enter a file name of up to 200 characters.");
                        var extension = Path.GetExtension(attachment.OriginalFileName);
                        attachment.OriginalFileName = name.EndsWith(
                            extension,
                            StringComparison.OrdinalIgnoreCase
                        )
                            ? name
                            : name + extension;
                    }
                    if (request.Kind is { } kind)
                    {
                        if (!AttachmentKinds.All.Contains(kind))
                            return Problem("kind", "Choose what kind of file this is.");
                        attachment.Kind = kind;
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        attachment.CandidateId,
                        "AttachmentUpdated",
                        new
                        {
                            attachment.Id,
                            attachment.OriginalFileName,
                            attachment.Kind,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Delete a file. The profile read from it stays; upload or choose another resume to replace it.
        api.MapDelete(
                "/attachments/{id:guid}",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var attachment = await db.Attachments.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (attachment is null)
                        return Results.NotFound();
                    await db
                        .ResumeParseJobs.Where(x => x.AttachmentId == id)
                        .ExecuteDeleteAsync(ct);
                    db.Attachments.Remove(attachment);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        attachment.CandidateId,
                        "AttachmentDeleted",
                        new { attachment.Id, attachment.OriginalFileName }
                    );
                    await db.SaveChangesAsync(ct);
                    files.Delete(attachment.StoredFileName);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }
}
