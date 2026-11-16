using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<RequisitionMember> RequisitionMembers => Set<RequisitionMember>();
    public DbSet<PipelineTemplateStage> PipelineTemplateStages => Set<PipelineTemplateStage>();
    public DbSet<ApprovalPolicy> ApprovalPolicies => Set<ApprovalPolicy>();
    public DbSet<ApplicationQuestion> ApplicationQuestions => Set<ApplicationQuestion>();
    public DbSet<ApplicationAnswer> ApplicationAnswers => Set<ApplicationAnswer>();
    public DbSet<JobDraft> JobDrafts => Set<JobDraft>();
}

public sealed class JobDraftConfiguration : IEntityTypeConfiguration<JobDraft>
{
    public void Configure(EntityTypeBuilder<JobDraft> builder)
    {
        builder.HasIndex(x => new { x.OwnerEmail, x.UpdatedAt });
        builder.Property(x => x.OwnerEmail).HasMaxLength(320);
        builder.Property(x => x.Title).HasMaxLength(200);
        builder.Property(x => x.DataJson).HasColumnType("jsonb");
    }
}

public sealed class RequisitionJobsConfiguration : IEntityTypeConfiguration<Requisition>
{
    public void Configure(EntityTypeBuilder<Requisition> builder)
    {
        builder.Property(x => x.LocationCity).HasMaxLength(120);
        builder.Property(x => x.LocationRegion).HasMaxLength(120);
        builder.Property(x => x.LocationCountry).HasMaxLength(2);
        builder.Property(x => x.RemoteCountries).HasColumnType("text[]");
        builder.Property(x => x.SalaryCurrency).HasMaxLength(3);
        builder.Property(x => x.SalaryPeriod).HasMaxLength(8);
        builder.Property(x => x.SalaryMin).HasPrecision(14, 2);
        builder.Property(x => x.SalaryMax).HasPrecision(14, 2);
    }
}

public sealed class PostingTemplateJobsConfiguration : IEntityTypeConfiguration<PostingTemplate>
{
    public void Configure(EntityTypeBuilder<PostingTemplate> builder)
    {
        builder.Property(x => x.QuestionsJson).HasColumnType("jsonb");
        builder.Property(x => x.UpdatedBy).HasMaxLength(320);
    }
}

public sealed class ApprovalJobsConfiguration : IEntityTypeConfiguration<Approval>
{
    public void Configure(EntityTypeBuilder<Approval> builder)
    {
        builder.Property(x => x.Note).HasMaxLength(2000);
        builder.Property(x => x.ReassignedFromEmail).HasMaxLength(320);
        builder.Property(x => x.ReassignedBy).HasMaxLength(320);
        builder.HasIndex(x => new { x.RequestedBy, x.Decision });
    }
}

public sealed class ApprovalPolicyConfiguration : IEntityTypeConfiguration<ApprovalPolicy>
{
    public void Configure(EntityTypeBuilder<ApprovalPolicy> builder)
    {
        // One organization-wide chain per kind (no departments), plus chains for some teams.
        builder.HasIndex(x => x.SubjectType);
        builder.Property(x => x.SubjectType).HasMaxLength(32);
        builder.Property(x => x.Departments).HasColumnType("text[]");
        builder.Property(x => x.Mode).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Approvers).HasColumnType("text[]");
        builder.Property(x => x.UpdatedBy).HasMaxLength(320);
    }
}

public sealed class ApplicationQuestionConfiguration : IEntityTypeConfiguration<ApplicationQuestion>
{
    public void Configure(EntityTypeBuilder<ApplicationQuestion> builder)
    {
        builder.HasIndex(x => new { x.RequisitionId, x.SortOrder });
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Label).HasMaxLength(300);
        builder.Property(x => x.HelpText).HasMaxLength(600);
        builder.Property(x => x.Options).HasColumnType("text[]");
        builder.Property(x => x.KnockoutAnswers).HasColumnType("text[]");
        builder
            .HasOne(x => x.Requisition)
            .WithMany(x => x.Questions)
            .HasForeignKey(x => x.RequisitionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ApplicationAnswerConfiguration : IEntityTypeConfiguration<ApplicationAnswer>
{
    public void Configure(EntityTypeBuilder<ApplicationAnswer> builder)
    {
        builder.HasIndex(x => new { x.ApplicationId, x.SortOrder });
        // For filters on answers in the candidates list: "Authorized to work in the US = No".
        builder.HasIndex(x => new { x.QuestionId, x.Flagged });
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Label).HasMaxLength(300);
        builder.Property(x => x.Values).HasColumnType("text[]");
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<ApplicationQuestion>()
            .WithMany()
            .HasForeignKey(x => x.QuestionId)
            .OnDelete(DeleteBehavior.SetNull);
        builder
            .HasOne<Attachment>()
            .WithMany()
            .HasForeignKey(x => x.AttachmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class AppUserJobsConfiguration : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> builder) =>
        builder.Property(x => x.DashboardJson).HasColumnType("jsonb");
}

public sealed class PipelineStageJobsConfiguration : IEntityTypeConfiguration<PipelineStage>
{
    public void Configure(EntityTypeBuilder<PipelineStage> builder)
    {
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.EmailOnEntry).HasConversion<string>().HasMaxLength(8);
        builder.Property(x => x.CandidateLabel).HasMaxLength(80);
        builder
            .HasOne<Assessment>()
            .WithMany()
            .HasForeignKey(x => x.AssessmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class PipelineTemplateStageConfiguration
    : IEntityTypeConfiguration<PipelineTemplateStage>
{
    public void Configure(EntityTypeBuilder<PipelineTemplateStage> builder)
    {
        builder.HasIndex(x => new { x.PipelineTemplateId, x.SortOrder });
        builder.Property(x => x.Name).HasMaxLength(80);
        builder.Property(x => x.CandidateLabel).HasMaxLength(80);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.EmailOnEntry).HasConversion<string>().HasMaxLength(8);
        builder
            .HasOne<PipelineTemplate>()
            .WithMany(x => x.Stages)
            .HasForeignKey(x => x.PipelineTemplateId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Assessment>()
            .WithMany()
            .HasForeignKey(x => x.AssessmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class RequisitionMemberConfiguration : IEntityTypeConfiguration<RequisitionMember>
{
    public void Configure(EntityTypeBuilder<RequisitionMember> builder)
    {
        // One role per person per job.
        builder.HasIndex(x => new { x.RequisitionId, x.UserId }).IsUnique();
        builder.HasIndex(x => x.UserId);
        builder.Property(x => x.Role).HasConversion<string>().HasMaxLength(16);
        builder
            .HasOne(x => x.Requisition)
            .WithMany(x => x.Members)
            .HasForeignKey(x => x.RequisitionId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
