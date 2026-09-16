using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Auth;

public static class AtsPolicies
{
    public const string Read = "ats.read";
    public const string ManageHiring = "ats.manage-hiring";
    public const string ManageCandidates = "ats.manage-candidates";
    public const string SubmitScorecard = "ats.submit-scorecard";
    public const string Admin = "ats.admin";
}

public static class AuthExtensions
{
    public static IServiceCollection AddAtsAuthentication(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var mode = configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "Oidc");
        if (!mode.Equals("Development", StringComparison.OrdinalIgnoreCase) && !mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Auth:Mode must be either Development or Oidc.");
        if (mode.Equals("Development", StringComparison.OrdinalIgnoreCase) && !environment.IsDevelopment())
            throw new InvalidOperationException("Development authentication cannot be enabled outside the Development environment.");
        if (mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
            ValidateOidcConfiguration(configuration);

        var authentication = services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(options =>
            {
                options.Cookie.Name = "mythorneai.ats.session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
                options.SlidingExpiration = true;
                options.ExpireTimeSpan = TimeSpan.FromHours(8);
                options.Events.OnRedirectToLogin = context =>
                {
                    if (context.Request.Path.StartsWithSegments("/api"))
                    {
                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        return Task.CompletedTask;
                    }

                    context.Response.Redirect(context.RedirectUri);
                    return Task.CompletedTask;
                };
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    if (context.Request.Path.StartsWithSegments("/api"))
                    {
                        context.Response.StatusCode = StatusCodes.Status403Forbidden;
                        return Task.CompletedTask;
                    }

                    context.Response.Redirect(context.RedirectUri);
                    return Task.CompletedTask;
                };
                options.Events.OnValidatePrincipal = ValidateSessionAsync;
            });

        if (mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
        {
            authentication.AddOpenIdConnect("oidc", options =>
            {
                options.Authority = configuration["Auth:Authority"]!;
                options.ClientId = configuration["Auth:ClientId"]!;
                options.ClientSecret = configuration["Auth:ClientSecret"]!;
                options.RequireHttpsMetadata = true;
                options.ResponseType = OpenIdConnectResponseType.Code;
                options.UsePkce = true;
                options.SaveTokens = false;
                options.GetClaimsFromUserInfoEndpoint = true;
                options.Scope.Clear();
                options.Scope.Add("openid");
                options.Scope.Add("profile");
                options.Scope.Add("email");
                options.TokenValidationParameters.NameClaimType = "name";
                options.Events.OnTokenValidated = ValidateAtsUserAsync;
            });
        }

        services.AddAuthorizationBuilder()
            .AddPolicy(AtsPolicies.Read, policy => policy.RequireRole(Enum.GetNames<UserRole>()))
            .AddPolicy(AtsPolicies.ManageHiring, policy => policy.RequireRole(nameof(UserRole.Admin), nameof(UserRole.Recruiter), nameof(UserRole.HiringManager)))
            .AddPolicy(AtsPolicies.ManageCandidates, policy => policy.RequireRole(nameof(UserRole.Admin), nameof(UserRole.Recruiter), nameof(UserRole.Hr)))
            .AddPolicy(AtsPolicies.SubmitScorecard, policy => policy.RequireRole(Enum.GetNames<UserRole>()))
            .AddPolicy(AtsPolicies.Admin, policy => policy.RequireRole(nameof(UserRole.Admin)));

        return services;
    }

    public static IEndpointRouteBuilder MapAtsAuth(this IEndpointRouteBuilder endpoints, IConfiguration configuration, IHostEnvironment environment)
    {
        var mode = configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "Oidc");

        if (mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
        {
            endpoints.MapGet("/auth/login", (string? returnUrl) =>
                Results.Challenge(new AuthenticationProperties { RedirectUri = SafeReturnUrl(returnUrl) }, ["oidc"]))
                .ExcludeFromDescription();
        }

        endpoints.MapPost("/api/auth/logout", async (HttpContext context, IAntiforgery antiforgery) =>
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.BadRequest(new { message = "The security token is missing or invalid." });
            }

            await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        }).RequireAuthorization();

        endpoints.MapGet("/api/auth/me", async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken cancellationToken) =>
        {
            var email = principal.Email();
            var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email, cancellationToken);
            return user is null
                ? Results.Unauthorized()
                : Results.Ok(new { user.Id, user.Email, user.DisplayName, Role = user.Role.ToString(), user.Department });
        }).RequireAuthorization();

        if (mode.Equals("Development", StringComparison.OrdinalIgnoreCase))
        {
            endpoints.MapGet("/api/auth/dev-users", async (AtsDbContext db, CancellationToken cancellationToken) =>
                Results.Ok(await db.Users.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Role).Select(x => new
                {
                    x.Email,
                    x.DisplayName,
                    Role = x.Role.ToString()
                }).ToListAsync(cancellationToken)));

            endpoints.MapPost("/api/auth/dev-login", async (DevLoginRequest request, HttpContext context, AtsDbContext db, CancellationToken cancellationToken) =>
            {
                var email = request.Email.Trim().ToLowerInvariant();
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email && x.IsActive, cancellationToken);
                if (user is null) return Results.Unauthorized();

                await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, CreatePrincipal(user, "Development"));
                return Results.NoContent();
            });
        }

        return endpoints;
    }

    private static async Task ValidateAtsUserAsync(TokenValidatedContext context)
    {
        var email = context.Principal?.FindFirstValue(ClaimTypes.Email)
            ?? context.Principal?.FindFirstValue("preferred_username")
            ?? context.Principal?.FindFirstValue("email");

        if (string.IsNullOrWhiteSpace(email))
        {
            context.Fail("The identity provider did not return an email address.");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<AtsDbContext>();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email.ToLower() && x.IsActive);
        if (user is null)
        {
            context.Fail("This account has not been granted ATS access.");
            return;
        }

        context.Principal = CreatePrincipal(user, "oidc");
    }

    private static async Task ValidateSessionAsync(CookieValidatePrincipalContext context)
    {
        var email = context.Principal?.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<AtsDbContext>();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
        if (user is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return;
        }

        var currentRole = context.Principal?.FindFirstValue(ClaimTypes.Role);
        var currentName = context.Principal?.FindFirstValue(ClaimTypes.Name);
        if (currentRole != user.Role.ToString() || currentName != user.DisplayName)
        {
            context.ReplacePrincipal(CreatePrincipal(user, context.Principal?.Identity?.AuthenticationType ?? "cookie"));
            context.ShouldRenew = true;
        }
    }

    private static ClaimsPrincipal CreatePrincipal(AppUser user, string authenticationType)
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim(ClaimTypes.Role, user.Role.ToString()),
            new Claim("ats_user_id", user.Id.ToString())
        };
        return new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType));
    }

    private static void ValidateOidcConfiguration(IConfiguration configuration)
    {
        var missing = new[] { "Auth:Authority", "Auth:ClientId", "Auth:ClientSecret" }
            .Where(key => string.IsNullOrWhiteSpace(configuration[key]))
            .ToArray();
        if (missing.Length > 0)
            throw new InvalidOperationException($"OIDC configuration is incomplete. Missing: {string.Join(", ", missing)}.");

        if (!Uri.TryCreate(configuration["Auth:Authority"], UriKind.Absolute, out var authority) || authority.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("Auth:Authority must be an absolute HTTPS URL.");
    }

    private static string SafeReturnUrl(string? returnUrl) =>
        !string.IsNullOrWhiteSpace(returnUrl) && Uri.IsWellFormedUriString(returnUrl, UriKind.Relative) && returnUrl.StartsWith('/')
            ? returnUrl
            : "/";

    private sealed record DevLoginRequest(string Email);
}

public static class PrincipalExtensions
{
    public static string Email(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant()
        ?? throw new InvalidOperationException("The signed-in user has no email claim.");

    public static bool IsHiringStaff(this ClaimsPrincipal principal) =>
        principal.IsInRole(nameof(UserRole.Admin)) || principal.IsInRole(nameof(UserRole.Recruiter)) || principal.IsInRole(nameof(UserRole.Hr));
}
