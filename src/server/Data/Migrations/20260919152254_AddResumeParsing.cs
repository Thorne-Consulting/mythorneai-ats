using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddResumeParsing : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "ResumeCertifications",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<string[]>(
                name: "ResumeEducation",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<string[]>(
                name: "ResumeJobTitles",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<string[]>(
                name: "ResumeLanguages",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ResumeParsedAt",
                table: "Candidates",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "ResumeSkills",
                table: "Candidates",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<string>(
                name: "ResumeSummary",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ResumeText",
                table: "Candidates",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ResumeYearsExperience",
                table: "Candidates",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ParseError",
                table: "Attachments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ParseStatus",
                table: "Attachments",
                type: "text",
                nullable: false,
                defaultValue: "NotParsed");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ParsedAt",
                table: "Attachments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql(
                "CREATE INDEX \"IX_Candidates_ResumeText_Trgm\" ON \"Candidates\" USING GIN (\"ResumeText\" gin_trgm_ops);"
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP INDEX IF EXISTS \"IX_Candidates_ResumeText_Trgm\";");

            migrationBuilder.DropColumn(
                name: "ResumeCertifications",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeEducation",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeJobTitles",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeLanguages",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeParsedAt",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeSkills",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeSummary",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeText",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeYearsExperience",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ParseError",
                table: "Attachments");

            migrationBuilder.DropColumn(
                name: "ParseStatus",
                table: "Attachments");

            migrationBuilder.DropColumn(
                name: "ParsedAt",
                table: "Attachments");
        }
    }
}
