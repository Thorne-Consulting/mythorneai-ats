using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
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
    private static async Task<Guid?> CandidateIdFromTokenAsync(AtsDbContext db, string? token, CancellationToken ct) =>
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
            CancellationToken ct) =>
        {
            var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
            if (candidateId is null) return Results.Unauthorized();
            var body = request.Body?.Trim() ?? "";
            if (body.Length is 0 or > 2000)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["body"] = ["Write a message of up to 2,000 characters."] });
            var application = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
                .SingleOrDefaultAsync(x => x.Id == applicationId && x.CandidateId == candidateId && x.Status != ApplicationStatus.PendingVerification, ct);
            if (application is null) return Results.NotFound();
            db.ApplicationMessages.Add(new ApplicationMessage { ApplicationId = applicationId, FromCandidate = true, Body = body });
            application.LastActivityAt = DateTimeOffset.UtcNow;
            var name = $"{application.Candidate!.FirstName} {application.Candidate.LastName}";
            QueueEmail(db, application.Requisition!.RecruiterEmail,
                $"New message from {name} about {application.Requisition.Title}",
                $"{name} wrote in the candidate portal:\n\n{body}\n\nReply from the application in the ATS.", applicationId);
            await PipelineEvents.NotifyAsync(db, $"New message from {name} about {application.Requisition.Title}.", ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        api.MapPost("/portal/applications/{applicationId:guid}/messages/read", async (
            Guid applicationId,
            [FromHeader(Name = "X-Candidate-Session")] string? token,
            AtsDbContext db,
            CancellationToken ct) =>
        {
            var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
            if (candidateId is null) return Results.Unauthorized();
            await db.ApplicationMessages
                .Where(x => x.ApplicationId == applicationId && !x.FromCandidate && x.ReadAt == null && x.Application!.CandidateId == candidateId)
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.ReadAt, DateTimeOffset.UtcNow), ct);
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
                    QueueEmail(db, interviewer, $"Interview cancelled: {interview.Title}",
                        "The candidate withdrew their application, so this interview is cancelled.", application.Id);
            }
            var name = $"{application.Candidate!.FirstName} {application.Candidate.LastName}";
            QueueEmail(db, application.Requisition.RecruiterEmail, $"{name} withdrew from {application.Requisition.Title}",
                $"{name} withdrew their application.{(string.IsNullOrEmpty(reason) ? "" : $"\n\nTheir note: {reason}")}", application.Id);
            QueueEmail(db, application.Candidate.Email, $"Your {application.Requisition.Title} application was withdrawn",
                "We've withdrawn your application as you asked. Thank you for your time, and you're welcome to apply again in the future.", application.Id);
            db.AuditEvents.Add(new AuditEvent
            {
                EntityType = "Application", EntityId = application.Id.ToString(), Action = "WithdrawnByCandidate",
                ActorEmail = application.Candidate.Email, Details = JsonSerializer.Serialize(new { reason }),
            });
            await PipelineEvents.OnMovedAsync(db, application, application.PipelineStageId, fromStatus, application.Candidate.Email, ct);
            await PipelineEvents.NotifyAsync(db, $"{name} withdrew from {application.Requisition.Title}.", ct);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });
    }
}
