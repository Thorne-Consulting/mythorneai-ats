using System.Security.Claims;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static class CalendarConnectionEndpoints
{
    public static void MapCalendarConnections(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/calendar/connect/{provider}", (
            string provider,
            ClaimsPrincipal principal,
            CalendarOAuthService oauth) =>
        {
            var state = oauth.CreateState(new CalendarOAuthState(provider, principal.Email()));
            return Results.Ok(new { authorizationUrl = oauth.AuthorizationUrl(provider, state) });
        }).RequireAuthorization();

        endpoints.MapGet("/auth/calendar/callback", async (
            string? code,
            string? state,
            string? error,
            CalendarOAuthService oauth,
            IDataProtectionProvider protection,
            AtsDbContext db,
            CancellationToken ct) =>
        {
            if (!string.IsNullOrWhiteSpace(error))
                return Results.BadRequest(new { message = "Calendar authorization was declined." });
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
                return Results.BadRequest(new { message = "Calendar authorization response is incomplete." });
            CalendarOAuthState oauthState;
            try { oauthState = oauth.ReadState(state); }
            catch (Exception) { return Results.BadRequest(new { message = "Calendar authorization state is invalid or expired." }); }
            var user = await db.Users.SingleOrDefaultAsync(x => x.Email == oauthState.UserEmail && x.IsActive, ct);
            if (user is null) return Results.Unauthorized();
            var token = await oauth.ExchangeCodeAsync(oauthState.Provider, code, ct);
            var protector = protection.CreateProtector("Internal.Ats.CalendarConnection.Token");
            var connection = await db.CalendarConnections.SingleOrDefaultAsync(x => x.UserEmail == user.Email, ct);
            if (connection is null)
            {
                connection = new CalendarConnection { UserEmail = user.Email, Provider = oauthState.Provider.Trim(), AccessToken = "" };
                db.CalendarConnections.Add(connection);
            }
            connection.Provider = oauthState.Provider.Trim();
            connection.ProviderAccountEmail = user.Email;
            connection.AccessToken = protector.Protect(token.AccessToken);
            connection.RefreshToken = token.RefreshToken is null ? connection.RefreshToken : protector.Protect(token.RefreshToken);
            connection.AccessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(token.ExpiresInSeconds);
            connection.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Redirect("/admin/integrations?calendar=connected");
        });

        var api = endpoints
            .MapGroup("/api/calendar")
            .RequireAuthorization()
            .AddEndpointFilter<AntiforgeryEndpointFilter>();
        api.MapGet("/connection", async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
        {
            var connection = await db.CalendarConnections.AsNoTracking().SingleOrDefaultAsync(x => x.UserEmail == principal.Email(), ct);
            return connection is null ? Results.Ok(new { connected = false }) : Results.Ok(new { connected = true, provider = connection.Provider, accountEmail = connection.ProviderAccountEmail, expiresAt = connection.AccessTokenExpiresAt });
        });
        api.MapGet("/availability", async (
            string interviewerEmails,
            DateTimeOffset from,
            DateTimeOffset to,
            int durationMinutes,
            int slotIntervalMinutes,
            IUserCalendarService calendars,
            CancellationToken ct) =>
        {
            var emails = interviewerEmails
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            if (emails.Length == 0 || to <= from || to - from > TimeSpan.FromDays(14))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["range"] = ["Provide interviewers and a range of one to fourteen days."] });
            if (durationMinutes is < 15 or > 480 || slotIntervalMinutes is < 5 or > 480)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["durationMinutes"] = ["Duration and slot interval must be between 5 and 480 minutes."] });

            var availability = await calendars.FindCommonAvailabilityAsync(
                emails,
                from,
                to,
                TimeSpan.FromMinutes(durationMinutes),
                TimeSpan.FromMinutes(slotIntervalMinutes),
                ct);
            return Results.Ok(availability);
        });
        api.MapDelete("/connection", async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
        {
            var connection = await db.CalendarConnections.SingleOrDefaultAsync(x => x.UserEmail == principal.Email(), ct);
            if (connection is not null) db.CalendarConnections.Remove(connection);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
