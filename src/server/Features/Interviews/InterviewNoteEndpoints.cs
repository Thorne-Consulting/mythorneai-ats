using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Each person's own notes for an interview, saved as they type in the Room. Nobody else reads
/// them, so they never shape another panelist's view.
/// </summary>
public static partial class AtsEndpoints
{
    private static void MapInterviewNotes(RouteGroupBuilder api)
    {
        api.MapGet(
            "/interviews/{id:guid}/my-notes",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (!await CanSeeInterviewAsync(db, principal, id, ct))
                    return Results.NotFound();
                var email = principal.Email();
                var notes = await db
                    .InterviewNotes.AsNoTracking()
                    .Where(x => x.InterviewId == id && x.AuthorEmail == email)
                    .OrderBy(x => x.SortOrder)
                    .Select(x => new
                    {
                        x.CriterionId,
                        x.Question,
                        x.Body,
                        x.Covered,
                        x.UpdatedAt,
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        Items = notes,
                        UpdatedAt = notes.Count == 0
                            ? (DateTimeOffset?)null
                            : notes.Max(x => x.UpdatedAt),
                    }
                );
            }
        );

        // The whole set each time: small, and an autosave that arrives twice changes nothing.
        api.MapPut(
            "/interviews/{id:guid}/my-notes",
            async (
                Guid id,
                SaveInterviewNotesRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var items = request.Items ?? [];
                if (items.Length > 100)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["items"] = ["Keep it to 100 notes."] }
                    );
                if (items.Any(x => x.Body?.Length > 20_000 || x.Question?.Length > 1000))
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["items"] = ["Each note can be up to 20,000 characters."],
                        }
                    );
                if (!await CanSeeInterviewAsync(db, principal, id, ct))
                    return Results.NotFound();
                var email = principal.Email();
                // One transaction, so a failed save never leaves the notes deleted.
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                await db
                    .InterviewNotes.Where(x => x.InterviewId == id && x.AuthorEmail == email)
                    .ExecuteDeleteAsync(ct);
                var now = DateTimeOffset.UtcNow;
                db.InterviewNotes.AddRange(
                    items
                        .Where(x =>
                            !string.IsNullOrWhiteSpace(x.Body)
                            || x.Covered
                            || !string.IsNullOrWhiteSpace(x.Question)
                        )
                        .Select(
                            (x, index) =>
                                new InterviewNote
                                {
                                    InterviewId = id,
                                    AuthorEmail = email,
                                    CriterionId = x.CriterionId,
                                    Question = Clean(x.Question),
                                    Body = x.Body ?? "",
                                    Covered = x.Covered,
                                    SortOrder = index,
                                    UpdatedAt = now,
                                }
                        )
                );
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return Results.Ok(new { UpdatedAt = now });
            }
        );
    }

    /// <summary>The interview exists and its application is in this person's scope.</summary>
    private static Task<bool> CanSeeInterviewAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid interviewId,
        CancellationToken ct
    )
    {
        var applicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal)
            .Select(x => x.Id);
        return db.Interviews.AnyAsync(
            x => x.Id == interviewId && applicationIds.Contains(x.ApplicationId),
            ct
        );
    }
}
