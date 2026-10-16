using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed class AtsDbContext(DbContextOptions<AtsDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Organization> Organizations => Set<Organization>();
    public DbSet<Requisition> Requisitions => Set<Requisition>();
    public DbSet<PostingTemplate> PostingTemplates => Set<PostingTemplate>();
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
    public DbSet<EmailOutboxItem> EmailOutbox => Set<EmailOutboxItem>();
    public DbSet<CandidatePortalSession> CandidatePortalSessions => Set<CandidatePortalSession>();
    public DbSet<CalendarConnection> CalendarConnections => Set<CalendarConnection>();
    public DbSet<Offer> Offers => Set<Offer>();
    public DbSet<Approval> Approvals => Set<Approval>();
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<ApplicationMessage> ApplicationMessages => Set<ApplicationMessage>();
    public DbSet<StageTransition> StageTransitions => Set<StageTransition>();
    public DbSet<SavedView> SavedViews => Set<SavedView>();
    public DbSet<AiCallLog> AiCallLogs => Set<AiCallLog>();
    public DbSet<JobFit> JobFits => Set<JobFit>();
    public DbSet<CandidateDismissal> CandidateDismissals => Set<CandidateDismissal>();
    public DbSet<PipelineTemplate> PipelineTemplates => Set<PipelineTemplate>();
    public DbSet<CustomFieldDefinition> CustomFieldDefinitions => Set<CustomFieldDefinition>();
    public DbSet<WebhookEndpoint> WebhookEndpoints => Set<WebhookEndpoint>();
    public DbSet<WebhookDelivery> WebhookDeliveries => Set<WebhookDelivery>();

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
            entity.Property(x => x.AllowedEmailDomains).HasColumnType("text[]");
            entity.Property(x => x.DefaultApproverEmails).HasColumnType("text[]");
        });

        modelBuilder.Entity<Requisition>(entity =>
        {
            entity.HasIndex(x => x.Code).IsUnique();
            entity.HasIndex(x => new { x.Status, x.UpdatedAt });
            entity.Property(x => x.Code).HasMaxLength(40);
            entity.Property(x => x.Title).HasMaxLength(200);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.ViewerEmails).HasColumnType("text[]");
            entity.Property(x => x.RequirementsEmbedding).HasColumnType("real[]");
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

        modelBuilder.Entity<PostingTemplate>(entity =>
        {
            entity.HasIndex(x => new { x.Name, x.Version }).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(160);
        });

        modelBuilder.Entity<CandidatePortalSession>(entity =>
        {
            entity.HasIndex(x => x.TokenHash).IsUnique();
            entity.HasIndex(x => new { x.CandidateId, x.ExpiresAt });
            entity.Property(x => x.TokenHash).HasMaxLength(128);
            entity.HasOne(x => x.Candidate).WithMany().HasForeignKey(x => x.CandidateId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CalendarConnection>(entity =>
        {
            entity.HasIndex(x => x.UserEmail).IsUnique();
            entity.Property(x => x.UserEmail).HasMaxLength(320);
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.ProviderAccountEmail).HasMaxLength(320);
            entity.Property(x => x.AccessToken).HasMaxLength(4096);
            entity.Property(x => x.RefreshToken).HasMaxLength(4096);
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
            entity.Property(x => x.ResumeEmbedding).HasColumnType("real[]");
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
            entity.HasIndex(x => new { x.Status, x.VerificationExpiresAt });
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
        modelBuilder.Entity<Offer>(entity =>
        {
            entity.HasIndex(x => new { x.ApplicationId, x.Status });
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.PreviousStatus).HasConversion<string>().HasMaxLength(32);
            entity
                .HasOne(x => x.Application)
                .WithMany()
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<Approval>(entity =>
        {
            entity.HasIndex(x => new { x.SubjectType, x.SubjectId });
            entity.HasIndex(x => new { x.ApproverEmail, x.Decision });
            entity.Property(x => x.SubjectType).HasMaxLength(32);
            entity.Property(x => x.ApproverEmail).HasMaxLength(320);
            entity.Property(x => x.Decision).HasConversion<string>().HasMaxLength(32);
        });
        modelBuilder.Entity<EmailTemplate>(entity =>
        {
            entity.HasIndex(x => new { x.Key, x.RequisitionId }).IsUnique();
            entity.Property(x => x.Key).HasMaxLength(64);
            entity.Property(x => x.Subject).HasMaxLength(300);
        });
        modelBuilder.Entity<ApplicationMessage>(entity =>
        {
            entity.HasIndex(x => new { x.ApplicationId, x.CreatedAt });
            entity
                .HasOne(x => x.Application)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.ApplicationId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<StageTransition>(entity =>
        {
            entity.HasIndex(x => new { x.ApplicationId, x.OccurredAt });
            entity.HasIndex(x => new { x.RequisitionId, x.OccurredAt });
            entity.Property(x => x.FromStatus).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.ToStatus).HasConversion<string>().HasMaxLength(32);
        });
        modelBuilder.Entity<SavedView>(entity =>
        {
            entity.HasIndex(x => new { x.OwnerEmail, x.Area });
            entity.Property(x => x.Name).HasMaxLength(120);
        });
        modelBuilder.Entity<AiCallLog>(entity =>
        {
            entity.HasIndex(x => x.CreatedAt);
            entity.Property(x => x.Purpose).HasMaxLength(64);
        });
        modelBuilder.Entity<JobFit>(entity =>
            entity.HasIndex(x => new { x.RequisitionId, x.CandidateId }).IsUnique()
        );
        modelBuilder.Entity<CandidateDismissal>(entity =>
            entity.HasIndex(x => new { x.RequisitionId, x.CandidateId }).IsUnique()
        );
        modelBuilder.Entity<PipelineTemplate>(entity =>
        {
            entity.HasIndex(x => x.Name).IsUnique();
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.StageNames).HasColumnType("text[]");
        });
        modelBuilder.Entity<CustomFieldDefinition>(entity =>
        {
            entity.HasIndex(x => x.Key).IsUnique();
            entity.Property(x => x.Key).HasMaxLength(64);
            entity.Property(x => x.Label).HasMaxLength(120);
            entity.Property(x => x.Options).HasColumnType("text[]");
        });
        modelBuilder.Entity<WebhookEndpoint>(entity =>
        {
            entity.Property(x => x.Url).HasMaxLength(1000);
            entity.Property(x => x.Events).HasColumnType("text[]");
        });
        modelBuilder.Entity<WebhookDelivery>(entity =>
        {
            entity.HasIndex(x => new { x.Status, x.NextAttemptAt });
            entity.Property(x => x.Status).HasMaxLength(32);
            entity
                .HasOne(x => x.Endpoint)
                .WithMany()
                .HasForeignKey(x => x.EndpointId)
                .OnDelete(DeleteBehavior.Cascade);
        });
        modelBuilder.Entity<EmailOutboxItem>(entity =>
        {
            entity.HasIndex(x => x.ProviderMessageId);
            entity.HasIndex(x => new { x.ApplicationId, x.CreatedAt });
            entity.HasIndex(x => new { x.Status, x.NextAttemptAt });
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Recipient).HasMaxLength(320);
            entity.Property(x => x.Subject).HasMaxLength(300);
        });
    }
}
