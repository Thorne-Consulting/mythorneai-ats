using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static class PublicEndpoints
{
    public static void MapPublicEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/public");

        api.MapGet("/jobs/{id:guid}", async (Guid id, AtsDbContext db, CancellationToken ct) =>
        {
            var job = await db.Requisitions.AsNoTracking()
                .Where(x => x.Id == id && x.Status == RequisitionStatus.Open)
                .Select(x => new
                {
                    x.Id, x.Code, x.Title, x.Department, x.Location, x.EmploymentType,
                    x.WorkMode, x.Openings, x.Description, x.TargetStartDate,
                })
                .SingleOrDefaultAsync(ct);
            return job is null ? Results.NotFound() : Results.Ok(job);
        });

        api.MapPost("/jobs/{id:guid}/applications", async (
            Guid id,
            PublicApplyRequest request,
            AtsDbContext db,
            IEmailSender email,
            CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.FirstName) || string.IsNullOrWhiteSpace(request.LastName)
                || !LooksLikeEmail(request.Email))
                return Results.ValidationProblem(new Dictionary<string, string[]> {
                    ["application"] = ["First name, last name, and a valid email are required."]
                });

            var job = await db.Requisitions.Include(x => x.Stages)
                .SingleOrDefaultAsync(x => x.Id == id && x.Status == RequisitionStatus.Open, ct);
            if (job is null) return Results.NotFound();

            var emailAddress = request.Email.Trim().ToLowerInvariant();
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == emailAddress, ct);
            if (candidate is not null && await db.Applications.AnyAsync(
                x => x.CandidateId == candidate.Id && x.RequisitionId == id
                    && x.Status != ApplicationStatus.PendingVerification, ct))
                return Results.Accepted(value: new { message = "Check your email for a confirmation code." });
            if (candidate is null)
            {
                candidate = new Candidate
                {
                    FirstName = request.FirstName.Trim(), LastName = request.LastName.Trim(),
                    Email = emailAddress, Source = "Career site", Phone = Clean(request.Phone),
                    Location = Clean(request.Location), LinkedInUrl = Clean(request.LinkedInUrl),
                };
                db.Candidates.Add(candidate);
            }
            else
            {
                candidate.FirstName = request.FirstName.Trim();
                candidate.LastName = request.LastName.Trim();
                candidate.Phone = Clean(request.Phone) ?? candidate.Phone;
                candidate.Location = Clean(request.Location) ?? candidate.Location;
                candidate.LinkedInUrl = Clean(request.LinkedInUrl) ?? candidate.LinkedInUrl;
                candidate.UpdatedAt = DateTimeOffset.UtcNow;
            }

            var application = await db.Applications
                .SingleOrDefaultAsync(x => x.CandidateId == candidate.Id && x.RequisitionId == id
                    && x.Status == ApplicationStatus.PendingVerification, ct);
            if (application is null)
            {
                var firstStage = job.Stages.OrderBy(x => x.SortOrder).First();
                application = new Application
                {
                    Candidate = candidate, RequisitionId = id, PipelineStageId = firstStage.Id,
                    Source = "Career site", Status = ApplicationStatus.PendingVerification,
                };
                db.Applications.Add(application);
            }

            var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
            application.VerificationCodeHash = Hash(code);
            application.VerificationExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15);
            application.LastActivityAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
            await email.SendAsync(emailAddress, $"Confirm your application for {job.Title}",
                $"Your confirmation code is {code}. It expires in 15 minutes.", ct);
            return Results.Accepted(value: new { message = "Check your email for a confirmation code." });
        });

        api.MapPost("/applications/verify", async (
            VerifyApplicationRequest request,
            AtsDbContext db,
            CancellationToken ct) =>
        {
            var emailAddress = request.Email.Trim().ToLowerInvariant();
            var application = await db.Applications.Include(x => x.Candidate)
                .Where(x => x.Candidate!.Email == emailAddress && x.Status == ApplicationStatus.PendingVerification)
                .OrderByDescending(x => x.AppliedAt).FirstOrDefaultAsync(ct);
            if (application is null || application.VerificationExpiresAt < DateTimeOffset.UtcNow
                || string.IsNullOrWhiteSpace(application.VerificationCodeHash)
                || !CryptographicOperations.FixedTimeEquals(
                    Convert.FromHexString(application.VerificationCodeHash),
                    Convert.FromHexString(Hash(request.Code))))
                return Results.BadRequest(new { message = "The code is invalid or expired." });

            application.Status = ApplicationStatus.Active;
            application.VerifiedAt = DateTimeOffset.UtcNow;
            application.VerificationCodeHash = null;
            application.VerificationExpiresAt = null;
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.CandidatePortalSessions.Add(new CandidatePortalSession
            {
                CandidateId = application.CandidateId, TokenHash = Hash(token),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { token, applicationId = application.Id });
        });

        api.MapPost("/portal/access-code", async (
            RequestPortalCodeRequest request,
            AtsDbContext db,
            IEmailSender email,
            CancellationToken ct) =>
        {
            var emailAddress = request.Email.Trim().ToLowerInvariant();
            var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Email == emailAddress, ct);
            if (candidate is not null)
            {
                var code = RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
                candidate.PortalCodeHash = Hash(code);
                candidate.PortalCodeExpiresAt = DateTimeOffset.UtcNow.AddMinutes(15);
                await db.SaveChangesAsync(ct);
                await email.SendAsync(emailAddress, "Your candidate portal sign-in code",
                    $"Your sign-in code is {code}. It expires in 15 minutes.", ct);
            }
            return Results.Accepted(value: new { message = "If that email is on file, a code is on its way." });
        });

        api.MapPost("/portal/verify", async (
            VerifyApplicationRequest request,
            AtsDbContext db,
            CancellationToken ct) =>
        {
            var candidate = await db.Candidates.SingleOrDefaultAsync(
                x => x.Email == request.Email.Trim().ToLowerInvariant(), ct);
            if (candidate is null || candidate.PortalCodeExpiresAt < DateTimeOffset.UtcNow
                || string.IsNullOrWhiteSpace(candidate.PortalCodeHash)
                || !CryptographicOperations.FixedTimeEquals(
                    Convert.FromHexString(candidate.PortalCodeHash),
                    Convert.FromHexString(Hash(request.Code))))
                return Results.BadRequest(new { message = "The code is invalid or expired." });

            candidate.PortalCodeHash = null;
            candidate.PortalCodeExpiresAt = null;
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
            db.CandidatePortalSessions.Add(new CandidatePortalSession
            {
                CandidateId = candidate.Id, TokenHash = Hash(token),
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(30),
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { token });
        });

        api.MapGet("/portal", async (HttpRequest http, AtsDbContext db, CancellationToken ct) =>
        {
            var token = http.Headers["X-Candidate-Session"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(token)) return Results.Unauthorized();
            var session = await db.CandidatePortalSessions.Include(x => x.Candidate)
                .SingleOrDefaultAsync(x => x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow, ct);
            if (session?.Candidate is null) return Results.Unauthorized();
            var applications = await db.Applications.AsNoTracking()
                .Where(x => x.CandidateId == session.CandidateId && x.Status != ApplicationStatus.PendingVerification)
                .OrderByDescending(x => x.LastActivityAt)
                .Select(x => new { x.Id, x.RequisitionId, JobTitle = x.Requisition!.Title,
                    Stage = x.PipelineStage!.Name, Status = x.Status.ToString(), x.AppliedAt,
                    x.LastActivityAt, Interviews = x.Interviews.Where(i => i.Status == InterviewStatus.Scheduled)
                        .Select(i => new { i.Id, i.Title, i.StartsAt, i.EndsAt, i.TimeZone, i.MeetingLink }),
                    ProposedInterviews = x.Interviews.Where(i => i.Status == InterviewStatus.Proposed)
                        .Select(i => new { i.Id, i.Title, i.StartsAt, i.EndsAt, i.TimeZone }) })
                .ToListAsync(ct);
            return Results.Ok(new { candidate = new { session.Candidate.FirstName, session.Candidate.LastName }, applications });
        });

        api.MapPost("/applications/{applicationId:guid}/interviews/{interviewId:guid}/book", async (
            Guid applicationId,
            Guid interviewId,
            HttpRequest http,
            AtsDbContext db,
            IWorkplaceIntegration integration,
            CancellationToken ct) =>
        {
            var token = http.Headers["X-Candidate-Session"].FirstOrDefault();
            if (string.IsNullOrWhiteSpace(token)) return Results.Unauthorized();
            var candidateId = await db.CandidatePortalSessions
                .Where(x => x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow)
                .Select(x => (Guid?)x.CandidateId).SingleOrDefaultAsync(ct);
            if (candidateId is null) return Results.Unauthorized();
            var interview = await db.Interviews.Include(x => x.Application)
                .SingleOrDefaultAsync(x => x.Id == interviewId && x.ApplicationId == applicationId
                    && x.Application!.CandidateId == candidateId && x.Status == InterviewStatus.Proposed, ct);
            if (interview is null) return Results.NotFound();
            var otherSlots = await db.Interviews.Where(x => x.ApplicationId == applicationId && x.Status == InterviewStatus.Proposed && x.Id != interviewId).ToListAsync(ct);
            foreach (var slot in otherSlots) slot.Status = InterviewStatus.Cancelled;
            interview.Status = InterviewStatus.Scheduled;
            interview.CalendarStatus = integration.IsEnabled ? "Queued" : "NotConfigured";
            interview.CalendarProvider = integration.IsEnabled ? integration.ProviderName : null;
            interview.Application!.LastActivityAt = DateTimeOffset.UtcNow;
            if (integration.IsEnabled) db.IntegrationOutbox.Add(new IntegrationOutboxItem
            {
                Operation = IntegrationOperation.CreateCalendarEvent, EntityId = interview.Id,
            });
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { interview.Id });
        });
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static bool LooksLikeEmail(string value) => !string.IsNullOrWhiteSpace(value) && value.Contains('@') && value.Length <= 320;
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
