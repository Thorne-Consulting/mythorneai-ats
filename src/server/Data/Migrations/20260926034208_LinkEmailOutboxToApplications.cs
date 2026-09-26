using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LinkEmailOutboxToApplications : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ApplicationId",
                table: "EmailOutbox",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_ApplicationId_CreatedAt",
                table: "EmailOutbox",
                columns: new[] { "ApplicationId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_ApplicationId_CreatedAt",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "ApplicationId",
                table: "EmailOutbox");
        }
    }
}
