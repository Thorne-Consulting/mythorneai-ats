using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInterviewMeetingNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MeetingNotes",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "MeetingNotesSource",
                table: "Interviews",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "MeetingNotesUpdatedAt",
                table: "Interviews",
                type: "timestamp with time zone",
                nullable: true
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "MeetingNotes", table: "Interviews");

            migrationBuilder.DropColumn(name: "MeetingNotesSource", table: "Interviews");

            migrationBuilder.DropColumn(name: "MeetingNotesUpdatedAt", table: "Interviews");
        }
    }
}
