using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Interviews;

/// <summary>Where booking an interview takes the application: the next interview-type stage, by stage type, never by name.</summary>
public static class InterviewStages
{
    /// <summary>Moves an active application to its next interview stage, when there is one. The caller saves.</summary>
    public static async Task MoveOnBookingAsync(
        AtsDbContext db,
        Application application,
        string? actorEmail,
        CancellationToken ct
    )
    {
        if (application.Status != ApplicationStatus.Active)
            return;
        var requisition =
            application.Requisition
            ?? await db.Requisitions.SingleAsync(x => x.Id == application.RequisitionId, ct);
        await db.Entry(requisition).Collection(x => x.Stages).LoadAsync(ct);
        var next = StageRules.NextInterview(requisition.Stages, application.PipelineStageId);
        if (next is null)
            return;
        var from = application.PipelineStageId;
        application.PipelineStageId = next.Id;
        await PipelineEvents.OnMovedAsync(
            db,
            application,
            from,
            application.Status,
            actorEmail,
            ct
        );
    }
}
