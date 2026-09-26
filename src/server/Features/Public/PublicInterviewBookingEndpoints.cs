using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicInterviewBooking(RouteGroupBuilder api)
    {
        api.MapPost(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/book",
            async (
                Guid applicationId,
                Guid interviewId,
                HttpRequest http,
                AtsDbContext db,
                IWorkplaceIntegration integration,
                CancellationToken ct
            ) =>
            {
                var token = http.Headers["X-Candidate-Session"].FirstOrDefault();
                if (string.IsNullOrWhiteSpace(token))
                    return Results.Unauthorized();
                var candidateId = await db
                    .CandidatePortalSessions.Where(x =>
                        x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow
                    )
                    .Select(x => (Guid?)x.CandidateId)
                    .SingleOrDefaultAsync(ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var interview = await db
                    .Interviews.Include(x => x.Application)
                        .ThenInclude(x => x!.Candidate)
                    .Include(x => x.Application)
                        .ThenInclude(x => x!.Requisition)
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == interviewId
                            && x.ApplicationId == applicationId
                            && x.Application!.CandidateId == candidateId
                            && x.Status == InterviewStatus.Proposed,
                        ct
                    );
                if (interview is null)
                    return Results.NotFound();
                var otherSlots = await db
                    .Interviews.Where(x =>
                        x.ApplicationId == applicationId
                        && x.Status == InterviewStatus.Proposed
                        && x.Id != interviewId
                    )
                    .ToListAsync(ct);
                foreach (var slot in otherSlots)
                    slot.Status = InterviewStatus.Cancelled;
                interview.Status = InterviewStatus.Scheduled;
                interview.CalendarStatus = integration.IsEnabled ? "Queued" : "NotConfigured";
                interview.CalendarProvider = integration.IsEnabled
                    ? integration.ProviderName
                    : null;
                interview.Application!.LastActivityAt = DateTimeOffset.UtcNow;
                QueueEmail(
                    db,
                    interview.Application.Candidate!.Email,
                    $"Interview booked for {interview.Application.Requisition!.Title}",
                    $"Your interview, {interview.Title}, is booked for {interview.StartsAt:u}."
                );
                if (integration.IsEnabled)
                    db.IntegrationOutbox.Add(
                        new IntegrationOutboxItem
                        {
                            Operation = IntegrationOperation.CreateCalendarEvent,
                            EntityId = interview.Id,
                        }
                    );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { interview.Id });
            }
        );
    }
}
