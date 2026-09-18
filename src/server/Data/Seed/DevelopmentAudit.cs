using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private static void AddDevelopmentAuditEvents(
        AtsDbContext db,
        DateTimeOffset now,
        DevelopmentJobs jobs,
        DevelopmentApplications applications
    )
    {
        var engineering = jobs.Engineering;
        var engManager = jobs.EngineeringManager;
        var operations = jobs.Operations;
        var jordanApp = applications.Jordan;
        var completedInterview = applications.CompletedInterview;

        db.AuditEvents.AddRange(
            new AuditEvent
            {
                EntityType = "Requisition",
                EntityId = engineering.Id.ToString(),
                Action = "Seeded",
                ActorEmail = "system",
                Details = "Initial development data",
                OccurredAt = now.AddDays(-30),
            },
            new AuditEvent
            {
                EntityType = "Requisition",
                EntityId = engManager.Id.ToString(),
                Action = "RequisitionFilled",
                ActorEmail = "manager@example.test",
                Details = "Closed after internal hire",
                OccurredAt = now.AddDays(-16),
            },
            new AuditEvent
            {
                EntityType = "Application",
                EntityId = jordanApp.Id.ToString(),
                Action = "StageChanged",
                ActorEmail = "recruiter@example.test",
                Details = "Review to Interview",
                OccurredAt = now.AddDays(-6),
            },
            new AuditEvent
            {
                EntityType = "Interview",
                EntityId = completedInterview.Id.ToString(),
                Action = "ScorecardSubmitted",
                ActorEmail = "tomas.interviewer@example.test",
                Details = "Technical interview",
                OccurredAt = now.AddDays(-3),
            },
            new AuditEvent
            {
                EntityType = "Requisition",
                EntityId = operations.Id.ToString(),
                Action = "RequisitionOnHold",
                ActorEmail = "priya.manager@example.test",
                Details = "Budget review",
                OccurredAt = now.AddDays(-12),
            }
        );
    }
}
