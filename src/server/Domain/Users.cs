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
