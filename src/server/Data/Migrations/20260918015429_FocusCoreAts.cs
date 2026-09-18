using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class FocusCoreAts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "Communications");

            migrationBuilder.DropTable(name: "Offers");

            migrationBuilder.DropTable(name: "Tasks");

            migrationBuilder.AddColumn<string>(
                name: "Concerns",
                table: "Scorecards",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "Strengths",
                table: "Scorecards",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "Question",
                table: "InterviewCriteria",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<int>(
                name: "Weight",
                table: "InterviewCriteria",
                type: "integer",
                nullable: false,
                defaultValue: 1
            );

            migrationBuilder.Sql(
                "UPDATE \"InterviewCriteria\" SET \"Question\" = \"Name\" WHERE \"Question\" = '';"
            );
            migrationBuilder.Sql(
                "UPDATE \"PipelineStages\" SET \"Name\" = 'Offer handoff' WHERE \"Name\" = 'Offer';"
            );

            migrationBuilder.CreateTable(
                name: "InterviewRecordings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalFileName = table.Column<string>(type: "text", nullable: false),
                    StoredFileName = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    Length = table.Column<long>(type: "bigint", nullable: false),
                    UploadedBy = table.Column<string>(type: "text", nullable: false),
                    ConsentConfirmed = table.Column<bool>(type: "boolean", nullable: false),
                    RecordedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InterviewRecordings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InterviewRecordings_Interviews_InterviewId",
                        column: x => x.InterviewId,
                        principalTable: "Interviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewRecordings_InterviewId_RecordedAt",
                table: "InterviewRecordings",
                columns: new[] { "InterviewId", "RecordedAt" }
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "Concerns", table: "Scorecards");

            migrationBuilder.DropColumn(name: "Strengths", table: "Scorecards");

            migrationBuilder.DropColumn(name: "Question", table: "InterviewCriteria");

            migrationBuilder.DropColumn(name: "Weight", table: "InterviewCriteria");

            migrationBuilder.Sql(
                "UPDATE \"PipelineStages\" SET \"Name\" = 'Offer' WHERE \"Name\" = 'Offer handoff';"
            );

            migrationBuilder.CreateTable(
                name: "Communications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    DeliveryError = table.Column<string>(type: "text", nullable: true),
                    ExternalMessageId = table.Column<string>(type: "text", nullable: true),
                    Provider = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: true
                    ),
                    Recipient = table.Column<string>(type: "text", nullable: false),
                    SenderEmail = table.Column<string>(type: "text", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    Status = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: false
                    ),
                    Subject = table.Column<string>(type: "text", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Communications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Communications_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    BaseSalary = table.Column<decimal>(type: "numeric", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Offers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Offers_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Tasks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssigneeEmail = table.Column<string>(type: "text", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tasks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Tasks_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id"
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Communications_ApplicationId",
                table: "Communications",
                column: "ApplicationId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Offers_ApplicationId",
                table: "Offers",
                column: "ApplicationId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Tasks_ApplicationId",
                table: "Tasks",
                column: "ApplicationId"
            );
        }
    }
}
