using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<Workflow> Workflows => Set<Workflow>();
    public DbSet<WorkflowVersion> WorkflowVersions => Set<WorkflowVersion>();
    public DbSet<WorkflowRun> WorkflowRuns => Set<WorkflowRun>();
    public DbSet<WorkflowStepRun> WorkflowStepRuns => Set<WorkflowStepRun>();

    /// <summary>
    /// Set by the workflow worker while a step runs: what that step changes must not start the same
    /// workflow again, and runs it starts count one deeper.
    /// </summary>
    public (Guid WorkflowId, int Depth)? RunningWorkflow { get; set; }

    /// <summary>Events published by code (not seen in tracked changes) that start runs at the next save.</summary>
    public List<Features.Workflows.WorkflowEvent> PendingWorkflowEvents { get; } = [];
}

public sealed class WorkflowConfiguration : IEntityTypeConfiguration<Workflow>
{
    public void Configure(EntityTypeBuilder<Workflow> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(160);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.BuiltInKey).HasMaxLength(40);
        builder.Property(x => x.TriggerKind).HasMaxLength(60);
        builder.Property(x => x.DraftGraphJson).HasColumnType("jsonb");
        builder.Property(x => x.CreatedBy).HasMaxLength(320);
        builder.Property(x => x.UpdatedBy).HasMaxLength(320);
        builder.HasIndex(x => new { x.Status, x.TriggerKind });
        builder.HasIndex(x => x.BuiltInKey).IsUnique().HasFilter("\"BuiltInKey\" IS NOT NULL");
        builder
            .HasOne(x => x.PublishedVersion)
            .WithMany()
            .HasForeignKey(x => x.PublishedVersionId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class WorkflowVersionConfiguration : IEntityTypeConfiguration<WorkflowVersion>
{
    public void Configure(EntityTypeBuilder<WorkflowVersion> builder)
    {
        builder.HasIndex(x => new { x.WorkflowId, x.Number }).IsUnique();
        builder.Property(x => x.GraphJson).HasColumnType("jsonb");
        builder.Property(x => x.Note).HasMaxLength(500);
        builder.Property(x => x.Summary).HasMaxLength(1000);
        builder.Property(x => x.PublishedBy).HasMaxLength(320);
        builder
            .HasOne<Workflow>()
            .WithMany()
            .HasForeignKey(x => x.WorkflowId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class WorkflowRunConfiguration : IEntityTypeConfiguration<WorkflowRun>
{
    public void Configure(EntityTypeBuilder<WorkflowRun> builder)
    {
        builder.Property(x => x.TriggerKind).HasMaxLength(60);
        builder.Property(x => x.Subject).HasMaxLength(80);
        builder.Property(x => x.DedupeKey).HasMaxLength(80);
        builder.Property(x => x.ContextJson).HasColumnType("jsonb");
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.CurrentNodeId).HasMaxLength(60);
        builder.Property(x => x.LastError).HasMaxLength(2000);
        // The worker's pick: due runs, oldest first.
        builder.HasIndex(x => new { x.Status, x.NextRunAt });
        builder.HasIndex(x => new { x.WorkflowId, x.StartedAt });
        builder.HasIndex(x => new
        {
            x.ApplicationId,
            x.WorkflowId,
            x.Subject,
        });
        // "Once per application", and each repeat of a time trigger, can start only one run.
        builder
            .HasIndex(x => new
            {
                x.WorkflowId,
                x.ApplicationId,
                x.DedupeKey,
            })
            .IsUnique()
            .HasFilter("\"DedupeKey\" IS NOT NULL");
        builder
            .HasOne(x => x.Workflow)
            .WithMany()
            .HasForeignKey(x => x.WorkflowId)
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
            .HasMany(x => x.Steps)
            .WithOne(x => x.Run)
            .HasForeignKey(x => x.RunId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class WorkflowStepRunConfiguration : IEntityTypeConfiguration<WorkflowStepRun>
{
    public void Configure(EntityTypeBuilder<WorkflowStepRun> builder)
    {
        // A step runs once per run: a retry updates its row, a crash after commit can't repeat it.
        builder.HasIndex(x => new { x.RunId, x.NodeId }).IsUnique();
        builder.Property(x => x.NodeId).HasMaxLength(60);
        builder.Property(x => x.Kind).HasMaxLength(60);
        builder.Property(x => x.Status).HasMaxLength(16);
        builder.Property(x => x.Branch).HasMaxLength(200);
        builder.Property(x => x.Output).HasMaxLength(2000);
        builder.Property(x => x.DetailJson).HasColumnType("jsonb");
        builder.Property(x => x.Error).HasMaxLength(2000);
    }
}
