using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    public static async Task InitializeAsync(
        AtsDbContext db,
        IHostEnvironment environment,
        IConfiguration configuration,
        CancellationToken cancellationToken = default
    )
    {
        if (await db.Users.AnyAsync(cancellationToken))
            return;

        if (!environment.IsDevelopment())
        {
            var email = configuration["Bootstrap:AdminEmail"]?.Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(email))
                throw new InvalidOperationException(
                    "Bootstrap:AdminEmail is required for the first production startup."
                );

            db.Users.Add(
                new AppUser
                {
                    Email = email,
                    DisplayName =
                        configuration["Bootstrap:AdminName"]?.Trim() ?? "ATS administrator",
                    Role = UserRole.Admin,
                }
            );
            await db.SaveChangesAsync(cancellationToken);
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var users = CreateDevelopmentUsers();
        var jobs = CreateDevelopmentJobs(now);
        var candidates = CreateDevelopmentCandidates(now);
        var applications = CreateDevelopmentApplications(now, candidates, jobs);

        db.Users.AddRange(users);
        db.Requisitions.Add(jobs.ContractWriter);
        db.Applications.AddRange(applications.Items);
        AddDevelopmentAuditEvents(db, now, jobs, applications);
        await db.SaveChangesAsync(cancellationToken);
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
                Name = "Offer handoff",
                SortOrder = 3,
                Color = "orange",
            },
            new()
            {
                RequisitionId = requisitionId,
                Name = "Hired",
                SortOrder = 4,
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
