using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record UpsertUserRequest(
    string Email,
    string DisplayName,
    UserRole Role,
    string? Department,
    bool IsActive
);

public sealed record UpdateOrganizationRequest(
    string Name,
    string? TimeZone,
    string[]? AllowedEmailDomains = null,
    bool AllowGoogleLogin = true,
    bool AllowMicrosoftLogin = true,
    int StaleReminderDays = 3,
    bool? RequireOfferApproval = null,
    bool? RequireRequisitionApproval = null,
    bool? ApprovalsSequential = null,
    string[]? DefaultApproverEmails = null,
    int? BookReminderDays = null,
    int? ScorecardReminderDays = null,
    int? MaxReminders = null,
    int? QuietHoursStart = null,
    int? QuietHoursEnd = null,
    string? NotificationWebhookUrl = null,
    string? PublicUrl = null,
    bool? AiEnabled = null,
    string? AiModel = null
);
