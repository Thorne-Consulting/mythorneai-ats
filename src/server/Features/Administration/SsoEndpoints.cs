using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using WorkOS;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SsoPortalLinkRequest(string Intent);

/// <summary>
/// Single sign-on through WorkOS. The customer's IT admin sets up their identity provider and
/// proves they own their domain in WorkOS's own hosted pages (the Admin Portal); we only keep the
/// WorkOS organization id and the "require single sign-on" switch.
/// </summary>
public static partial class AtsEndpoints
{
    private static void MapSso(RouteGroupBuilder api)
    {
        var sso = api.MapGroup("/admin/sso").RequireAuthorization(AtsPolicies.Admin);

        sso.MapGet(
            "",
            async (
                IServiceProvider services,
                IConfiguration configuration,
                IHostEnvironment environment,
                AtsDbContext db,
                ILoggerFactory loggers,
                CancellationToken ct
            ) =>
            {
                var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
                var mode = AuthMode(configuration, environment);
                var last = await db
                    .AuditEvents.AsNoTracking()
                    .Where(x =>
                        x.Action == "SignedIn"
                        && x.Details != null
                        && x.Details.Contains("\"Method\":\"SSO\"")
                    )
                    .OrderByDescending(x => x.OccurredAt)
                    .Select(x => new { x.ActorEmail, x.OccurredAt })
                    .FirstOrDefaultAsync(ct);
                object[] connections = [];
                object[] domains = [];
                string? problem = null;
                var client = WorkOs(services, configuration, environment);
                if (client is not null && organization.WorkOsOrganizationId is { } orgId)
                {
                    try
                    {
                        var found = await client.SSO.ListConnectionsAsync(
                            new SSOListConnectionsOptions { OrganizationId = orgId },
                            cancellationToken: ct
                        );
                        connections =
                        [
                            .. (found.Data ?? []).Select(x => new
                            {
                                x.Name,
                                Type = $"{x.ConnectionType}",
                                State = $"{x.State}",
                            }),
                        ];
                        domains =
                        [
                            .. (await VerifiedDomainsAsync(client, orgId, ct)).Select(x => new
                            {
                                x.Domain,
                                x.State,
                            }),
                        ];
                    }
                    catch (Exception exception)
                        when (exception is WorkOS.ApiException or HttpRequestException)
                    {
                        loggers
                            .CreateLogger("Sso")
                            .LogWarning(exception, "Could not read single sign-on from WorkOS.");
                        problem = "We couldn’t reach WorkOS just now. Try again in a minute.";
                    }
                }
                return Results.Ok(
                    new
                    {
                        AuthMode = mode,
                        Authority = mode == "Oidc" ? configuration["Auth:Authority"] : null,
                        Linked = organization.WorkOsOrganizationId is not null,
                        Connections = connections,
                        Domains = domains,
                        organization.RequireSso,
                        organization.AllowGoogleLogin,
                        organization.AllowMicrosoftLogin,
                        OwnerEmail = organization.OwnerEmail,
                        LastSsoSignIn = last is null
                            ? null
                            : new
                            {
                                Email = last.ActorEmail,
                                Name = await db
                                    .Users.Where(x => x.Email == last.ActorEmail)
                                    .Select(x => x.DisplayName)
                                    .FirstOrDefaultAsync(ct),
                                At = last.OccurredAt,
                            },
                        Problem = problem,
                    }
                );
            }
        );

        // A one-time link to WorkOS's hosted setup, opened in a new tab.
        sso.MapPost(
            "/portal-link",
            async (
                SsoPortalLinkRequest request,
                HttpContext context,
                ClaimsPrincipal principal,
                IServiceProvider services,
                IConfiguration configuration,
                IHostEnvironment environment,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                GenerateLinkIntent? intent = request.Intent switch
                {
                    "sso" => GenerateLinkIntent.SSO,
                    "domain_verification" => GenerateLinkIntent.DomainVerification,
                    _ => null,
                };
                if (intent is null)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["intent"] = ["Pick single sign-on or domain verification."],
                        }
                    );
                var client = WorkOs(services, configuration, environment);
                if (client is null)
                    return Results.Conflict(
                        new
                        {
                            message = "Single sign-on set-up needs sign-in through WorkOS. Ask whoever runs MyThorneAI for you.",
                        }
                    );
                var organization = await db.Organizations.SingleAsync(ct);
                try
                {
                    if (organization.WorkOsOrganizationId is null)
                    {
                        var created = await client.Organizations.CreateAsync(
                            new OrganizationsCreateOptions
                            {
                                Name = organization.Name,
                                ExternalId = organization.Id.ToString(),
                            },
                            cancellationToken: ct
                        );
                        organization.WorkOsOrganizationId = created.Id;
                    }
                    var back = $"{BaseUrl(organization, context)}/settings/sso";
                    var link = await client.AdminPortal.GenerateLinkAsync(
                        new AdminPortalGenerateLinkOptions
                        {
                            Organization = organization.WorkOsOrganizationId,
                            Intent = intent.Value,
                            ReturnUrl = back,
                            SuccessUrl = back,
                        },
                        cancellationToken: ct
                    );
                    Audit.Add(
                        db,
                        principal,
                        "Organization",
                        organization.Id,
                        "SsoSetupOpened",
                        new { request.Intent }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { link.Link });
                }
                catch (Exception exception)
                    when (exception is WorkOS.ApiException or HttpRequestException)
                {
                    return Results.Json(
                        new
                        {
                            message = "We couldn’t reach WorkOS just now. Try again in a minute.",
                        },
                        statusCode: StatusCodes.Status502BadGateway
                    );
                }
            }
        );
    }

    // Only when people actually sign in through WorkOS: a development copy may hold WorkOS keys in
    // its .env file, and must never create organizations in that account.
    private static WorkOSClient? WorkOs(
        IServiceProvider services,
        IConfiguration configuration,
        IHostEnvironment environment
    ) =>
        AuthMode(configuration, environment).Equals("WorkOS", StringComparison.OrdinalIgnoreCase)
            ? services.GetService<WorkOSClient>()
            : null;

    private static string AuthMode(IConfiguration configuration, IHostEnvironment environment) =>
        configuration["Auth:Mode"] ?? (environment.IsDevelopment() ? "Development" : "WorkOS");

    private static string BaseUrl(Domain.Organization organization, HttpContext context) =>
        string.IsNullOrWhiteSpace(organization.PublicUrl)
            ? $"{context.Request.Scheme}://{context.Request.Host}"
            : organization.PublicUrl.TrimEnd('/');

    /// <summary>The domains on the WorkOS organization and whether each is verified.</summary>
    public static async Task<List<(string Domain, string State)>> VerifiedDomainsAsync(
        WorkOSClient client,
        string organizationId,
        CancellationToken ct
    )
    {
        var organization = await client.Organizations.GetAsync(
            organizationId,
            cancellationToken: ct
        );
        return
        [
            .. (organization.Domains ?? []).Select(x =>
                (x.Domain.ToLowerInvariant(), IsVerified($"{x.State}") ? "Verified" : "Pending")
            ),
        ];
    }

    private static bool IsVerified(string state) =>
        state.Equals("Verified", StringComparison.OrdinalIgnoreCase)
        || state.Equals("LegacyVerified", StringComparison.OrdinalIgnoreCase);
}
