using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>Kind: "Rejected" (we decided) or "Withdrawn" (they decided). NeedsNote: closing with it asks why.</summary>
public sealed record RejectionReasonRequest(string? Label, string? Kind, bool? NeedsNote = null);

public sealed record RejectionReasonOrderRequest(Guid[]? Ids);

/// <summary>The reasons an application closes, managed in Settings and read by every reject dialog.</summary>
public static class RejectionReasons
{
    /// <summary>The reasons the app shipped with. Applications already closed with these keep working.</summary>
    public static readonly (string Label, ApplicationStatus Kind)[] Standard =
    [
        ("Does not meet minimum requirements", ApplicationStatus.Rejected),
        ("Skills mismatch", ApplicationStatus.Rejected),
        ("Experience mismatch", ApplicationStatus.Rejected),
        ("Compensation mismatch", ApplicationStatus.Rejected),
        ("Location or availability", ApplicationStatus.Rejected),
        ("Position closed", ApplicationStatus.Rejected),
        ("Other", ApplicationStatus.Rejected),
        ("Withdrew", ApplicationStatus.Withdrawn),
        ("Accepted another offer", ApplicationStatus.Withdrawn),
        ("No longer interested", ApplicationStatus.Withdrawn),
    ];

    /// <summary>Seeds the standard list once. Reasons are archived, never deleted, so the list never empties again.</summary>
    public static async Task EnsureAsync(AtsDbContext db, CancellationToken ct = default)
    {
        if (await db.RejectionReasons.AnyAsync(ct))
            return;
        db.RejectionReasons.AddRange(
            Standard.Select(
                (x, i) =>
                    new RejectionReason
                    {
                        Label = x.Label,
                        Kind = x.Kind,
                        NeedsNote = x.Label == "Other",
                        SortOrder = i,
                    }
            )
        );
        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Refuses a close without the note its reason asks for. Returns the problem, or null when the
    /// close may go ahead.
    /// </summary>
    public static async Task<Dictionary<string, string[]>?> NoteProblemAsync(
        AtsDbContext db,
        ApplicationStatus status,
        string? reason,
        string? note,
        CancellationToken ct
    )
    {
        if (status is not (ApplicationStatus.Rejected or ApplicationStatus.Withdrawn))
            return null;
        if (note?.Trim().Length > 2000)
            return new() { ["dispositionNote"] = ["Keep the note under 2,000 characters."] };
        var label = reason?.Trim();
        return
            string.IsNullOrWhiteSpace(note)
            && label is not null
            && await db.RejectionReasons.AnyAsync(x => x.Label == label && x.NeedsNote, ct)
            ? new() { ["dispositionNote"] = [$"Add a note that says why ({label})."] }
            : null;
    }
}

public static partial class AtsEndpoints
{
    private static void MapRejectionReasons(RouteGroupBuilder api)
    {
        // Everyone who can reject reads them; ?all=true adds archived ones for Settings.
        api.MapGet(
                "/rejection-reasons",
                async (bool? all, AtsDbContext db, CancellationToken ct) =>
                {
                    var reasons = await db
                        .RejectionReasons.AsNoTracking()
                        .Where(x => all == true || x.ArchivedAt == null)
                        .OrderBy(x => x.SortOrder)
                        .ThenBy(x => x.Label)
                        .ToListAsync(ct);
                    var labels = reasons.Select(x => x.Label).ToArray();
                    var used = await db
                        .Applications.Where(x =>
                            x.DispositionReason != null && labels.Contains(x.DispositionReason)
                        )
                        .GroupBy(x => x.DispositionReason!)
                        .Select(g => new { g.Key, Count = g.Count() })
                        .ToDictionaryAsync(x => x.Key, x => x.Count, ct);
                    return Results.Ok(
                        reasons.Select(x => new
                        {
                            x.Id,
                            x.Label,
                            Kind = x.Kind.ToString(),
                            x.NeedsNote,
                            x.SortOrder,
                            Archived = x.ArchivedAt != null,
                            Used = used.GetValueOrDefault(x.Label),
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/rejection-reasons",
                async (
                    RejectionReasonRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var (label, kind, errors) = await ValidateReasonAsync(db, request, null, ct);
                    if (errors is not null)
                        return Results.ValidationProblem(errors);
                    var reason = new RejectionReason
                    {
                        Label = label!,
                        Kind = kind ?? ApplicationStatus.Rejected,
                        NeedsNote = request.NeedsNote ?? false,
                        SortOrder =
                            (await db.RejectionReasons.MaxAsync(x => (int?)x.SortOrder, ct) ?? -1)
                            + 1,
                    };
                    db.RejectionReasons.Add(reason);
                    Audit.Add(
                        db,
                        principal,
                        "RejectionReason",
                        reason.Id,
                        "Created",
                        new { reason.Label }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/rejection-reasons/{reason.Id}",
                        new { reason.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        // Renaming also renames it on every application closed with it, so reports keep one group.
        api.MapPut(
                "/rejection-reasons/{id:guid}",
                async (
                    Guid id,
                    RejectionReasonRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var reason = await db.RejectionReasons.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (reason is null)
                        return Results.NotFound();
                    var (label, kind, errors) = await ValidateReasonAsync(db, request, id, ct);
                    if (errors is not null)
                        return Results.ValidationProblem(errors);
                    var old = reason.Label;
                    reason.Label = label!;
                    reason.Kind = kind ?? reason.Kind;
                    reason.NeedsNote = request.NeedsNote ?? reason.NeedsNote;
                    if (old != reason.Label)
                        await db
                            .Applications.Where(x => x.DispositionReason == old)
                            .ExecuteUpdateAsync(
                                s => s.SetProperty(x => x.DispositionReason, reason.Label),
                                ct
                            );
                    Audit.Add(
                        db,
                        principal,
                        "RejectionReason",
                        id,
                        "Renamed",
                        new { From = old, To = reason.Label }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/rejection-reasons/{id:guid}/archive",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    SetArchivedAsync(id, true, principal, db, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPost(
                "/rejection-reasons/{id:guid}/restore",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    SetArchivedAsync(id, false, principal, db, ct)
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapPut(
                "/rejection-reasons/order",
                async (
                    RejectionReasonOrderRequest request,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var ids = (request.Ids ?? []).Distinct().ToArray();
                    var reasons = await db.RejectionReasons.ToListAsync(ct);
                    if (ids.Length != reasons.Count || reasons.Any(x => !ids.Contains(x.Id)))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["ids"] = ["Send every reason once, in the new order."],
                            }
                        );
                    foreach (var reason in reasons)
                        reason.SortOrder = Array.IndexOf(ids, reason.Id);
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);
    }

    private static async Task<IResult> SetArchivedAsync(
        Guid id,
        bool archived,
        ClaimsPrincipal principal,
        AtsDbContext db,
        CancellationToken ct
    )
    {
        var reason = await db.RejectionReasons.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (reason is null)
            return Results.NotFound();
        if (
            archived
            && await db.RejectionReasons.CountAsync(
                x => x.ArchivedAt == null && x.Kind == reason.Kind && x.Id != id,
                ct
            ) == 0
        )
            return Results.Conflict(
                new
                {
                    message = "Keep at least one reason in each group, so people can always pick one.",
                }
            );
        reason.ArchivedAt = archived ? DateTimeOffset.UtcNow : null;
        Audit.Add(
            db,
            principal,
            "RejectionReason",
            id,
            archived ? "Archived" : "Restored",
            new { reason.Label }
        );
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<(
        string? Label,
        ApplicationStatus? Kind,
        Dictionary<string, string[]>? Errors
    )> ValidateReasonAsync(
        AtsDbContext db,
        RejectionReasonRequest request,
        Guid? id,
        CancellationToken ct
    )
    {
        var label = request.Label?.Trim();
        if (string.IsNullOrEmpty(label))
            return (null, null, new() { ["label"] = ["Write the reason."] });
        if (label.Length > 120)
            return (null, null, new() { ["label"] = ["Keep the reason under 120 characters."] });
        ApplicationStatus? kind = request.Kind switch
        {
            null => null,
            nameof(ApplicationStatus.Rejected) => ApplicationStatus.Rejected,
            nameof(ApplicationStatus.Withdrawn) => ApplicationStatus.Withdrawn,
            _ => (ApplicationStatus)(-1),
        };
        if (kind == (ApplicationStatus)(-1))
            return (null, null, new() { ["kind"] = ["Choose who decided."] });
        var lower = label.ToLowerInvariant();
        if (await db.RejectionReasons.AnyAsync(x => x.Id != id && x.Label.ToLower() == lower, ct))
            return (
                null,
                null,
                new()
                {
                    ["label"] =
                    [
                        "That reason already exists. Restore it from the archived list if you need it.",
                    ],
                }
            );
        return (label, kind, null);
    }
}
