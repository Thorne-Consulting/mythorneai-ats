using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicInterviewBooking(RouteGroupBuilder api)
    {
        api.MapGet(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/availability",
            async (
                Guid applicationId,
                Guid interviewId,
                HttpRequest http,
                AtsDbContext db,
                IUserCalendarService userCalendars,
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
                    .Interviews.AsNoTracking()
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
                var from = interview.StartsAt.Date;
                var availability = await userCalendars.FindCommonAvailabilityAsync(
                    interview.InterviewerEmails,
                    from,
                    from.AddDays(14),
                    interview.EndsAt - interview.StartsAt,
                    TimeSpan.FromMinutes(30),
                    ct
                );
                return Results.Ok(availability);
            }
        );

        api.MapPost(
            "/applications/{applicationId:guid}/interviews/{interviewId:guid}/book",
            async (
                Guid applicationId,
                Guid interviewId,
                BookInterviewRequest? request,
                HttpRequest http,
                AtsDbContext db,
                IWorkplaceIntegration integration,
                IUserCalendarService userCalendars,
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
                    .ThenInclude(x => x!.Stages)
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
                if (request?.StartsAt is not null || request?.EndsAt is not null)
                {
                    if (
                        request.StartsAt is null
                        || request.EndsAt is null
                        || request.EndsAt <= request.StartsAt
                    )
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["time"] = ["A valid start and end time are required."],
                            }
                        );
                    var availability = await userCalendars.FindCommonAvailabilityAsync(
                        interview.InterviewerEmails,
                        request.StartsAt.Value,
                        request.EndsAt.Value,
                        request.EndsAt.Value - request.StartsAt.Value,
                        TimeSpan.FromMinutes(1),
                        ct
                    );
                    if (
                        availability.MissingConnections.Count == 0
                        && !availability.Slots.Any(slot =>
                            slot.StartsAt == request.StartsAt && slot.EndsAt == request.EndsAt
                        )
                    )
                        return Results.Conflict(new { message = "That time is no longer available." });
                    interview.StartsAt = request.StartsAt.Value;
                    interview.EndsAt = request.EndsAt.Value;
                }
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
                var bookedStage = interview.Application.Requisition!.Stages.FirstOrDefault(stage =>
                    stage.Name.Equals("Booked", StringComparison.OrdinalIgnoreCase)
                );
                if (bookedStage is not null)
                    interview.Application.PipelineStageId = bookedStage.Id;
                QueueEmail(
                    db,
                    interview.Application.Candidate!.Email,
                    $"Interview booked for {interview.Application.Requisition!.Title}",
                    $"Your interview, {interview.Title}, is booked for {interview.StartsAt:u}."
                );
                foreach (var interviewer in interview.InterviewerEmails)
                    QueueEmail(
                        db,
                        interviewer,
                        $"Interview booked: {interview.Title}",
                        $"The candidate booked {interview.StartsAt:u} for {interview.Application.Requisition.Title}."
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
