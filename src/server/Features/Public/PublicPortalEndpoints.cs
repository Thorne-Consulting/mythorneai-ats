using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicPortal(RouteGroupBuilder api)
    {
        api.MapGet("/portal", async ([FromHeader(Name = "X-Candidate-Session")] string? token, AtsDbContext db, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(token)) return Results.Unauthorized();
            var session = await db.CandidatePortalSessions.Include(x => x.Candidate)
                .SingleOrDefaultAsync(x => x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow, ct);
            if (session?.Candidate is null) return Results.Unauthorized();
            var applications = await db.Applications.AsNoTracking()
                .Where(x => x.CandidateId == session.CandidateId && x.Status != ApplicationStatus.PendingVerification)
                .OrderByDescending(x => x.LastActivityAt)
                .Select(x => new
                {
                    x.Id,
                    x.RequisitionId,
                    JobTitle = x.Requisition!.Title,
                    Stage = x.PipelineStage!.Name,
                    Status = x.Status.ToString(),
                    x.AppliedAt,
                    x.LastActivityAt,
                    Interviews = x.Interviews.Where(i => i.Status == InterviewStatus.Scheduled)
                        .Select(i => new { i.Id, i.Title, i.StartsAt, i.EndsAt, i.TimeZone, i.MeetingLink }),
                    ProposedInterviews = x.Interviews.Where(i => i.Status == InterviewStatus.Proposed)
                        .Select(i => new { i.Id, i.Title, i.StartsAt, i.EndsAt, i.TimeZone }),
                    Messages = db.EmailOutbox.Where(message =>
                            message.ApplicationId == x.Id
                            && message.Recipient == session.Candidate.Email
                            && message.Status == EmailOutboxStatus.Succeeded)
                        .OrderByDescending(message => message.CreatedAt)
                        .Take(25)
                        .Select(message => new { message.Subject, message.Body, message.CreatedAt })
                })
                .ToListAsync(ct);
            return Results.Ok(new { candidate = new { session.Candidate.FirstName, session.Candidate.LastName }, applications });
        });
    }
}
