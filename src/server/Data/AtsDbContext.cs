using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed class AtsDbContext(DbContextOptions<AtsDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Requisition> Requisitions => Set<Requisition>();
    public DbSet<PipelineStage> PipelineStages => Set<PipelineStage>();
    public DbSet<Candidate> Candidates => Set<Candidate>();
    public DbSet<Application> Applications => Set<Application>();
    public DbSet<ApplicationNote> Notes => Set<ApplicationNote>();
    public DbSet<Interview> Interviews => Set<Interview>();
    public DbSet<InterviewKit> InterviewKits => Set<InterviewKit>();
    public DbSet<InterviewCriterion> InterviewCriteria => Set<InterviewCriterion>();
    public DbSet<Scorecard> Scorecards => Set<Scorecard>();
    public DbSet<ScorecardCriterionRating> ScorecardCriterionRatings =>
        Set<ScorecardCriterionRating>();
    public DbSet<InterviewRecording> InterviewRecordings => Set<InterviewRecording>();
    public DbSet<IntegrationOutboxItem> IntegrationOutbox => Set<IntegrationOutboxItem>();
    public DbSet<ResumeParseJob> ResumeParseJobs => Set<ResumeParseJob>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("pg_trgm");

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.HasIndex(x => x.Email).IsUnique();
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.DisplayName).HasMaxLength(200);
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(32);
        });

        modelBuilder.Entity<Organization>(entity =>
        {
            entity.HasIndex(x => x.OwnerEmail).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.OwnerEmail).HasMaxLength(320);
            entity.Property(x => x.TimeZone).HasMaxLength(80);
        });

        modelBuilder.Entity<Requisition>(entity =>
        {
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasIndex(x => new { x.Status, x.UpdatedAt });
            entity.Property(x => x.Code).HasMaxLength(40);
            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity
                .HasMany(x => x.Stages)
                .WithOne(x => x.Requisition)
                .HasForeignKey(x => x.RequisitionId)
                .OnDelete(DeleteBehavior.Cascade);
            entity
                .HasMany(x => x.InterviewKits)
                .WithOne(x => x.Requisition)
                .HasForeignKey(x => x.RequisitionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PipelineStage>(entity =>
        {
            entity.HasIndex(x => new { x.RequisitionId, x.SortOrder }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.Property(x => x.Color).HasMaxLength(24);
        });

        modelBuilder.Entity<Candidate>(entity =>
        {
            entity.HasIndex(x => x.Email);
            entity.HasIndex(x => new { x.LastName, x.FirstName });
            entity.Property(x => x.Email).HasMaxLength(320);
            entity.Property(x => x.Tags).HasColumnType("text[]");
            entity.Property(x => x.ResumeSkills).HasColumnType("text[]");
            entity.Property(x => x.ResumeJobTitles).HasColumnType("text[]");
            entity.Property(x => x.ResumeEducation).HasColumnType("text[]");
            entity.Property(x => x.ResumeCertifications).HasColumnType("text[]");
            entity.Property(x => x.ResumeLanguages).HasColumnType("text[]");
        });

        modelBuilder.Entity<Application>(entity =>
        {
            entity.HasIndex(x => new
            {
                x.RequisitionId,
                x.Status,
                x.PipelineStageId,
            });
            entity.HasIndex(x => new { x.CandidateId, x.RequisitionId });
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity
                .HasOne(x => x.PipelineStage)
                .WithMany(x => x.Applications)
                .HasForeignKey(x => x.PipelineStageId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Interview>(entity =>
        {
            entity.Property(x => x.InterviewerEmails).HasColumnType("text[]");
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.MeetingNotesSource).HasMaxLength(120);
            entity
                .HasOne(x => x.InterviewKit)
                .WithMany(x => x.Interviews)
                .HasForeignKey(x => x.InterviewKitId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<InterviewKit>(entity =>
        {
            entity.HasIndex(x => new { x.RequisitionId, x.SortOrder }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(120);
        });

        modelBuilder.Entity<InterviewCriterion>(entity =>
        {
            entity.HasIndex(x => new { x.InterviewKitId, x.SortOrder }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Question).HasMaxLength(1000);
        });

        modelBuilder.Entity<Scorecard>(entity =>
        {
            entity.HasIndex(x => new { x.InterviewId, x.InterviewerEmail }).IsUnique();
            entity.Property(x => x.Recommendation).HasConversion<string>().HasMaxLength(32);
        });

        modelBuilder.Entity<ScorecardCriterionRating>(entity =>
        {
            entity.HasIndex(x => new { x.ScorecardId, x.InterviewCriterionId }).IsUnique();
            entity
                .HasOne(x => x.Scorecard)
                .WithMany(x => x.CriterionRatings)
                .HasForeignKey(x => x.ScorecardId)
                .OnDelete(DeleteBehavior.Cascade);
            entity
                .HasOne(x => x.InterviewCriterion)
                .WithMany(x => x.Ratings)
                .HasForeignKey(x => x.InterviewCriterionId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<InterviewRecording>(entity =>
        {
            entity.HasIndex(x => new { x.InterviewId, x.RecordedAt });
            entity
                .HasOne(x => x.Interview)
                .WithMany(x => x.Recordings)
                .HasForeignKey(x => x.InterviewId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<IntegrationOutboxItem>(entity =>
        {
            entity.HasIndex(x => new { x.Status, x.NextAttemptAt });
            entity.HasIndex(x => new { x.Operation, x.EntityId }).IsUnique();
            entity.Property(x => x.Operation).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        });
        modelBuilder.Entity<ResumeParseJob>(entity =>
        {
            entity.HasIndex(x => x.AttachmentId).IsUnique();
            entity.HasIndex(x => new { x.Status, x.NextAttemptAt });
            entity.Property(x => x.Status).HasMaxLength(32);
        });
        modelBuilder.Entity<Attachment>(entity =>
            entity.Property(x => x.ParseStatus).HasDefaultValue("NotParsed")
        );
        modelBuilder.Entity<AuditEvent>(entity =>
            entity.HasIndex(x => new
            {
                x.EntityType,
                x.EntityId,
                x.OccurredAt,
            })
        );
    }
}
