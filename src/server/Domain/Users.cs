namespace MyThorneAI.Ats.Api.Domain;

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string DisplayName { get; set; }

    /// <summary>The built-in role, or for a custom role the built-in one it behaves like (<c>Permissions.KindOf</c>), kept in step when the role changes.</summary>
    public UserRole Role { get; set; }

    /// <summary>A role an admin made. Null means the built-in <see cref="Role"/>.</summary>
    public Guid? CustomRoleId { get; set; }
    public CustomRole? CustomRole { get; set; }

    /// <summary>Job departments this person works in (their teams). Recruiters and hiring managers with teams see the jobs in them; empty means no limit for recruiters and only their own jobs for hiring managers.</summary>
    public string[] Departments { get; set; } = [];

    /// <summary>The colour of their initials avatar (blue, violet, green, amber, red, gray). Null picks one from the name.</summary>
    public string? AvatarTone { get; set; }

    /// <summary>Their own settings as JSON: theme, density, start page, date format, welcome. See <c>MyPreferences</c>.</summary>
    public string? PreferencesJson { get; set; }

    /// <summary>Their dashboard as JSON: card order and hidden cards. See <c>DashboardLayout</c>.</summary>
    public string? DashboardJson { get; set; }

    /// <summary>IANA zone (for example America/Chicago). Null means the organization's zone.</summary>
    public string? TimeZone { get; set; }

    /// <summary>Weekly hours as JSON, weekday number (0 = Sunday) to ranges: {"1":[["09:00","17:00"]]}. Null means 9 to 5, Monday to Friday.</summary>
    public string? WorkingHoursJson { get; set; }

    /// <summary>Free minutes kept before and after each interview.</summary>
    public int BufferMinutes { get; set; }
    public int? MaxInterviewsPerDay { get; set; }
    public int? MaxInterviewsPerWeek { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>Null until their first sign-in. An invited person who never signed in shows as "Invited".</summary>
    public DateTimeOffset? LastSignInAt { get; set; }
    public DateTimeOffset? InvitedAt { get; set; }
    public string? InvitedByEmail { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A role an admin made by duplicating another one and changing what it may do.</summary>
public sealed class CustomRole
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public string? Description { get; set; }

    /// <summary>Capability keys from <c>Permissions.All</c>.</summary>
    public string[] Permissions { get; set; } = [];
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

public enum AccessRequestStatus
{
    Pending,
    Approved,
    Declined,
}

/// <summary>Someone at an allowed company domain who signed in without an invitation.</summary>
public sealed class AccessRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Email { get; set; }
    public required string Name { get; set; }
    public string? Note { get; set; }
    public AccessRequestStatus Status { get; set; } = AccessRequestStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? DecidedByEmail { get; set; }
    public DateTimeOffset? DecidedAt { get; set; }
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

    /// <summary>Which events post to that channel (TeamChannel.Events keys). Null uses the defaults.</summary>
    public string[]? ChannelNotificationKinds { get; set; }

    /// <summary>How candidate emails from a person are named: "PersonAtCompany" ("Avery at Acme") or "Company" ("Acme hiring team").</summary>
    public string SenderNameFormat { get; set; } = "PersonAtCompany";

    // Where the web app is reachable (for example https://ats.example.com). Candidate emails link to its portal.
    public string? PublicUrl { get; set; }
    public bool AiEnabled { get; set; } = true;
    public string? AiModel { get; set; }

    /// <summary>Old per-role switches (reports, import, templates). Read once at startup into custom roles, then cleared (<c>Roles.CarryOverAsync</c>).</summary>
    public string? RolePermissionsJson { get; set; }

    /// <summary>The WorkOS organization that holds single sign-on and domain verification. Created the first time an admin opens the setup.</summary>
    public string? WorkOsOrganizationId { get; set; }

    /// <summary>The currency that totals and comparisons are shown in (ISO 4217). Jobs and offers may use any supported one.</summary>
    public string BaseCurrency { get; set; } = "USD";

    /// <summary>People at a verified domain must sign in with single sign-on. The owner is always exempt.</summary>
    public bool RequireSso { get; set; }
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
