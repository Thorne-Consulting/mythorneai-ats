using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<ReportSubscription> ReportSubscriptions => Set<ReportSubscription>();
}

public sealed class ReportSubscriptionConfiguration : IEntityTypeConfiguration<ReportSubscription>
{
    public void Configure(EntityTypeBuilder<ReportSubscription> builder)
    {
        builder.HasIndex(x => new { x.Paused, x.NextSendAt });
        builder.Property(x => x.OwnerEmail).HasMaxLength(320);
        builder.Property(x => x.Frequency).HasConversion<string>().HasMaxLength(16);
        builder
            .HasOne(x => x.SavedView)
            .WithMany()
            .HasForeignKey(x => x.SavedViewId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
