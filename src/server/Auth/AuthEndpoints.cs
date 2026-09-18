using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

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
            configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "Oidc");

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

    private static string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrWhiteSpace(returnUrl)
        && Uri.IsWellFormedUriString(returnUrl, UriKind.Relative)
        && returnUrl.StartsWith('/')
            ? returnUrl
            : "/";

    private sealed record DevLoginRequest(string Email);
}
