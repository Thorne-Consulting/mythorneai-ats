using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapInterviewRecordings(RouteGroupBuilder api)
    {
        api.MapPost("/interviews/{id:guid}/recordings", async (
            Guid id, bool consentConfirmed, IFormFile file, ClaimsPrincipal principal,
            AtsDbContext db, LocalFileStore files, CancellationToken ct) =>
        {
            if (!consentConfirmed)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["consentConfirmed"] = ["Confirm that every participant agreed to recording."] });
            var interview = await db.Interviews.Include(x => x.Application).ThenInclude(x => x!.Requisition).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (interview?.Application?.Requisition is null) return Results.NotFound();
            var isAssigned = interview.InterviewerEmails.Contains(principal.Email(), StringComparer.OrdinalIgnoreCase);
            if (!isAssigned && !CanManage(interview.Application.Requisition, principal)) return Results.Forbid();
            try
            {
                var stored = await files.SaveRecordingAsync(file, ct);
                var recording = new InterviewRecording { InterviewId = id, OriginalFileName = Path.GetFileName(file.FileName), StoredFileName = stored.StoredName, ContentType = stored.ContentType, Length = file.Length, UploadedBy = principal.Email(), ConsentConfirmed = true };
                db.InterviewRecordings.Add(recording); Audit.Add(db, principal, "Application", interview.ApplicationId, "InterviewRecordingUploaded", new { recording.Id, recording.Length });
                await db.SaveChangesAsync(ct);
                return Results.Created($"/api/interview-recordings/{recording.Id}", new { recording.Id });
            }
            catch (InvalidDataException exception) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = [exception.Message] }); }
        });

        api.MapGet("/interview-recordings/{id:guid}", async (Guid id, ClaimsPrincipal principal, AtsDbContext db, LocalFileStore files, CancellationToken ct) =>
        {
            var allowedApplicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal).Select(x => x.Id);
            var recording = await db.InterviewRecordings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id && allowedApplicationIds.Contains(x.Interview!.ApplicationId), ct);
            return recording is null ? Results.NotFound() : Results.File(files.OpenRead(recording.StoredFileName), recording.ContentType, enableRangeProcessing: true);
        });

        api.MapDelete("/interview-recordings/{id:guid}", async (Guid id, ClaimsPrincipal principal, AtsDbContext db, LocalFileStore files, CancellationToken ct) =>
        {
            var recording = await db.InterviewRecordings.Include(x => x.Interview).ThenInclude(x => x!.Application).ThenInclude(x => x!.Requisition).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (recording?.Interview?.Application?.Requisition is null || !CanManage(recording.Interview.Application.Requisition, principal)) return Results.NotFound();
            db.InterviewRecordings.Remove(recording); Audit.Add(db, principal, "Application", recording.Interview.ApplicationId, "InterviewRecordingDeleted", new { recording.Id });
            await db.SaveChangesAsync(ct); files.Delete(recording.StoredFileName); return Results.NoContent();
        }).RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
