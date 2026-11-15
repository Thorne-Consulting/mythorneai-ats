using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using WorkOS;

namespace MyThorneAI.Ats.Api.Auth;

public static partial class AuthExtensions
{
    public static IEndpointRouteBuilder MapAtsAuth(
        this IEndpointRouteBuilder endpoints,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var mode =
            configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "WorkOS");

        if (mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
        {
            endpoints
                .MapGet(
                    "/auth/login",
                    (string? returnUrl) =>
                        Results.Challenge(
                            new AuthenticationProperties { RedirectUri = SafeReturnUrl(returnUrl) },
                            ["oidc"]
                        )
                )
                .ExcludeFromDescription();
        }
        else if (mode.Equals("WorkOS", StringComparison.OrdinalIgnoreCase))
        {
            endpoints
                .MapGet(
                    "/auth/login",
                    (
                        HttpContext context,
                        string? returnUrl,
                        WorkOSClient client,
                        IDataProtectionProvider protection
                    ) =>
                    {
                        var nonce = RandomNumberGenerator.GetHexString(32);
                        var state = protection
                            .CreateProtector("Internal.Ats.WorkOS.LoginState")
                            .Protect(
                                JsonSerializer.Serialize(
                                    new WorkOSLoginState(SafeReturnUrl(returnUrl), nonce)
                                )
                            );
                        context.Response.Cookies.Append(
                            "ats.workos.login-state",
                            nonce,
                            new CookieOptions
                            {
                                HttpOnly = true,
                                SameSite = SameSiteMode.Lax,
                                Secure = context.Request.IsHttps,
                                MaxAge = TimeSpan.FromMinutes(10),
                                IsEssential = true,
                            }
                        );
                        var redirectUri = configuration["Auth:WorkOS:RedirectUri"]!;
                        var url = client.UserManagement.GetAuthorizationUrl(
                            new UserManagementGetAuthorizationUrlOptions
                            {
                                RedirectUri = redirectUri,
                                Provider = UserManagementAuthenticationProvider.Authkit,
                                State = state,
                            }
                        );
                        return Results.Redirect(url);
                    }
                )
                .ExcludeFromDescription();

            endpoints
                .MapGet(
                    "/auth/callback",
                    async (
                        HttpContext context,
                        string? code,
                        string? state,
                        WorkOSClient client,
                        IDataProtectionProvider protection,
                        AtsDbContext db,
                        CancellationToken cancellationToken
                    ) =>
                    {
                        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(state))
                            return Results.Redirect("/login?error=state");

                        WorkOSLoginState loginState;
                        try
                        {
                            var json = protection
                                .CreateProtector("Internal.Ats.WorkOS.LoginState")
                                .Unprotect(state);
                            loginState =
                                JsonSerializer.Deserialize<WorkOSLoginState>(json)
                                ?? throw new InvalidOperationException();
                        }
                        catch (Exception exception)
                            when (exception
                                    is CryptographicException
                                        or JsonException
                                        or InvalidOperationException
                            )
                        {
                            return Results.Redirect("/login?error=state");
                        }

                        var expectedNonce = context.Request.Cookies["ats.workos.login-state"];
                        context.Response.Cookies.Delete("ats.workos.login-state");
                        if (
                            string.IsNullOrWhiteSpace(expectedNonce)
                            || string.IsNullOrWhiteSpace(loginState.Nonce)
                            || !CryptographicOperations.FixedTimeEquals(
                                System.Text.Encoding.UTF8.GetBytes(expectedNonce),
                                System.Text.Encoding.UTF8.GetBytes(loginState.Nonce)
                            )
                        )
                            return Results.Redirect("/login?error=state");

                        try
                        {
                            var authentication =
                                await client.UserManagement.AuthenticateWithCodeAsync(
                                    new AuthenticateWithCodeOptions
                                    {
                                        Code = code,
                                        IpAddress = context.Connection.RemoteIpAddress?.ToString(),
                                        UserAgent = context.Request.Headers.UserAgent.ToString(),
                                    },
                                    cancellationToken: cancellationToken
                                );
                            var email = authentication.User.Email;
                            var method = $"{authentication.AuthenticationMethod}";
                            var organization = await db
                                .Organizations.AsNoTracking()
                                .SingleOrDefaultAsync(cancellationToken);
                            if (!MethodAllowed(organization, method))
                            {
                                await DenySignInAsync(db, email, "method");
                                return Results.Redirect(Refused("method", loginState.ReturnUrl));
                            }
                            var (user, error, requestId) = await FindOrProvisionAtsUserAsync(
                                db,
                                context.RequestServices.GetRequiredService<IConfiguration>(),
                                email,
                                authentication.User.Name
                            );
                            if (user is null)
                            {
                                await DenySignInAsync(db, email, error ?? "not_invited");
                                var token = requestId is { } id
                                    ? "&request="
                                        + Uri.EscapeDataString(
                                            protection
                                                .CreateProtector(AccessRequestPurpose)
                                                .Protect(id.ToString())
                                        )
                                    : "";
                                return Results.Redirect(
                                    Refused(error ?? "not_invited", loginState.ReturnUrl) + token
                                );
                            }

                            if (
                                await SsoRequiredAsync(
                                    client,
                                    organization,
                                    user.Email,
                                    method,
                                    cancellationToken
                                )
                            )
                            {
                                await DenySignInAsync(db, email, "sso");
                                return Results.Redirect(Refused("sso", loginState.ReturnUrl));
                            }

                            await CompleteSignInAsync(db, user, method);
                            await context.SignInAsync(
                                CookieAuthenticationDefaults.AuthenticationScheme,
                                await CreatePrincipalAsync(db, user, "WorkOS")
                            );
                            return Results.Redirect(loginState.ReturnUrl);
                        }
                        catch (WorkOS.ApiException)
                        {
                            return Results.Redirect(Refused("provider", loginState.ReturnUrl));
                        }
                    }
                )
                .ExcludeFromDescription();
        }

        // The /login page's "add a note" for someone whose sign-in became an access request.
        endpoints
            .MapPost(
                "/auth/access-request",
                async (
                    AccessRequestNote request,
                    IDataProtectionProvider protection,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    Guid id;
                    try
                    {
                        id = Guid.Parse(
                            protection
                                .CreateProtector(AccessRequestPurpose)
                                .Unprotect(request.Token)
                        );
                    }
                    catch (Exception exception)
                        when (exception is CryptographicException or FormatException)
                    {
                        return Results.BadRequest(
                            new
                            {
                                message = "This link has expired. Sign in again to ask for access.",
                            }
                        );
                    }
                    var pending = await db.AccessRequests.SingleOrDefaultAsync(
                        x => x.Id == id && x.Status == AccessRequestStatus.Pending,
                        ct
                    );
                    if (pending is null)
                        return Results.NotFound();
                    pending.Note = request.Note?.Trim() is { Length: > 0 } note
                        ? note[..Math.Min(note.Length, 1000)]
                        : null;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireRateLimiting("public-candidate")
            .ExcludeFromDescription();

        endpoints
            .MapPost(
                "/api/auth/logout",
                async (HttpContext context, IAntiforgery antiforgery, AtsDbContext db) =>
                {
                    try
                    {
                        await antiforgery.ValidateRequestAsync(context);
                    }
                    catch (AntiforgeryValidationException)
                    {
                        return Results.BadRequest(
                            new { message = "The security token is missing or invalid." }
                        );
                    }

                    var email = context.User.Email();
                    var userId = await db
                        .Users.Where(x => x.Email == email)
                        .Select(x => x.Id)
                        .FirstOrDefaultAsync();
                    Audit.Add(db, email, "User", userId, "SignedOut");
                    await db.SaveChangesAsync();
                    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization();

        endpoints
            .MapGet(
                "/api/auth/me",
                async (
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    IConfiguration configuration,
                    MyThorneAI.Ats.Api.Infrastructure.IAiAssistant ai,
                    CancellationToken cancellationToken
                ) =>
                {
                    var email = principal.Email();
                    var user = await db
                        .Users.AsNoTracking()
                        .Include(x => x.CustomRole)
                        .SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
                    if (user is null)
                        return Results.Unauthorized();
                    var organization = await db
                        .Organizations.AsNoTracking()
                        .SingleOrDefaultAsync(cancellationToken);
                    return Results.Ok(
                        new
                        {
                            user.Id,
                            user.Email,
                            user.DisplayName,
                            // The built-in role this one behaves like (personal defaults read it), and its name.
                            Role = user.Role.ToString(),
                            RoleName = Permissions.RoleName(user),
                            user.Departments,
                            user.AvatarTone,
                            user.TimeZone,
                            OrganizationName = organization?.Name,
                            // The employer's square icon from the careers site brand, if they set one.
                            WorkspaceIconUrl = CareerSites.ImageUrl(
                                await CareerSites.FindAsync(db, cancellationToken),
                                CareerSites.Icon
                            ),
                            OrganizationTimeZone = organization?.TimeZone,
                            OrganizationSetupCompleted = organization?.SetupCompleted ?? false,
                            IsOrganizationOwner = organization?.OwnerEmail == user.Email,
                            // What this person may do, as CASL rules. The web app hides everything else.
                            Rules = Abilities.RulesFor(
                                Permissions.For(principal),
                                user.Email,
                                user.Departments
                            ),
                            Preferences = MyPreferences.Parse(user.PreferencesJson),
                            // AI controls show only when the server has a key and the organization has AI on.
                            AiEnabled = ai.IsConfigured && (organization?.AiEnabled ?? true),
                            SupportEmail = configuration["Support:Email"],
                            ChangelogUrl = configuration["Support:ChangelogUrl"],
                        }
                    );
                }
            )
            .RequireAuthorization();

        if (mode.Equals("Development", StringComparison.OrdinalIgnoreCase))
        {
            endpoints.MapGet(
                "/api/auth/dev-users",
                async (AtsDbContext db, CancellationToken cancellationToken) =>
                    Results.Ok(
                        await db
                            .Users.AsNoTracking()
                            .Where(x => x.IsActive)
                            .OrderBy(x => x.Role)
                            .Select(x => new
                            {
                                x.Email,
                                x.DisplayName,
                                Role = x.Role.ToString(),
                            })
                            .ToListAsync(cancellationToken)
                    )
            );

            endpoints.MapPost(
                "/api/auth/dev-login",
                async (
                    DevLoginRequest request,
                    HttpContext context,
                    AtsDbContext db,
                    CancellationToken cancellationToken
                ) =>
                {
                    var email = request.Email.Trim().ToLowerInvariant();
                    var user = await db.Users.SingleOrDefaultAsync(
                        x => x.Email == email && x.IsActive,
                        cancellationToken
                    );
                    if (user is null)
                        return Results.Unauthorized();
                    await CompleteSignInAsync(db, user, "Development");

                    await context.SignInAsync(
                        CookieAuthenticationDefaults.AuthenticationScheme,
                        await CreatePrincipalAsync(db, user, "Development")
                    );
                    return Results.NoContent();
                }
            );
        }

        return endpoints;
    }

    /// <summary>
    /// Whether this sign-in must be refused because the workspace requires single sign-on for the
    /// person's verified company domain and they used something else. The owner is always let in,
    /// so a broken identity provider can't lock the workspace.
    /// </summary>
    private static async Task<bool> SsoRequiredAsync(
        WorkOSClient client,
        MyThorneAI.Ats.Api.Domain.Organization? organization,
        string email,
        string method,
        CancellationToken ct
    )
    {
        if (
            organization is not { RequireSso: true, WorkOsOrganizationId: { } orgId }
            || method.Equals("SSO", StringComparison.OrdinalIgnoreCase)
            || email.Equals(organization.OwnerEmail, StringComparison.OrdinalIgnoreCase)
        )
            return false;
        var domain = email.Split('@').Last().ToLowerInvariant();
        var domains = await AtsEndpoints.VerifiedDomainsAsync(client, orgId, ct);
        return domains.Any(x => x.Domain == domain && x.State == "Verified");
    }

    // "//evil.com" is a well-formed *relative* URI that starts with '/', so the
    // obvious guard lets it through, and a browser reads it as protocol-relative
    // and leaves the site. Everything else hostile ("https://evil.com", "/\evil.com")
    // already fails IsWellFormedUriString.
    private static string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrWhiteSpace(returnUrl)
        && Uri.IsWellFormedUriString(returnUrl, UriKind.Relative)
        && returnUrl.StartsWith('/')
        && !returnUrl.StartsWith("//", StringComparison.Ordinal)
            ? returnUrl
            : "/";

    // Back to the sign-in page with the reason, keeping where the person was going.
    private static string Refused(string code, string returnUrl) =>
        $"/login?error={code}&returnUrl={Uri.EscapeDataString(returnUrl)}";

    private const string AccessRequestPurpose = "Internal.Ats.AccessRequest";

    private sealed record DevLoginRequest(string Email);

    private sealed record AccessRequestNote(string Token, string? Note);

    private sealed record WorkOSLoginState(string ReturnUrl, string Nonce);
}
