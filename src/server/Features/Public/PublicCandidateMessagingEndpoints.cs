using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public sealed record CandidateMessageRequest(string Body);

public sealed record WithdrawRequest(string? Reason);

public static partial class PublicEndpoints
{
    internal static async Task<Guid?> CandidateIdFromTokenAsync(AtsDbContext db, string? token, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(token)
            ? null
            : await db.CandidatePortalSessions
                .Where(x => x.TokenHash == Hash(token) && x.ExpiresAt > DateTimeOffset.UtcNow)
                .Select(x => (Guid?)x.CandidateId)
                .SingleOrDefaultAsync(ct);

    private static void MapPublicMessaging(RouteGroupBuilder api)
    {
        api.MapPost("/portal/applications/{applicationId:guid}/messages", async (
            Guid applicationId,
            CandidateMessageRequest request,
            [FromHeader(Name = "X-Candidate-Session")] string? token,
            AtsDbContext db,
            IConfiguration configuration,
            IHubContext<InboxHub> hub,
            CancellationToken ct) =>
        {
            var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
            if (candidateId is null) return Results.Unauthorized();
            var body = request.Body?.Trim() ?? "";
            if (body.Length is 0 or > EmailInbound.MaxBody)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["body"] = ["Write a message of up to 10,000 characters."] });
            var application = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
                .SingleOrDefaultAsync(x => x.Id == applicationId && x.CandidateId == candidateId && x.Status != ApplicationStatus.PendingVerification, ct);
            if (application is null) return Results.NotFound();
            var message = new ApplicationMessage { ApplicationId = applicationId, FromCandidate = true, Body = body };
            db.ApplicationMessages.Add(message);
            application.LastActivityAt = DateTimeOffset.UtcNow;
            // A candidate writing again reopens a thread the team marked done.
            application.ThreadDoneAt = null;
            await EmailThreads.AlertTeamAsync(db, configuration, application, message, ct);
            await db.SaveChangesAsync(ct);
            await hub.ThreadChangedAsync(applicationId, application.CandidateId);
            return Results.NoContent();
        });

        api.MapPost("/portal/applications/{applicationId:guid}/messages/read", async (
            Guid applicationId,
            [FromHeader(Name = "X-Candidate-Session")] string? token,
            AtsDbContext db,
            IHubContext<InboxHub> hub,
            CancellationToken ct) =>
        {
            var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
            if (candidateId is null) return Results.Unauthorized();
            var seen = await db.ApplicationMessages
                .Where(x => x.ApplicationId == applicationId && !x.FromCandidate && x.ReadAt == null && x.Application!.CandidateId == candidateId)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.ReadAt, DateTimeOffset.UtcNow), ct);
            // The team sees "Seen" under their message.
            if (seen > 0) await hub.ThreadChangedAsync(applicationId);
            return Results.NoContent();
        });

        api.MapPost("/portal/applications/{applicationId:guid}/withdraw", async (
            Guid applicationId,
            WithdrawRequest request,
            [FromHeader(Name = "X-Candidate-Session")] string? token,
            AtsDbContext db,
            IWorkplaceIntegration integration,
            CancellationToken ct) =>
        {
            var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
            if (candidateId is null) return Results.Unauthorized();
            var application = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
                .Include(x => x.Interviews)
                .SingleOrDefaultAsync(x => x.Id == applicationId && x.CandidateId == candidateId && x.Status == ApplicationStatus.Active, ct);
            if (application is null) return Results.NotFound();
            if (!application.Requisition!.AllowCandidateWithdraw)
                return Results.Json(new { message = "This application can't be withdrawn here. Message the hiring team instead." }, statusCode: StatusCodes.Status403Forbidden);

            var fromStatus = application.Status;
            application.Status = ApplicationStatus.Withdrawn;
            var reason = request.Reason?.Trim();
            application.DispositionReason = string.IsNullOrEmpty(reason) ? "Withdrawn by candidate" : $"Withdrawn by candidate: {reason}";
            application.LastActivityAt = DateTimeOffset.UtcNow;
            foreach (var interview in application.Interviews.Where(x => x.Status is InterviewStatus.Scheduled or InterviewStatus.Proposed))
            {
                var wasScheduled = interview.Status == InterviewStatus.Scheduled;
                interview.Status = InterviewStatus.Cancelled;
                if (!wasScheduled) continue;
                var personalConnection = await db.CalendarConnections.AnyAsync(x => interview.InterviewerEmails.Contains(x.UserEmail), ct);
                interview.CalendarStatus = integration.IsEnabled || personalConnection ? "CancellationQueued" : "Cancelled";
                if (integration.IsEnabled || personalConnection)
                    db.IntegrationOutbox.Add(new IntegrationOutboxItem { Operation = IntegrationOperation.CancelCalendarEvent, EntityId = interview.Id });
                foreach (var interviewer in interview.InterviewerEmails)
                    await EmailTemplates.QueueAsync(db, "interview-team-update", application.RequisitionId, interviewer, new Dictionary<string, string>
                    {
                        ["title"] = "Cancelled",
                        ["candidateName"] = $"{application.Candidate!.FirstName} {application.Candidate.LastName}",
                        ["jobTitle"] = application.Requisition.Title,
                        ["interviewDetails"] = $"{interview.Title}: the candidate withdrew their application, so this interview is cancelled.",
                        ["link"] = Notify.AbsoluteLink(await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct), $"/interviews/{interview.Id}"),
                    }, application.Id, ct);
            }
            var name = $"{application.Candidate!.FirstName} {application.Candidate.LastName}";
            await Notify.AddAsync(db, [application.AssigneeEmail, .. await EmailThreads.RecruitersAsync(db, application.Requisition, ct)], new NotificationDraft(
                NotificationKinds.CandidateWithdrew, $"{name} withdrew from {application.Requisition.Title}", $"/applications/{application.Id}",
                Body: string.IsNullOrEmpty(reason) ? null : $"Their note: {reason}", ApplicationId: application.Id), ct);
            await EmailTemplates.QueueAsync(db, "withdrawal-confirmed", application.RequisitionId, application.Candidate.Email, new Dictionary<string, string>
            {
                ["firstName"] = application.Candidate.FirstName,
                ["jobTitle"] = application.Requisition.Title,
            }, application.Id, ct);
            db.AuditEvents.Add(new AuditEvent
            {
                EntityType = "Application", EntityId = application.Id.ToString(), Action = "WithdrawnByCandidate",
                ActorEmail = application.Candidate.Email, Details = JsonSerializer.Serialize(new { reason }),
            });
            await PipelineEvents.OnMovedAsync(db, application, application.PipelineStageId, fromStatus, application.Candidate.Email, ct);
            await PipelineEvents.NotifyAsync(db, $"{name} withdrew from {application.Requisition.Title}.", ct, TeamChannel.CandidateWithdrew, $"/applications/{application.Id}");
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
