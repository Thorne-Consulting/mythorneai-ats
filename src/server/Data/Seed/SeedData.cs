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
        {
            // Portal test candidates only need open jobs, not the development sign-in.
            await EnsureLocalPortalCandidatesAsync(db, cancellationToken);
            return;
        }

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
                new PipelineTemplate { Name = "Standard hiring", IsDefault = true, Stages = StageRules.DefaultTemplate(), StageNames = [.. StageRules.DefaultTemplate().Select(x => x.Name)] },
                new PipelineTemplate { Name = "Engineering with technical screen", Stages = StageRules.EngineeringTemplate(), StageNames = [.. StageRules.EngineeringTemplate().Select(x => x.Name)] }
            );
            db.CustomFieldDefinitions.AddRange(
                new CustomFieldDefinition { Key = "notice-period", Label = "Notice period", Type = "select", Options = ["Immediate", "2 weeks", "1 month", "2 months or more"], SortOrder = 0 },
                new CustomFieldDefinition { Key = "work-authorization", Label = "Work authorization", Type = "text", SortOrder = 1 }
            );
            foreach (var job in jobs.All)
                if (job.Status != RequisitionStatus.Draft)
                    job.OpenedAt = job.CreatedAt;
            db.Requisitions.AddRange(jobs.All);
            db.Candidates.AddRange(candidates);
            db.Applications.AddRange(applications.Items);
            AddDevelopmentAuditEvents(db, now, jobs, applications);
            AddDevelopmentStageHistory(db, jobs, applications);
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();
        }

        await EnsureDevelopmentResumesAsync(db, files, cancellationToken);
        await EnsureLocalPortalCandidatesAsync(db, cancellationToken);
    }

    public static List<PipelineStage> CreateDefaultStages(Guid requisitionId) =>
        StageRules.FromTemplate(requisitionId, StageRules.DefaultTemplate());

    private sealed record DevelopmentJobs(
        Requisition Engineering,
        Requisition Platform,
        Requisition Designer,
        Requisition Analyst,
        Requisition Operations,
        Requisition EngineeringManager,
        Requisition ContractWriter,
        Requisition Nurse,
        Requisition Marketing,
        Requisition Mechanical,
        Requisition Research,
        Requisition Programs,
        InterviewKit TechnicalKit,
        InterviewKit ValuesKit
    )
    {
        public Requisition[] All =>
            [Engineering, Platform, Designer, Analyst, Operations, EngineeringManager, ContractWriter, Nurse, Marketing, Mechanical, Research, Programs];
    }

    private sealed record DevelopmentApplications(
        List<Application> Items,
        Application Jordan,
        Interview CompletedInterview
    );
}
