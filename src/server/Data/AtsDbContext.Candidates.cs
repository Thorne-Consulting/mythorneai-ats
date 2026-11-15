using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;
using NpgsqlTypes;

namespace MyThorneAI.Ats.Api.Data;

/// <summary>Search columns on candidates: a weighted full-text vector, trigram name indexes and phone digits.</summary>
public sealed class CandidateSearchConfiguration : IEntityTypeConfiguration<Candidate>
{
    public const string SearchVector = "SearchVector";

    /// <summary>The custom field values as jsonb, for filtering on pick-one and pick-many fields.</summary>
    public const string CustomFields = "CustomFields";

    public void Configure(EntityTypeBuilder<Candidate> builder)
    {
        builder.Property(x => x.DoNotContactReason).HasMaxLength(500);
        builder
            .Property(x => x.PhoneDigits)
            .HasMaxLength(40)
            .HasComputedColumnSql(
                """regexp_replace(coalesce("Phone", ''), '[^0-9]', '', 'g')""",
                stored: true
            );
        builder.HasIndex(x => x.PhoneDigits);
        // Name and email weigh most (A), then the current title (B), then the resume text (C).
        builder
            .Property<NpgsqlTsVector>(SearchVector)
            .HasComputedColumnSql(
                """
                setweight(to_tsvector('simple', coalesce("FirstName", '') || ' ' || coalesce("LastName", '') || ' ' || coalesce("Email", '')), 'A')
                || setweight(to_tsvector('simple', coalesce("CurrentTitle", '')), 'B')
                || setweight(to_tsvector('simple', coalesce("ResumeText", '')), 'C')
                """,
                stored: true
            );
        builder.HasIndex(SearchVector).HasMethod("gin");
        builder
            .Property<string>(CustomFields)
            .HasColumnType("jsonb")
            .HasComputedColumnSql("\"CustomFieldsJson\"::jsonb", stored: true);
        // Typo-tolerant names: "jordn" finds Jordan.
        builder
            .HasIndex(x => x.FirstName, "IX_Candidates_FirstName_Trgm")
            .HasMethod("gin")
            .HasOperators("gin_trgm_ops");
        builder
            .HasIndex(x => x.LastName, "IX_Candidates_LastName_Trgm")
            .HasMethod("gin")
            .HasOperators("gin_trgm_ops");
        builder
            .HasIndex(x => x.Email, "IX_Candidates_Email_Trgm")
            .HasMethod("gin")
            .HasOperators("gin_trgm_ops");
    }
}

public sealed class AttachmentKindConfiguration : IEntityTypeConfiguration<Attachment>
{
    // Files uploaded before kinds existed were all read as resumes.
    public void Configure(EntityTypeBuilder<Attachment> builder) =>
        builder.Property(x => x.Kind).HasMaxLength(24).HasDefaultValue(AttachmentKinds.Resume);
}
