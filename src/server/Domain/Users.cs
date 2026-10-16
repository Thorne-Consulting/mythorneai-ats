namespace MyThorneAI.Ats.Api.Domain;

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string DisplayName { get; set; }
    public UserRole Role { get; set; }
    public string? Department { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Organization
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string OwnerEmail { get; set; }
    public string TimeZone { get; set; } = "UTC";
    public string[] AllowedEmailDomains { get; set; } = [];
    public bool AllowGoogleLogin { get; set; } = true;
    public bool AllowMicrosoftLogin { get; set; } = true;
    public int StaleReminderDays { get; set; } = 3;
    public bool RequireOfferApproval { get; set; } = true;
    public bool RequireRequisitionApproval { get; set; }
    public bool ApprovalsSequential { get; set; }
    public string[] DefaultApproverEmails { get; set; } = [];
    public int BookReminderDays { get; set; } = 2;
    public int ScorecardReminderDays { get; set; } = 2;
    public int MaxReminders { get; set; } = 3;
    // Reminder emails are held until the organization's local hour is outside [QuietHoursStart, QuietHoursEnd).
    public int QuietHoursStart { get; set; } = 20;
    public int QuietHoursEnd { get; set; } = 8;
    // Slack or Teams incoming webhook for team notifications. Empty means off.
    public string? NotificationWebhookUrl { get; set; }
    // Where the web app is reachable (for example https://ats.example.com). Candidate emails link to its portal.
    public string? PublicUrl { get; set; }
    public bool AiEnabled { get; set; } = true;
    public string? AiModel { get; set; }
    // JSON map of role name to the extra permissions granted to it. Null uses the built-in defaults.
    public string? RolePermissionsJson { get; set; }
    public bool SetupCompleted { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CalendarConnection
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string UserEmail { get; set; }
    public required string Provider { get; set; }
    public string? ProviderAccountEmail { get; set; }
    public required string AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public DateTimeOffset? AccessTokenExpiresAt { get; set; }
    public string CalendarId { get; set; } = "primary";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
