using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static class SeedData
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

        var users = new[]
        {
            new AppUser
            {
                Email = "admin@example.test",
                DisplayName = "Avery Admin",
                Role = UserRole.Admin,
            },
            new AppUser
            {
                Email = "recruiter@example.test",
                DisplayName = "Riley Recruiter",
                Role = UserRole.Recruiter,
            },
            new AppUser
            {
                Email = "manager@example.test",
                DisplayName = "Morgan Manager",
                Role = UserRole.HiringManager,
                Department = "Engineering",
            },
            new AppUser
            {
                Email = "interviewer@example.test",
                DisplayName = "Indigo Interviewer",
                Role = UserRole.Interviewer,
                Department = "Engineering",
            },
        };

        var req = new Requisition
        {
            Code = "ENG-104",
            Title = "Senior product engineer",
            Department = "Engineering",
            Location = "Chicago, IL",
            EmploymentType = "Full time",
            WorkMode = "Hybrid",
            Openings = 2,
            OwnerEmail = "manager@example.test",
            RecruiterEmail = "recruiter@example.test",
            Description = "Build reliable product experiences across our internal platforms.",
            Status = RequisitionStatus.Open,
            TargetStartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(60)),
        };

        var stages = CreateDefaultStages(req.Id);
        req.Stages.AddRange(stages);

        var candidateOne = new Candidate
        {
            FirstName = "Jordan",
            LastName = "Lee",
            Email = "jordan.lee@example.com",
            Phone = "+1 312 555 0142",
            Location = "Chicago, IL",
            CurrentTitle = "Product engineer",
            LinkedInUrl = "https://www.linkedin.com/in/example",
            Source = "Referral",
            Tags = ["react", "dotnet", "referred"],
        };

        var candidateTwo = new Candidate
        {
            FirstName = "Sam",
            LastName = "Patel",
            Email = "sam.patel@example.com",
            Location = "Madison, WI",
            CurrentTitle = "Senior software engineer",
            Source = "Direct applicant",
            Tags = ["platform", "postgresql"],
        };

        var applicationOne = new Application
        {
            Candidate = candidateOne,
            Requisition = req,
            PipelineStage = stages[2],
            Source = candidateOne.Source,
            Rating = 4,
            AppliedAt = DateTimeOffset.UtcNow.AddDays(-9),
            LastActivityAt = DateTimeOffset.UtcNow.AddDays(-1),
        };
        applicationOne.Notes.Add(
            new ApplicationNote
            {
                Body = "Strong product instincts and clear examples of cross-functional delivery.",
                AuthorEmail = "recruiter@example.test",
            }
        );
        applicationOne.Interviews.Add(
            new Interview
            {
                Title = "Technical interview",
                StartsAt = DateTimeOffset.UtcNow.AddDays(2).AddHours(2),
                EndsAt = DateTimeOffset.UtcNow.AddDays(2).AddHours(3),
                TimeZone = "America/Chicago",
                MeetingLink = "https://meet.example.com/technical-interview",
                InterviewerEmails = ["interviewer@example.test"],
            }
        );

        var applicationTwo = new Application
        {
            Candidate = candidateTwo,
            Requisition = req,
            PipelineStage = stages[1],
            Source = candidateTwo.Source,
            AppliedAt = DateTimeOffset.UtcNow.AddDays(-4),
            LastActivityAt = DateTimeOffset.UtcNow.AddDays(-2),
        };

        db.Users.AddRange(users);
        db.Applications.AddRange(applicationOne, applicationTwo);
        db.AuditEvents.Add(
            new AuditEvent
            {
                EntityType = "Requisition",
                EntityId = req.Id.ToString(),
                Action = "Seeded",
                ActorEmail = "system",
                Details = "Initial development data",
            }
        );
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
}
