using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<Assessment> Assessments => Set<Assessment>();
    public DbSet<AssessmentVersion> AssessmentVersions => Set<AssessmentVersion>();
    public DbSet<AssessmentInvite> AssessmentInvites => Set<AssessmentInvite>();
    public DbSet<AssessmentAnswer> AssessmentAnswers => Set<AssessmentAnswer>();
}

public sealed class AssessmentConfiguration : IEntityTypeConfiguration<Assessment>
{
    public void Configure(EntityTypeBuilder<Assessment> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(200);
        builder.Property(x => x.Department).HasMaxLength(120);
        builder.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.ProviderName).HasMaxLength(120);
        builder.Property(x => x.ExternalUrl).HasMaxLength(2000);
        builder.Property(x => x.ContentJson).HasColumnType("jsonb");
        builder.Property(x => x.CreatedBy).HasMaxLength(320);
        builder.HasIndex(x => x.Status);
        // ponytail: CurrentVersionId is a plain column, no foreign key, so a version and its assessment never wait on each other to save.
    }
}

public sealed class AssessmentVersionConfiguration : IEntityTypeConfiguration<AssessmentVersion>
{
    public void Configure(EntityTypeBuilder<AssessmentVersion> builder)
    {
        builder.HasIndex(x => new { x.AssessmentId, x.Number }).IsUnique();
        builder.Property(x => x.ContentJson).HasColumnType("jsonb");
        builder.Property(x => x.PublishedBy).HasMaxLength(320);
        builder
            .HasOne(x => x.Assessment)
            .WithMany()
            .HasForeignKey(x => x.AssessmentId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class AssessmentInviteConfiguration : IEntityTypeConfiguration<AssessmentInvite>
{
    public void Configure(EntityTypeBuilder<AssessmentInvite> builder)
    {
        builder.HasIndex(x => x.ApplicationId);
        builder.HasIndex(x => new { x.AssessmentId, x.Status });
        // The worker's sweeps: open invites by their close times.
        builder.HasIndex(x => new { x.Status, x.ExpiresAt });
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Decision).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.InvitedBy).HasMaxLength(320);
        builder.Property(x => x.DecidedBy).HasMaxLength(320);
        builder.Property(x => x.Comment).HasMaxLength(4000);
        builder.Property(x => x.IntegrityJson).HasColumnType("jsonb");
        builder.Property(x => x.MaxPoints).HasPrecision(9, 2);
        builder.Property(x => x.EarnedPoints).HasPrecision(9, 2);
        builder
            .HasOne(x => x.Assessment)
            .WithMany()
            .HasForeignKey(x => x.AssessmentId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne(x => x.Version)
            .WithMany()
            .HasForeignKey(x => x.VersionId)
            .OnDelete(DeleteBehavior.Restrict);
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Attachment>()
            .WithMany()
            .HasForeignKey(x => x.ReportAttachmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class AssessmentAnswerConfiguration : IEntityTypeConfiguration<AssessmentAnswer>
{
    public void Configure(EntityTypeBuilder<AssessmentAnswer> builder)
    {
        builder.HasIndex(x => new { x.InviteId, x.QuestionId }).IsUnique();
        builder.Property(x => x.QuestionId).HasMaxLength(64);
        builder.Property(x => x.Text).HasMaxLength(100_000);
        builder.Property(x => x.ReviewerEmail).HasMaxLength(320);
        builder.Property(x => x.ReviewerNote).HasMaxLength(4000);
        builder.Property(x => x.AutoPoints).HasPrecision(9, 2);
        builder.Property(x => x.ReviewerPoints).HasPrecision(9, 2);
        builder
            .HasOne(x => x.Invite)
            .WithMany()
            .HasForeignKey(x => x.InviteId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Attachment>()
            .WithMany()
            .HasForeignKey(x => x.AttachmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
