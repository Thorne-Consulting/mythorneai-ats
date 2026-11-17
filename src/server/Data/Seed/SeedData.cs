using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    /// <summary>
    /// The demo set: sample jobs, candidates, applications, interviews, messages and offers, the
    /// development accounts, and the @local.dev portal candidates. The sample data is made once
    /// (when the workspace has no accounts); the resumes and portal candidates are checked on
    /// every run. Never for production: <see cref="Seeding.Plan"/> refuses it there.
    /// </summary>
    public static async Task DemoAsync(
        AtsDbContext db,
        LocalFileStore files,
        IConfiguration configuration,
        CancellationToken cancellationToken = default
    )
    {
        if (!await db.Users.AnyAsync(cancellationToken))
        {
            var now = DateTimeOffset.UtcNow;
            var users = CreateDevelopmentUsers().ToList();
            var jobs = CreateDevelopmentJobs(now);
            var candidates = CreateDevelopmentCandidates(now);
            var applications = CreateDevelopmentApplications(now, candidates, jobs);

            // On a host with real sign-in, the person named by BOOTSTRAP_ADMIN_EMAIL gets an admin
            // account too, so the demo accounts do not lock them out.
            var owner = "admin@example.test";
            if (configuration["Bootstrap:AdminEmail"] is { Length: > 0 } bootstrap)
            {
                owner = bootstrap.Trim().ToLowerInvariant();
                users.Add(
                    new AppUser
                    {
                        Email = owner,
                        DisplayName = configuration["Bootstrap:AdminName"] is { Length: > 0 } n
                            ? n
                            : owner.Split('@')[0],
                        Role = UserRole.Admin,
                    }
                );
            }
            db.Users.AddRange(users);
            if (!await db.Organizations.AnyAsync(cancellationToken))
                db.Organizations.Add(new Organization
                {
                    Name = "Thorne Consulting",
                    OwnerEmail = owner,
                    SetupCompleted = true,
                    DefaultApproverEmails = ["manager@example.test", "admin@example.test"],
                });
            if (!await db.PipelineTemplates.AnyAsync(cancellationToken))
                db.PipelineTemplates.AddRange(
                    new PipelineTemplate { Name = "Standard hiring", IsDefault = true, Stages = StageRules.DefaultTemplate(), StageNames = [.. StageRules.DefaultTemplate().Select(x => x.Name)] },
                    new PipelineTemplate { Name = "Engineering with technical screen", Stages = StageRules.EngineeringTemplate(), StageNames = [.. StageRules.EngineeringTemplate().Select(x => x.Name)] }
                );
            if (!await db.CustomFieldDefinitions.AnyAsync(cancellationToken))
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
