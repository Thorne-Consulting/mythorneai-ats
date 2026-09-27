using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
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
                    (HttpContext context, string? returnUrl, WorkOSClient client, IDataProtectionProvider protection) =>
                    {
                        var nonce = RandomNumberGenerator.GetHexString(32);
                        var state = protection
                            .CreateProtector("Internal.Ats.WorkOS.LoginState")
                            .Protect(JsonSerializer.Serialize(new WorkOSLoginState(SafeReturnUrl(returnUrl), nonce)));
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
                            return Results.BadRequest(new { message = "The WorkOS login response is incomplete." });

                        WorkOSLoginState loginState;
                        try
                        {
                            var json = protection
                                .CreateProtector("Internal.Ats.WorkOS.LoginState")
                                .Unprotect(state);
                            loginState = JsonSerializer.Deserialize<WorkOSLoginState>(json)
                                ?? throw new InvalidOperationException();
                        }
                        catch (CryptographicException)
                        {
                            return Results.BadRequest(new { message = "The WorkOS login state is invalid." });
                        }
                        catch (JsonException)
                        {
                            return Results.BadRequest(new { message = "The WorkOS login state is invalid." });
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
                            return Results.BadRequest(new { message = "The WorkOS login state is invalid." });

                        try
                        {
                            var authentication = await client.UserManagement.AuthenticateWithCodeAsync(
                                new AuthenticateWithCodeOptions
                                {
                                    Code = code,
                                    IpAddress = context.Connection.RemoteIpAddress?.ToString(),
                                    UserAgent = context.Request.Headers.UserAgent.ToString(),
                                },
                                cancellationToken: cancellationToken
                            );
                            var (user, error) = await FindOrProvisionAtsUserAsync(
                                db,
                                context.RequestServices.GetRequiredService<IConfiguration>(),
                                authentication.User.Email,
                                authentication.User.Name
                            );
                            if (user is null)
                                return Results.Redirect($"/login?error={Uri.EscapeDataString(error ?? "Access denied.")}");

                            await context.SignInAsync(
                                CookieAuthenticationDefaults.AuthenticationScheme,
                                CreatePrincipal(user, "WorkOS")
                            );
                            return Results.Redirect(loginState.ReturnUrl);
                        }
                        catch (WorkOS.ApiException)
                        {
                            return Results.Redirect("/login?error=WorkOS%20authentication%20failed");
                        }
                    }
                )
                .ExcludeFromDescription();
        }

        endpoints
            .MapPost(
                "/api/auth/logout",
                async (HttpContext context, IAntiforgery antiforgery) =>
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
                    CancellationToken cancellationToken
                ) =>
                {
                    var email = principal.Email();
                    var user = await db
                        .Users.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
                    var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync(cancellationToken);
                    return user is null
                        ? Results.Unauthorized()
                        : Results.Ok(
                            new
                            {
                                user.Id,
                                user.Email,
                                user.DisplayName,
                                Role = user.Role.ToString(),
                                user.Department,
                                OrganizationName = organization?.Name,
                                OrganizationSetupCompleted = organization?.SetupCompleted ?? false,
                                IsOrganizationOwner = organization?.OwnerEmail == user.Email,
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
                    var user = await db
                        .Users.AsNoTracking()
                        .SingleOrDefaultAsync(
                            x => x.Email == email && x.IsActive,
                            cancellationToken
                        );
                    if (user is null)
                        return Results.Unauthorized();

                    await context.SignInAsync(
                        CookieAuthenticationDefaults.AuthenticationScheme,
                        CreatePrincipal(user, "Development")
                    );
                    return Results.NoContent();
                }
            );
        }

        return endpoints;
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

    private sealed record DevLoginRequest(string Email);

    private sealed record WorkOSLoginState(string ReturnUrl, string Nonce);
}
