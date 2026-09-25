using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPostingTemplates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PostingTemplateId",
                table: "Requisitions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PostingTemplateVersion",
                table: "Requisitions",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "PostingTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    HeaderMarkdown = table.Column<string>(type: "text", nullable: false),
                    DescriptionMarkdown = table.Column<string>(type: "text", nullable: false),
                    BenefitsMarkdown = table.Column<string>(type: "text", nullable: false),
                    ApplicationQuestionsMarkdown = table.Column<string>(type: "text", nullable: false),
                    InterviewStagesMarkdown = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostingTemplates", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PostingTemplates_Name_Version",
                table: "PostingTemplates",
                columns: new[] { "Name", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PostingTemplates");

            migrationBuilder.DropColumn(
                name: "PostingTemplateId",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "PostingTemplateVersion",
                table: "Requisitions");
        }
    }
}
