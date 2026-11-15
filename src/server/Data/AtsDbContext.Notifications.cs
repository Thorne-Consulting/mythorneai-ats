using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationPreference> NotificationPreferences => Set<NotificationPreference>();
}

public sealed class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.Property(x => x.UserEmail).HasMaxLength(320);
        builder.Property(x => x.Kind).HasMaxLength(40);
        builder.Property(x => x.Title).HasMaxLength(300);
        builder.Property(x => x.Body).HasMaxLength(1000);
        builder.Property(x => x.Href).HasMaxLength(500);
        builder.Property(x => x.ActorEmail).HasMaxLength(320);
        builder.Property(x => x.GroupKey).HasMaxLength(120);
        builder.HasIndex(x => new
        {
            x.UserEmail,
            x.ReadAt,
            x.CreatedAt,
        });
        builder.HasIndex(x => new { x.UserEmail, x.GroupKey });
    }
}

public sealed class NotificationPreferenceConfiguration
    : IEntityTypeConfiguration<NotificationPreference>
{
    public void Configure(EntityTypeBuilder<NotificationPreference> builder)
    {
        builder.HasKey(x => new { x.UserEmail, x.Kind });
        builder.Property(x => x.UserEmail).HasMaxLength(320);
        builder.Property(x => x.Kind).HasMaxLength(40);
    }
}
