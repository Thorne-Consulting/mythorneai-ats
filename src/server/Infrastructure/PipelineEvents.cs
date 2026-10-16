using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class PipelineEvents
{
    // Call after the application's stage and status have been changed (before SaveChanges).
    public static void RecordMove(
        AtsDbContext db,
        Application application,
        Guid? fromStageId,
        ApplicationStatus? fromStatus,
        string? actorEmail
    ) =>
        db.StageTransitions.Add(
            new StageTransition
            {
                ApplicationId = application.Id,
                RequisitionId = application.RequisitionId,
                FromStageId = fromStageId,
                ToStageId = application.PipelineStageId,
                FromStatus = fromStatus,
                ToStatus = application.Status,
                ActorEmail = actorEmail,
            }
        );

    // Queues one signed delivery per active webhook subscribed to the event.
    public static async Task PublishAsync(
        AtsDbContext db,
        string eventType,
        object data,
        CancellationToken ct
    )
    {
        var endpoints = await db
            .WebhookEndpoints.AsNoTracking()
            .Where(x => x.IsActive && (x.Events.Length == 0 || x.Events.Contains(eventType)))
            .ToListAsync(ct);
        if (endpoints.Count == 0)
            return;
        var payload = JsonSerializer.Serialize(
            new
            {
                id = Guid.NewGuid(),
                type = eventType,
                occurredAt = DateTimeOffset.UtcNow,
                data,
            }
        );
        foreach (var endpoint in endpoints)
            db.WebhookDeliveries.Add(
                new WebhookDelivery
                {
                    EndpointId = endpoint.Id,
                    Url = endpoint.Url,
                    EventType = eventType,
                    Payload = payload,
                }
            );
    }

    public static async Task PublishApplicationAsync(
        AtsDbContext db,
        string eventType,
        Application application,
        CancellationToken ct,
        object? extra = null
    )
    {
        await db.Entry(application).Reference(x => x.Candidate).LoadAsync(ct);
        await db.Entry(application).Reference(x => x.Requisition).LoadAsync(ct);
        var stageName = await db
            .PipelineStages.Where(x => x.Id == application.PipelineStageId)
            .Select(x => x.Name)
            .SingleOrDefaultAsync(ct);
        await PublishAsync(
            db,
            eventType,
            new
            {
                applicationId = application.Id,
                status = application.Status.ToString(),
                stage = stageName,
                candidate = new
                {
                    id = application.CandidateId,
                    firstName = application.Candidate!.FirstName,
                    lastName = application.Candidate.LastName,
                    email = application.Candidate.Email,
                },
                job = new
                {
                    id = application.RequisitionId,
                    code = application.Requisition!.Code,
                    title = application.Requisition.Title,
                    department = application.Requisition.Department,
                    targetStartDate = application.Requisition.TargetStartDate,
                },
                extra,
            },
            ct
        );
    }

    // Everything that must follow a stage or status change: history row, webhooks, and closing a filled job.
    public static async Task OnMovedAsync(
        AtsDbContext db,
        Application application,
        Guid? fromStageId,
        ApplicationStatus? fromStatus,
        string? actorEmail,
        CancellationToken ct
    )
    {
        RecordMove(db, application, fromStageId, fromStatus, actorEmail);
        await PublishApplicationAsync(db, "application.stage_changed", application, ct);
        if (application.Status != ApplicationStatus.Hired || fromStatus == ApplicationStatus.Hired)
            return;
        await PublishApplicationAsync(db, "application.hired", application, ct);
        var requisition = application.Requisition!;
        var hired = await db.Applications.CountAsync(
            x =>
                x.RequisitionId == application.RequisitionId
                && x.Status == ApplicationStatus.Hired
                && x.Id != application.Id,
            ct
        );
        if (requisition.Status == RequisitionStatus.Open && hired + 1 >= requisition.Openings)
        {
            requisition.Status = RequisitionStatus.Filled;
            requisition.UpdatedAt = DateTimeOffset.UtcNow;
        }
    }

    // Team notification to the organization's Slack or Teams incoming webhook, when one is set.
    public static async Task NotifyAsync(AtsDbContext db, string text, CancellationToken ct)
    {
        var url = await db.Organizations.Select(x => x.NotificationWebhookUrl).SingleOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(url))
            return;
        db.WebhookDeliveries.Add(
            new WebhookDelivery
            {
                Url = url,
                EventType = "notification",
                Payload = JsonSerializer.Serialize(new { text }),
            }
        );
    }
}
