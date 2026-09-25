namespace MyThorneAI.Ats.Api.Contracts;

public sealed record PublicApplyRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? LinkedInUrl
);

public sealed record VerifyApplicationRequest(string Email, string Code);

public sealed record RequestPortalCodeRequest(string Email);
