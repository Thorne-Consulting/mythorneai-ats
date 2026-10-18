using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    public static async Task InitializeAsync(
        AtsDbContext db,
        IHostEnvironment environment,
        IConfiguration configuration,
        LocalFileStore files,
        CancellationToken cancellationToken = default
    )
    {
        var hasUsers = await db.Users.AnyAsync(cancellationToken);

        if (!hasUsers && !environment.IsDevelopment())
        {
            return;
        }

        if (!environment.IsDevelopment())
            return;

        if (!string.Equals(configuration["Auth:Mode"], "Development", StringComparison.OrdinalIgnoreCase))
            return;

        if (!hasUsers)
        {
            var now = DateTimeOffset.UtcNow;
            var users = CreateDevelopmentUsers();
            var jobs = CreateDevelopmentJobs(now);
            var candidates = CreateDevelopmentCandidates(now);
            var applications = CreateDevelopmentApplications(now, candidates, jobs);

            db.Users.AddRange(users);
            db.Organizations.Add(new Organization
            {
                Name = "Thorne Consulting",
                OwnerEmail = "admin@example.test",
                SetupCompleted = true,
                DefaultApproverEmails = ["manager@example.test", "admin@example.test"],
            });
            db.PipelineTemplates.AddRange(
                new PipelineTemplate { Name = "Standard hiring", IsDefault = true, StageNames = ["New", "Review", "Interview", "Booked", "Offer handoff"] },
                new PipelineTemplate { Name = "Engineering with technical screen", StageNames = ["New", "Review", "Recruiter screen", "Technical screen", "Panel interview", "Booked", "Offer handoff"] }
            );
            db.CustomFieldDefinitions.AddRange(
                new CustomFieldDefinition { Key = "notice-period", Label = "Notice period", Type = "select", Options = ["Immediate", "2 weeks", "1 month", "2 months or more"], SortOrder = 0 },
                new CustomFieldDefinition { Key = "work-authorization", Label = "Work authorization", Type = "text", SortOrder = 1 }
            );
            foreach (var job in new[] { jobs.Engineering, jobs.Platform, jobs.Designer, jobs.Analyst, jobs.Operations, jobs.EngineeringManager, jobs.ContractWriter })
                if (job.Status != RequisitionStatus.Draft)
                    job.OpenedAt = job.CreatedAt;
            db.Requisitions.Add(jobs.ContractWriter);
            db.Applications.AddRange(applications.Items);
            AddDevelopmentAuditEvents(db, now, jobs, applications);
            AddDevelopmentStageHistory(db, jobs, applications);
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
        }

        await EnsureDevelopmentResumesAsync(db, files, cancellationToken);
    }

    private static readonly string[] StageColors =
        ["gray", "blue", "violet", "indigo", "orange", "cyan", "grape", "teal", "pink", "yellow", "lime", "red"];

    // Custom pipelines: the named stages in order, then a terminal "Hired".
    public static List<PipelineStage> CreateStages(Guid requisitionId, IEnumerable<string> names)
    {
        var stages = names
            .Select((name, index) => new PipelineStage
            {
                RequisitionId = requisitionId,
                Name = name,
                SortOrder = index,
                Color = StageColors[index % StageColors.Length],
            })
            .ToList();
        stages.Add(new PipelineStage { RequisitionId = requisitionId, Name = "Hired", SortOrder = stages.Count, Color = "green", IsTerminal = true });
        return stages;
    }

    public static List<PipelineStage> CreateDefaultStages(Guid requisitionId) =>
        [
            new()
            {
                RequisitionId = requisitionId,
                Name = "New",
                SortOrder = 0,
                Color = "gray",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Review",
                SortOrder = 1,
                Color = "blue",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Interview",
                SortOrder = 2,
                Color = "violet",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Booked",
                SortOrder = 3,
                Color = "indigo",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Offer handoff",
                SortOrder = 4,
                Color = "orange",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Hired",
                SortOrder = 5,
                Color = "green",
                IsTerminal = true,
            },
        ];

    private sealed record DevelopmentJobs(
        Requisition Engineering,
        Requisition Platform,
        Requisition Designer,
        Requisition Analyst,
        Requisition Operations,
        Requisition EngineeringManager,
        Requisition ContractWriter,
        InterviewKit TechnicalKit,
        InterviewKit ValuesKit
    );

    private sealed record DevelopmentApplications(
        List<Application> Items,
        Application Jordan,
        Interview CompletedInterview
    );
}
