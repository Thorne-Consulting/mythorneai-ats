using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

// A role is named by its key: a built-in role ("Recruiter") or a custom role's id.

public sealed record UpsertUserRequest(
    string Email,
    string DisplayName,
    string Role,
    bool IsActive,
    string[]? Departments = null
);

/// <summary>Changes one or many members at once, all or nothing. Null leaves a field as it is.</summary>
public sealed record UpdateUsersRequest(
    Guid[] Ids,
    string? Role = null,
    bool? IsActive = null,
    // Their teams (job departments). An empty list clears them.
    string[]? Departments = null,
    // Only with exactly one id.
    string? DisplayName = null
);

public sealed record InviteMembersRequest(
    string[] Emails,
    string Role,
    string[]? Departments = null,
    string? Note = null
);

public sealed record ApproveAccessRequest(string Role, string[]? Departments = null);

public sealed record SaveRoleRequest(string Name, string? Description, string[]? Permissions);

public sealed record TransferOwnershipRequest(Guid UserId);

/// <summary>Every field is optional: only what is sent changes.</summary>
public sealed record UpdateOrganizationRequest(
    string? Name = null,
    string? TimeZone = null,
    string[]? AllowedEmailDomains = null,
    bool? AllowGoogleLogin = null,
    bool? AllowMicrosoftLogin = null,
    bool? RequireSso = null,
    int? StaleReminderDays = null,
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

public sealed record AuditQuery(
    string? Cursor = null,
    DateTimeOffset? From = null,
    DateTimeOffset? To = null,
    string? Actor = null,
    string? Type = null,
    string? Action = null,
    string? EntityId = null,
    int? Limit = null
);
