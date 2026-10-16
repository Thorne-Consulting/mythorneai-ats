using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    // Seed applications are created in their final state, so stage history is reconstructed:
    // applied in the first stage, then spread through the stages up to the current one.
    private static void AddDevelopmentStageHistory(AtsDbContext db, DevelopmentJobs jobs, DevelopmentApplications applications)
    {
        var requisitions = new[] { jobs.Engineering, jobs.Platform, jobs.Designer, jobs.Analyst, jobs.Operations, jobs.EngineeringManager, jobs.ContractWriter }
            .ToDictionary(x => x.Id);
        foreach (var application in applications.Items)
        {
            var stages = requisitions[application.RequisitionId].Stages.OrderBy(x => x.SortOrder).ToList();
            var current = stages.First(x => x.Id == application.PipelineStageId);
            var path = stages.Where(x => x.SortOrder <= current.SortOrder).ToList();
            var span = application.LastActivityAt - application.AppliedAt;
            if (span < TimeSpan.Zero)
                span = TimeSpan.Zero;
            for (var i = 0; i < path.Count; i++)
            {
                var last = i == path.Count - 1;
                var status = last && application.Status != ApplicationStatus.Active ? application.Status : ApplicationStatus.Active;
                db.StageTransitions.Add(new StageTransition
                {
                    ApplicationId = application.Id,
                    RequisitionId = application.RequisitionId,
                    FromStageId = i == 0 ? null : path[i - 1].Id,
                    ToStageId = path[i].Id,
                    FromStatus = i == 0 ? null : ApplicationStatus.Active,
                    ToStatus = status,
                    ActorEmail = i == 0 ? null : "recruiter@example.test",
                    OccurredAt = application.AppliedAt + span * i / Math.Max(path.Count - 1, 1),
                });
            }
            if (path.Count == 1 && application.Status != ApplicationStatus.Active)
                db.StageTransitions.Add(new StageTransition
                {
                    ApplicationId = application.Id,
                    RequisitionId = application.RequisitionId,
                    FromStageId = path[0].Id,
                    ToStageId = path[0].Id,
                    FromStatus = ApplicationStatus.Active,
                    ToStatus = application.Status,
                    ActorEmail = "recruiter@example.test",
                    OccurredAt = application.LastActivityAt,
                });
        }
    }
}
