namespace MyThorneAI.Ats.Api.Contracts;

public sealed record ResumeParseResult(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? CurrentTitle,
    string? LinkedInUrl,
    string Summary,
    string[] Skills,
    string[] JobTitles,
    string[] Education,
    string[] Certifications,
    string[] Languages,
    decimal? YearsExperience,
    int Confidence,
    string[] Warnings,
    string RawText
);
