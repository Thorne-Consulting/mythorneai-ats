using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Contracts;

public sealed record CreateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags
);

public sealed record UpdateCandidateRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Source,
    string[]? Tags,
    bool DoNotContact
);

public sealed record UpdateResumeProfileRequest(
    string? Summary,
    string? CurrentTitle,
    string[]? Skills,
    string[]? JobTitles,
    string[]? Education,
    string[]? Certifications,
    string[]? Languages,
    decimal? YearsExperience
);
