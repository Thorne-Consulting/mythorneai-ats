using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<ApplicationSubmission> ApplicationSubmissions => Set<ApplicationSubmission>();
    public DbSet<CandidateMagicLink> CandidateMagicLinks => Set<CandidateMagicLink>();
    public DbSet<ResumeUpload> ResumeUploads => Set<ResumeUpload>();
    public DbSet<CareerSite> CareerSites => Set<CareerSite>();
    public DbSet<DocumentRequest> DocumentRequests => Set<DocumentRequest>();
}

public sealed class CareerSiteConfiguration : IEntityTypeConfiguration<CareerSite>
{
    public void Configure(EntityTypeBuilder<CareerSite> builder)
    {
        builder.HasIndex(x => x.OrganizationId).IsUnique();
        builder
            .HasOne<Organization>()
            .WithOne()
            .HasForeignKey<CareerSite>(x => x.OrganizationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder.Property(x => x.LogoFile).HasMaxLength(100);
        builder.Property(x => x.LogoDarkFile).HasMaxLength(100);
        builder.Property(x => x.IconFile).HasMaxLength(100);
        builder.Property(x => x.BrandColor).HasMaxLength(7);
        builder.Property(x => x.Headline).HasMaxLength(120);
        builder.Property(x => x.IntroMarkdown).HasMaxLength(4000);
        builder.Property(x => x.WebsiteUrl).HasMaxLength(300);
    }
}

public sealed class DocumentRequestConfiguration : IEntityTypeConfiguration<DocumentRequest>
{
    public void Configure(EntityTypeBuilder<DocumentRequest> builder)
    {
        builder.HasIndex(x => new { x.ApplicationId, x.FulfilledAt });
        builder.Property(x => x.Label).HasMaxLength(80);
        builder.Property(x => x.Kind).HasMaxLength(24);
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.RequestedBy).HasMaxLength(320);
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Attachment>()
            .WithMany()
            .HasForeignKey(x => x.AttachmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class ApplicationSubmissionConfiguration
    : IEntityTypeConfiguration<ApplicationSubmission>
{
    public void Configure(EntityTypeBuilder<ApplicationSubmission> builder)
    {
        builder.HasIndex(x => x.ApplicationId).IsUnique();
        builder.HasIndex(x => new { x.ConfirmedAt, x.SubmittedAt });
        builder.Property(x => x.UtmJson).HasMaxLength(1000);
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Attachment>()
            .WithMany()
            .HasForeignKey(x => x.ResumeAttachmentId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class CandidateMagicLinkConfiguration : IEntityTypeConfiguration<CandidateMagicLink>
{
    public void Configure(EntityTypeBuilder<CandidateMagicLink> builder)
    {
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => x.ExpiresAt);
        builder.Property(x => x.TokenHash).HasMaxLength(128);
        builder.Property(x => x.Purpose).HasMaxLength(24);
        builder.Property(x => x.Path).HasMaxLength(200);
        builder
            .HasOne(x => x.Candidate)
            .WithMany()
            .HasForeignKey(x => x.CandidateId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Application>()
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ResumeUploadConfiguration : IEntityTypeConfiguration<ResumeUpload>
{
    public void Configure(EntityTypeBuilder<ResumeUpload> builder)
    {
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => x.CreatedAt);
        builder.Property(x => x.TokenHash).HasMaxLength(128);
        builder.Property(x => x.StoredFileName).HasMaxLength(100);
        builder.Property(x => x.OriginalFileName).HasMaxLength(260);
        builder.Property(x => x.ContentType).HasMaxLength(100);
    }
}
