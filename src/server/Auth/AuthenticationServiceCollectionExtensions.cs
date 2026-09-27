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
using WorkOS;

namespace MyThorneAI.Ats.Api.Auth;

public static partial class AuthExtensions
{
    public static IServiceCollection AddAtsAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment
    )
    {
        var mode =
            configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "WorkOS");
        if (
            !mode.Equals("Development", StringComparison.OrdinalIgnoreCase)
            && !mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase)
            && !mode.Equals("WorkOS", StringComparison.OrdinalIgnoreCase)
        )
            throw new InvalidOperationException("Auth:Mode must be Development, Oidc, or WorkOS.");
        if (
            mode.Equals("Development", StringComparison.OrdinalIgnoreCase)
            && !environment.IsDevelopment()
        )
            throw new InvalidOperationException(
                "Development authentication cannot be enabled outside the Development environment."
            );
        if (mode.Equals("Oidc", StringComparison.OrdinalIgnoreCase))
            ValidateOidcConfiguration(configuration);
        if (mode.Equals("WorkOS", StringComparison.OrdinalIgnoreCase))
        {
            ValidateWorkOsConfiguration(configuration);
            services.AddSingleton(
                new WorkOSClient(
                    new WorkOSOptions
                    {
                        ApiKey = configuration["Auth:WorkOS:ApiKey"]!.Trim(),
                        ClientId = configuration["Auth:WorkOS:ClientId"]!.Trim(),
                    }
                )
            );
        }

        var authentication = services
            .AddAuthentication(options =>
            {
                options.DefaultAuthenticateScheme =
                    CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                options.DefaultChallengeScheme = CookieAuthenticationDefaults.AuthenticationScheme;
            })
            .AddCookie(options =>
            {
                options.Cookie.Name = "internal.ats.session";
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Lax;
                options.Cookie.SecurePolicy = environment.IsDevelopment()
                    ? CookieSecurePolicy.SameAsRequest
                    : CookieSecurePolicy.Always;
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
            authentication.AddOpenIdConnect(
                "oidc",
                options =>
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
                }
            );
        }

        services
            .AddAuthorizationBuilder()
            .AddPolicy(AtsPolicies.Read, policy => policy.RequireRole(Enum.GetNames<UserRole>()))
            .AddPolicy(
                AtsPolicies.ManageHiring,
                policy =>
                    policy.RequireRole(
                        nameof(UserRole.Admin),
                        nameof(UserRole.Recruiter),
                        nameof(UserRole.HiringManager)
                    )
            )
            .AddPolicy(
                AtsPolicies.ManageCandidates,
                policy => policy.RequireRole(nameof(UserRole.Admin), nameof(UserRole.Recruiter))
            )
            .AddPolicy(
                AtsPolicies.SubmitScorecard,
                policy => policy.RequireRole(Enum.GetNames<UserRole>())
            )
            .AddPolicy(AtsPolicies.Admin, policy => policy.RequireRole(nameof(UserRole.Admin)));

        return services;
    }

    private static async Task ValidateAtsUserAsync(TokenValidatedContext context)
    {
        var email =
            context.Principal?.FindFirstValue(ClaimTypes.Email)
            ?? context.Principal?.FindFirstValue("preferred_username")
            ?? context.Principal?.FindFirstValue("email");

        if (string.IsNullOrWhiteSpace(email))
        {
            context.Fail("The identity provider did not return an email address.");
            return;
        }

        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var db = context.HttpContext.RequestServices.GetRequiredService<AtsDbContext>();
        var (user, error) = await FindOrProvisionAtsUserAsync(
            db,
            configuration,
            email,
            context.Principal?.FindFirstValue(ClaimTypes.Name)
                ?? context.Principal?.FindFirstValue("name")
        );
        if (user is null)
        {
            context.Fail(error ?? "This account cannot access the ATS.");
            return;
        }

        context.Principal = CreatePrincipal(user, "oidc");
    }

    private static async Task<(AppUser? User, string? Error)> FindOrProvisionAtsUserAsync(
        AtsDbContext db,
        IConfiguration configuration,
        string email,
        string? displayName
    )
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var allowedDomains = configuration["Auth:AllowedEmailDomains"]?
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(x => x.TrimStart('@').ToLowerInvariant())
            .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];
        var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync();
        if (organization?.SetupCompleted == true && organization.AllowedEmailDomains.Length > 0)
            allowedDomains = organization.AllowedEmailDomains.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (allowedDomains.Count > 0 && !allowedDomains.Contains(normalizedEmail.Split('@').Last()))
            return (null, "This account is outside the configured company email domains.");

        var user = await db.Users.SingleOrDefaultAsync(x =>
            x.Email == normalizedEmail && x.IsActive
        );
        if (user is not null)
            return (user, null);
        if (await db.Users.AnyAsync(x => x.IsActive))
            return (null, "This account has not been invited to the ATS.");

        user = new AppUser
        {
            Email = normalizedEmail,
            DisplayName = (displayName ?? normalizedEmail.Split('@')[0]).Trim(),
            Role = UserRole.Admin,
        };
        db.Users.Add(user);
        db.Organizations.Add(new MyThorneAI.Ats.Api.Domain.Organization
        {
            Name = "Your organization",
            OwnerEmail = normalizedEmail,
            SetupCompleted = false,
        });
        await db.SaveChangesAsync();
        return (user, null);
    }

    private static async Task ValidateSessionAsync(CookieValidatePrincipalContext context)
    {
        var email = context.Principal?.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email))
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(
                CookieAuthenticationDefaults.AuthenticationScheme
            );
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<AtsDbContext>();
        var user = await db
            .Users.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
        if (user is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(
                CookieAuthenticationDefaults.AuthenticationScheme
            );
            return;
        }

        var currentRole = context.Principal?.FindFirstValue(ClaimTypes.Role);
        var currentName = context.Principal?.FindFirstValue(ClaimTypes.Name);
        if (currentRole != user.Role.ToString() || currentName != user.DisplayName)
        {
            context.ReplacePrincipal(
                CreatePrincipal(user, context.Principal?.Identity?.AuthenticationType ?? "cookie")
            );
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
            new Claim("ats_user_id", user.Id.ToString()),
        };
        return new ClaimsPrincipal(new ClaimsIdentity(claims, authenticationType));
    }

    private static void ValidateOidcConfiguration(IConfiguration configuration)
    {
        var missing = new[] { "Auth:Authority", "Auth:ClientId", "Auth:ClientSecret" }
            .Where(key => string.IsNullOrWhiteSpace(configuration[key]))
            .ToArray();
        if (missing.Length > 0)
            throw new InvalidOperationException(
                $"OIDC configuration is incomplete. Missing: {string.Join(", ", missing)}."
            );

        if (
            !Uri.TryCreate(configuration["Auth:Authority"], UriKind.Absolute, out var authority)
            || authority.Scheme != Uri.UriSchemeHttps
        )
            throw new InvalidOperationException("Auth:Authority must be an absolute HTTPS URL.");
    }

    private static void ValidateWorkOsConfiguration(IConfiguration configuration)
    {
        var missing = new[] { "Auth:WorkOS:ApiKey", "Auth:WorkOS:ClientId", "Auth:WorkOS:RedirectUri" }
            .Where(key => string.IsNullOrWhiteSpace(configuration[key]))
            .ToArray();
        if (missing.Length > 0)
            throw new InvalidOperationException(
                $"WorkOS configuration is incomplete. Missing: {string.Join(", ", missing)}."
            );

        if (
            !Uri.TryCreate(configuration["Auth:WorkOS:RedirectUri"], UriKind.Absolute, out var redirectUri)
            || redirectUri.Scheme != Uri.UriSchemeHttps
                && !string.Equals(redirectUri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
        )
            throw new InvalidOperationException("Auth:WorkOS:RedirectUri must be an absolute HTTPS URL (or localhost in development).");
    }
}
