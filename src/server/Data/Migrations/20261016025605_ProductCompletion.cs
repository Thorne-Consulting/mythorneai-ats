using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductCompletion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowCandidateReschedule",
                table: "Requisitions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowCandidateWithdraw",
                table: "Requisitions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsConfidential",
                table: "Requisitions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "OpenedAt",
                table: "Requisitions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE \"Requisitions\" SET \"OpenedAt\" = \"CreatedAt\" WHERE \"Status\" NOT IN ('Draft', 'PendingApproval')");

            migrationBuilder.AddColumn<float[]>(
                name: "RequirementsEmbedding",
                table: "Requisitions",
                type: "real[]",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RequirementsJson",
                table: "Requisitions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string[]>(
                name: "ViewerEmails",
                table: "Requisitions",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<bool>(
                name: "AiEnabled",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<string>(
                name: "AiModel",
                table: "Organizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "ApprovalsSequential",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "BookReminderDays",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<string[]>(
                name: "DefaultApproverEmails",
                table: "Organizations",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]);

            migrationBuilder.AddColumn<int>(
                name: "MaxReminders",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 3);

            migrationBuilder.AddColumn<string>(
                name: "NotificationWebhookUrl",
                table: "Organizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PublicUrl",
                table: "Organizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QuietHoursEnd",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 8);

            migrationBuilder.AddColumn<int>(
                name: "QuietHoursStart",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 20);

            migrationBuilder.AddColumn<bool>(
                name: "RequireOfferApproval",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequireRequisitionApproval",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RolePermissionsJson",
                table: "Organizations",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScorecardReminderDays",
                table: "Organizations",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            migrationBuilder.AddColumn<int>(
                name: "BookingReminderCount",
                table: "Interviews",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "Interviews",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastBookingReminderAt",
                table: "Interviews",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ScorecardReminderCount",
                table: "Interviews",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Transcript",
                table: "InterviewRecordings",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeliveryStatus",
                table: "EmailOutbox",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DeliveryUpdatedAt",
                table: "EmailOutbox",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderMessageId",
                table: "EmailOutbox",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TemplateKey",
                table: "EmailOutbox",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TemplateVersion",
                table: "EmailOutbox",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CustomFieldsJson",
                table: "Candidates",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<bool>(
                name: "EmailBounced",
                table: "Candidates",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<float[]>(
                name: "ResumeEmbedding",
                table: "Candidates",
                type: "real[]",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ResumeEmbeddingAt",
                table: "Candidates",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReminderCount",
                table: "Applications",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "AiCallLogs",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Purpose = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Model = table.Column<string>(type: "text", nullable: false),
                    UserEmail = table.Column<string>(type: "text", nullable: true),
                    SubjectType = table.Column<string>(type: "text", nullable: true),
                    SubjectId = table.Column<string>(type: "text", nullable: true),
                    Input = table.Column<string>(type: "text", nullable: false),
                    Output = table.Column<string>(type: "text", nullable: false),
                    PromptTokens = table.Column<int>(type: "integer", nullable: false),
                    CompletionTokens = table.Column<int>(type: "integer", nullable: false),
                    LatencyMs = table.Column<int>(type: "integer", nullable: false),
                    Error = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiCallLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApplicationMessages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromCandidate = table.Column<bool>(type: "boolean", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    AuthorEmail = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReadAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationMessages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationMessages_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Approvals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectType = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    SubjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApproverEmail = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    Sequence = table.Column<int>(type: "integer", nullable: false),
                    Decision = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    RequestedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Approvals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CandidateDismissals",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    DismissedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CandidateDismissals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Label = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    Options = table.Column<string[]>(type: "text[]", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EmailTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Subject = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JobFits",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResultJson = table.Column<string>(type: "text", nullable: false),
                    Score = table.Column<int>(type: "integer", nullable: false),
                    InputHash = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobFits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Offers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Note = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    PreviousStageId = table.Column<Guid>(type: "uuid", nullable: true),
                    PreviousStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SentAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Offers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Offers_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PipelineTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    StageNames = table.Column<string[]>(type: "text[]", nullable: false),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SavedViews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerEmail = table.Column<string>(type: "text", nullable: false),
                    Area = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    ParamsJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavedViews", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StageTransitions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStageId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToStageId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ToStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ActorEmail = table.Column<string>(type: "text", nullable: true),
                    OccurredAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StageTransitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WebhookEndpoints",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Url = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Secret = table.Column<string>(type: "text", nullable: false),
                    Events = table.Column<string[]>(type: "text[]", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WebhookEndpoints", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WebhookDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EndpointId = table.Column<Guid>(type: "uuid", nullable: true),
                    Url = table.Column<string>(type: "text", nullable: false),
                    EventType = table.Column<string>(type: "text", nullable: false),
                    Payload = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LockedUntil = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    LastStatusCode = table.Column<int>(type: "integer", nullable: true),
                    LastError = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WebhookDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WebhookDeliveries_WebhookEndpoints_EndpointId",
                        column: x => x.EndpointId,
                        principalTable: "WebhookEndpoints",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EmailOutbox_ProviderMessageId",
                table: "EmailOutbox",
                column: "ProviderMessageId");

            migrationBuilder.CreateIndex(
                name: "IX_AiCallLogs_CreatedAt",
                table: "AiCallLogs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationMessages_ApplicationId_CreatedAt",
                table: "ApplicationMessages",
                columns: new[] { "ApplicationId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Approvals_ApproverEmail_Decision",
                table: "Approvals",
                columns: new[] { "ApproverEmail", "Decision" });

            migrationBuilder.CreateIndex(
                name: "IX_Approvals_SubjectType_SubjectId",
                table: "Approvals",
                columns: new[] { "SubjectType", "SubjectId" });

            migrationBuilder.CreateIndex(
                name: "IX_CandidateDismissals_RequisitionId_CandidateId",
                table: "CandidateDismissals",
                columns: new[] { "RequisitionId", "CandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_Key",
                table: "CustomFieldDefinitions",
                column: "Key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplates_Key_RequisitionId",
                table: "EmailTemplates",
                columns: new[] { "Key", "RequisitionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_JobFits_RequisitionId_CandidateId",
                table: "JobFits",
                columns: new[] { "RequisitionId", "CandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Offers_ApplicationId_Status",
                table: "Offers",
                columns: new[] { "ApplicationId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PipelineTemplates_Name",
                table: "PipelineTemplates",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SavedViews_OwnerEmail_Area",
                table: "SavedViews",
                columns: new[] { "OwnerEmail", "Area" });

            migrationBuilder.CreateIndex(
                name: "IX_StageTransitions_ApplicationId_OccurredAt",
                table: "StageTransitions",
                columns: new[] { "ApplicationId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StageTransitions_RequisitionId_OccurredAt",
                table: "StageTransitions",
                columns: new[] { "RequisitionId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_WebhookDeliveries_EndpointId",
                table: "WebhookDeliveries",
                column: "EndpointId");

            migrationBuilder.CreateIndex(
                name: "IX_WebhookDeliveries_Status_NextAttemptAt",
                table: "WebhookDeliveries",
                columns: new[] { "Status", "NextAttemptAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiCallLogs");

            migrationBuilder.DropTable(
                name: "ApplicationMessages");

            migrationBuilder.DropTable(
                name: "Approvals");

            migrationBuilder.DropTable(
                name: "CandidateDismissals");

            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions");

            migrationBuilder.DropTable(
                name: "EmailTemplates");

            migrationBuilder.DropTable(
                name: "JobFits");

            migrationBuilder.DropTable(
                name: "Offers");

            migrationBuilder.DropTable(
                name: "PipelineTemplates");

            migrationBuilder.DropTable(
                name: "SavedViews");

            migrationBuilder.DropTable(
                name: "StageTransitions");

            migrationBuilder.DropTable(
                name: "WebhookDeliveries");

            migrationBuilder.DropTable(
                name: "WebhookEndpoints");

            migrationBuilder.DropIndex(
                name: "IX_EmailOutbox_ProviderMessageId",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "AllowCandidateReschedule",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "AllowCandidateWithdraw",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "IsConfidential",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "OpenedAt",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "RequirementsEmbedding",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "RequirementsJson",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "ViewerEmails",
                table: "Requisitions");

            migrationBuilder.DropColumn(
                name: "AiEnabled",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "AiModel",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "ApprovalsSequential",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "BookReminderDays",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "DefaultApproverEmails",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "MaxReminders",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "NotificationWebhookUrl",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "PublicUrl",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "QuietHoursEnd",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "QuietHoursStart",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "RequireOfferApproval",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "RequireRequisitionApproval",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "RolePermissionsJson",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "ScorecardReminderDays",
                table: "Organizations");

            migrationBuilder.DropColumn(
                name: "BookingReminderCount",
                table: "Interviews");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                table: "Interviews");

            migrationBuilder.DropColumn(
                name: "LastBookingReminderAt",
                table: "Interviews");

            migrationBuilder.DropColumn(
                name: "ScorecardReminderCount",
                table: "Interviews");

            migrationBuilder.DropColumn(
                name: "Transcript",
                table: "InterviewRecordings");

            migrationBuilder.DropColumn(
                name: "DeliveryStatus",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "DeliveryUpdatedAt",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "ProviderMessageId",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "TemplateKey",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "TemplateVersion",
                table: "EmailOutbox");

            migrationBuilder.DropColumn(
                name: "CustomFieldsJson",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "EmailBounced",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeEmbedding",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ResumeEmbeddingAt",
                table: "Candidates");

            migrationBuilder.DropColumn(
                name: "ReminderCount",
                table: "Applications");
        }
    }
}
