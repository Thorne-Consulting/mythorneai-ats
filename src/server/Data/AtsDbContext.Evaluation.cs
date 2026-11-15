using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<ScorecardDraft> ScorecardDrafts => Set<ScorecardDraft>();
    public DbSet<HiringDecision> HiringDecisions => Set<HiringDecision>();
    public DbSet<ScorecardAddendum> ScorecardAddenda => Set<ScorecardAddendum>();
    public DbSet<KitTemplate> KitTemplates => Set<KitTemplate>();
    public DbSet<QuestionBankItem> QuestionBankItems => Set<QuestionBankItem>();
    public DbSet<RejectionReason> RejectionReasons => Set<RejectionReason>();
}

public sealed class InterviewKitVersionConfiguration : IEntityTypeConfiguration<InterviewKit>
{
    public void Configure(EntityTypeBuilder<InterviewKit> builder)
    {
        // Frozen versions keep their old place in the list, so only current kits need a unique one.
        builder
            .HasIndex(x => new { x.RequisitionId, x.SortOrder })
            .IsUnique()
            .HasFilter("\"VersionOfId\" IS NULL");
        builder.HasIndex(x => x.VersionOfId);
        builder
            .HasOne<InterviewKit>()
            .WithMany()
            .HasForeignKey(x => x.VersionOfId)
            .OnDelete(DeleteBehavior.Cascade);
        builder
            .HasOne<PipelineStage>()
            .WithMany()
            .HasForeignKey(x => x.PipelineStageId)
            .OnDelete(DeleteBehavior.SetNull);
        builder.Property(x => x.UpdatedBy).HasMaxLength(320);
    }
}

public sealed class InterviewCriterionVersionConfiguration
    : IEntityTypeConfiguration<InterviewCriterion>
{
    public void Configure(EntityTypeBuilder<InterviewCriterion> builder)
    {
        builder.Property(x => x.FollowUps).HasMaxLength(2000);
    }
}

public sealed class KitTemplateConfiguration : IEntityTypeConfiguration<KitTemplate>
{
    public void Configure(EntityTypeBuilder<KitTemplate> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(120);
        builder.Property(x => x.Summary).HasMaxLength(200);
        builder.Property(x => x.CompetenciesJson).HasColumnType("jsonb");
        builder.Property(x => x.CreatedBy).HasMaxLength(320);
    }
}

public sealed class QuestionBankItemConfiguration : IEntityTypeConfiguration<QuestionBankItem>
{
    public void Configure(EntityTypeBuilder<QuestionBankItem> builder)
    {
        builder.Property(x => x.Name).HasMaxLength(120);
        builder.Property(x => x.Question).HasMaxLength(1000);
        builder.Property(x => x.FollowUps).HasMaxLength(2000);
        builder.Property(x => x.GoodLooksLike).HasMaxLength(2000);
        builder.Property(x => x.Tags).HasColumnType("text[]");
        builder.Property(x => x.CreatedBy).HasMaxLength(320);
    }
}

public sealed class ScorecardAddendumConfiguration : IEntityTypeConfiguration<ScorecardAddendum>
{
    public void Configure(EntityTypeBuilder<ScorecardAddendum> builder)
    {
        builder.HasIndex(x => new { x.ScorecardId, x.CreatedAt });
        builder.Property(x => x.Body).HasMaxLength(4000);
        builder.Property(x => x.AuthorEmail).HasMaxLength(320);
        builder
            .HasOne(x => x.Scorecard)
            .WithMany()
            .HasForeignKey(x => x.ScorecardId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class ScorecardDraftConfiguration : IEntityTypeConfiguration<ScorecardDraft>
{
    public void Configure(EntityTypeBuilder<ScorecardDraft> builder)
    {
        builder.HasIndex(x => new { x.InterviewId, x.InterviewerEmail }).IsUnique();
        builder.Property(x => x.InterviewerEmail).HasMaxLength(320);
        builder
            .HasOne(x => x.Interview)
            .WithMany()
            .HasForeignKey(x => x.InterviewId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class HiringDecisionConfiguration : IEntityTypeConfiguration<HiringDecision>
{
    public void Configure(EntityTypeBuilder<HiringDecision> builder)
    {
        builder.HasIndex(x => new { x.ApplicationId, x.DecidedAt });
        builder.Property(x => x.Decision).HasConversion<string>().HasMaxLength(16);
        builder.Property(x => x.Rationale).HasMaxLength(4000);
        builder.Property(x => x.DecidedBy).HasMaxLength(320);
        builder
            .HasOne(x => x.Application)
            .WithMany()
            .HasForeignKey(x => x.ApplicationId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class OfferTermsConfiguration : IEntityTypeConfiguration<Offer>
{
    public void Configure(EntityTypeBuilder<Offer> builder)
    {
        builder.Property(x => x.BaseSalary).HasPrecision(14, 2);
        builder.Property(x => x.Currency).HasMaxLength(3);
        builder.Property(x => x.PayPeriod).HasMaxLength(8);
        builder.Property(x => x.Bonus).HasMaxLength(300);
        builder.Property(x => x.Equity).HasMaxLength(300);
        builder.Property(x => x.EmploymentType).HasMaxLength(40);
        builder.Property(x => x.WorkMode).HasMaxLength(40);
        builder.Property(x => x.Location).HasMaxLength(200);
        builder.Property(x => x.DeclineReason).HasMaxLength(1000);
        builder.Property(x => x.DeclineNote).HasMaxLength(1000);
        builder.Property(x => x.RespondedBy).HasMaxLength(320);
        builder.Property(x => x.RespondedName).HasMaxLength(200);
        builder.Property(x => x.LetterMarkdown).HasMaxLength(40_000);
        builder.Property(x => x.LetterSent).HasMaxLength(60_000);
        builder.HasIndex(x => new { x.Status, x.ExpiresAt });
    }
}

public sealed class RejectionReasonConfiguration : IEntityTypeConfiguration<RejectionReason>
{
    public void Configure(EntityTypeBuilder<RejectionReason> builder)
    {
        builder.Property(x => x.Label).HasMaxLength(120);
        builder.HasIndex(x => x.Label).IsUnique();
        builder.Property(x => x.Kind).HasConversion<string>().HasMaxLength(16);
    }
}
