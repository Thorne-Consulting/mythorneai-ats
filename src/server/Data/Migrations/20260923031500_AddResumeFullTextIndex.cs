using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations;

[DbContext(typeof(AtsDbContext))]
[Migration("20260923031500_AddResumeFullTextIndex")]
public partial class AddResumeFullTextIndex : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Keep this expression identical to the resume-text search predicate. A functional
        // index works on PostgreSQL versions that predate generated columns.
        migrationBuilder.Sql(
            "CREATE INDEX \"IX_Candidates_ResumeText_Fts\" ON \"Candidates\" "
                + "USING GIN (to_tsvector('simple', coalesce(\"ResumeText\", '')));"
        );
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Candidates_ResumeText_Fts\";");
    }
}
