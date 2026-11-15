using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// The candidate portal session: a random token in an HttpOnly cookie, stored hashed in
/// <see cref="CandidatePortalSession"/>. It lasts 30 days and slides while the person uses the portal.
/// </summary>
public static partial class PublicEndpoints
{
    public const string SessionCookie = "candidate.session";
    public const string SessionHeader = "X-Candidate-Session";
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromDays(30);

    /// <summary>Changes signed in by cookie must carry this header. Other sites cannot add it, so they cannot act for the candidate.</summary>
    public const string PortalRequestHeader = "X-Candidate-Portal";

    /// <summary>
    /// Copies the session cookie into the X-Candidate-Session header for /public requests, so every
    /// endpoint that binds the header reads the cookie too, with no change to each one. A header
    /// sent by the caller wins (API clients and tests keep working).
    /// </summary>
    public static IApplicationBuilder UseCandidateSessionCookie(this IApplicationBuilder app) =>
        app.Use(
            (context, next) =>
            {
                var request = context.Request;
                var reading =
                    HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method);
                if (
                    request.Path.StartsWithSegments("/public")
                    && !request.Headers.ContainsKey(SessionHeader)
                    && (reading || request.Headers.ContainsKey(PortalRequestHeader))
                    && request.Cookies.TryGetValue(SessionCookie, out var token)
                    && token is { Length: > 0 and <= 128 }
                )
                    request.Headers[SessionHeader] = token;
                return next(context);
            }
        );

    private static async Task<string> CreateSessionAsync(
        HttpContext http,
        AtsDbContext db,
        Guid candidateId,
        CancellationToken ct
    )
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        var expires = DateTimeOffset.UtcNow + SessionLifetime;
        db.CandidatePortalSessions.Add(
            new CandidatePortalSession
            {
                CandidateId = candidateId,
                TokenHash = Hash(token),
                ExpiresAt = expires,
            }
        );
        await db.SaveChangesAsync(ct);
        WriteSessionCookie(http, token, expires);
        return token;
    }

    private static void WriteSessionCookie(
        HttpContext http,
        string token,
        DateTimeOffset expires
    ) => http.Response.Cookies.Append(SessionCookie, token, SessionCookieOptions(http, expires));

    private static void ClearSessionCookie(HttpContext http) =>
        http.Response.Cookies.Delete(SessionCookie, SessionCookieOptions(http, null));

    // Secure everywhere except plain-http development, like the workspace cookie. Lax so a link
    // from an email still opens the portal signed in.
    private static CookieOptions SessionCookieOptions(HttpContext http, DateTimeOffset? expires) =>
        new()
        {
            HttpOnly = true,
            Secure =
                http.Request.IsHttps
                || !http.RequestServices.GetRequiredService<IHostEnvironment>().IsDevelopment(),
            SameSite = SameSiteMode.Lax,
            Path = "/",
            Expires = expires,
            IsEssential = true,
        };

    /// <summary>
    /// The signed-in session for this request, sliding its expiry forward once a day (and the
    /// cookie with it). Null when there is no session or it has ended.
    /// </summary>
    private static async Task<CandidatePortalSession?> CurrentSessionAsync(
        HttpContext http,
        AtsDbContext db,
        string? token,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;
        var now = DateTimeOffset.UtcNow;
        var session = await db
            .CandidatePortalSessions.Include(x => x.Candidate)
            .SingleOrDefaultAsync(x => x.TokenHash == Hash(token) && x.ExpiresAt > now, ct);
        if (session is null)
            return null;
        if (session.ExpiresAt - now < SessionLifetime - TimeSpan.FromDays(1))
        {
            session.ExpiresAt = now + SessionLifetime;
            await db.SaveChangesAsync(ct);
            if (http.Request.Cookies.ContainsKey(SessionCookie))
                WriteSessionCookie(http, token, session.ExpiresAt);
        }
        return session;
    }

    private static void MapPublicSession(RouteGroupBuilder api)
    {
        // Ends the session on the server too, so a copied cookie stops working.
        api.MapPost(
            "/portal/sign-out",
            async (HttpContext http, AtsDbContext db, CancellationToken ct) =>
            {
                var token = http.Request.Headers[SessionHeader].ToString();
                if (token.Length is > 0 and <= 128)
                    await db
                        .CandidatePortalSessions.Where(x => x.TokenHash == Hash(token))
                        .ExecuteDeleteAsync(ct);
                ClearSessionCookie(http);
                return Results.NoContent();
            }
        );
    }
}

/// <summary>
/// One-click links in candidate emails: a one-time token that signs the person in and opens the
/// right portal page. Built only from the saved site address, never from request headers.
/// </summary>
public static class CandidateLinks
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public static string ApplicationPath(Guid applicationId, string? section = null) =>
        $"/candidate-portal/applications/{applicationId}{(section is null ? "" : $"#{section}")}";

    public static string ConversationPath(Guid applicationId) =>
        $"/candidate-portal/messages/{applicationId}";

    /// <summary>
    /// Adds the link row (the caller saves) and returns the full address, or null when the
    /// organization has not saved where the site lives.
    /// </summary>
    public static async Task<string?> CreateAsync(
        AtsDbContext db,
        Guid candidateId,
        Guid? applicationId,
        string path,
        CancellationToken ct,
        string purpose = CandidateMagicLink.SignIn
    )
    {
        var site = await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(site))
            return null;
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.CandidateMagicLinks.Add(
            new CandidateMagicLink
            {
                TokenHash = PublicEndpoints.Hash(token),
                CandidateId = candidateId,
                ApplicationId = applicationId,
                Purpose = purpose,
                Path = SafePath(path),
                ExpiresAt = DateTimeOffset.UtcNow + Lifetime,
            }
        );
        // The token sits after # so it never reaches a server log.
        return $"{site.TrimEnd('/')}/candidate-portal/link#{token}";
    }

    /// <summary>
    /// For template emails: when the email goes to the application's candidate, <c>{{portalLink}}</c>
    /// becomes a one-click link to that application (its interviews for booking emails).
    /// </summary>
    public static async Task<IReadOnlyDictionary<string, string>> WithPortalLinkAsync(
        AtsDbContext db,
        string key,
        string recipient,
        Guid? applicationId,
        IReadOnlyDictionary<string, string> variables,
        CancellationToken ct
    )
    {
        if (applicationId is not { } id || variables.ContainsKey("portalLink"))
            return variables;
        var candidateId = await db
            .Applications.Where(x => x.Id == id && x.Candidate!.Email == recipient)
            .Select(x => (Guid?)x.CandidateId)
            .SingleOrDefaultAsync(ct);
        if (candidateId is null)
            return variables;
        // ponytail: one link row per candidate email even when the template has no {{portalLink}}; the follow-up worker clears them.
        var link = await CreateAsync(
            db,
            candidateId.Value,
            id,
            ApplicationPath(
                id,
                key.StartsWith("booking", StringComparison.Ordinal) ? "interviews" : null
            ),
            ct
        );
        return link is null
            ? variables
            : new Dictionary<string, string>(variables) { ["portalLink"] = link };
    }

    /// <summary>Only portal pages, so a link can never send someone to another site.</summary>
    public static string? SafePath(string? path) =>
        path is { Length: > 0 and <= 200 }
        && path.StartsWith("/candidate-portal/", StringComparison.Ordinal)
        && !path.Contains("//", StringComparison.Ordinal)
        && !path.Contains('\\')
            ? path
            : null;
}
