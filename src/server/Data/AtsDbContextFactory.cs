using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MyThorneAI.Ats.Api.Data;

public sealed class AtsDbContextFactory : IDesignTimeDbContextFactory<AtsDbContext>
{
    public AtsDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AtsDbContext>()
            .UseNpgsql(
                "Host=localhost;Port=5432;Database=internal_ats_design;Username=ats;Password=design-time-only"
            )
            .Options;
        return new AtsDbContext(options);
    }
}
