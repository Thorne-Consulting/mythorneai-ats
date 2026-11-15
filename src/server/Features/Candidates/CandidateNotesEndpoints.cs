using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record CandidateNoteRequest(
    string? Body,
    Guid? ApplicationId,
    bool IsPrivate = false
);

public sealed record NoteUpdateRequest(string? Body, bool? IsPrivate);

public static partial class AtsEndpoints
{
    private const int NoteLimit = 20_000;

    /// <summary>Can this person see the candidate at all? Staff see everyone; others through a job or interview.</summary>
    private static Task<bool> CanSeeCandidateAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid id,
        CancellationToken ct
    ) =>
        principal.IsHiringStaff()
            ? db.Candidates.AnyAsync(x => x.Id == id, ct)
            : ScopeApplications(db.Applications.AsNoTracking(), principal)
                .AnyAsync(x => x.CandidateId == id, ct);

    /// <summary>A note this person may read: its application is visible to them, and private notes need staff or a hiring manager.</summary>
    private static async Task<ApplicationNote?> VisibleNoteAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid noteId,
        CancellationToken ct
    )
    {
        var note = await db
            .Notes.Include(x => x.Application)
            .SingleOrDefaultAsync(x => x.Id == noteId, ct);
        if (note is null || (note.IsPrivate && !CanSeeContact(principal)))
            return null;
        var candidateId = note.CandidateId ?? note.Application?.CandidateId;
        if (
            candidateId is null
            || !await CanSeeCandidateAsync(db, principal, candidateId.Value, ct)
        )
            return null;
        if (
            note.ApplicationId is { } applicationId
            && !await ScopeApplications(db.Applications.AsNoTracking(), principal)
                .AnyAsync(x => x.Id == applicationId, ct)
        )
            return null;
        return note;
    }

    private static void MapCandidateNotes(RouteGroupBuilder api)
    {
        // Who can be mentioned in a note about this person, and whether each of them can see it.
        api.MapGet(
            "/candidates/{id:guid}/people",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await CanSeeCandidateAsync(db, principal, id, ct))
                    return Results.NotFound();
                var users = await db
                    .Users.AsNoTracking()
                    .Where(x => x.IsActive)
                    .OrderBy(x => x.DisplayName)
                    .Select(x => new
                    {
                        Email = x.Email.ToLower(),
                        Name = x.DisplayName,
                        x.Role,
                    })
                    .Take(300)
                    .ToListAsync(ct);
                // ponytail: one small query per hiring manager or interviewer; fine for teams of a few hundred.
                var people = new List<object>();
                foreach (var user in users)
                {
                    var access =
                        user.Role is UserRole.Admin or UserRole.Recruiter
                        || await ScopeApplications(
                                db.Applications.AsNoTracking(),
                                PrincipalFor(user.Email, user.Role)
                            )
                            .AnyAsync(x => x.CandidateId == id, ct);
                    people.Add(
                        new
                        {
                            user.Email,
                            user.Name,
                            Role = user.Role.ToString(),
                            Access = access,
                        }
                    );
                }
                return Results.Ok(people);
            }
        );

        api.MapPost(
            "/candidates/{id:guid}/notes",
            async (
                Guid id,
                CandidateNoteRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var body = request.Body?.Trim() ?? "";
                if (body.Length == 0)
                    return Problem("body", "Write the note first.");
                if (body.Length > NoteLimit)
                    return Problem(
                        "body",
                        "That note is too long. Keep it under 20,000 characters."
                    );
                if (!await CanSeeCandidateAsync(db, principal, id, ct))
                    return Results.NotFound();
                Application? application = null;
                if (request.ApplicationId is { } applicationId)
                {
                    application = await ScopeApplications(db.Applications, principal)
                        .SingleOrDefaultAsync(
                            x => x.Id == applicationId && x.CandidateId == id,
                            ct
                        );
                    if (application is null)
                        return Problem("applicationId", "Choose one of their jobs, or none.");
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                }
                var note = new ApplicationNote
                {
                    CandidateId = id,
                    ApplicationId = application?.Id,
                    Body = body,
                    AuthorEmail = principal.Email(),
                    IsPrivate = request.IsPrivate && CanSeeContact(principal),
                };
                db.Notes.Add(note);
                var mentioned = await Mentions.RecordAsync(db, note, ct);
                Audit.Add(
                    db,
                    principal,
                    "Candidate",
                    id,
                    "NoteAdded",
                    new
                    {
                        note.Id,
                        note.ApplicationId,
                        note.IsPrivate,
                        Mentioned = mentioned,
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.Created(
                    $"/api/notes/{note.Id}",
                    new { note.Id, Mentioned = mentioned }
                );
            }
        );

        // Edit your own note. Mentions follow the new text; only new names are notified.
        api.MapPut(
            "/notes/{id:guid}",
            async (
                Guid id,
                NoteUpdateRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var note = await VisibleNoteAsync(db, principal, id, ct);
                if (note is null)
                    return Results.NotFound();
                if (note.AuthorEmail != principal.Email())
                    return Results.Forbid();
                if (request.Body is not null)
                {
                    var body = request.Body.Trim();
                    if (body.Length == 0)
                        return Problem("body", "A note cannot be empty. Delete it instead.");
                    if (body.Length > NoteLimit)
                        return Problem(
                            "body",
                            "That note is too long. Keep it under 20,000 characters."
                        );
                    if (body != note.Body)
                    {
                        note.Body = body;
                        note.EditedAt = DateTimeOffset.UtcNow;
                    }
                }
                if (request.IsPrivate is { } isPrivate)
                    note.IsPrivate = isPrivate && CanSeeContact(principal);
                var mentioned = await Mentions.RecordAsync(db, note, ct);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { Mentioned = mentioned });
            }
        );

        // Your own note, or any note for an admin.
        api.MapDelete(
            "/notes/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var note = await VisibleNoteAsync(db, principal, id, ct);
                if (note is null)
                    return Results.NotFound();
                if (
                    note.AuthorEmail != principal.Email()
                    && !principal.IsInRole(nameof(UserRole.Admin))
                )
                    return Results.Forbid();
                db.Notes.Remove(note);
                Audit.Add(
                    db,
                    principal,
                    "Candidate",
                    (note.CandidateId ?? note.Application?.CandidateId)!,
                    "NoteDeleted",
                    new { note.Id, note.AuthorEmail }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        async Task<IResult> Pin(
            Guid id,
            bool pin,
            ClaimsPrincipal principal,
            AtsDbContext db,
            CancellationToken ct
        )
        {
            var note = await VisibleNoteAsync(db, principal, id, ct);
            if (note is null)
                return Results.NotFound();
            note.PinnedAt = pin ? DateTimeOffset.UtcNow : null;
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        }
        api.MapPut(
                "/notes/{id:guid}/pin",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    Pin(id, true, principal, db, ct)
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
        api.MapDelete(
                "/notes/{id:guid}/pin",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    Pin(id, false, principal, db, ct)
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>A stand-in for another user, to ask "could they see this?" with the same scope rules.</summary>
    private static ClaimsPrincipal PrincipalFor(string email, UserRole role) =>
        new(
            new ClaimsIdentity(
                [new Claim(ClaimTypes.Email, email), new Claim(ClaimTypes.Role, role.ToString())],
                "scope-check"
            )
        );
}
