using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<MessageThreadState> MessageThreadStates => Set<MessageThreadState>();
    public DbSet<UnmatchedInboundEmail> UnmatchedInboundEmails => Set<UnmatchedInboundEmail>();
    public DbSet<EmailTemplateVersion> EmailTemplateVersions => Set<EmailTemplateVersion>();
}

/// <summary>Saved replies and per-person ownership on the one template store.</summary>
public sealed class EmailTemplateStoreConfiguration : IEntityTypeConfiguration<EmailTemplate>
{
    public void Configure(EntityTypeBuilder<EmailTemplate> builder)
    {
        builder
            .Property(x => x.Kind)
            .HasConversion<string>()
            .HasMaxLength(16)
            .HasDefaultValue(TemplateKind.Automatic);
        builder.Property(x => x.Name).HasMaxLength(120);
        builder.Property(x => x.Category).HasMaxLength(60);
        builder.Property(x => x.OwnerEmail).HasMaxLength(320);
        builder.Property(x => x.UpdatedBy).HasMaxLength(320);
        builder.HasIndex(x => new { x.Kind, x.OwnerEmail });
    }
}

public sealed class EmailTemplateVersionConfiguration
    : IEntityTypeConfiguration<EmailTemplateVersion>
{
    public void Configure(EntityTypeBuilder<EmailTemplateVersion> builder)
    {
        builder.Property(x => x.TemplateRef).HasMaxLength(64);
        builder.Property(x => x.Subject).HasMaxLength(300);
        builder.Property(x => x.Action).HasMaxLength(16);
        builder.Property(x => x.EditedBy).HasMaxLength(320);
        builder.HasIndex(x => new
        {
            x.TemplateRef,
            x.RequisitionId,
            x.Version,
        });
    }
}

/// <summary>Inbound replies and delivery status on thread messages.</summary>
public sealed class ApplicationMessageThreadConfiguration
    : IEntityTypeConfiguration<ApplicationMessage>
{
    public void Configure(EntityTypeBuilder<ApplicationMessage> builder)
    {
        builder
            .Property(x => x.Channel)
            .HasConversion<string>()
            .HasMaxLength(16)
            .HasDefaultValue(MessageChannel.Portal);
        builder.Property(x => x.ExternalMessageId).HasMaxLength(200);
        builder.Property(x => x.FromAddress).HasMaxLength(320);
        builder
            .HasIndex(x => x.ExternalMessageId)
            .IsUnique()
            .HasFilter("\"ExternalMessageId\" IS NOT NULL");
        builder.HasIndex(x => x.EmailOutboxItemId);
        // Full-text search over every message body ("start date", "visa"), with a GIN index.
        builder
            .Property<NpgsqlTypes.NpgsqlTsVector>(SearchVector)
            .HasComputedColumnSql("to_tsvector('english', coalesce(\"Body\", ''))", stored: true);
        builder.HasIndex(SearchVector).HasMethod("GIN");
    }

    /// <summary>The generated column the inbox search matches against.</summary>
    public const string SearchVector = "SearchVector";
}

/// <summary>Per-thread columns on an application: the reply token and the shared Done state.</summary>
public sealed class ApplicationThreadConfiguration : IEntityTypeConfiguration<Application>
{
    public void Configure(EntityTypeBuilder<Application> builder)
    {
        builder.Property(x => x.ThreadToken).HasMaxLength(40);
        builder.Property(x => x.AssigneeEmail).HasMaxLength(320);
        builder.Property(x => x.SnoozedBy).HasMaxLength(320);
        builder.HasIndex(x => x.AssigneeEmail);
        builder.HasIndex(x => x.ThreadToken).IsUnique().HasFilter("\"ThreadToken\" IS NOT NULL");
    }
}

public sealed class MessageThreadStateConfiguration : IEntityTypeConfiguration<MessageThreadState>
{
    public void Configure(EntityTypeBuilder<MessageThreadState> builder)
    {
        builder.HasKey(x => new { x.ApplicationId, x.UserEmail });
        builder.Property(x => x.UserEmail).HasMaxLength(320);
        builder.Property(x => x.ReplyToken).HasMaxLength(40);
        builder.HasIndex(x => x.UserEmail);
        builder.HasIndex(x => x.ReplyToken).IsUnique().HasFilter("\"ReplyToken\" IS NOT NULL");
        builder
            .HasOne<Application>()
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class UnmatchedInboundEmailConfiguration
    : IEntityTypeConfiguration<UnmatchedInboundEmail>
{
    public void Configure(EntityTypeBuilder<UnmatchedInboundEmail> builder)
    {
        builder.HasIndex(x => x.ExternalMessageId).IsUnique();
        builder.Property(x => x.ExternalMessageId).HasMaxLength(200);
        builder.Property(x => x.FromAddress).HasMaxLength(320);
        builder.Property(x => x.FromName).HasMaxLength(200);
        builder.Property(x => x.Subject).HasMaxLength(500);
    }
}

/// <summary>Files sent in a message point back at it; deleting the message keeps the file in the candidate's files.</summary>
public sealed class AttachmentMessageConfiguration : IEntityTypeConfiguration<Attachment>
{
    public void Configure(EntityTypeBuilder<Attachment> builder)
    {
        builder.HasIndex(x => x.MessageId);
        builder
            .HasOne<ApplicationMessage>()
            .WithMany()
            .HasForeignKey(x => x.MessageId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
