using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private const string WrongCode =
        "That code is wrong or too old. Check the newest email from us and try again.";

    private static void MapPublicCandidateAccess(RouteGroupBuilder api)
    {
        // The code from an application email: confirms that application (if it still needs it) and signs in.
        api.MapPost(
            "/applications/verify",
            async (
                VerifyApplicationRequest request,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    string.IsNullOrWhiteSpace(request.Email)
                    || string.IsNullOrWhiteSpace(request.Code)
                )
                    return Results.BadRequest(new { message = WrongCode });
                var email = request.Email.Trim().ToLowerInvariant();
                // Each application has its own code, so applying for a second job never breaks the first one's.
                var applications = await db
                    .Applications.Include(x => x.Candidate)
                    .Where(x =>
                        x.Candidate!.Email == email
                        && x.VerificationCodeHash != null
                        && (request.ApplicationId == null || x.Id == request.ApplicationId)
                    )
                    .ToListAsync(ct);
                var match = applications.FirstOrDefault(x =>
                    x.VerificationAttempts < 5
                    && ValidCode(
                        x.VerificationCodeHash,
                        x.VerificationExpiresAt,
                        request.Code.Trim()
                    )
                );
                if (match is null)
                {
                    applications.ForEach(x => x.VerificationAttempts++);
                    await db.SaveChangesAsync(ct);
                    return Results.BadRequest(new { message = WrongCode });
                }
                await ApplicationIntake.ConfirmAsync(db, match, ct);
                match.Candidate!.TimeZone = Zone(request.TimeZone) ?? match.Candidate.TimeZone;
                var token = await CreateSessionAsync(http, db, match.CandidateId, ct);
                return Results.Ok(new { token, applicationId = match.Id });
            }
        );

        // The one-time link in an application email. Used or expired links say so and hand back the
        // address, so the page can offer a sign-in code instead.
        api.MapPost(
            "/magic",
            async (
                MagicLinkRequest request,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var raw = request.Token?.Trim() ?? "";
                var link = raw.Length is > 0 and <= 128
                    ? await db
                        .CandidateMagicLinks.Include(x => x.Candidate)
                        .SingleOrDefaultAsync(x => x.TokenHash == Hash(raw), ct)
                    : null;
                if (link?.Candidate is null)
                    return Results.BadRequest(
                        new
                        {
                            message = "This link does not work. Sign in with your email instead.",
                        }
                    );
                if (link.UsedAt is not null || link.ExpiresAt <= DateTimeOffset.UtcNow)
                    return Results.Json(
                        new
                        {
                            message = "This link was already used or is too old. We can email you a sign-in code instead.",
                            email = link.Candidate.Email,
                            // Where the link pointed, so a person who is still signed in goes straight there.
                            path = LinkPath(link),
                        },
                        statusCode: StatusCodes.Status410Gone
                    );
                link.UsedAt = DateTimeOffset.UtcNow;
                var application = link.ApplicationId is { } id
                    ? await db
                        .Applications.Include(x => x.Candidate)
                        .SingleOrDefaultAsync(
                            x => x.Id == id && x.CandidateId == link.CandidateId,
                            ct
                        )
                    : null;
                if (application is not null)
                    await ApplicationIntake.ConfirmAsync(db, application, ct);
                link.Candidate.TimeZone = Zone(request.TimeZone) ?? link.Candidate.TimeZone;
                var token = await CreateSessionAsync(http, db, link.CandidateId, ct);
                return Results.Ok(
                    new
                    {
                        token,
                        applicationId = application?.Id,
                        path = LinkPath(link),
                    }
                );
            }
        );

        api.MapPost(
            "/portal/access-code",
            async (
                RequestPortalCodeRequest request,
                AtsDbContext db,
                IHostEnvironment environment,
                CancellationToken ct
            ) =>
            {
                var emailAddress = request.Email?.Trim().ToLowerInvariant() ?? "";
                var candidate = await db.Candidates.SingleOrDefaultAsync(
                    x => x.Email == emailAddress,
                    ct
                );
                if (candidate is not null)
                {
                    var code = CandidateCodes.New(emailAddress, environment);
                    candidate.PortalCodeHash = Hash(code);
                    candidate.PortalCodeExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15);
                    candidate.PortalCodeAttempts = 0;
                    // A one-click link too, to the page the person was trying to open.
                    var link = await CandidateLinks.CreateAsync(
                        db,
                        candidate.Id,
                        null,
                        CandidateLinks.SafePath(request.Next) ?? "/candidate-portal/home",
                        ct
                    );
                    // Through the outbox, so a bounced address is skipped and a failed send is retried.
                    var email = await EmailTemplates.RenderAsync(
                        db,
                        "portal-code",
                        null,
                        new Dictionary<string, string>
                        {
                            ["firstName"] = candidate.FirstName,
                            ["code"] = code,
                            ["signInLink"] = link ?? "",
                        },
                        ct
                    );
                    db.EmailOutbox.Add(
                        new EmailOutboxItem
                        {
                            Recipient = emailAddress,
                            Subject = email.Subject,
                            Body = email.Body,
                            TemplateKey = email.Key,
                            TemplateVersion = email.Version,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                }
                return Results.Accepted(
                    value: new { message = "If that email is on file, a code is on its way." }
                );
            }
        );

        api.MapPost(
            "/portal/verify",
            async (
                VerifyApplicationRequest request,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    string.IsNullOrWhiteSpace(request.Email)
                    || string.IsNullOrWhiteSpace(request.Code)
                )
                    return Results.BadRequest(new { message = "The code is invalid or expired." });
                var candidate = await db.Candidates.SingleOrDefaultAsync(
                    x => x.Email == request.Email.Trim().ToLowerInvariant(),
                    ct
                );
                if (candidate is null || candidate.PortalCodeAttempts >= 5)
                    return Results.BadRequest(new { message = "The code is invalid or expired." });
                candidate.PortalCodeAttempts++;
                if (
                    !ValidCode(
                        candidate.PortalCodeHash,
                        candidate.PortalCodeExpiresAt,
                        request.Code.Trim()
                    )
                )
                {
                    await db.SaveChangesAsync(ct);
                    return Results.BadRequest(new { message = "The code is invalid or expired." });
                }
                candidate.PortalCodeHash = null;
                candidate.PortalCodeExpiresAt = null;
                candidate.PortalCodeAttempts = 0;
                candidate.TimeZone = Zone(request.TimeZone) ?? candidate.TimeZone;
                var token = await CreateSessionAsync(http, db, candidate.Id, ct);
                return Results.Ok(new { token });
            }
        );
    }

    private static bool ValidCode(string? hash, DateTimeOffset? expiresAt, string code) =>
        expiresAt > DateTimeOffset.UtcNow
        && !string.IsNullOrWhiteSpace(hash)
        && CryptographicOperations.FixedTimeEquals(
            Convert.FromHexString(hash),
            Convert.FromHexString(Hash(code))
        );

    // Where a link opens: its saved page, else its application, else Home.
    private static string LinkPath(CandidateMagicLink link) =>
        CandidateLinks.SafePath(link.Path)
        ?? (
            link.ApplicationId is { } id
                ? CandidateLinks.ApplicationPath(id)
                : "/candidate-portal/home"
        );
}
