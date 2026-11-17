using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public sealed partial class AtsDbContext
{
    public DbSet<SeedRecord> SeedRecords => Set<SeedRecord>();
    public DbSet<PickListItem> PickListItems => Set<PickListItem>();
    public DbSet<Currency> Currencies => Set<Currency>();
    public DbSet<ExchangeRateTable> ExchangeRateTables => Set<ExchangeRateTable>();
}

public sealed class SeedRecordConfiguration : IEntityTypeConfiguration<SeedRecord>
{
    public void Configure(EntityTypeBuilder<SeedRecord> builder)
    {
        builder.Property(x => x.SeedKey).HasMaxLength(200);
        builder.Property(x => x.Fingerprint).HasMaxLength(64);
        builder.HasIndex(x => x.SeedKey).IsUnique();
    }
}

public sealed class PickListItemConfiguration : IEntityTypeConfiguration<PickListItem>
{
    public void Configure(EntityTypeBuilder<PickListItem> builder)
    {
        builder.Property(x => x.Kind).HasMaxLength(32);
        builder.Property(x => x.Value).HasMaxLength(120);
        builder.HasIndex(x => new { x.Kind, x.Value }).IsUnique();
    }
}

public sealed class CurrencyConfiguration : IEntityTypeConfiguration<Currency>
{
    public void Configure(EntityTypeBuilder<Currency> builder)
    {
        builder.Property(x => x.Code).HasMaxLength(3);
        builder.Property(x => x.Name).HasMaxLength(80);
        builder.Property(x => x.Symbol).HasMaxLength(8);
        builder.HasIndex(x => x.Code).IsUnique();
    }
}

public sealed class ExchangeRateTableConfiguration : IEntityTypeConfiguration<ExchangeRateTable>
{
    public void Configure(EntityTypeBuilder<ExchangeRateTable> builder)
    {
        builder.Property(x => x.Base).HasMaxLength(3);
        builder.Property(x => x.RatesJson).HasColumnType("jsonb");
    }
}
