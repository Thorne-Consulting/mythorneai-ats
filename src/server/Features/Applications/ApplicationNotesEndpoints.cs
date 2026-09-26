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
    private static void MapApplicationNotes(RouteGroupBuilder api)
    {
        api.MapPost("/applications/{id:guid}/notes", async (
            Guid id,
            AddNoteRequest request,
            ClaimsPrincipal principal,
            AtsDbContext db,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Body))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["body"] = ["Note text is required."] });
            var application = await db.Applications.Include(x => x.Requisition).SingleOrDefaultAsync(x => x.Id == id, ct);
            if (application?.Requisition is null || !CanManage(application.Requisition, principal))
                return Results.NotFound();
            var note = new ApplicationNote { ApplicationId = id, Body = request.Body.Trim(), AuthorEmail = principal.Email(), IsPrivate = request.IsPrivate };
            db.Notes.Add(note); application.LastActivityAt = DateTimeOffset.UtcNow;
            Audit.Add(db, principal, "Application", id, "NoteAdded", new { note.Id, note.IsPrivate });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/applications/{id}/notes/{note.Id}", new { note.Id });
        }).RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
