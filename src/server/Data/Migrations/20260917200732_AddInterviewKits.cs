using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInterviewKits : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "InterviewKitId",
                table: "Interviews",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.CreateTable(
                name: "InterviewKits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Instructions = table.Column<string>(type: "text", nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InterviewKits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InterviewKits_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "InterviewCriteria",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewKitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Description = table.Column<string>(type: "text", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InterviewCriteria", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InterviewCriteria_InterviewKits_InterviewKitId",
                        column: x => x.InterviewKitId,
                        principalTable: "InterviewKits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ScorecardCriterionRatings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ScorecardId = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewCriterionId = table.Column<Guid>(type: "uuid", nullable: false),
                    Rating = table.Column<int>(type: "integer", nullable: false),
                    Evidence = table.Column<string>(type: "text", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScorecardCriterionRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScorecardCriterionRatings_InterviewCriteria_InterviewCriter~",
                        column: x => x.InterviewCriterionId,
                        principalTable: "InterviewCriteria",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict
                    );
                    table.ForeignKey(
                        name: "FK_ScorecardCriterionRatings_Scorecards_ScorecardId",
                        column: x => x.ScorecardId,
                        principalTable: "Scorecards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Interviews_InterviewKitId",
                table: "Interviews",
                column: "InterviewKitId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewCriteria_InterviewKitId_SortOrder",
                table: "InterviewCriteria",
                columns: new[] { "InterviewKitId", "SortOrder" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewKits_RequisitionId_SortOrder",
                table: "InterviewKits",
                columns: new[] { "RequisitionId", "SortOrder" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_ScorecardCriterionRatings_InterviewCriterionId",
                table: "ScorecardCriterionRatings",
                column: "InterviewCriterionId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ScorecardCriterionRatings_ScorecardId_InterviewCriterionId",
                table: "ScorecardCriterionRatings",
                columns: new[] { "ScorecardId", "InterviewCriterionId" },
                unique: true
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Interviews_InterviewKits_InterviewKitId",
                table: "Interviews",
                column: "InterviewKitId",
                principalTable: "InterviewKits",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Interviews_InterviewKits_InterviewKitId",
                table: "Interviews"
            );

            migrationBuilder.DropTable(name: "ScorecardCriterionRatings");

            migrationBuilder.DropTable(name: "InterviewCriteria");

            migrationBuilder.DropTable(name: "InterviewKits");

            migrationBuilder.DropIndex(name: "IX_Interviews_InterviewKitId", table: "Interviews");

            migrationBuilder.DropColumn(name: "InterviewKitId", table: "Interviews");
        }
    }
}
