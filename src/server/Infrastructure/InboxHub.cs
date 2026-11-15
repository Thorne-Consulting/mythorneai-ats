using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// Live updates for message threads at /api/hubs/inbox. Staff sign in with their cookie; the
/// candidate portal passes its session token as the access token. Pushes carry ids only, and
/// clients refetch through the normal (permission-checked) endpoints, so nothing leaks.
/// </summary>
public sealed class InboxHub(AtsDbContext db) : Hub
{
    public const string Path = "/api/hubs/inbox";
    public const string Staff = "staff";

    public static string ThreadGroup(Guid applicationId) => $"application:{applicationId}";

    public static string CandidateGroup(Guid candidateId) => $"candidate:{candidateId}";

    /// <summary>One team member's tabs, for their notification count.</summary>
    public static string UserGroup(string email) => $"user:{email.ToLowerInvariant()}";

    private const string CandidateKey = "candidateId";

    public override async Task OnConnectedAsync()
    {
        var user = Context.User;
        if (
            user?.Identity?.IsAuthenticated == true
            && user.FindFirstValue(ClaimTypes.Email) is { } email
        )
        {
            // Everyone on the team gets their own notification pushes; people with an inbox get threads too.
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(email));
            if (IsHiringStaff(user))
                await Groups.AddToGroupAsync(Context.ConnectionId, Staff);
            return;
        }
        var http = Context.GetHttpContext();
        var token = http?.Request.Query["access_token"].ToString();
        if (string.IsNullOrEmpty(token))
            token = http
                ?.Request.Headers.Authorization.ToString()
                .Replace("Bearer ", "", StringComparison.OrdinalIgnoreCase);
        // The candidate portal signs in with an HttpOnly cookie, so scripts have no token to pass.
        if (string.IsNullOrEmpty(token))
            token = http?.Request.Cookies[PublicEndpoints.SessionCookie];
        var candidateId = await PublicEndpoints.CandidateIdFromTokenAsync(
            db,
            token,
            Context.ConnectionAborted
        );
        if (candidateId is null)
        {
            Context.Abort();
            return;
        }
        Context.Items[CandidateKey] = candidateId.Value;
        await Groups.AddToGroupAsync(Context.ConnectionId, CandidateGroup(candidateId.Value));
    }

    /// <summary>Join a thread to see who is typing in it. Checked like the thread endpoints.</summary>
    public async Task Watch(Guid applicationId)
    {
        if (await CanUseAsync(applicationId) is not null)
            await Groups.AddToGroupAsync(Context.ConnectionId, ThreadGroup(applicationId));
    }

    public Task Unwatch(Guid applicationId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, ThreadGroup(applicationId));

    /// <summary>Clients call this at most every few seconds while someone types.</summary>
    public async Task Typing(Guid applicationId)
    {
        var name = await CanUseAsync(applicationId);
        if (name is null)
            return;
        await Clients
            .OthersInGroup(ThreadGroup(applicationId))
            .SendAsync(
                "typing",
                new
                {
                    applicationId,
                    name,
                    fromCandidate = Context.Items.ContainsKey(CandidateKey),
                }
            );
    }

    // The display name to show for this connection in the thread, or null when it has no access.
    private async Task<string?> CanUseAsync(Guid applicationId)
    {
        var ct = Context.ConnectionAborted;
        if (Context.Items.TryGetValue(CandidateKey, out var value) && value is Guid candidateId)
            return await db
                .Applications.AsNoTracking()
                .Where(x => x.Id == applicationId && x.CandidateId == candidateId)
                .Select(x => x.Candidate!.FirstName)
                .SingleOrDefaultAsync(ct);
        var user = Context.User;
        if (user is null || !IsHiringStaff(user))
            return null;
        var requisition = await db
            .Applications.AsNoTracking()
            .Where(x => x.Id == applicationId)
            .Select(x => x.Requisition)
            .SingleOrDefaultAsync(ct);
        if (requisition is null || !AtsEndpoints.CanManage(requisition, user))
            return null;
        var email = user.Email();
        return await db
                .Users.AsNoTracking()
                .Where(x => x.Email == email)
                .Select(x => x.DisplayName)
                .SingleOrDefaultAsync(ct)
            ?? email;
    }

    private static bool IsHiringStaff(ClaimsPrincipal user) =>
        user.IsInRole(nameof(UserRole.Admin))
        || user.IsInRole(nameof(UserRole.Recruiter))
        || user.IsInRole(nameof(UserRole.HiringManager));
}

public static class InboxLive
{
    /// <summary>
    /// A thread changed (new message, read, delivery, star or done). Every hiring-staff client
    /// refetches its inbox; the candidate's portal refetches their thread.
    /// </summary>
    // ponytail: one broadcast to all staff; scope it to the people on the job if the team grows past a few hundred.
    public static Task ThreadChangedAsync(
        this IHubContext<InboxHub> hub,
        Guid applicationId,
        Guid? candidateId = null
    )
    {
        var payload = new { applicationId };
        var staff = hub.Clients.Group(InboxHub.Staff).SendAsync("threadChanged", payload);
        return candidateId is null
            ? staff
            : Task.WhenAll(
                staff,
                hub.Clients.Group(InboxHub.CandidateGroup(candidateId.Value))
                    .SendAsync("threadChanged", payload)
            );
    }
}
