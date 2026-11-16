using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<AccessRequest> AccessRequests => Set<AccessRequest>();
    public DbSet<CustomRole> CustomRoles => Set<CustomRole>();

    // Fills audit diffs and queues webhook events from tracked changes on every save.
    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
        optionsBuilder.AddInterceptors(ChangeInterceptor.Instance);
}

public sealed class AccessRequestConfiguration : IEntityTypeConfiguration<AccessRequest>
{
    public void Configure(EntityTypeBuilder<AccessRequest> builder)
    {
        builder.Property(x => x.Email).HasMaxLength(320);
        builder.Property(x => x.Name).HasMaxLength(200);
        builder.Property(x => x.Note).HasMaxLength(1000);
        builder.Property(x => x.DecidedByEmail).HasMaxLength(320);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        // One open request per person; decided ones stay as history.
        builder.HasIndex(x => x.Email).IsUnique().HasFilter("\"Status\" = 'Pending'");
    }
}

public sealed class AuditEventPlatformConfiguration : IEntityTypeConfiguration<AuditEvent>
{
    // Activity history pages newest first with a (time, id) cursor.
    public void Configure(EntityTypeBuilder<AuditEvent> builder) =>
        builder.HasIndex(x => new { x.OccurredAt, x.Id }).IsDescending();
}

public sealed class AppUserPlatformConfiguration : IEntityTypeConfiguration<AppUser>
{
    public void Configure(EntityTypeBuilder<AppUser> builder)
    {
        builder.Property(x => x.InvitedByEmail).HasMaxLength(320);
        builder.Property(x => x.Departments).HasColumnType("text[]");
        builder.Property(x => x.AvatarTone).HasMaxLength(16);
        builder.Property(x => x.PreferencesJson).HasColumnType("jsonb");
        // A role with people on it can't be deleted; they move to another role first.
        builder
            .HasOne(x => x.CustomRole)
            .WithMany()
            .HasForeignKey(x => x.CustomRoleId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class CustomRoleConfiguration : IEntityTypeConfiguration<CustomRole>
{
    public void Configure(EntityTypeBuilder<CustomRole> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(60);
        builder.Property(x => x.Description).HasMaxLength(300);
        builder.Property(x => x.Permissions).HasColumnType("text[]");
    }
}

public sealed class OrganizationPlatformConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder) =>
        builder.Property(x => x.WorkOsOrganizationId).HasMaxLength(64);
}

/// <summary>
/// Access to a job comes from its hiring team, so the team (and each member's account) loads with
/// every job. <c>CanManage</c> then sees the whole team wherever a job was loaded from.
/// </summary>
public sealed class RequisitionAccessConfiguration
    : IEntityTypeConfiguration<Requisition>,
        IEntityTypeConfiguration<RequisitionMember>
{
    public void Configure(EntityTypeBuilder<Requisition> builder) =>
        builder.Navigation(x => x.Members).AutoInclude();

    public void Configure(EntityTypeBuilder<RequisitionMember> builder) =>
        builder.Navigation(x => x.User).AutoInclude();
}
