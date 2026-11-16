using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Interviews
{
    /// <summary>One pool member as the ranking sees them.</summary>
    /// <param name="Recent">Interviews of this round they ran or have booked, over the last 30 days.</param>
    /// <param name="LastAt">When they last ran (or will run) this round; null if never.</param>
    /// <param name="ThisWeek">All their interviews this week.</param>
    /// <param name="OpenTimes">Starts in the scheduler's range that fit their hours and calendar.</param>
    public sealed record PoolMember(
        string Email,
        int Recent,
        DateTimeOffset? LastAt,
        int ThisWeek,
        int OpenTimes
    );

    /// <summary>
    /// Who from a round's pool to suggest: people with open times first, then whoever has run this
    /// round least lately (so turns go round fairly), then whoever waited longest since their last
    /// turn, then the lightest week.
    /// </summary>
    public static class InterviewerPools
    {
        public static IReadOnlyList<PoolMember> Rank(IEnumerable<PoolMember> members) =>
            members
                .OrderBy(x => x.OpenTimes > 0 ? 0 : 1)
                .ThenBy(x => x.Recent)
                .ThenBy(x => x.LastAt ?? DateTimeOffset.MinValue)
                .ThenBy(x => x.ThisWeek)
                .ThenBy(x => x.Email, StringComparer.Ordinal)
                .ToList();
    }
}

namespace MyThorneAI.Ats.Api.Api
{
    public sealed record SaveInterviewerPoolRequest(string[]? Emails, int Pick);

    public sealed record PoolSuggestionRequest(
        DateTimeOffset From,
        DateTimeOffset To,
        int? DurationMinutes
    );

    public static partial class AtsEndpoints
    {
        private const int MaxPoolSize = 30;

        private static async Task<InterviewKit?> PoolKitAsync(
            AtsDbContext db,
            ClaimsPrincipal principal,
            Guid kitId,
            CancellationToken ct
        )
        {
            var kit = await db
                .InterviewKits.Include(x => x.Requisition)
                .SingleOrDefaultAsync(x => x.Id == kitId && x.VersionOfId == null, ct);
            var jobs = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
            return
                kit?.Requisition is not null
                && await jobs.AnyAsync(x => x.Id == kit.RequisitionId, ct)
                ? kit
                : null;
        }

        private static void MapInterviewerPools(RouteGroupBuilder api)
        {
            api.MapGet(
                    "/interview-kits/{kitId:guid}/pool",
                    async (
                        Guid kitId,
                        ClaimsPrincipal principal,
                        AtsDbContext db,
                        CancellationToken ct
                    ) =>
                    {
                        var kit = await PoolKitAsync(db, principal, kitId, ct);
                        if (kit is null)
                            return Results.NotFound();
                        return Results.Ok(
                            new
                            {
                                Emails = kit.PoolEmails,
                                Pick = kit.PoolPick,
                                CanManage = CanManage(kit.Requisition!, principal),
                            }
                        );
                    }
                )
                .RequireAuthorization(AtsPolicies.ManageHiring);

            api.MapPut(
                    "/interview-kits/{kitId:guid}/pool",
                    async (
                        Guid kitId,
                        SaveInterviewerPoolRequest request,
                        ClaimsPrincipal principal,
                        AtsDbContext db,
                        CancellationToken ct
                    ) =>
                    {
                        var kit = await PoolKitAsync(db, principal, kitId, ct);
                        if (kit is null || !CanManage(kit.Requisition!, principal))
                            return Results.NotFound();
                        var emails = NormalizeEmails(request.Emails);
                        var errors = new Dictionary<string, string[]>();
                        if (emails.Length > MaxPoolSize)
                            errors["emails"] = [$"A pool has up to {MaxPoolSize} people."];
                        else if (emails.Any(x => !x.Contains('@')))
                            errors["emails"] = ["Pick people from your team."];
                        if (emails.Length > 0 && (request.Pick < 1 || request.Pick > emails.Length))
                            errors["pick"] =
                            [
                                $"Pick between 1 and {emails.Length} {(emails.Length == 1 ? "person" : "people")}.",
                            ];
                        if (errors.Count > 0)
                            return Results.ValidationProblem(errors);
                        var known = await db
                            .Users.AsNoTracking()
                            .Where(x => emails.Contains(x.Email) && x.IsActive)
                            .Select(x => x.Email)
                            .ToListAsync(ct);
                        if (emails.Except(known).ToArray() is { Length: > 0 } unknown)
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["emails"] =
                                    [
                                        $"These people are not active on your team: {string.Join(", ", unknown)}.",
                                    ],
                                }
                            );
                        kit.PoolEmails = emails;
                        kit.PoolPick = emails.Length == 0 ? 1 : request.Pick;
                        Audit.Add(
                            db,
                            principal,
                            "InterviewKit",
                            kit.Id,
                            "InterviewerPoolSaved",
                            new { Emails = emails, Pick = kit.PoolPick }
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.Ok(new { Emails = kit.PoolEmails, Pick = kit.PoolPick });
                    }
                )
                .RequireAuthorization(AtsPolicies.ManageHiring);

            // Who from the pool to put on this round, for the scheduler's range.
            api.MapPost(
                    "/interview-kits/{kitId:guid}/pool/suggest",
                    async (
                        Guid kitId,
                        PoolSuggestionRequest request,
                        ClaimsPrincipal principal,
                        AtsDbContext db,
                        AvailabilityService availability,
                        CancellationToken ct
                    ) =>
                    {
                        if (
                            request.To <= request.From
                            || request.To - request.From > TimeSpan.FromDays(31)
                        )
                            return Results.ValidationProblem(
                                new Dictionary<string, string[]>
                                {
                                    ["range"] =
                                    [
                                        "Choose an end after the start, at most 31 days later.",
                                    ],
                                }
                            );
                        var kit = await PoolKitAsync(db, principal, kitId, ct);
                        if (kit is null)
                            return Results.NotFound();
                        if (kit.PoolEmails.Length == 0)
                            return Results.Ok(
                                new
                                {
                                    kit.PoolPick,
                                    Members = Array.Empty<object>(),
                                    Suggested = Array.Empty<string>(),
                                }
                            );
                        var now = DateTimeOffset.UtcNow;
                        var since = now.AddDays(-30);
                        var pool = kit.PoolEmails;
                        var turns = await db
                            .Interviews.AsNoTracking()
                            .Where(x =>
                                (
                                    x.InterviewKitId == kit.Id
                                    || x.InterviewKit!.VersionOfId == kit.Id
                                )
                                && x.Status != InterviewStatus.Cancelled
                                && x.StartsAt >= since
                            )
                            .Select(x => new { x.StartsAt, x.InterviewerEmails })
                            .ToListAsync(ct);
                        var known = await availability.LoadPeopleAsync(
                            pool,
                            request.From,
                            request.To,
                            null,
                            ct
                        );
                        var duration = TimeSpan.FromMinutes(
                            Math.Clamp(request.DurationMinutes ?? kit.DurationMinutes, 15, 480)
                        );
                        var members = known
                            .People.Select(person =>
                            {
                                var mine = turns
                                    .Where(t => t.InterviewerEmails.Contains(person.Email))
                                    .ToList();
                                var local = TimeZoneInfo.ConvertTime(now, person.Zone).Date;
                                var week = local.AddDays(-(((int)local.DayOfWeek + 6) % 7));
                                return new PoolMember(
                                    person.Email,
                                    mine.Count,
                                    mine.Count == 0 ? null : mine.Max(t => t.StartsAt),
                                    person.Booked.Count(at =>
                                    {
                                        var day = TimeZoneInfo.ConvertTime(at, person.Zone).Date;
                                        return day >= week && day < week.AddDays(7);
                                    }),
                                    AvailabilityService
                                        .FindSlots(
                                            [person],
                                            request.From,
                                            request.To,
                                            duration,
                                            TimeSpan.FromMinutes(15),
                                            now + TimeSpan.FromMinutes(30),
                                            3000
                                        )
                                        .Slots.Count
                                );
                            })
                            .ToList();
                        var ranked = InterviewerPools.Rank(members);
                        var names = await db
                            .Users.AsNoTracking()
                            .Where(x => pool.Contains(x.Email))
                            .ToDictionaryAsync(x => x.Email, x => x.DisplayName, ct);
                        return Results.Ok(
                            new
                            {
                                kit.PoolPick,
                                Members = ranked.Select(x => new
                                {
                                    x.Email,
                                    Name = names.GetValueOrDefault(x.Email, x.Email),
                                    x.Recent,
                                    x.LastAt,
                                    x.ThisWeek,
                                    x.OpenTimes,
                                    CalendarChecked = known.CheckedCalendars.Contains(x.Email),
                                }),
                                Suggested = ranked
                                    .Where(x => x.OpenTimes > 0)
                                    .Take(kit.PoolPick)
                                    .Select(x => x.Email),
                            }
                        );
                    }
                )
                .RequireAuthorization(AtsPolicies.ManageHiring);
        }
    }
}
