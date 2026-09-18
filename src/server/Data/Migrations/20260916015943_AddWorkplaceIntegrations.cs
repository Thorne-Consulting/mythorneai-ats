using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkplaceIntegrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CalendarError",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CalendarProvider",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CalendarStatus",
                table: "Interviews",
                type: "text",
                nullable: false,
                defaultValue: "NotConfigured"
            );

            migrationBuilder.AddColumn<string>(
                name: "ExternalEventId",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "Communications",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "text"
            );

            migrationBuilder.AddColumn<string>(
                name: "DeliveryError",
                table: "Communications",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ExternalMessageId",
                table: "Communications",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "Communications",
                type: "character varying(32)",
                maxLength: 32,
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SentAt",
                table: "Communications",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.CreateTable(
                name: "IntegrationOutbox",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Operation = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: false
                    ),
                    EntityId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: false
                    ),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    LockedUntil = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    CompletedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IntegrationOutbox", x => x.Id);
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationOutbox_Operation_EntityId",
                table: "IntegrationOutbox",
                columns: new[] { "Operation", "EntityId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_IntegrationOutbox_Status_NextAttemptAt",
                table: "IntegrationOutbox",
                columns: new[] { "Status", "NextAttemptAt" }
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "IntegrationOutbox");

            migrationBuilder.DropColumn(name: "CalendarError", table: "Interviews");

            migrationBuilder.DropColumn(name: "CalendarProvider", table: "Interviews");

            migrationBuilder.DropColumn(name: "CalendarStatus", table: "Interviews");

            migrationBuilder.DropColumn(name: "ExternalEventId", table: "Interviews");

            migrationBuilder.DropColumn(name: "DeliveryError", table: "Communications");

            migrationBuilder.DropColumn(name: "ExternalMessageId", table: "Communications");

            migrationBuilder.DropColumn(name: "Provider", table: "Communications");

            migrationBuilder.DropColumn(name: "SentAt", table: "Communications");

            migrationBuilder.AlterColumn<string>(
                name: "Status",
                table: "Communications",
                type: "text",
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(32)",
                oldMaxLength: 32
            );
        }
    }
}
