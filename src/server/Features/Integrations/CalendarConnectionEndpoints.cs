using System.Security.Claims;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

public static class CalendarConnectionEndpoints
{
    public static void MapCalendarConnections(this IEndpointRouteBuilder endpoints)
    {
        endpoints
            .MapGet(
                "/api/calendar/connect/{provider}",
                (string provider, ClaimsPrincipal principal, CalendarOAuthService oauth) =>
                {
                    var state = oauth.CreateState(
                        new CalendarOAuthState(provider, principal.Email())
                    );
                    try
                    {
                        return Results.Ok(
                            new { authorizationUrl = oauth.AuthorizationUrl(provider, state) }
                        );
                    }
                    catch (InvalidOperationException)
                    {
                        return Results.Json(
                            new
                            {
                                message = "Connecting a calendar is not set up for this workspace yet. Ask an admin to set it up.",
                            },
                            statusCode: StatusCodes.Status409Conflict
                        );
                    }
                }
            )
            .RequireAuthorization();

        // The browser lands here from Google or Microsoft. Every outcome goes back to the person's
        // calendar settings with a plain status, never a raw error page.
        endpoints.MapGet(
            "/auth/calendar/callback",
            async (
                string? code,
                string? state,
                string? error,
                CalendarOAuthService oauth,
                IDataProtectionProvider protection,
                AtsDbContext db,
                ILoggerFactory loggers,
                CancellationToken ct
            ) =>
            {
                const string page = "/settings/availability";
                if (!string.IsNullOrWhiteSpace(error))
                    return Results.Redirect($"{page}?calendar=declined");
                if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
                    return Results.Redirect($"{page}?calendar=incomplete");
                CalendarOAuthState oauthState;
                try
                {
                    oauthState = oauth.ReadState(state);
                }
                catch (Exception)
                {
                    return Results.Redirect($"{page}?calendar=expired");
                }
                var user = await db.Users.SingleOrDefaultAsync(
                    x => x.Email == oauthState.UserEmail && x.IsActive,
                    ct
                );
                if (user is null)
                    return Results.Redirect($"{page}?calendar=failed");
                CalendarOAuthToken token;
                try
                {
                    token = await oauth.ExchangeCodeAsync(oauthState.Provider, code, ct);
                }
                catch (Exception exception)
                    when (exception
                            is HttpRequestException
                                or InvalidOperationException
                                or System.Text.Json.JsonException
                    )
                {
                    loggers
                        .CreateLogger("CalendarConnection")
                        .LogWarning(exception, "Calendar sign-in failed for {Email}.", user.Email);
                    return Results.Redirect($"{page}?calendar=failed");
                }
                var protector = protection.CreateProtector("Internal.Ats.CalendarConnection.Token");
                var connection = await db.CalendarConnections.SingleOrDefaultAsync(
                    x => x.UserEmail == user.Email,
                    ct
                );
                if (connection is null)
                {
                    connection = new CalendarConnection
                    {
                        UserEmail = user.Email,
                        Provider = oauthState.Provider.Trim(),
                        AccessToken = "",
                    };
                    db.CalendarConnections.Add(connection);
                }
                connection.Provider = oauthState.Provider.Trim();
                // The Google or Microsoft account actually connected, which can differ from the sign-in email.
                connection.ProviderAccountEmail = token.AccountEmail ?? user.Email;
                connection.AccessToken = protector.Protect(token.AccessToken);
                connection.RefreshToken = token.RefreshToken is null
                    ? connection.RefreshToken
                    : protector.Protect(token.RefreshToken);
                connection.AccessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(
                    token.ExpiresInSeconds
                );
                connection.UpdatedAt = DateTimeOffset.UtcNow;
                // Interviews whose invite could not be reached because this person was disconnected can go out again.
                var stuck = await db
                    .Interviews.Where(x =>
                        x.CalendarStatus == "Disconnected"
                        && x.Status == InterviewStatus.Scheduled
                        && x.InterviewerEmails.Contains(user.Email)
                    )
                    .ToListAsync(ct);
                foreach (var interview in stuck)
                {
                    interview.CalendarStatus = "Queued";
                    interview.CalendarError = null;
                    var row = await db.IntegrationOutbox.SingleOrDefaultAsync(
                        x =>
                            x.Operation == IntegrationOperation.CreateCalendarEvent
                            && x.EntityId == interview.Id,
                        ct
                    );
                    if (row is null)
                        db.IntegrationOutbox.Add(
                            new IntegrationOutboxItem
                            {
                                Operation = IntegrationOperation.CreateCalendarEvent,
                                EntityId = interview.Id,
                            }
                        );
                    else
                    {
                        row.Status = IntegrationOutboxStatus.Pending;
                        row.Attempts = 0;
                        row.NextAttemptAt = DateTimeOffset.UtcNow;
                        row.LastError = null;
                        row.LockedUntil = null;
                        row.CompletedAt = null;
                    }
                }
                await db.SaveChangesAsync(ct);
                return Results.Redirect($"{page}?calendar=connected");
            }
        );

        var api = endpoints
            .MapGroup("/api/calendar")
            .RequireAuthorization()
            .AddEndpointFilter<AntiforgeryEndpointFilter>();
        api.MapGet(
            "/connection",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var connection = await db
                    .CalendarConnections.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.UserEmail == principal.Email(), ct);
                return connection is null
                    ? Results.Ok(new { connected = false })
                    : Results.Ok(
                        new
                        {
                            connected = true,
                            provider = connection.Provider,
                            accountEmail = connection.ProviderAccountEmail,
                            expiresAt = connection.AccessTokenExpiresAt,
                        }
                    );
            }
        );
        // Times that fit every interviewer: working hours, zones, buffers, limits and calendars.
        api.MapGet(
                "/availability",
                async (
                    string interviewerEmails,
                    DateTimeOffset from,
                    DateTimeOffset to,
                    int durationMinutes,
                    int? slotIntervalMinutes,
                    Guid? ignoreInterviewId,
                    AvailabilityService availability,
                    CancellationToken ct
                ) =>
                {
                    var emails = interviewerEmails
                        .Split(
                            ',',
                            StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries
                        )
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                    if (emails.Length == 0 || to <= from || to - from > TimeSpan.FromDays(21))
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["range"] = ["Add interviewers and a range of up to 21 days."],
                            }
                        );
                    var step = slotIntervalMinutes ?? 30;
                    if (durationMinutes is < 15 or > 480 || step is < 5 or > 480)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["durationMinutes"] =
                                [
                                    "Length and step must be between 15 and 480 minutes.",
                                ],
                            }
                        );
                    return Results.Ok(
                        await availability.FindAsync(
                            new AvailabilityRequest(
                                emails,
                                from,
                                to,
                                TimeSpan.FromMinutes(durationMinutes),
                                TimeSpan.FromMinutes(step),
                                TimeSpan.Zero,
                                ignoreInterviewId
                            ),
                            ct
                        )
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
        api.MapDelete(
            "/connection",
            async (
                ClaimsPrincipal principal,
                AtsDbContext db,
                CalendarOAuthService oauth,
                CancellationToken ct
            ) =>
            {
                var connection = await db.CalendarConnections.SingleOrDefaultAsync(
                    x => x.UserEmail == principal.Email(),
                    ct
                );
                if (connection is null)
                    return Results.NoContent();
                var revoked = await oauth.RevokeAsync(connection, ct);
                db.CalendarConnections.Remove(connection);
                Audit.Add(
                    db,
                    principal,
                    "User",
                    principal.Email(),
                    "CalendarDisconnected",
                    new { connection.Provider, Revoked = revoked }
                );
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
    }
}
