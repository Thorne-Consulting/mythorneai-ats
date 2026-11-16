using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record MarkNotificationsRequest(Guid[]? Ids, bool All = false, bool Read = true);

public sealed record NotificationPreferenceRequest(
    string Kind,
    bool InApp,
    bool Email,
    bool Digest
);

/// <summary>The bell, the /notifications feed and each person's notification settings.</summary>
public static class NotificationEndpoints
{
    public static RouteGroupBuilder MapNotifications(this RouteGroupBuilder api)
    {
        api.MapGet(
            "/notifications",
            async (
                string? status,
                DateTimeOffset? before,
                int? limit,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var take = Math.Clamp(limit ?? 30, 1, 100);
                var page = await Feed(
                        db,
                        principal.Email(),
                        await HiddenKindsAsync(db, principal.Email(), ct)
                    )
                    .Where(x => status != "unread" || x.ReadAt == null)
                    .Where(x => before == null || x.CreatedAt < before)
                    .OrderByDescending(x => x.CreatedAt)
                    .Take(take + 1)
                    .Select(x => new
                    {
                        x.Id,
                        x.Kind,
                        x.Title,
                        x.Body,
                        x.Href,
                        x.CreatedAt,
                        x.ReadAt,
                        ActorName = db
                            .Users.Where(u => u.Email == x.ActorEmail)
                            .Select(u => u.DisplayName)
                            .FirstOrDefault(),
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        Items = page.Take(take),
                        NextCursor = page.Count > take
                            ? page[take - 1].CreatedAt
                            : (DateTimeOffset?)null,
                    }
                );
            }
        );

        api.MapGet(
            "/notifications/count",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                return Results.Ok(
                    new
                    {
                        Unread = await Feed(db, me, await HiddenKindsAsync(db, me, ct))
                            .CountAsync(x => x.ReadAt == null, ct),
                    }
                );
            }
        );

        api.MapPost(
            "/notifications/read",
            async (
                MarkNotificationsRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                IHubContext<InboxHub> hub,
                CancellationToken ct
            ) =>
            {
                var me = principal.Email();
                var ids = request.Ids ?? [];
                if (!request.All && ids.Length == 0)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["ids"] = ["Choose notifications to mark."],
                        }
                    );
                var rows = db.Notifications.Where(x => x.UserEmail == me);
                if (!request.All)
                    rows = rows.Where(x => ids.Contains(x.Id));
                var changed = request.Read
                    ? await rows.Where(x => x.ReadAt == null)
                        .ExecuteUpdateAsync(
                            u => u.SetProperty(x => x.ReadAt, DateTimeOffset.UtcNow),
                            ct
                        )
                    : await rows.Where(x => x.ReadAt != null)
                        .ExecuteUpdateAsync(
                            u => u.SetProperty(x => x.ReadAt, (DateTimeOffset?)null),
                            ct
                        );
                // Other open tabs update their bell.
                if (changed > 0)
                    await hub
                        .Clients.Group(InboxHub.UserGroup(me))
                        .SendAsync("notificationsChanged", ct);
                return Results.Ok(new { Changed = changed });
            }
        );

        api.MapGet(
            "/me/notification-preferences",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var stored = await db
                    .NotificationPreferences.AsNoTracking()
                    .Where(x => x.UserEmail == me)
                    .ToDictionaryAsync(x => x.Kind, ct);
                return Results.Ok(
                    NotificationKinds.All.Select(kind =>
                    {
                        var saved = stored.GetValueOrDefault(kind.Key);
                        return new
                        {
                            kind.Key,
                            kind.Label,
                            kind.Description,
                            InApp = saved?.InApp ?? kind.InApp,
                            Email = saved?.Email ?? kind.Email,
                            Digest = saved?.Digest ?? kind.Digest,
                            Changed = saved is not null,
                        };
                    })
                );
            }
        );

        api.MapPut(
            "/me/notification-preferences",
            async (
                NotificationPreferenceRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var kind = NotificationKinds.Find(request.Kind);
                if (kind is null)
                    return Results.NotFound();
                var me = principal.Email();
                var row = await db.NotificationPreferences.SingleOrDefaultAsync(
                    x => x.UserEmail == me && x.Kind == kind.Key,
                    ct
                );
                if (row is null)
                    db.NotificationPreferences.Add(
                        row = new NotificationPreference { UserEmail = me, Kind = kind.Key }
                    );
                row.InApp = request.InApp;
                row.Email = request.Email;
                row.Digest = request.Digest;
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        return api;
    }

    private static IQueryable<Notification> Feed(AtsDbContext db, string me, string[] hidden) =>
        db.Notifications.AsNoTracking().Where(x => x.UserEmail == me && !hidden.Contains(x.Kind));

    // Kinds this person switched off in the app (their rows may still exist for the daily summary).
    private static async Task<string[]> HiddenKindsAsync(
        AtsDbContext db,
        string me,
        CancellationToken ct
    )
    {
        var stored = await db
            .NotificationPreferences.AsNoTracking()
            .Where(x => x.UserEmail == me)
            .ToDictionaryAsync(x => x.Kind, x => x.InApp, ct);
        return NotificationKinds
            .All.Where(kind => !(stored.TryGetValue(kind.Key, out var inApp) ? inApp : kind.InApp))
            .Select(kind => kind.Key)
            .ToArray();
    }
}
