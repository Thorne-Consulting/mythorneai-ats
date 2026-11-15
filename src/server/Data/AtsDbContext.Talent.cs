using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<TalentPool> TalentPools => Set<TalentPool>();
    public DbSet<TalentPoolMember> TalentPoolMembers => Set<TalentPoolMember>();
    public DbSet<NoteMention> NoteMentions => Set<NoteMention>();
    public DbSet<FitJob> FitJobs => Set<FitJob>();
    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<Source> Sources => Set<Source>();
}

public sealed class SourceConfiguration : IEntityTypeConfiguration<Source>
{
    public void Configure(EntityTypeBuilder<Source> builder)
    {
        builder.HasIndex(x => x.Name).IsUnique();
        builder.Property(x => x.Name).HasMaxLength(100);
        builder.Property(x => x.Category).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Codes).HasColumnType("text[]");
    }
}

/// <summary>Who referred a candidate; the person stays a referral if the teammate's account goes.</summary>
public sealed class CandidateReferrerConfiguration : IEntityTypeConfiguration<Candidate>
{
    public void Configure(EntityTypeBuilder<Candidate> builder) =>
        builder
            .HasOne(x => x.Referrer)
            .WithMany()
            .HasForeignKey(x => x.ReferrerId)
            .OnDelete(DeleteBehavior.SetNull);
}

public sealed class ImportBatchConfiguration : IEntityTypeConfiguration<ImportBatch>
{
    public void Configure(EntityTypeBuilder<ImportBatch> builder)
    {
        builder.HasIndex(x => x.CreatedAt);
        builder.Property(x => x.FileName).HasMaxLength(260);
        builder.Property(x => x.CreatedBy).HasMaxLength(320);
        builder.Property(x => x.UndoneBy).HasMaxLength(320);
    }
}

public sealed class TalentPoolConfiguration : IEntityTypeConfiguration<TalentPool>
{
    public void Configure(EntityTypeBuilder<TalentPool> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(120);
        builder.Property(x => x.Description).HasMaxLength(500);
        builder.Property(x => x.OwnerEmail).HasMaxLength(320);
    }
}

public sealed class TalentPoolMemberConfiguration : IEntityTypeConfiguration<TalentPoolMember>
{
    public void Configure(EntityTypeBuilder<TalentPoolMember> builder)
    {
        builder.HasKey(x => new { x.PoolId, x.CandidateId });
        builder.HasIndex(x => x.CandidateId);
        builder.Property(x => x.AddedBy).HasMaxLength(320);
        builder
            .HasOne(x => x.Pool)
            .WithMany(x => x.Members)
            .HasForeignKey(x => x.PoolId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne(x => x.Candidate)
            .WithMany()
            .HasForeignKey(x => x.CandidateId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

/// <summary>A note belongs to its person and may be about one application; both cascade.</summary>
public sealed class ApplicationNoteConfiguration : IEntityTypeConfiguration<ApplicationNote>
{
    public void Configure(EntityTypeBuilder<ApplicationNote> builder)
    {
        builder.HasIndex(x => new { x.CandidateId, x.CreatedAt });
        builder
            .HasOne(x => x.Application)
            .WithMany(x => x.Notes)
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne(x => x.Candidate)
            .WithMany()
            .HasForeignKey(x => x.CandidateId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class NoteMentionConfiguration : IEntityTypeConfiguration<NoteMention>
{
    public void Configure(EntityTypeBuilder<NoteMention> builder)
    {
        builder.HasIndex(x => new { x.UserEmail, x.CreatedAt });
        builder.HasIndex(x => new { x.NoteId, x.UserEmail }).IsUnique();
        builder.Property(x => x.UserEmail).HasMaxLength(320);
        builder
            .HasOne(x => x.Note)
            .WithMany(x => x.Mentions)
            .HasForeignKey(x => x.NoteId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class FitJobConfiguration : IEntityTypeConfiguration<FitJob>
{
    public void Configure(EntityTypeBuilder<FitJob> builder)
    {
        builder.HasIndex(x => new { x.Status, x.CreatedAt });
        builder.HasIndex(x => new { x.RequisitionId, x.CandidateId });
        builder.Property(x => x.Status).HasMaxLength(16);
        builder.Property(x => x.RequestedBy).HasMaxLength(320);
        builder
            .HasOne<Candidate>()
            .WithMany()
            .HasForeignKey(x => x.CandidateId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<Requisition>()
            .WithMany()
            .HasForeignKey(x => x.RequisitionId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
