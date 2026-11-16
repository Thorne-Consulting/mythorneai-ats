using System;
using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace MyThorneAI.Ats.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ProductCompletionProgram : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_InterviewKits_RequisitionId_SortOrder",
                table: "InterviewKits"
            );

            migrationBuilder.DropColumn(name: "InterviewStagesMarkdown", table: "PostingTemplates");

            migrationBuilder.DropColumn(name: "CandidateMessage", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "InterviewerMessage", table: "InterviewKits");

            migrationBuilder.AddColumn<string>(
                name: "WorkingHoursJson",
                table: "Users",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "DisabledReason",
                table: "WebhookEndpoints",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FailingSince",
                table: "WebhookEndpoints",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "PreviousSecret",
                table: "WebhookEndpoints",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PreviousSecretExpiresAt",
                table: "WebhookEndpoints",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "AttemptLog",
                table: "WebhookDeliveries",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "DurationMs",
                table: "WebhookDeliveries",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "RequestHeaders",
                table: "WebhookDeliveries",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ResponseBody",
                table: "WebhookDeliveries",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "AvatarTone",
                table: "Users",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "BufferMinutes",
                table: "Users",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<Guid>(
                name: "CustomRoleId",
                table: "Users",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "DashboardJson",
                table: "Users",
                type: "jsonb",
                nullable: true
            );

            migrationBuilder.AddColumn<string[]>(
                name: "Departments",
                table: "Users",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]
            );

            // A person's single team becomes their list of teams.
            migrationBuilder.Sql(
                "UPDATE \"Users\" SET \"Departments\" = ARRAY[\"Department\"] WHERE \"Department\" IS NOT NULL AND \"Department\" <> '';"
            );

            migrationBuilder.DropColumn(name: "Department", table: "Users");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "InvitedAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "InvitedByEmail",
                table: "Users",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSignInAt",
                table: "Users",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "MaxInterviewsPerDay",
                table: "Users",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "MaxInterviewsPerWeek",
                table: "Users",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "PreferencesJson",
                table: "Users",
                type: "jsonb",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                table: "Users",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "SubmittedBy",
                table: "Scorecards",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string[]>(
                name: "PinnedBy",
                table: "SavedViews",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]
            );

            migrationBuilder.AddColumn<bool>(
                name: "Shared",
                table: "SavedViews",
                type: "boolean",
                nullable: false,
                defaultValue: false
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ClosedAt",
                table: "Requisitions",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "LocationCity",
                table: "Requisitions",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "LocationCountry",
                table: "Requisitions",
                type: "character varying(2)",
                maxLength: 2,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "LocationRegion",
                table: "Requisitions",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "PipelineTemplateId",
                table: "Requisitions",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string[]>(
                name: "RemoteCountries",
                table: "Requisitions",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]
            );

            migrationBuilder.AddColumn<string>(
                name: "SalaryCurrency",
                table: "Requisitions",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<decimal>(
                name: "SalaryMax",
                table: "Requisitions",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: true
            );

            migrationBuilder.AddColumn<decimal>(
                name: "SalaryMin",
                table: "Requisitions",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "SalaryPeriod",
                table: "Requisitions",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<bool>(
                name: "ShowSalary",
                table: "Requisitions",
                type: "boolean",
                nullable: false,
                defaultValue: false
            );

            migrationBuilder.AddColumn<string>(
                name: "StatusReason",
                table: "Requisitions",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "PostingTemplates",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "QuestionsJson",
                table: "PostingTemplates",
                type: "jsonb",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "PostingTemplates",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AlterColumn<string>(
                name: "Color",
                table: "PipelineStages",
                type: "character varying(24)",
                maxLength: 24,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(24)",
                oldMaxLength: 24
            );

            migrationBuilder.AddColumn<Guid>(
                name: "AssessmentId",
                table: "PipelineStages",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CandidateLabel",
                table: "PipelineStages",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "EmailOnEntry",
                table: "PipelineStages",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<int>(
                name: "TargetDays",
                table: "PipelineStages",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Type",
                table: "PipelineStages",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string[]>(
                name: "ChannelNotificationKinds",
                table: "Organizations",
                type: "text[]",
                nullable: true
            );

            migrationBuilder.AddColumn<bool>(
                name: "RequireSso",
                table: "Organizations",
                type: "boolean",
                nullable: false,
                defaultValue: false
            );

            migrationBuilder.AddColumn<string>(
                name: "SenderNameFormat",
                table: "Organizations",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "WorkOsOrganizationId",
                table: "Organizations",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true
            );

            migrationBuilder.AddColumn<decimal>(
                name: "BaseSalary",
                table: "Offers",
                type: "numeric(14,2)",
                precision: 14,
                scale: 2,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Bonus",
                table: "Offers",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "Currency",
                table: "Offers",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "DeclineNote",
                table: "Offers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "DeclineReason",
                table: "Offers",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "EmploymentType",
                table: "Offers",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "Equity",
                table: "Offers",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExpiresAt",
                table: "Offers",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<DateOnly>(
                name: "ExpiresOn",
                table: "Offers",
                type: "date",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "LetterMarkdown",
                table: "Offers",
                type: "character varying(40000)",
                maxLength: 40000,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "LetterSent",
                table: "Offers",
                type: "character varying(60000)",
                maxLength: 60000,
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "LetterTemplateId",
                table: "Offers",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "LetterTemplateVersion",
                table: "Offers",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "Offers",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "PayPeriod",
                table: "Offers",
                type: "character varying(8)",
                maxLength: 8,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReminderSentAt",
                table: "Offers",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacesOfferId",
                table: "Offers",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RespondedAt",
                table: "Offers",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "RespondedBy",
                table: "Offers",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "RespondedName",
                table: "Offers",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true
            );

            migrationBuilder.AddColumn<DateOnly>(
                name: "StartDate",
                table: "Offers",
                type: "date",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "WorkMode",
                table: "Offers",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AlterColumn<Guid>(
                name: "ApplicationId",
                table: "Notes",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid"
            );

            migrationBuilder.AddColumn<Guid>(
                name: "CandidateId",
                table: "Notes",
                type: "uuid",
                nullable: true
            );

            // Notes written before candidate-level notes belong to their application's candidate.
            migrationBuilder.Sql(
                "UPDATE \"Notes\" n SET \"CandidateId\" = a.\"CandidateId\" FROM \"Applications\" a WHERE n.\"ApplicationId\" = a.\"Id\" AND n.\"CandidateId\" IS NULL;"
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EditedAt",
                table: "Notes",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "PinnedAt",
                table: "Notes",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "AttendeeResponsesJson",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CancelReason",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CancelledAt",
                table: "Interviews",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CancelledBy",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "IcsSequence",
                table: "Interviews",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<string>(
                name: "Location",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "LoopId",
                table: "Interviews",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "MeetingType",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "NoShowParty",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "OrganizerEmail",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "OutcomeAt",
                table: "Interviews",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "OutcomeBy",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "OutcomeNote",
                table: "Interviews",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "SchedulingRequestId",
                table: "Interviews",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "AudioStoredFileName",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "ChunksReceived",
                table: "InterviewRecordings",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<int>(
                name: "DurationSeconds",
                table: "InterviewRecordings",
                type: "integer",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastChunkAt",
                table: "InterviewRecordings",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ProcessingError",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "SegmentsJson",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Source",
                table: "InterviewRecordings",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "SpeakerNamesJson",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "InterviewRecordings",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "TranscribedAt",
                table: "InterviewRecordings",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "TranscriptError",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "TranscriptModel",
                table: "InterviewRecordings",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "TranscriptStatus",
                table: "InterviewRecordings",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "InterviewKits",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "PipelineStageId",
                table: "InterviewKits",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string[]>(
                name: "PoolEmails",
                table: "InterviewKits",
                type: "text[]",
                nullable: false,
                defaultValue: new string[0]
            );

            migrationBuilder.AddColumn<int>(
                name: "PoolPick",
                table: "InterviewKits",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "InterviewKits",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(
                    new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                    new TimeSpan(0, 0, 0, 0, 0)
                )
            );

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "InterviewKits",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "InterviewKits",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<Guid>(
                name: "VersionOfId",
                table: "InterviewKits",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "CompetencyId",
                table: "InterviewCriteria",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000")
            );

            migrationBuilder.AddColumn<string>(
                name: "FollowUps",
                table: "InterviewCriteria",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AlterColumn<string>(
                name: "Key",
                table: "EmailTemplates",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64
            );

            migrationBuilder.AddColumn<string>(
                name: "Category",
                table: "EmailTemplates",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                table: "EmailTemplates",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(
                    new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified),
                    new TimeSpan(0, 0, 0, 0, 0)
                )
            );

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "EmailTemplates",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Automatic"
            );

            migrationBuilder.AddColumn<string>(
                name: "Name",
                table: "EmailTemplates",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "OwnerEmail",
                table: "EmailTemplates",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                table: "EmailTemplates",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<Guid[]>(
                name: "AttachmentIds",
                table: "EmailOutbox",
                type: "uuid[]",
                nullable: false,
                defaultValue: new Guid[0]
            );

            migrationBuilder.AddColumn<string>(
                name: "FromName",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "InlineFileContentType",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "InlineFileName",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "InlineFileText",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ReplyTo",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ThreadReference",
                table: "EmailOutbox",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "DoNotContactReason",
                table: "Candidates",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true
            );

            migrationBuilder.AddColumn<Guid>(
                name: "ReferrerId",
                table: "Candidates",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                table: "Candidates",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Changes",
                table: "AuditEvents",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "Attachments",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "Resume"
            );

            migrationBuilder.AddColumn<Guid>(
                name: "MessageId",
                table: "Attachments",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<bool>(
                name: "AnyOne",
                table: "Approvals",
                type: "boolean",
                nullable: false,
                defaultValue: false
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EscalatedAt",
                table: "Approvals",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<bool>(
                name: "FromPolicy",
                table: "Approvals",
                type: "boolean",
                nullable: false,
                defaultValue: false
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastRemindedAt",
                table: "Approvals",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Note",
                table: "Approvals",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ReassignedBy",
                table: "Approvals",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ReassignedFromEmail",
                table: "Approvals",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<int>(
                name: "RemindersSent",
                table: "Approvals",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<int>(
                name: "Round",
                table: "Approvals",
                type: "integer",
                nullable: false,
                defaultValue: 0
            );

            migrationBuilder.AddColumn<string>(
                name: "AssigneeEmail",
                table: "Applications",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "DispositionNote",
                table: "Applications",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "SnoozedBy",
                table: "Applications",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "SnoozedUntil",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ThreadDoneAt",
                table: "Applications",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ThreadToken",
                table: "Applications",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "Channel",
                table: "ApplicationMessages",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Portal"
            );

            migrationBuilder.AddColumn<Guid>(
                name: "EmailOutboxItemId",
                table: "ApplicationMessages",
                type: "uuid",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "ExternalMessageId",
                table: "ApplicationMessages",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "FromAddress",
                table: "ApplicationMessages",
                type: "character varying(320)",
                maxLength: 320,
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "OriginalBody",
                table: "ApplicationMessages",
                type: "text",
                nullable: true
            );

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ScheduledFor",
                table: "ApplicationMessages",
                type: "timestamp with time zone",
                nullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CustomFields",
                table: "Candidates",
                type: "jsonb",
                nullable: true,
                computedColumnSql: "\"CustomFieldsJson\"::jsonb",
                stored: true
            );

            migrationBuilder.AddColumn<string>(
                name: "PhoneDigits",
                table: "Candidates",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true,
                computedColumnSql: "regexp_replace(coalesce(\"Phone\", ''), '[^0-9]', '', 'g')",
                stored: true
            );

            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "SearchVector",
                table: "Candidates",
                type: "tsvector",
                nullable: true,
                computedColumnSql: "setweight(to_tsvector('simple', coalesce(\"FirstName\", '') || ' ' || coalesce(\"LastName\", '') || ' ' || coalesce(\"Email\", '')), 'A')\n|| setweight(to_tsvector('simple', coalesce(\"CurrentTitle\", '')), 'B')\n|| setweight(to_tsvector('simple', coalesce(\"ResumeText\", '')), 'C')",
                stored: true
            );

            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "SearchVector",
                table: "ApplicationMessages",
                type: "tsvector",
                nullable: true,
                computedColumnSql: "to_tsvector('english', coalesce(\"Body\", ''))",
                stored: true
            );

            migrationBuilder.CreateTable(
                name: "AccessRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Email = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Name = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    Note = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: true
                    ),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    DecidedByEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    DecidedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccessRequests", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "ApplicationQuestions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Type = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Label = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: false
                    ),
                    HelpText = table.Column<string>(
                        type: "character varying(600)",
                        maxLength: 600,
                        nullable: true
                    ),
                    Required = table.Column<bool>(type: "boolean", nullable: false),
                    Options = table.Column<string[]>(type: "text[]", nullable: false),
                    KnockoutAnswers = table.Column<string[]>(type: "text[]", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    BankQuestionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationQuestions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationQuestions_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ApplicationSubmissions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    HeldProfileJson = table.Column<string>(type: "text", nullable: true),
                    HeldResumeId = table.Column<Guid>(type: "uuid", nullable: true),
                    UtmJson = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: true
                    ),
                    SentProfileJson = table.Column<string>(type: "text", nullable: true),
                    ResumeAttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ConfirmedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    ReminderSentAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationSubmissions_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_ApplicationSubmissions_Attachments_ResumeAttachmentId",
                        column: x => x.ResumeAttachmentId,
                        principalTable: "Attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ApprovalPolicies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SubjectType = table.Column<string>(
                        type: "character varying(32)",
                        maxLength: 32,
                        nullable: false
                    ),
                    Departments = table.Column<string[]>(type: "text[]", nullable: false),
                    Mode = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Approvers = table.Column<string[]>(type: "text[]", nullable: false),
                    ReminderDays = table.Column<int>(type: "integer", nullable: false),
                    UpdatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApprovalPolicies", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "Assessments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    Department = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: true
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    ExpiryDays = table.Column<int>(type: "integer", nullable: false),
                    RemindAfterDays = table.Column<int>(type: "integer", nullable: true),
                    BlindReview = table.Column<bool>(type: "boolean", nullable: false),
                    ProviderName = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: true
                    ),
                    ExternalUrl = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: true
                    ),
                    ContentJson = table.Column<string>(type: "jsonb", nullable: false),
                    CurrentVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assessments", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "CandidateMagicLinks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(
                        type: "character varying(128)",
                        maxLength: 128,
                        nullable: false
                    ),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(
                        type: "character varying(24)",
                        maxLength: 24,
                        nullable: false
                    ),
                    Path = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: true
                    ),
                    ExpiresAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UsedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CandidateMagicLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CandidateMagicLinks_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_CandidateMagicLinks_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "CareerSites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    LogoFile = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: true
                    ),
                    LogoDarkFile = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: true
                    ),
                    IconFile = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: true
                    ),
                    BrandColor = table.Column<string>(
                        type: "character varying(7)",
                        maxLength: 7,
                        nullable: true
                    ),
                    Headline = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: true
                    ),
                    IntroMarkdown = table.Column<string>(
                        type: "character varying(4000)",
                        maxLength: 4000,
                        nullable: true
                    ),
                    WebsiteUrl = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: true
                    ),
                    SocialUrls = table.Column<string[]>(type: "text[]", nullable: false),
                    RequireResume = table.Column<bool>(type: "boolean", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CareerSites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CareerSites_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "CustomRoles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: false
                    ),
                    Description = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: true
                    ),
                    Permissions = table.Column<string[]>(type: "text[]", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomRoles", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "DocumentRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(
                        type: "character varying(80)",
                        maxLength: 80,
                        nullable: false
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(24)",
                        maxLength: 24,
                        nullable: false
                    ),
                    Note = table.Column<string>(
                        type: "character varying(500)",
                        maxLength: 500,
                        nullable: true
                    ),
                    RequestedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    RequestedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    AttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    FulfilledAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DocumentRequests_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_DocumentRequests_Attachments_AttachmentId",
                        column: x => x.AttachmentId,
                        principalTable: "Attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "EmailTemplateVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateRef = table.Column<string>(
                        type: "character varying(64)",
                        maxLength: 64,
                        nullable: false
                    ),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    Subject = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: false
                    ),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Action = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    EditedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    EditedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailTemplateVersions", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "FitJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_FitJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FitJobs_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_FitJobs_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "HiringDecisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Decision = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    ToStageId = table.Column<Guid>(type: "uuid", nullable: true),
                    Rationale = table.Column<string>(
                        type: "character varying(4000)",
                        maxLength: 4000,
                        nullable: false
                    ),
                    DecidedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    DecidedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HiringDecisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HiringDecisions_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ImportBatches",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FileName = table.Column<string>(
                        type: "character varying(260)",
                        maxLength: 260,
                        nullable: false
                    ),
                    CreatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Created = table.Column<int>(type: "integer", nullable: false),
                    Updated = table.Column<int>(type: "integer", nullable: false),
                    Skipped = table.Column<int>(type: "integer", nullable: false),
                    CandidateIds = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UndoneAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    UndoneBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportBatches", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "InterviewNotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CriterionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Question = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: true
                    ),
                    Body = table.Column<string>(
                        type: "character varying(20000)",
                        maxLength: 20000,
                        nullable: false
                    ),
                    Covered = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InterviewNotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InterviewNotes_Interviews_InterviewId",
                        column: x => x.InterviewId,
                        principalTable: "Interviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "InterviewSummaries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Model = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: false
                    ),
                    Sources = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: false
                    ),
                    Reason = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: true
                    ),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    EditedBy = table.Column<string>(type: "text", nullable: true),
                    EditedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InterviewSummaries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InterviewSummaries_Interviews_InterviewId",
                        column: x => x.InterviewId,
                        principalTable: "Interviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "JobDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Title = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    DataJson = table.Column<string>(type: "jsonb", nullable: false),
                    Step = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobDrafts", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "KitTemplates",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Summary = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    Instructions = table.Column<string>(type: "text", nullable: false),
                    CompetenciesJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ArchivedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KitTemplates", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "MessageThreadStates",
                columns: table => new
                {
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    LastReadAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    MarkedUnread = table.Column<bool>(type: "boolean", nullable: false),
                    Starred = table.Column<bool>(type: "boolean", nullable: false),
                    ReplyToken = table.Column<string>(
                        type: "character varying(40)",
                        maxLength: 40,
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey(
                        "PK_MessageThreadStates",
                        x => new { x.ApplicationId, x.UserEmail }
                    );
                    table.ForeignKey(
                        name: "FK_MessageThreadStates_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "NoteMentions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    NoteId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NoteMentions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NoteMentions_Notes_NoteId",
                        column: x => x.NoteId,
                        principalTable: "Notes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "NotificationPreferences",
                columns: table => new
                {
                    UserEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(40)",
                        maxLength: 40,
                        nullable: false
                    ),
                    InApp = table.Column<bool>(type: "boolean", nullable: false),
                    Email = table.Column<bool>(type: "boolean", nullable: false),
                    Digest = table.Column<bool>(type: "boolean", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey(
                        "PK_NotificationPreferences",
                        x => new { x.UserEmail, x.Kind }
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Notifications",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(40)",
                        maxLength: 40,
                        nullable: false
                    ),
                    Title = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: false
                    ),
                    Body = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: true
                    ),
                    Href = table.Column<string>(
                        type: "character varying(500)",
                        maxLength: 500,
                        nullable: false
                    ),
                    ActorEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    GroupKey = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: true
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ReadAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    DigestedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Notifications", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "QuestionBankItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Question = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: false
                    ),
                    FollowUps = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: false
                    ),
                    GoodLooksLike = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: false
                    ),
                    Weight = table.Column<int>(type: "integer", nullable: false),
                    Tags = table.Column<string[]>(type: "text[]", nullable: false),
                    CreatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ArchivedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuestionBankItems", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "RejectionReasons",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    NeedsNote = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ArchivedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RejectionReasons", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "ReportSubscriptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SavedViewId = table.Column<Guid>(type: "uuid", nullable: false),
                    OwnerEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Recipients = table.Column<string[]>(type: "text[]", nullable: false),
                    Frequency = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    DayOfWeek = table.Column<int>(type: "integer", nullable: false),
                    DayOfMonth = table.Column<int>(type: "integer", nullable: false),
                    Hour = table.Column<int>(type: "integer", nullable: false),
                    NextSendAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    LastSentAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    Paused = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportSubscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReportSubscriptions_SavedViews_SavedViewId",
                        column: x => x.SavedViewId,
                        principalTable: "SavedViews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "RequisitionMembers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequisitionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Role = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RequisitionMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RequisitionMembers_Requisitions_RequisitionId",
                        column: x => x.RequisitionId,
                        principalTable: "Requisitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_RequisitionMembers_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ResumeUploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(
                        type: "character varying(128)",
                        maxLength: 128,
                        nullable: false
                    ),
                    StoredFileName = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: false
                    ),
                    OriginalFileName = table.Column<string>(
                        type: "character varying(260)",
                        maxLength: 260,
                        nullable: false
                    ),
                    ContentType = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: false
                    ),
                    Length = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ResumeUploads", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "SchedulingRequests",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewKitId = table.Column<Guid>(type: "uuid", nullable: true),
                    Title = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    InterviewerEmails = table.Column<string[]>(type: "text[]", nullable: false),
                    OfferedStarts = table.Column<DateTimeOffset[]>(
                        type: "timestamp with time zone[]",
                        nullable: false
                    ),
                    WindowStart = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    WindowEnd = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    MinimumNoticeHours = table.Column<int>(type: "integer", nullable: false),
                    MeetingType = table.Column<string>(
                        type: "character varying(24)",
                        maxLength: 24,
                        nullable: true
                    ),
                    MeetingLink = table.Column<string>(type: "text", nullable: true),
                    Location = table.Column<string>(type: "text", nullable: true),
                    MessageToCandidate = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: true
                    ),
                    TimeZone = table.Column<string>(
                        type: "character varying(64)",
                        maxLength: 64,
                        nullable: false
                    ),
                    ExpiresAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    Status = table.Column<string>(
                        type: "character varying(24)",
                        maxLength: 24,
                        nullable: false
                    ),
                    InterviewId = table.Column<Guid>(type: "uuid", nullable: true),
                    CandidateNote = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: true
                    ),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    BookedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    LastReminderAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    ReminderCount = table.Column<int>(type: "integer", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SchedulingRequests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SchedulingRequests_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ScorecardAddenda",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ScorecardId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(
                        type: "character varying(4000)",
                        maxLength: 4000,
                        nullable: false
                    ),
                    AuthorEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScorecardAddenda", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScorecardAddenda_Scorecards_ScorecardId",
                        column: x => x.ScorecardId,
                        principalTable: "Scorecards",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "ScorecardDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewId = table.Column<Guid>(type: "uuid", nullable: false),
                    InterviewerEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    Json = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScorecardDrafts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScorecardDrafts_Interviews_InterviewId",
                        column: x => x.InterviewId,
                        principalTable: "Interviews",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Sources",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(100)",
                        maxLength: 100,
                        nullable: false
                    ),
                    Category = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Codes = table.Column<string[]>(type: "text[]", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Sources", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "TalentPools",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(120)",
                        maxLength: 120,
                        nullable: false
                    ),
                    Description = table.Column<string>(
                        type: "character varying(500)",
                        maxLength: 500,
                        nullable: false
                    ),
                    OwnerEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TalentPools", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "UnmatchedInboundEmails",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExternalMessageId = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: false
                    ),
                    FromAddress = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    FromName = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: true
                    ),
                    Subject = table.Column<string>(
                        type: "character varying(500)",
                        maxLength: 500,
                        nullable: false
                    ),
                    Body = table.Column<string>(type: "text", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UnmatchedInboundEmails", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "ApplicationAnswers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Label = table.Column<string>(
                        type: "character varying(300)",
                        maxLength: 300,
                        nullable: false
                    ),
                    Type = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Values = table.Column<string[]>(type: "text[]", nullable: false),
                    AttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Flagged = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApplicationAnswers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ApplicationAnswers_ApplicationQuestions_QuestionId",
                        column: x => x.QuestionId,
                        principalTable: "ApplicationQuestions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                    table.ForeignKey(
                        name: "FK_ApplicationAnswers_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_ApplicationAnswers_Attachments_AttachmentId",
                        column: x => x.AttachmentId,
                        principalTable: "Attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "AssessmentVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    ContentJson = table.Column<string>(type: "jsonb", nullable: false),
                    PublishedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    PublishedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentVersions_Assessments_AssessmentId",
                        column: x => x.AssessmentId,
                        principalTable: "Assessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "PipelineTemplateStages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PipelineTemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(80)",
                        maxLength: 80,
                        nullable: false
                    ),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    Type = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    CandidateLabel = table.Column<string>(
                        type: "character varying(80)",
                        maxLength: 80,
                        nullable: false
                    ),
                    EmailOnEntry = table.Column<string>(
                        type: "character varying(8)",
                        maxLength: 8,
                        nullable: false
                    ),
                    TargetDays = table.Column<int>(type: "integer", nullable: true),
                    AssessmentId = table.Column<Guid>(type: "uuid", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PipelineTemplateStages", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PipelineTemplateStages_Assessments_AssessmentId",
                        column: x => x.AssessmentId,
                        principalTable: "Assessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                    table.ForeignKey(
                        name: "FK_PipelineTemplateStages_PipelineTemplates_PipelineTemplateId",
                        column: x => x.PipelineTemplateId,
                        principalTable: "PipelineTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "TalentPoolMembers",
                columns: table => new
                {
                    PoolId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    AddedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TalentPoolMembers", x => new { x.PoolId, x.CandidateId });
                    table.ForeignKey(
                        name: "FK_TalentPoolMembers_Candidates_CandidateId",
                        column: x => x.CandidateId,
                        principalTable: "Candidates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_TalentPoolMembers_TalentPools_PoolId",
                        column: x => x.PoolId,
                        principalTable: "TalentPools",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "AssessmentInvites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AssessmentId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Attempt = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    InvitedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    InvitedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    ExpiresAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    StartedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    DeadlineAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    ExtraMinutes = table.Column<int>(type: "integer", nullable: false),
                    SubmittedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    AutoSubmitted = table.Column<bool>(type: "boolean", nullable: false),
                    MaxPoints = table.Column<decimal>(
                        type: "numeric(9,2)",
                        precision: 9,
                        scale: 2,
                        nullable: false
                    ),
                    EarnedPoints = table.Column<decimal>(
                        type: "numeric(9,2)",
                        precision: 9,
                        scale: 2,
                        nullable: false
                    ),
                    PendingCount = table.Column<int>(type: "integer", nullable: false),
                    Percent = table.Column<int>(type: "integer", nullable: true),
                    Decision = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: true
                    ),
                    DecidedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    DecidedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    Comment = table.Column<string>(
                        type: "character varying(4000)",
                        maxLength: 4000,
                        nullable: true
                    ),
                    ReminderCount = table.Column<int>(type: "integer", nullable: false),
                    LastReminderAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    IntegrityJson = table.Column<string>(type: "jsonb", nullable: false),
                    ReplacedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    ReportAttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentInvites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentInvites_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_AssessmentInvites_AssessmentVersions_VersionId",
                        column: x => x.VersionId,
                        principalTable: "AssessmentVersions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict
                    );
                    table.ForeignKey(
                        name: "FK_AssessmentInvites_Assessments_AssessmentId",
                        column: x => x.AssessmentId,
                        principalTable: "Assessments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_AssessmentInvites_Attachments_ReportAttachmentId",
                        column: x => x.ReportAttachmentId,
                        principalTable: "Attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "AssessmentAnswers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InviteId = table.Column<Guid>(type: "uuid", nullable: false),
                    QuestionId = table.Column<string>(
                        type: "character varying(64)",
                        maxLength: 64,
                        nullable: false
                    ),
                    ChoiceIds = table.Column<string[]>(type: "text[]", nullable: false),
                    Text = table.Column<string>(
                        type: "character varying(100000)",
                        maxLength: 100000,
                        nullable: true
                    ),
                    AttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Seconds = table.Column<int>(type: "integer", nullable: false),
                    SavedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    AutoPoints = table.Column<decimal>(
                        type: "numeric(9,2)",
                        precision: 9,
                        scale: 2,
                        nullable: true
                    ),
                    ReviewerPoints = table.Column<decimal>(
                        type: "numeric(9,2)",
                        precision: 9,
                        scale: 2,
                        nullable: true
                    ),
                    ReviewerEmail = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    ReviewerNote = table.Column<string>(
                        type: "character varying(4000)",
                        maxLength: 4000,
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssessmentAnswers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AssessmentAnswers_AssessmentInvites_InviteId",
                        column: x => x.InviteId,
                        principalTable: "AssessmentInvites",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                    table.ForeignKey(
                        name: "FK_AssessmentAnswers_Attachments_AttachmentId",
                        column: x => x.AttachmentId,
                        principalTable: "Attachments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "WorkflowRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkflowId = table.Column<Guid>(type: "uuid", nullable: false),
                    VersionId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApplicationId = table.Column<Guid>(type: "uuid", nullable: false),
                    TriggerKind = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: false
                    ),
                    Subject = table.Column<string>(
                        type: "character varying(80)",
                        maxLength: 80,
                        nullable: false
                    ),
                    DedupeKey = table.Column<string>(
                        type: "character varying(80)",
                        maxLength: 80,
                        nullable: true
                    ),
                    ContextJson = table.Column<string>(type: "jsonb", nullable: true),
                    Depth = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    CurrentNodeId = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: true
                    ),
                    NextRunAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    LockedUntil = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    LastError = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: true
                    ),
                    StartedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    FinishedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowRuns_Applications_ApplicationId",
                        column: x => x.ApplicationId,
                        principalTable: "Applications",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "WorkflowStepRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RunId = table.Column<Guid>(type: "uuid", nullable: false),
                    NodeId = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: false
                    ),
                    Kind = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: false
                    ),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    Branch = table.Column<string>(
                        type: "character varying(200)",
                        maxLength: 200,
                        nullable: true
                    ),
                    Output = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: true
                    ),
                    DetailJson = table.Column<string>(type: "jsonb", nullable: true),
                    Error = table.Column<string>(
                        type: "character varying(2000)",
                        maxLength: 2000,
                        nullable: true
                    ),
                    Attempts = table.Column<int>(type: "integer", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    FinishedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowStepRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowStepRuns_WorkflowRuns_RunId",
                        column: x => x.RunId,
                        principalTable: "WorkflowRuns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateTable(
                name: "Workflows",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(
                        type: "character varying(160)",
                        maxLength: 160,
                        nullable: false
                    ),
                    Status = table.Column<string>(
                        type: "character varying(16)",
                        maxLength: 16,
                        nullable: false
                    ),
                    BuiltInKey = table.Column<string>(
                        type: "character varying(40)",
                        maxLength: 40,
                        nullable: true
                    ),
                    DraftGraphJson = table.Column<string>(type: "jsonb", nullable: false),
                    PublishedVersionId = table.Column<Guid>(type: "uuid", nullable: true),
                    TriggerKind = table.Column<string>(
                        type: "character varying(60)",
                        maxLength: 60,
                        nullable: true
                    ),
                    RunsOncePerApplication = table.Column<bool>(type: "boolean", nullable: false),
                    MaxRunsPerApplication = table.Column<int>(type: "integer", nullable: true),
                    StopWhenClosed = table.Column<bool>(type: "boolean", nullable: false),
                    RespectQuietHours = table.Column<bool>(type: "boolean", nullable: false),
                    FailureAlertedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: true
                    ),
                    CreatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    CreatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                    UpdatedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: true
                    ),
                    UpdatedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Workflows", x => x.Id);
                }
            );

            migrationBuilder.CreateTable(
                name: "WorkflowVersions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkflowId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    GraphJson = table.Column<string>(type: "jsonb", nullable: false),
                    Note = table.Column<string>(
                        type: "character varying(500)",
                        maxLength: 500,
                        nullable: true
                    ),
                    Summary = table.Column<string>(
                        type: "character varying(1000)",
                        maxLength: 1000,
                        nullable: false
                    ),
                    PublishedBy = table.Column<string>(
                        type: "character varying(320)",
                        maxLength: 320,
                        nullable: false
                    ),
                    PublishedAt = table.Column<DateTimeOffset>(
                        type: "timestamp with time zone",
                        nullable: false
                    ),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowVersions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkflowVersions_Workflows_WorkflowId",
                        column: x => x.WorkflowId,
                        principalTable: "Workflows",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade
                    );
                }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Users_CustomRoleId",
                table: "Users",
                column: "CustomRoleId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_PipelineStages_AssessmentId",
                table: "PipelineStages",
                column: "AssessmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Offers_Status_ExpiresAt",
                table: "Offers",
                columns: new[] { "Status", "ExpiresAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Notes_CandidateId_CreatedAt",
                table: "Notes",
                columns: new[] { "CandidateId", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewKits_PipelineStageId",
                table: "InterviewKits",
                column: "PipelineStageId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewKits_RequisitionId_SortOrder",
                table: "InterviewKits",
                columns: new[] { "RequisitionId", "SortOrder" },
                unique: true,
                filter: "\"VersionOfId\" IS NULL"
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewKits_VersionOfId",
                table: "InterviewKits",
                column: "VersionOfId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplates_Kind_OwnerEmail",
                table: "EmailTemplates",
                columns: new[] { "Kind", "OwnerEmail" }
            );

            migrationBuilder
                .CreateIndex(name: "IX_Candidates_Email_Trgm", table: "Candidates", column: "Email")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder
                .CreateIndex(
                    name: "IX_Candidates_FirstName_Trgm",
                    table: "Candidates",
                    column: "FirstName"
                )
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder
                .CreateIndex(
                    name: "IX_Candidates_LastName_Trgm",
                    table: "Candidates",
                    column: "LastName"
                )
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_PhoneDigits",
                table: "Candidates",
                column: "PhoneDigits"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Candidates_ReferrerId",
                table: "Candidates",
                column: "ReferrerId"
            );

            migrationBuilder
                .CreateIndex(
                    name: "IX_Candidates_SearchVector",
                    table: "Candidates",
                    column: "SearchVector"
                )
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "IX_AuditEvents_OccurredAt_Id",
                table: "AuditEvents",
                columns: new[] { "OccurredAt", "Id" },
                descending: new bool[0]
            );

            migrationBuilder.CreateIndex(
                name: "IX_Attachments_MessageId",
                table: "Attachments",
                column: "MessageId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Approvals_RequestedBy_Decision",
                table: "Approvals",
                columns: new[] { "RequestedBy", "Decision" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Applications_AssigneeEmail",
                table: "Applications",
                column: "AssigneeEmail"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Applications_ThreadToken",
                table: "Applications",
                column: "ThreadToken",
                unique: true,
                filter: "\"ThreadToken\" IS NOT NULL"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationMessages_EmailOutboxItemId",
                table: "ApplicationMessages",
                column: "EmailOutboxItemId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationMessages_ExternalMessageId",
                table: "ApplicationMessages",
                column: "ExternalMessageId",
                unique: true,
                filter: "\"ExternalMessageId\" IS NOT NULL"
            );

            migrationBuilder
                .CreateIndex(
                    name: "IX_ApplicationMessages_SearchVector",
                    table: "ApplicationMessages",
                    column: "SearchVector"
                )
                .Annotation("Npgsql:IndexMethod", "GIN");

            migrationBuilder.CreateIndex(
                name: "IX_AccessRequests_Email",
                table: "AccessRequests",
                column: "Email",
                unique: true,
                filter: "\"Status\" = 'Pending'"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationAnswers_ApplicationId_SortOrder",
                table: "ApplicationAnswers",
                columns: new[] { "ApplicationId", "SortOrder" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationAnswers_AttachmentId",
                table: "ApplicationAnswers",
                column: "AttachmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationAnswers_QuestionId_Flagged",
                table: "ApplicationAnswers",
                columns: new[] { "QuestionId", "Flagged" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationQuestions_RequisitionId_SortOrder",
                table: "ApplicationQuestions",
                columns: new[] { "RequisitionId", "SortOrder" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationSubmissions_ApplicationId",
                table: "ApplicationSubmissions",
                column: "ApplicationId",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationSubmissions_ConfirmedAt_SubmittedAt",
                table: "ApplicationSubmissions",
                columns: new[] { "ConfirmedAt", "SubmittedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApplicationSubmissions_ResumeAttachmentId",
                table: "ApplicationSubmissions",
                column: "ResumeAttachmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ApprovalPolicies_SubjectType",
                table: "ApprovalPolicies",
                column: "SubjectType"
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentAnswers_AttachmentId",
                table: "AssessmentAnswers",
                column: "AttachmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentAnswers_InviteId_QuestionId",
                table: "AssessmentAnswers",
                columns: new[] { "InviteId", "QuestionId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentInvites_ApplicationId",
                table: "AssessmentInvites",
                column: "ApplicationId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentInvites_AssessmentId_Status",
                table: "AssessmentInvites",
                columns: new[] { "AssessmentId", "Status" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentInvites_ReportAttachmentId",
                table: "AssessmentInvites",
                column: "ReportAttachmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentInvites_Status_ExpiresAt",
                table: "AssessmentInvites",
                columns: new[] { "Status", "ExpiresAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentInvites_VersionId",
                table: "AssessmentInvites",
                column: "VersionId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Assessments_Status",
                table: "Assessments",
                column: "Status"
            );

            migrationBuilder.CreateIndex(
                name: "IX_AssessmentVersions_AssessmentId_Number",
                table: "AssessmentVersions",
                columns: new[] { "AssessmentId", "Number" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_CandidateMagicLinks_ApplicationId",
                table: "CandidateMagicLinks",
                column: "ApplicationId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_CandidateMagicLinks_CandidateId",
                table: "CandidateMagicLinks",
                column: "CandidateId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_CandidateMagicLinks_ExpiresAt",
                table: "CandidateMagicLinks",
                column: "ExpiresAt"
            );

            migrationBuilder.CreateIndex(
                name: "IX_CandidateMagicLinks_TokenHash",
                table: "CandidateMagicLinks",
                column: "TokenHash",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_CareerSites_OrganizationId",
                table: "CareerSites",
                column: "OrganizationId",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_DocumentRequests_ApplicationId_FulfilledAt",
                table: "DocumentRequests",
                columns: new[] { "ApplicationId", "FulfilledAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_DocumentRequests_AttachmentId",
                table: "DocumentRequests",
                column: "AttachmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_EmailTemplateVersions_TemplateRef_RequisitionId_Version",
                table: "EmailTemplateVersions",
                columns: new[] { "TemplateRef", "RequisitionId", "Version" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_FitJobs_CandidateId",
                table: "FitJobs",
                column: "CandidateId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_FitJobs_RequisitionId_CandidateId",
                table: "FitJobs",
                columns: new[] { "RequisitionId", "CandidateId" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_FitJobs_Status_CreatedAt",
                table: "FitJobs",
                columns: new[] { "Status", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_HiringDecisions_ApplicationId_DecidedAt",
                table: "HiringDecisions",
                columns: new[] { "ApplicationId", "DecidedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ImportBatches_CreatedAt",
                table: "ImportBatches",
                column: "CreatedAt"
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewNotes_InterviewId_AuthorEmail",
                table: "InterviewNotes",
                columns: new[] { "InterviewId", "AuthorEmail" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewSummaries_InterviewId_CreatedAt",
                table: "InterviewSummaries",
                columns: new[] { "InterviewId", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_JobDrafts_OwnerEmail_UpdatedAt",
                table: "JobDrafts",
                columns: new[] { "OwnerEmail", "UpdatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_MessageThreadStates_ReplyToken",
                table: "MessageThreadStates",
                column: "ReplyToken",
                unique: true,
                filter: "\"ReplyToken\" IS NOT NULL"
            );

            migrationBuilder.CreateIndex(
                name: "IX_MessageThreadStates_UserEmail",
                table: "MessageThreadStates",
                column: "UserEmail"
            );

            migrationBuilder.CreateIndex(
                name: "IX_NoteMentions_NoteId_UserEmail",
                table: "NoteMentions",
                columns: new[] { "NoteId", "UserEmail" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_NoteMentions_UserEmail_CreatedAt",
                table: "NoteMentions",
                columns: new[] { "UserEmail", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserEmail_GroupKey",
                table: "Notifications",
                columns: new[] { "UserEmail", "GroupKey" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserEmail_ReadAt_CreatedAt",
                table: "Notifications",
                columns: new[] { "UserEmail", "ReadAt", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_PipelineTemplateStages_AssessmentId",
                table: "PipelineTemplateStages",
                column: "AssessmentId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_PipelineTemplateStages_PipelineTemplateId_SortOrder",
                table: "PipelineTemplateStages",
                columns: new[] { "PipelineTemplateId", "SortOrder" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_RejectionReasons_Label",
                table: "RejectionReasons",
                column: "Label",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_ReportSubscriptions_Paused_NextSendAt",
                table: "ReportSubscriptions",
                columns: new[] { "Paused", "NextSendAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ReportSubscriptions_SavedViewId",
                table: "ReportSubscriptions",
                column: "SavedViewId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_RequisitionMembers_RequisitionId_UserId",
                table: "RequisitionMembers",
                columns: new[] { "RequisitionId", "UserId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_RequisitionMembers_UserId",
                table: "RequisitionMembers",
                column: "UserId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ResumeUploads_CreatedAt",
                table: "ResumeUploads",
                column: "CreatedAt"
            );

            migrationBuilder.CreateIndex(
                name: "IX_ResumeUploads_TokenHash",
                table: "ResumeUploads",
                column: "TokenHash",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_SchedulingRequests_ApplicationId_Status",
                table: "SchedulingRequests",
                columns: new[] { "ApplicationId", "Status" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_SchedulingRequests_Status_ExpiresAt",
                table: "SchedulingRequests",
                columns: new[] { "Status", "ExpiresAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ScorecardAddenda_ScorecardId_CreatedAt",
                table: "ScorecardAddenda",
                columns: new[] { "ScorecardId", "CreatedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_ScorecardDrafts_InterviewId_InterviewerEmail",
                table: "ScorecardDrafts",
                columns: new[] { "InterviewId", "InterviewerEmail" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_Sources_Name",
                table: "Sources",
                column: "Name",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_TalentPoolMembers_CandidateId",
                table: "TalentPoolMembers",
                column: "CandidateId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_UnmatchedInboundEmails_ExternalMessageId",
                table: "UnmatchedInboundEmails",
                column: "ExternalMessageId",
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRuns_ApplicationId_WorkflowId_Subject",
                table: "WorkflowRuns",
                columns: new[] { "ApplicationId", "WorkflowId", "Subject" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRuns_Status_NextRunAt",
                table: "WorkflowRuns",
                columns: new[] { "Status", "NextRunAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRuns_VersionId",
                table: "WorkflowRuns",
                column: "VersionId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRuns_WorkflowId_ApplicationId_DedupeKey",
                table: "WorkflowRuns",
                columns: new[] { "WorkflowId", "ApplicationId", "DedupeKey" },
                unique: true,
                filter: "\"DedupeKey\" IS NOT NULL"
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowRuns_WorkflowId_StartedAt",
                table: "WorkflowRuns",
                columns: new[] { "WorkflowId", "StartedAt" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_Workflows_BuiltInKey",
                table: "Workflows",
                column: "BuiltInKey",
                unique: true,
                filter: "\"BuiltInKey\" IS NOT NULL"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Workflows_PublishedVersionId",
                table: "Workflows",
                column: "PublishedVersionId"
            );

            migrationBuilder.CreateIndex(
                name: "IX_Workflows_Status_TriggerKind",
                table: "Workflows",
                columns: new[] { "Status", "TriggerKind" }
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowStepRuns_RunId_NodeId",
                table: "WorkflowStepRuns",
                columns: new[] { "RunId", "NodeId" },
                unique: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowVersions_WorkflowId_Number",
                table: "WorkflowVersions",
                columns: new[] { "WorkflowId", "Number" },
                unique: true
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Attachments_ApplicationMessages_MessageId",
                table: "Attachments",
                column: "MessageId",
                principalTable: "ApplicationMessages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Candidates_Users_ReferrerId",
                table: "Candidates",
                column: "ReferrerId",
                principalTable: "Users",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );

            migrationBuilder.AddForeignKey(
                name: "FK_InterviewKits_InterviewKits_VersionOfId",
                table: "InterviewKits",
                column: "VersionOfId",
                principalTable: "InterviewKits",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade
            );

            migrationBuilder.AddForeignKey(
                name: "FK_InterviewKits_PipelineStages_PipelineStageId",
                table: "InterviewKits",
                column: "PipelineStageId",
                principalTable: "PipelineStages",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Notes_Candidates_CandidateId",
                table: "Notes",
                column: "CandidateId",
                principalTable: "Candidates",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade
            );

            migrationBuilder.AddForeignKey(
                name: "FK_PipelineStages_Assessments_AssessmentId",
                table: "PipelineStages",
                column: "AssessmentId",
                principalTable: "Assessments",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Users_CustomRoles_CustomRoleId",
                table: "Users",
                column: "CustomRoleId",
                principalTable: "CustomRoles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict
            );

            migrationBuilder.AddForeignKey(
                name: "FK_WorkflowRuns_WorkflowVersions_VersionId",
                table: "WorkflowRuns",
                column: "VersionId",
                principalTable: "WorkflowVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict
            );

            migrationBuilder.AddForeignKey(
                name: "FK_WorkflowRuns_Workflows_WorkflowId",
                table: "WorkflowRuns",
                column: "WorkflowId",
                principalTable: "Workflows",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade
            );

            migrationBuilder.AddForeignKey(
                name: "FK_Workflows_WorkflowVersions_PublishedVersionId",
                table: "Workflows",
                column: "PublishedVersionId",
                principalTable: "WorkflowVersions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull
            );
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Attachments_ApplicationMessages_MessageId",
                table: "Attachments"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_Candidates_Users_ReferrerId",
                table: "Candidates"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_InterviewKits_InterviewKits_VersionOfId",
                table: "InterviewKits"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_InterviewKits_PipelineStages_PipelineStageId",
                table: "InterviewKits"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_Notes_Candidates_CandidateId",
                table: "Notes"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_PipelineStages_Assessments_AssessmentId",
                table: "PipelineStages"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_Users_CustomRoles_CustomRoleId",
                table: "Users"
            );

            migrationBuilder.DropForeignKey(
                name: "FK_Workflows_WorkflowVersions_PublishedVersionId",
                table: "Workflows"
            );

            migrationBuilder.DropTable(name: "AccessRequests");

            migrationBuilder.DropTable(name: "ApplicationAnswers");

            migrationBuilder.DropTable(name: "ApplicationSubmissions");

            migrationBuilder.DropTable(name: "ApprovalPolicies");

            migrationBuilder.DropTable(name: "AssessmentAnswers");

            migrationBuilder.DropTable(name: "CandidateMagicLinks");

            migrationBuilder.DropTable(name: "CareerSites");

            migrationBuilder.DropTable(name: "CustomRoles");

            migrationBuilder.DropTable(name: "DocumentRequests");

            migrationBuilder.DropTable(name: "EmailTemplateVersions");

            migrationBuilder.DropTable(name: "FitJobs");

            migrationBuilder.DropTable(name: "HiringDecisions");

            migrationBuilder.DropTable(name: "ImportBatches");

            migrationBuilder.DropTable(name: "InterviewNotes");

            migrationBuilder.DropTable(name: "InterviewSummaries");

            migrationBuilder.DropTable(name: "JobDrafts");

            migrationBuilder.DropTable(name: "KitTemplates");

            migrationBuilder.DropTable(name: "MessageThreadStates");

            migrationBuilder.DropTable(name: "NoteMentions");

            migrationBuilder.DropTable(name: "NotificationPreferences");

            migrationBuilder.DropTable(name: "Notifications");

            migrationBuilder.DropTable(name: "PipelineTemplateStages");

            migrationBuilder.DropTable(name: "QuestionBankItems");

            migrationBuilder.DropTable(name: "RejectionReasons");

            migrationBuilder.DropTable(name: "ReportSubscriptions");

            migrationBuilder.DropTable(name: "RequisitionMembers");

            migrationBuilder.DropTable(name: "ResumeUploads");

            migrationBuilder.DropTable(name: "SchedulingRequests");

            migrationBuilder.DropTable(name: "ScorecardAddenda");

            migrationBuilder.DropTable(name: "ScorecardDrafts");

            migrationBuilder.DropTable(name: "Sources");

            migrationBuilder.DropTable(name: "TalentPoolMembers");

            migrationBuilder.DropTable(name: "UnmatchedInboundEmails");

            migrationBuilder.DropTable(name: "WorkflowStepRuns");

            migrationBuilder.DropTable(name: "ApplicationQuestions");

            migrationBuilder.DropTable(name: "AssessmentInvites");

            migrationBuilder.DropTable(name: "TalentPools");

            migrationBuilder.DropTable(name: "WorkflowRuns");

            migrationBuilder.DropTable(name: "AssessmentVersions");

            migrationBuilder.DropTable(name: "Assessments");

            migrationBuilder.DropTable(name: "WorkflowVersions");

            migrationBuilder.DropTable(name: "Workflows");

            migrationBuilder.DropIndex(name: "IX_Users_CustomRoleId", table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_PipelineStages_AssessmentId",
                table: "PipelineStages"
            );

            migrationBuilder.DropIndex(name: "IX_Offers_Status_ExpiresAt", table: "Offers");

            migrationBuilder.DropIndex(name: "IX_Notes_CandidateId_CreatedAt", table: "Notes");

            migrationBuilder.DropIndex(
                name: "IX_InterviewKits_PipelineStageId",
                table: "InterviewKits"
            );

            migrationBuilder.DropIndex(
                name: "IX_InterviewKits_RequisitionId_SortOrder",
                table: "InterviewKits"
            );

            migrationBuilder.DropIndex(
                name: "IX_InterviewKits_VersionOfId",
                table: "InterviewKits"
            );

            migrationBuilder.DropIndex(
                name: "IX_EmailTemplates_Kind_OwnerEmail",
                table: "EmailTemplates"
            );

            migrationBuilder.DropIndex(name: "IX_Candidates_Email_Trgm", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_Candidates_FirstName_Trgm", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_Candidates_LastName_Trgm", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_Candidates_PhoneDigits", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_Candidates_ReferrerId", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_Candidates_SearchVector", table: "Candidates");

            migrationBuilder.DropIndex(name: "IX_AuditEvents_OccurredAt_Id", table: "AuditEvents");

            migrationBuilder.DropIndex(name: "IX_Attachments_MessageId", table: "Attachments");

            migrationBuilder.DropIndex(
                name: "IX_Approvals_RequestedBy_Decision",
                table: "Approvals"
            );

            migrationBuilder.DropIndex(
                name: "IX_Applications_AssigneeEmail",
                table: "Applications"
            );

            migrationBuilder.DropIndex(name: "IX_Applications_ThreadToken", table: "Applications");

            migrationBuilder.DropIndex(
                name: "IX_ApplicationMessages_EmailOutboxItemId",
                table: "ApplicationMessages"
            );

            migrationBuilder.DropIndex(
                name: "IX_ApplicationMessages_ExternalMessageId",
                table: "ApplicationMessages"
            );

            migrationBuilder.DropIndex(
                name: "IX_ApplicationMessages_SearchVector",
                table: "ApplicationMessages"
            );

            migrationBuilder.DropColumn(name: "CustomFields", table: "Candidates");

            migrationBuilder.DropColumn(name: "PhoneDigits", table: "Candidates");

            migrationBuilder.DropColumn(name: "SearchVector", table: "Candidates");

            migrationBuilder.DropColumn(name: "SearchVector", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "DisabledReason", table: "WebhookEndpoints");

            migrationBuilder.DropColumn(name: "FailingSince", table: "WebhookEndpoints");

            migrationBuilder.DropColumn(name: "PreviousSecret", table: "WebhookEndpoints");

            migrationBuilder.DropColumn(name: "PreviousSecretExpiresAt", table: "WebhookEndpoints");

            migrationBuilder.DropColumn(name: "AttemptLog", table: "WebhookDeliveries");

            migrationBuilder.DropColumn(name: "DurationMs", table: "WebhookDeliveries");

            migrationBuilder.DropColumn(name: "RequestHeaders", table: "WebhookDeliveries");

            migrationBuilder.DropColumn(name: "ResponseBody", table: "WebhookDeliveries");

            migrationBuilder.DropColumn(name: "AvatarTone", table: "Users");

            migrationBuilder.DropColumn(name: "BufferMinutes", table: "Users");

            migrationBuilder.DropColumn(name: "CustomRoleId", table: "Users");

            migrationBuilder.DropColumn(name: "DashboardJson", table: "Users");

            migrationBuilder.AddColumn<string>(
                name: "Department",
                table: "Users",
                type: "text",
                nullable: true
            );

            migrationBuilder.Sql(
                "UPDATE \"Users\" SET \"Department\" = \"Departments\"[1] WHERE cardinality(\"Departments\") > 0;"
            );

            migrationBuilder.DropColumn(name: "Departments", table: "Users");

            migrationBuilder.DropColumn(name: "InvitedAt", table: "Users");

            migrationBuilder.DropColumn(name: "InvitedByEmail", table: "Users");

            migrationBuilder.DropColumn(name: "LastSignInAt", table: "Users");

            migrationBuilder.DropColumn(name: "MaxInterviewsPerDay", table: "Users");

            migrationBuilder.DropColumn(name: "MaxInterviewsPerWeek", table: "Users");

            migrationBuilder.DropColumn(name: "PreferencesJson", table: "Users");

            migrationBuilder.DropColumn(name: "TimeZone", table: "Users");

            migrationBuilder.DropColumn(name: "SubmittedBy", table: "Scorecards");

            migrationBuilder.DropColumn(name: "PinnedBy", table: "SavedViews");

            migrationBuilder.DropColumn(name: "Shared", table: "SavedViews");

            migrationBuilder.DropColumn(name: "ClosedAt", table: "Requisitions");

            migrationBuilder.DropColumn(name: "LocationCity", table: "Requisitions");

            migrationBuilder.DropColumn(name: "LocationCountry", table: "Requisitions");

            migrationBuilder.DropColumn(name: "LocationRegion", table: "Requisitions");

            migrationBuilder.DropColumn(name: "PipelineTemplateId", table: "Requisitions");

            migrationBuilder.DropColumn(name: "RemoteCountries", table: "Requisitions");

            migrationBuilder.DropColumn(name: "SalaryCurrency", table: "Requisitions");

            migrationBuilder.DropColumn(name: "SalaryMax", table: "Requisitions");

            migrationBuilder.DropColumn(name: "SalaryMin", table: "Requisitions");

            migrationBuilder.DropColumn(name: "SalaryPeriod", table: "Requisitions");

            migrationBuilder.DropColumn(name: "ShowSalary", table: "Requisitions");

            migrationBuilder.DropColumn(name: "StatusReason", table: "Requisitions");

            migrationBuilder.DropColumn(name: "ArchivedAt", table: "PostingTemplates");

            migrationBuilder.DropColumn(name: "QuestionsJson", table: "PostingTemplates");

            migrationBuilder.DropColumn(name: "UpdatedBy", table: "PostingTemplates");

            migrationBuilder.DropColumn(name: "AssessmentId", table: "PipelineStages");

            migrationBuilder.DropColumn(name: "CandidateLabel", table: "PipelineStages");

            migrationBuilder.DropColumn(name: "EmailOnEntry", table: "PipelineStages");

            migrationBuilder.DropColumn(name: "TargetDays", table: "PipelineStages");

            migrationBuilder.DropColumn(name: "Type", table: "PipelineStages");

            migrationBuilder.DropColumn(name: "ChannelNotificationKinds", table: "Organizations");

            migrationBuilder.DropColumn(name: "RequireSso", table: "Organizations");

            migrationBuilder.DropColumn(name: "SenderNameFormat", table: "Organizations");

            migrationBuilder.DropColumn(name: "WorkOsOrganizationId", table: "Organizations");

            migrationBuilder.DropColumn(name: "BaseSalary", table: "Offers");

            migrationBuilder.DropColumn(name: "Bonus", table: "Offers");

            migrationBuilder.DropColumn(name: "Currency", table: "Offers");

            migrationBuilder.DropColumn(name: "DeclineNote", table: "Offers");

            migrationBuilder.DropColumn(name: "DeclineReason", table: "Offers");

            migrationBuilder.DropColumn(name: "EmploymentType", table: "Offers");

            migrationBuilder.DropColumn(name: "Equity", table: "Offers");

            migrationBuilder.DropColumn(name: "ExpiresAt", table: "Offers");

            migrationBuilder.DropColumn(name: "ExpiresOn", table: "Offers");

            migrationBuilder.DropColumn(name: "LetterMarkdown", table: "Offers");

            migrationBuilder.DropColumn(name: "LetterSent", table: "Offers");

            migrationBuilder.DropColumn(name: "LetterTemplateId", table: "Offers");

            migrationBuilder.DropColumn(name: "LetterTemplateVersion", table: "Offers");

            migrationBuilder.DropColumn(name: "Location", table: "Offers");

            migrationBuilder.DropColumn(name: "PayPeriod", table: "Offers");

            migrationBuilder.DropColumn(name: "ReminderSentAt", table: "Offers");

            migrationBuilder.DropColumn(name: "ReplacesOfferId", table: "Offers");

            migrationBuilder.DropColumn(name: "RespondedAt", table: "Offers");

            migrationBuilder.DropColumn(name: "RespondedBy", table: "Offers");

            migrationBuilder.DropColumn(name: "RespondedName", table: "Offers");

            migrationBuilder.DropColumn(name: "StartDate", table: "Offers");

            migrationBuilder.DropColumn(name: "WorkMode", table: "Offers");

            migrationBuilder.DropColumn(name: "CandidateId", table: "Notes");

            migrationBuilder.DropColumn(name: "EditedAt", table: "Notes");

            migrationBuilder.DropColumn(name: "PinnedAt", table: "Notes");

            migrationBuilder.DropColumn(name: "AttendeeResponsesJson", table: "Interviews");

            migrationBuilder.DropColumn(name: "CancelReason", table: "Interviews");

            migrationBuilder.DropColumn(name: "CancelledAt", table: "Interviews");

            migrationBuilder.DropColumn(name: "CancelledBy", table: "Interviews");

            migrationBuilder.DropColumn(name: "IcsSequence", table: "Interviews");

            migrationBuilder.DropColumn(name: "Location", table: "Interviews");

            migrationBuilder.DropColumn(name: "LoopId", table: "Interviews");

            migrationBuilder.DropColumn(name: "MeetingType", table: "Interviews");

            migrationBuilder.DropColumn(name: "NoShowParty", table: "Interviews");

            migrationBuilder.DropColumn(name: "OrganizerEmail", table: "Interviews");

            migrationBuilder.DropColumn(name: "OutcomeAt", table: "Interviews");

            migrationBuilder.DropColumn(name: "OutcomeBy", table: "Interviews");

            migrationBuilder.DropColumn(name: "OutcomeNote", table: "Interviews");

            migrationBuilder.DropColumn(name: "SchedulingRequestId", table: "Interviews");

            migrationBuilder.DropColumn(name: "AudioStoredFileName", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "ChunksReceived", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "DurationSeconds", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "LastChunkAt", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "ProcessingError", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "SegmentsJson", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "Source", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "SpeakerNamesJson", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "Status", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "TranscribedAt", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "TranscriptError", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "TranscriptModel", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "TranscriptStatus", table: "InterviewRecordings");

            migrationBuilder.DropColumn(name: "ArchivedAt", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "PipelineStageId", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "PoolEmails", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "PoolPick", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "UpdatedAt", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "UpdatedBy", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "Version", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "VersionOfId", table: "InterviewKits");

            migrationBuilder.DropColumn(name: "CompetencyId", table: "InterviewCriteria");

            migrationBuilder.DropColumn(name: "FollowUps", table: "InterviewCriteria");

            migrationBuilder.DropColumn(name: "Category", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "CreatedAt", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "Kind", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "Name", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "OwnerEmail", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "UpdatedBy", table: "EmailTemplates");

            migrationBuilder.DropColumn(name: "AttachmentIds", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "FromName", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "InlineFileContentType", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "InlineFileName", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "InlineFileText", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "ReplyTo", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "ThreadReference", table: "EmailOutbox");

            migrationBuilder.DropColumn(name: "DoNotContactReason", table: "Candidates");

            migrationBuilder.DropColumn(name: "ReferrerId", table: "Candidates");

            migrationBuilder.DropColumn(name: "TimeZone", table: "Candidates");

            migrationBuilder.DropColumn(name: "Changes", table: "AuditEvents");

            migrationBuilder.DropColumn(name: "Kind", table: "Attachments");

            migrationBuilder.DropColumn(name: "MessageId", table: "Attachments");

            migrationBuilder.DropColumn(name: "AnyOne", table: "Approvals");

            migrationBuilder.DropColumn(name: "EscalatedAt", table: "Approvals");

            migrationBuilder.DropColumn(name: "FromPolicy", table: "Approvals");

            migrationBuilder.DropColumn(name: "LastRemindedAt", table: "Approvals");

            migrationBuilder.DropColumn(name: "Note", table: "Approvals");

            migrationBuilder.DropColumn(name: "ReassignedBy", table: "Approvals");

            migrationBuilder.DropColumn(name: "ReassignedFromEmail", table: "Approvals");

            migrationBuilder.DropColumn(name: "RemindersSent", table: "Approvals");

            migrationBuilder.DropColumn(name: "Round", table: "Approvals");

            migrationBuilder.DropColumn(name: "AssigneeEmail", table: "Applications");

            migrationBuilder.DropColumn(name: "DispositionNote", table: "Applications");

            migrationBuilder.DropColumn(name: "SnoozedBy", table: "Applications");

            migrationBuilder.DropColumn(name: "SnoozedUntil", table: "Applications");

            migrationBuilder.DropColumn(name: "ThreadDoneAt", table: "Applications");

            migrationBuilder.DropColumn(name: "ThreadToken", table: "Applications");

            migrationBuilder.DropColumn(name: "Channel", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "EmailOutboxItemId", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "ExternalMessageId", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "FromAddress", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "OriginalBody", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "ScheduledFor", table: "ApplicationMessages");

            migrationBuilder.DropColumn(name: "WorkingHoursJson", table: "Users");

            migrationBuilder.AddColumn<string>(
                name: "InterviewStagesMarkdown",
                table: "PostingTemplates",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AlterColumn<string>(
                name: "Color",
                table: "PipelineStages",
                type: "character varying(24)",
                maxLength: 24,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(24)",
                oldMaxLength: 24,
                oldNullable: true
            );

            migrationBuilder.AlterColumn<Guid>(
                name: "ApplicationId",
                table: "Notes",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true
            );

            migrationBuilder.AddColumn<string>(
                name: "CandidateMessage",
                table: "InterviewKits",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AddColumn<string>(
                name: "InterviewerMessage",
                table: "InterviewKits",
                type: "text",
                nullable: false,
                defaultValue: ""
            );

            migrationBuilder.AlterColumn<string>(
                name: "Key",
                table: "EmailTemplates",
                type: "character varying(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "character varying(64)",
                oldMaxLength: 64,
                oldNullable: true
            );

            migrationBuilder.CreateIndex(
                name: "IX_InterviewKits_RequisitionId_SortOrder",
                table: "InterviewKits",
                columns: new[] { "RequisitionId", "SortOrder" },
                unique: true
            );
        }
    }
}
