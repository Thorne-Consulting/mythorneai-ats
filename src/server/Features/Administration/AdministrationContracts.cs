using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record UpsertUserRequest(
    string Email,
    string DisplayName,
    UserRole Role,
    string? Department,
    bool IsActive
);

public sealed record UpdateOrganizationRequest(string Name, string? TimeZone);
