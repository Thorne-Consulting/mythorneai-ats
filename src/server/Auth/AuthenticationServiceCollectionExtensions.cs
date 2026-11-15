using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
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
                    // Refusals and provider errors land on the sign-in page with a reason it can explain.
                    options.Events.OnRemoteFailure = context =>
                    {
                        var code = context.Failure?.Message;
                        context.Response.Redirect(
                            $"/login?error={(SignInErrors.Contains(code ?? "") ? code : "provider")}"
                        );
                        context.HandleResponse();
                        return Task.CompletedTask;
                    };
                }
            );
        }

        // Each policy is one capability from the person's role (Permissions), carried as claims.
        services
            .AddAuthorizationBuilder()
            .AddPolicy(AtsPolicies.Read, policy => policy.RequireRole(Enum.GetNames<UserRole>()))
            .AddPolicy(
                AtsPolicies.ManageHiring,
                policy => policy.RequireClaim(Permissions.Claim, Permissions.Jobs)
            )
            .AddPolicy(
                AtsPolicies.ManageCandidates,
                policy => policy.RequireClaim(Permissions.Claim, Permissions.Candidates)
            )
            .AddPolicy(
                AtsPolicies.SubmitScorecard,
                policy => policy.RequireRole(Enum.GetNames<UserRole>())
            )
            .AddPolicy(
                AtsPolicies.Admin,
                policy => policy.RequireClaim(Permissions.Claim, Permissions.Workspace)
            );

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
            context.Fail("provider");
            return;
        }

        var configuration =
            context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var db = context.HttpContext.RequestServices.GetRequiredService<AtsDbContext>();
        var (user, error, _) = await FindOrProvisionAtsUserAsync(
            db,
            configuration,
            email,
            context.Principal?.FindFirstValue(ClaimTypes.Name)
                ?? context.Principal?.FindFirstValue("name")
        );
        if (user is null)
        {
            await DenySignInAsync(db, email, error ?? "not_invited");
            context.Fail(error ?? "not_invited");
            return;
        }

        await CompleteSignInAsync(db, user, "Oidc");
        context.Principal = await CreatePrincipalAsync(db, user, "oidc");
    }

    /// <summary>Reasons a sign-in is refused. The /login page has a plain message for each.</summary>
    public static readonly HashSet<string> SignInErrors =
    [
        "not_invited",
        "domain",
        "pending",
        "declined",
        "deactivated",
        "method",
        "sso",
        "provider",
        "state",
    ];

    /// <summary>Whether the organization allows the way this person just signed in (WorkOS method names).</summary>
    public static bool MethodAllowed(
        MyThorneAI.Ats.Api.Domain.Organization? organization,
        string method
    ) =>
        organization is null
        || method switch
        {
            "GoogleOAuth" => organization.AllowGoogleLogin,
            "MicrosoftOAuth" => organization.AllowMicrosoftLogin,
            _ => true,
        };

    public static async Task CompleteSignInAsync(AtsDbContext db, AppUser user, string method)
    {
        // An invited person's first sign-in opens the welcome; the owner gets workspace setup instead.
        // Not for development test accounts, so screenshots and tests open straight on the page.
        if (
            user.LastSignInAt is null
            && method != "Development"
            && !await db.Organizations.AnyAsync(x => x.OwnerEmail == user.Email)
        )
            user.PreferencesJson = MyPreferences
                .Parse(user.PreferencesJson)
                .Merge(new(Welcome: true))
                .Serialize();
        user.LastSignInAt = DateTimeOffset.UtcNow;
        Audit.Add(db, user.Email, "User", user.Id, "SignedIn", new { Method = method });
        await db.SaveChangesAsync();
    }

    public static async Task DenySignInAsync(AtsDbContext db, string email, string reason)
    {
        Audit.Add(
            db,
            email.Trim().ToLowerInvariant(),
            "SignIn",
            email.Trim().ToLowerInvariant(),
            "SignInDenied",
            new { Reason = reason }
        );
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Finds the active member for this email, or explains why not with a code from
    /// <see cref="SignInErrors"/>. Someone uninvited at an allowed company domain becomes an access
    /// request. The very first person becomes the owner.
    /// </summary>
    public static async Task<(
        AppUser? User,
        string? Error,
        Guid? RequestId
    )> FindOrProvisionAtsUserAsync(
        AtsDbContext db,
        IConfiguration configuration,
        string email,
        string? displayName
    )
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var allowedDomains =
            configuration["Auth:AllowedEmailDomains"]
                ?.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.TrimStart('@').ToLowerInvariant())
                .ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? [];
        var organization = await db.Organizations.AsNoTracking().SingleOrDefaultAsync();
        if (organization?.SetupCompleted == true && organization.AllowedEmailDomains.Length > 0)
            allowedDomains = organization.AllowedEmailDomains.ToHashSet(
                StringComparer.OrdinalIgnoreCase
            );
        if (allowedDomains.Count > 0 && !allowedDomains.Contains(normalizedEmail.Split('@').Last()))
            return (null, "domain", null);

        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == normalizedEmail);
        if (user is { IsActive: true })
            return (user, null, null);
        if (user is not null)
            return (null, "deactivated", null);
        if (await db.Users.AnyAsync(x => x.IsActive))
        {
            // ponytail: requests only from a known company domain, so a stranger with a Google
            // account cannot fill the list. Without domains, an admin invites people instead.
            if (allowedDomains.Count == 0)
                return (null, "not_invited", null);
            var request = await db
                .AccessRequests.Where(x => x.Email == normalizedEmail)
                .OrderByDescending(x => x.CreatedAt)
                .FirstOrDefaultAsync();
            if (
                request is { Status: AccessRequestStatus.Declined }
                && request.DecidedAt > DateTimeOffset.UtcNow.AddDays(-7)
            )
                return (null, "declined", null);
            if (request is not { Status: AccessRequestStatus.Pending })
            {
                request = new AccessRequest
                {
                    Email = normalizedEmail,
                    Name = (
                        string.IsNullOrWhiteSpace(displayName)
                            ? normalizedEmail.Split('@')[0]
                            : displayName
                    ).Trim(),
                };
                db.AccessRequests.Add(request);
                Audit.Add(db, normalizedEmail, "AccessRequest", request.Id, "AccessRequested");
                var admins = await db
                    .Users.Where(x => x.IsActive && x.Role == UserRole.Admin)
                    .Select(x => x.Email)
                    .ToListAsync();
                await Notify.AddAsync(
                    db,
                    admins,
                    new NotificationDraft(
                        NotificationKinds.WorkspaceAlert,
                        $"{request.Name} asked to join {organization?.Name ?? "your workspace"}",
                        "/settings/members?tab=requests",
                        $"{request.Name} ({normalizedEmail}) tried to sign in and asked for access. Approve or decline it under Members, then Requests."
                    ),
                    CancellationToken.None
                );
                await db.SaveChangesAsync();
            }
            return (null, "pending", request.Id);
        }

        user = new AppUser
        {
            Email = normalizedEmail,
            DisplayName = (displayName ?? normalizedEmail.Split('@')[0]).Trim(),
            Role = UserRole.Admin,
        };
        db.Users.Add(user);
        db.Organizations.Add(
            new MyThorneAI.Ats.Api.Domain.Organization
            {
                Name = "Your organization",
                OwnerEmail = normalizedEmail,
                SetupCompleted = false,
            }
        );
        await db.SaveChangesAsync();
        return (user, null, null);
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
            .Include(x => x.CustomRole)
            .SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
        if (user is null)
        {
            context.RejectPrincipal();
            await context.HttpContext.SignOutAsync(
                CookieAuthenticationDefaults.AuthenticationScheme
            );
            return;
        }

        // A changed role, role capabilities, name or teams take effect on the next request.
        var permissions = Permissions.Of(user);
        var principal = context.Principal!;
        if (
            !Permissions.For(principal).SetEquals(permissions)
            || !principal
                .FindAll(ClaimTypes.Role)
                .Select(x => x.Value)
                .SequenceEqual(Permissions.RoleClaims(permissions))
            || principal.FindFirstValue(ClaimTypes.Name) != user.DisplayName
            || !principal.Departments().SequenceEqual(user.Departments)
        )
        {
            context.ReplacePrincipal(
                CreatePrincipal(
                    user,
                    permissions,
                    principal.Identity?.AuthenticationType ?? "cookie"
                )
            );
            context.ShouldRenew = true;
        }
    }

    /// <summary>The session for a member: their capabilities and the role claims the API's checks read.</summary>
    public static async Task<ClaimsPrincipal> CreatePrincipalAsync(
        AtsDbContext db,
        AppUser user,
        string authenticationType
    ) => CreatePrincipal(user, await Permissions.OfAsync(db, user), authenticationType);

    private static ClaimsPrincipal CreatePrincipal(
        AppUser user,
        string[] permissions,
        string authenticationType
    )
    {
        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Name, user.DisplayName),
            new Claim("ats_user_id", user.Id.ToString()),
        }
            .Concat(Permissions.RoleClaims(permissions).Select(x => new Claim(ClaimTypes.Role, x)))
            .Concat(permissions.Select(x => new Claim(Permissions.Claim, x)))
            .Concat(
                user.Departments.Select(x => new Claim(PrincipalExtensions.DepartmentClaim, x))
            );
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
        var missing = new[]
        {
            "Auth:WorkOS:ApiKey",
            "Auth:WorkOS:ClientId",
            "Auth:WorkOS:RedirectUri",
        }
            .Where(key => string.IsNullOrWhiteSpace(configuration[key]))
            .ToArray();
        if (missing.Length > 0)
            throw new InvalidOperationException(
                $"WorkOS configuration is incomplete. Missing: {string.Join(", ", missing)}."
            );

        if (
            !Uri.TryCreate(
                configuration["Auth:WorkOS:RedirectUri"],
                UriKind.Absolute,
                out var redirectUri
            )
            || redirectUri.Scheme != Uri.UriSchemeHttps
                && !string.Equals(redirectUri.Host, "localhost", StringComparison.OrdinalIgnoreCase)
        )
            throw new InvalidOperationException(
                "Auth:WorkOS:RedirectUri must be an absolute HTTPS URL (or localhost in development)."
            );
    }
}
