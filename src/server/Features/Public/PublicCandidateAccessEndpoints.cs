using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicCandidateAccess(RouteGroupBuilder api)
    {
        api.MapPost("/applications/verify", async (VerifyApplicationRequest request, AtsDbContext db, CancellationToken ct) =>
        {
            var application = await db.Applications.Include(x => x.Candidate)
                .Where(x => x.Candidate!.Email == request.Email.Trim().ToLowerInvariant() && x.Status == ApplicationStatus.PendingVerification)
                .OrderByDescending(x => x.AppliedAt).FirstOrDefaultAsync(ct);
            if (application is null || !ValidCode(application.VerificationCodeHash, application.VerificationExpiresAt, request.Code))
                return Results.BadRequest(new { message = "The code is invalid or expired." });
            application.Status = ApplicationStatus.Active; application.VerifiedAt = DateTimeOffset.UtcNow;
            application.VerificationCodeHash = null; application.VerificationExpiresAt = null;
            var token = await CreateSessionAsync(db, application.CandidateId, ct);
            return Results.Ok(new { token, applicationId = application.Id });
        });

        api.MapPost("/portal/access-code", async (RequestPortalCodeRequest request, AtsDbContext db, IEmailSender email, CancellationToken ct) =>
        {
            var emailAddress = request.Email.Trim().ToLowerInvariant();
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == emailAddress, ct);
            if (candidate is not null)
            {
                var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
                candidate.PortalCodeHash = Hash(code); candidate.PortalCodeExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15);
                await db.SaveChangesAsync(ct);
                await email.SendAsync(emailAddress, "Your candidate portal sign-in code", $"Your sign-in code is {code}. It expires in 15 minutes.", ct);
            }
            return Results.Accepted(value: new { message = "If that email is on file, a code is on its way." });
        });

        api.MapPost("/portal/verify", async (VerifyApplicationRequest request, AtsDbContext db, CancellationToken ct) =>
        {
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == request.Email.Trim().ToLowerInvariant(), ct);
            if (candidate is null || !ValidCode(candidate.PortalCodeHash, candidate.PortalCodeExpiresAt, request.Code))
                return Results.BadRequest(new { message = "The code is invalid or expired." });
            candidate.PortalCodeHash = null; candidate.PortalCodeExpiresAt = null;
            var token = await CreateSessionAsync(db, candidate.Id, ct);
            return Results.Ok(new { token });
        });
    }

    private static bool ValidCode(string? hash, DateTimeOffset? expiresAt, string code) =>
        expiresAt > DateTimeOffset.UtcNow && !string.IsNullOrWhiteSpace(hash)
        && CryptographicOperations.FixedTimeEquals(Convert.FromHexString(hash), Convert.FromHexString(Hash(code)));

    private static async Task<string> CreateSessionAsync(AtsDbContext db, Guid candidateId, CancellationToken ct)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.CandidatePortalSessions.Add(new CandidatePortalSession { CandidateId = candidateId, TokenHash = Hash(token), ExpiresAt = DateTimeOffset.UtcNow.AddDays(30) });
        await db.SaveChangesAsync(ct);
        return token;
    }
}
