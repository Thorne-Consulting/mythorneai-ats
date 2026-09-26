using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddApplicationQuestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ApplicationQuestionsMarkdown",
                table: "Requisitions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ApplicationAnswersMarkdown",
                table: "Applications",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApplicationQuestionsMarkdown",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "ApplicationAnswersMarkdown",
                table: "Applications");
        }
    }
}
