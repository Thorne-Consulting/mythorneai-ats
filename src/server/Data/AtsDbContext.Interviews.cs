using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<InterviewNote> InterviewNotes => Set<InterviewNote>();
    public DbSet<InterviewSummary> InterviewSummaries => Set<InterviewSummary>();
    public DbSet<SchedulingRequest> SchedulingRequests => Set<SchedulingRequest>();
}

public sealed class InterviewNoteConfiguration : IEntityTypeConfiguration<InterviewNote>
{
    public void Configure(EntityTypeBuilder<InterviewNote> builder)
    {
        builder.HasIndex(x => new { x.InterviewId, x.AuthorEmail });
        builder.Property(x => x.AuthorEmail).HasMaxLength(320);
        builder.Property(x => x.Question).HasMaxLength(1000);
        builder.Property(x => x.Body).HasMaxLength(20_000);
        builder
            .HasOne(x => x.Interview)
            .WithMany()
            .HasForeignKey(x => x.InterviewId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class InterviewSummaryConfiguration : IEntityTypeConfiguration<InterviewSummary>
{
    public void Configure(EntityTypeBuilder<InterviewSummary> builder)
    {
        builder.HasIndex(x => new { x.InterviewId, x.CreatedAt });
        builder.Property(x => x.Model).HasMaxLength(100);
        builder.Property(x => x.Sources).HasMaxLength(300);
        builder.Property(x => x.Reason).HasMaxLength(300);
        builder
            .HasOne(x => x.Interview)
            .WithMany()
            .HasForeignKey(x => x.InterviewId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class SchedulingRequestConfiguration : IEntityTypeConfiguration<SchedulingRequest>
{
    public void Configure(EntityTypeBuilder<SchedulingRequest> builder)
    {
        builder.HasIndex(x => new { x.ApplicationId, x.Status });
        builder.HasIndex(x => new { x.Status, x.ExpiresAt });
        builder.Property(x => x.InterviewerEmails).HasColumnType("text[]");
        builder.Property(x => x.Title).HasMaxLength(200);
        builder.Property(x => x.Status).HasMaxLength(24);
        builder.Property(x => x.MeetingType).HasMaxLength(24);
        builder.Property(x => x.TimeZone).HasMaxLength(64);
        builder.Property(x => x.CandidateNote).HasMaxLength(1000);
        builder.Property(x => x.MessageToCandidate).HasMaxLength(2000);
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
