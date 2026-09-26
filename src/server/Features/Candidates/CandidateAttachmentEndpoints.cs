using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapCandidateAttachments(RouteGroupBuilder api)
    {
        api.MapPost("/candidates/{id:guid}/attachments", async (Guid id, IFormFile file, ClaimsPrincipal principal, AtsDbContext db, LocalFileStore files, CancellationToken ct) =>
        {
            if (await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct) is null) return Results.NotFound();
            try
            {
                var stored = await files.SaveValidatedAsync(file, ct);
                var attachment = new Attachment { CandidateId = id, OriginalFileName = Path.GetFileName(file.FileName), StoredFileName = stored.StoredName, ContentType = stored.ContentType, Length = file.Length, UploadedBy = principal.Email(), ScanStatus = "ValidationOnly", ParseStatus = "Pending" };
                db.Attachments.Add(attachment); db.ResumeParseJobs.Add(new ResumeParseJob { AttachmentId = attachment.Id });
                Audit.Add(db, principal, "Candidate", id, "AttachmentUploaded", new { attachment.Id, attachment.OriginalFileName, attachment.Length });
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/attachments/{attachment.Id}", new { attachment.Id });
            }
            catch (InvalidDataException exception) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [exception.Message] }); }
        }).RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet("/attachments/{id:guid}", async (Guid id, bool inline, ClaimsPrincipal principal, AtsDbContext db, LocalFileStore files, CancellationToken ct) =>
        {
            var allowedCandidateIds = ScopeApplications(db.Applications.AsNoTracking(), principal).Select(x => x.CandidateId);
            var attachment = await db.Attachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && (principal.IsHiringStaff() || allowedCandidateIds.Contains(x.CandidateId)), ct);
            return attachment is null ? Results.NotFound() : Results.File(files.OpenRead(attachment.StoredFileName), attachment.ContentType, inline ? null : attachment.OriginalFileName, attachment.UploadedAt, enableRangeProcessing: true);
        });
    }
}
