using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>One competency in a kit. Id is its competency id: send it back to keep the competency, leave it out for a new one.</summary>
public sealed record KitCompetencyRequest(
    Guid? Id,
    string? Name,
    string? Question,
    string? Description,
    int Weight = 3,
    string? FollowUps = null
);

public sealed record SaveInterviewKitRequest(
    string? Name,
    string? Instructions,
    int DurationMinutes,
    KitCompetencyRequest[]? Criteria,
    Guid? PipelineStageId = null
);

public sealed record KitStageRequest(Guid? PipelineStageId);

public sealed record KitOrderRequest(Guid[]? Ids);

/// <summary>
/// Kit versions: a kit keeps its id; when a kit that interviews use is edited, its old content and
/// those interviews (with their scorecards) move to a frozen row (<see cref="InterviewKit.VersionOfId"/>),
/// so nothing already scheduled or scored changes. Competencies keep their competency id across versions.
/// </summary>
public static class InterviewKits
{
    /// <summary>A criterion's competency id. Rows from before versions have none and use their own id.</summary>
    public static Guid CompetencyOf(InterviewCriterion criterion) =>
        criterion.CompetencyId == Guid.Empty ? criterion.Id : criterion.CompetencyId;

    public static Dictionary<string, string[]>? Validate(SaveInterviewKitRequest request)
    {
        var items = request.Criteria ?? [];
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 120)
            errors.Add("Give the kit a name of up to 120 characters.");
        if (request.DurationMinutes is < 15 or > 480)
            errors.Add("Choose a length from 15 to 480 minutes.");
        if (MediaEndpoints.HasImageWithoutAlt(request.Instructions))
            errors.Add(MediaEndpoints.AltRequired);
        if (items.Length is 0 or > 30)
            errors.Add("Add from 1 to 30 competencies.");
        if (
            items.Any(x =>
                string.IsNullOrWhiteSpace(x.Name) || string.IsNullOrWhiteSpace(x.Question)
            )
        )
            errors.Add("Every competency needs a name and a question.");
        if (
            items.Any(x =>
                x.Name?.Trim().Length > 120
                || x.Question?.Trim().Length > 1000
                || x.FollowUps?.Trim().Length > 2000
            )
        )
            errors.Add(
                "A competency name is up to 120 characters, a question up to 1,000 and follow-ups up to 2,000."
            );
        if (items.Any(x => x.Weight is < 1 or > 5))
            errors.Add("Weights go from 1 to 5.");
        var names = items.Select(x => x.Name?.Trim() ?? "").Where(x => x.Length > 0).ToArray();
        if (names.Distinct(StringComparer.OrdinalIgnoreCase).Count() != names.Length)
            errors.Add("Two competencies have the same name.");
        var ids = items.Where(x => x.Id is not null).Select(x => x.Id!.Value).ToArray();
        if (ids.Distinct().Count() != ids.Length)
            errors.Add("A competency appears twice.");
        return errors.Count == 0 ? null : new() { ["interviewKit"] = [.. errors] };
    }

    public static InterviewCriterion NewCriterion(
        Guid kitId,
        KitCompetencyRequest item,
        int index,
        Guid? competencyId = null
    )
    {
        var id = Guid.NewGuid();
        var criterion = new InterviewCriterion
        {
            Id = id,
            CompetencyId = competencyId ?? id,
            InterviewKitId = kitId,
            Name = "",
            Question = "",
        };
        Fill(criterion, item, index);
        return criterion;
    }

    public static void Fill(InterviewCriterion criterion, KitCompetencyRequest item, int index)
    {
        criterion.Name = item.Name!.Trim();
        criterion.Question = item.Question!.Trim();
        criterion.FollowUps = item.FollowUps?.Trim() ?? "";
        criterion.Description = item.Description?.Trim() ?? "";
        criterion.Weight = item.Weight;
        criterion.SortOrder = index;
    }

    /// <summary>Would saving this change what interviewers see? A stage-only save does not make a version.</summary>
    public static bool SameContent(
        InterviewKit kit,
        IReadOnlyList<InterviewCriterion> current,
        SaveInterviewKitRequest request
    )
    {
        var items = request.Criteria ?? [];
        return kit.Name == request.Name!.Trim()
            && kit.Instructions == (request.Instructions?.Trim() ?? "")
            && kit.DurationMinutes == request.DurationMinutes
            && current.Count == items.Length
            && current
                .Zip(items)
                .All(pair =>
                    CompetencyOf(pair.First) == pair.Second.Id
                    && pair.First.Name == pair.Second.Name!.Trim()
                    && pair.First.Question == pair.Second.Question!.Trim()
                    && pair.First.FollowUps == (pair.Second.FollowUps?.Trim() ?? "")
                    && pair.First.Description == (pair.Second.Description?.Trim() ?? "")
                    && pair.First.Weight == pair.Second.Weight
                );
    }
}

public static partial class AtsEndpoints
{
    private static async Task<int> NextKitSortAsync(
        AtsDbContext db,
        Guid requisitionId,
        CancellationToken ct
    ) =>
        (
            await db
                .InterviewKits.Where(x => x.RequisitionId == requisitionId && x.VersionOfId == null)
                .MaxAsync(x => (int?)x.SortOrder, ct)
            ?? -1
        ) + 1;

    private static async Task<bool> StageOnJobAsync(
        AtsDbContext db,
        Guid requisitionId,
        Guid? stageId,
        CancellationToken ct
    ) =>
        stageId is null
        || await db.PipelineStages.AnyAsync(
            x => x.Id == stageId && x.RequisitionId == requisitionId,
            ct
        );

    private static IResult KitProblem(string message) =>
        Results.ValidationProblem(
            new Dictionary<string, string[]> { ["interviewKit"] = [message] }
        );

    private static void MapInterviewKits(RouteGroupBuilder api)
    {
        // The job's kits, as the Kits page lists them: current versions, archived ones last.
        api.MapGet(
            "/requisitions/{id:guid}/interview-kits",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var requisition = await ScopeRequisitions(db.Requisitions.AsNoTracking(), principal)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (requisition is null)
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                var kits = await db
                    .InterviewKits.AsNoTracking()
                    .Where(k => k.RequisitionId == id && k.VersionOfId == null)
                    .OrderBy(k => k.ArchivedAt != null)
                    .ThenBy(k => k.SortOrder)
                    .Select(k => new
                    {
                        k.Id,
                        k.Name,
                        k.DurationMinutes,
                        k.Version,
                        k.PipelineStageId,
                        k.ArchivedAt,
                        k.UpdatedAt,
                        Competencies = k.Criteria.Count,
                        Interviews = db.Interviews.Count(i =>
                            i.InterviewKitId == k.Id || i.InterviewKit!.VersionOfId == k.Id
                        ),
                        Upcoming = db.Interviews.Count(i =>
                            (i.InterviewKitId == k.Id || i.InterviewKit!.VersionOfId == k.Id)
                            && (
                                i.Status == InterviewStatus.Proposed
                                || i.Status == InterviewStatus.Scheduled
                            )
                            && i.StartsAt > now
                        ),
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new { CanManage = CanManage(requisition, principal), Kits = kits }
                );
            }
        );

        // One kit. A frozen version's id shows that version, read only.
        api.MapGet(
            "/requisitions/{id:guid}/interview-kits/{kitId:guid}",
            async (
                Guid id,
                Guid kitId,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var requisition = await ScopeRequisitions(db.Requisitions.AsNoTracking(), principal)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (requisition is null)
                    return Results.NotFound();
                var kit = await db
                    .InterviewKits.AsNoTracking()
                    .Where(k => k.Id == kitId && k.RequisitionId == id)
                    .Select(k => new
                    {
                        k.Id,
                        k.Name,
                        k.Instructions,
                        k.DurationMinutes,
                        k.Version,
                        k.VersionOfId,
                        k.PipelineStageId,
                        k.ArchivedAt,
                        k.UpdatedAt,
                        k.UpdatedBy,
                        Interviews = k.Interviews.Count,
                        Criteria = k
                            .Criteria.OrderBy(c => c.SortOrder)
                            .Select(c => new
                            {
                                Id = c.CompetencyId == Guid.Empty ? c.Id : c.CompetencyId,
                                c.Name,
                                c.Question,
                                c.FollowUps,
                                c.Description,
                                c.Weight,
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                if (kit is null)
                    return Results.NotFound();
                var now = DateTimeOffset.UtcNow;
                // Earlier versions that interviews still use, newest first.
                var versions = await db
                    .InterviewKits.AsNoTracking()
                    .Where(k => k.VersionOfId == (kit.VersionOfId ?? kit.Id))
                    .OrderByDescending(k => k.Version)
                    .Select(k => new
                    {
                        k.Id,
                        k.Version,
                        k.UpdatedAt,
                        Interviews = k.Interviews.Count,
                        Upcoming = k.Interviews.Count(i =>
                            (
                                i.Status == InterviewStatus.Proposed
                                || i.Status == InterviewStatus.Scheduled
                            )
                            && i.StartsAt > now
                        ),
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        Kit = kit,
                        Versions = versions,
                        CanManage = kit.VersionOfId is null && CanManage(requisition, principal),
                    }
                );
            }
        );

        api.MapPost(
                "/requisitions/{id:guid}/interview-kits",
                async (
                    Guid id,
                    SaveInterviewKitRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (InterviewKits.Validate(request) is { } errors)
                        return Results.ValidationProblem(errors);
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    if (!await StageOnJobAsync(db, id, request.PipelineStageId, ct))
                        return KitProblem("Choose a stage of this job.");
                    var kit = new InterviewKit
                    {
                        RequisitionId = id,
                        Name = request.Name!.Trim(),
                        Instructions = request.Instructions?.Trim() ?? "",
                        DurationMinutes = request.DurationMinutes,
                        PipelineStageId = request.PipelineStageId,
                        SortOrder = await NextKitSortAsync(db, id, ct),
                        UpdatedBy = principal.Email(),
                    };
                    kit.Criteria.AddRange(
                        request.Criteria!.Select(
                            (item, index) => InterviewKits.NewCriterion(kit.Id, item, index)
                        )
                    );
                    db.InterviewKits.Add(kit);
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitCreated",
                        new
                        {
                            kit.Id,
                            kit.Name,
                            Criteria = kit.Criteria.Count,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/requisitions/{id}/interview-kits/{kit.Id}",
                        new { kit.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Saves a new version. Interviews already using the kit keep the version they had.
        api.MapPut(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}",
                async (
                    Guid id,
                    Guid kitId,
                    SaveInterviewKitRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (InterviewKits.Validate(request) is { } errors)
                        return Results.ValidationProblem(errors);
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var kit = await db.InterviewKits.SingleOrDefaultAsync(
                        x => x.Id == kitId && x.RequisitionId == id && x.VersionOfId == null,
                        ct
                    );
                    if (kit is null)
                        return Results.NotFound();
                    if (!await StageOnJobAsync(db, id, request.PipelineStageId, ct))
                        return KitProblem("Choose a stage of this job.");
                    var current = await db
                        .InterviewCriteria.AsNoTracking()
                        .Where(x => x.InterviewKitId == kit.Id)
                        .OrderBy(x => x.SortOrder)
                        .ToListAsync(ct);
                    var known = current.Select(InterviewKits.CompetencyOf).ToHashSet();
                    var items = request.Criteria!;
                    if (items.Any(x => x.Id is { } competency && !known.Contains(competency)))
                        return KitProblem(
                            "A competency does not belong to this kit. Reload the page and try again."
                        );

                    kit.PipelineStageId = request.PipelineStageId;
                    if (InterviewKits.SameContent(kit, current, request))
                    {
                        await db.SaveChangesAsync(ct);
                        return Results.NoContent();
                    }

                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    var frozen = await db.Interviews.AnyAsync(x => x.InterviewKitId == kit.Id, ct);
                    if (frozen)
                    {
                        // Interviews use this version: keep it, with them and their scorecards, as a frozen row.
                        var version = new InterviewKit
                        {
                            RequisitionId = id,
                            VersionOfId = kit.Id,
                            Name = kit.Name,
                            Instructions = kit.Instructions,
                            DurationMinutes = kit.DurationMinutes,
                            Version = kit.Version,
                            SortOrder = kit.SortOrder,
                            PipelineStageId = kit.PipelineStageId,
                            CreatedAt = kit.CreatedAt,
                            UpdatedAt = kit.UpdatedAt,
                            UpdatedBy = kit.UpdatedBy,
                        };
                        db.InterviewKits.Add(version);
                        await db.SaveChangesAsync(ct);
                        await db
                            .InterviewCriteria.Where(x =>
                                x.InterviewKitId == kit.Id && x.CompetencyId == Guid.Empty
                            )
                            .ExecuteUpdateAsync(
                                set => set.SetProperty(x => x.CompetencyId, x => x.Id),
                                ct
                            );
                        await db
                            .InterviewCriteria.Where(x => x.InterviewKitId == kit.Id)
                            .ExecuteUpdateAsync(
                                set => set.SetProperty(x => x.InterviewKitId, version.Id),
                                ct
                            );
                        await db
                            .Interviews.Where(x => x.InterviewKitId == kit.Id)
                            .ExecuteUpdateAsync(
                                set => set.SetProperty(x => x.InterviewKitId, version.Id),
                                ct
                            );
                        db.InterviewCriteria.AddRange(
                            items.Select(
                                (item, index) =>
                                    InterviewKits.NewCriterion(kit.Id, item, index, item.Id)
                            )
                        );
                    }
                    else
                    {
                        // Nobody uses this version yet, so change it in place.
                        var rows = await db
                            .InterviewCriteria.Where(x => x.InterviewKitId == kit.Id)
                            .ToListAsync(ct);
                        var kept = items
                            .Where(x => x.Id is not null)
                            .Select(x => x.Id!.Value)
                            .ToHashSet();
                        db.InterviewCriteria.RemoveRange(
                            rows.Where(x => !kept.Contains(InterviewKits.CompetencyOf(x)))
                        );
                        // (KitId, SortOrder) is unique, so park the survivors out of the way first.
                        foreach (var row in rows)
                        {
                            row.CompetencyId = InterviewKits.CompetencyOf(row);
                            row.SortOrder += 1000;
                        }
                        await db.SaveChangesAsync(ct);
                        for (var index = 0; index < items.Length; index++)
                        {
                            var row = rows.FirstOrDefault(x => x.CompetencyId == items[index].Id);
                            if (row is null)
                                db.InterviewCriteria.Add(
                                    InterviewKits.NewCriterion(kit.Id, items[index], index)
                                );
                            else
                                InterviewKits.Fill(row, items[index], index);
                        }
                    }

                    kit.Name = request.Name!.Trim();
                    kit.Instructions = request.Instructions?.Trim() ?? "";
                    kit.DurationMinutes = request.DurationMinutes;
                    kit.Version += 1;
                    kit.UpdatedAt = DateTimeOffset.UtcNow;
                    kit.UpdatedBy = principal.Email();
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitUpdated",
                        new
                        {
                            kit.Id,
                            kit.Name,
                            kit.Version,
                            Criteria = items.Length,
                            KeptEarlierVersion = frozen,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Which stage a kit is for. Not a new version: interviewers see the same kit.
        api.MapPut(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}/stage",
                async (
                    Guid id,
                    Guid kitId,
                    KitStageRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var kit = await ManagedKitAsync(db, principal, id, kitId, ct);
                    if (kit is null)
                        return Results.NotFound();
                    if (!await StageOnJobAsync(db, id, request.PipelineStageId, ct))
                        return KitProblem("Choose a stage of this job.");
                    kit.PipelineStageId = request.PipelineStageId;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The order of the job's kits, usually the order of its interview rounds.
        api.MapPut(
                "/requisitions/{id:guid}/interview-kits/order",
                async (
                    Guid id,
                    KitOrderRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db.Requisitions.SingleOrDefaultAsync(
                        x => x.Id == id,
                        ct
                    );
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var kits = await db
                        .InterviewKits.Where(x => x.RequisitionId == id && x.VersionOfId == null)
                        .OrderBy(x => x.SortOrder)
                        .ToListAsync(ct);
                    var active = kits.Where(x => x.ArchivedAt == null).ToList();
                    var ids = request.Ids ?? [];
                    if (
                        ids.Length != active.Count
                        || !ids.ToHashSet().SetEquals(active.Select(x => x.Id))
                    )
                        return KitProblem(
                            "The list of kits changed. Reload the page and try again."
                        );
                    foreach (var kit in kits)
                        kit.SortOrder += 1000;
                    await db.SaveChangesAsync(ct);
                    var ordered = ids.Select(x => active.Single(k => k.Id == x))
                        .Concat(kits.Where(x => x.ArchivedAt != null));
                    var index = 0;
                    foreach (var kit in ordered)
                        kit.SortOrder = index++;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}/duplicate",
                async (
                    Guid id,
                    Guid kitId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var source = await ManagedKitAsync(db, principal, id, kitId, ct);
                    if (source is null)
                        return Results.NotFound();
                    var criteria = await db
                        .InterviewCriteria.AsNoTracking()
                        .Where(x => x.InterviewKitId == source.Id)
                        .OrderBy(x => x.SortOrder)
                        .ToListAsync(ct);
                    var name = $"{source.Name} (copy)";
                    var copy = new InterviewKit
                    {
                        RequisitionId = id,
                        Name = name.Length > 120 ? name[..120] : name,
                        Instructions = source.Instructions,
                        DurationMinutes = source.DurationMinutes,
                        PipelineStageId = source.PipelineStageId,
                        SortOrder = await NextKitSortAsync(db, id, ct),
                        UpdatedBy = principal.Email(),
                    };
                    copy.Criteria.AddRange(
                        criteria.Select(
                            (c, index) =>
                                InterviewKits.NewCriterion(
                                    copy.Id,
                                    new KitCompetencyRequest(
                                        null,
                                        c.Name,
                                        c.Question,
                                        c.Description,
                                        c.Weight,
                                        c.FollowUps
                                    ),
                                    index
                                )
                        )
                    );
                    db.InterviewKits.Add(copy);
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitCreated",
                        new
                        {
                            copy.Id,
                            copy.Name,
                            CopiedFrom = source.Id,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/requisitions/{id}/interview-kits/{copy.Id}",
                        new { copy.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Archive hides a kit from scheduling. Interviews that used it keep it.
        api.MapPost(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}/archive",
                async (
                    Guid id,
                    Guid kitId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var kit = await ManagedKitAsync(db, principal, id, kitId, ct);
                    if (kit is null)
                        return Results.NotFound();
                    var now = DateTimeOffset.UtcNow;
                    var waiting = await db.Interviews.CountAsync(
                        i =>
                            (i.InterviewKitId == kit.Id || i.InterviewKit!.VersionOfId == kit.Id)
                            && (
                                i.Status == InterviewStatus.Proposed
                                || i.Status == InterviewStatus.Scheduled
                            )
                            && i.StartsAt > now,
                        ct
                    );
                    if (waiting > 0)
                        return Results.Conflict(
                            new
                            {
                                message = waiting == 1
                                    ? "An upcoming interview uses this kit. Archive it after that interview, or give the interview another kit."
                                    : $"{waiting} upcoming interviews use this kit. Archive it after those interviews, or give them another kit.",
                            }
                        );
                    kit.ArchivedAt = now;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitArchived",
                        new { kit.Id, kit.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/requisitions/{id:guid}/interview-kits/{kitId:guid}/restore",
                async (
                    Guid id,
                    Guid kitId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var kit = await ManagedKitAsync(db, principal, id, kitId, ct);
                    if (kit is null)
                        return Results.NotFound();
                    kit.ArchivedAt = null;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "InterviewKitRestored",
                        new { kit.Id, kit.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    /// <summary>A job's current kit, when this person can change the job.</summary>
    private static async Task<InterviewKit?> ManagedKitAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid requisitionId,
        Guid kitId,
        CancellationToken ct
    )
    {
        var requisition = await db
            .Requisitions.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == requisitionId, ct);
        if (requisition is null || !CanManage(requisition, principal))
            return null;
        return await db.InterviewKits.SingleOrDefaultAsync(
            x => x.Id == kitId && x.RequisitionId == requisitionId && x.VersionOfId == null,
            ct
        );
    }
}
