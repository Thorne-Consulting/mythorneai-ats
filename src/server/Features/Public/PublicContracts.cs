using MyThorneAI.Ats.Api.Api;

namespace MyThorneAI.Ats.Api.Contracts;

/// <summary>
/// An application from the careers site. <c>FileToken</c> comes from <c>POST /public/resume</c>.
/// <c>Website</c> is a hidden field that only bots fill in. <c>Source</c> and the UTM fields come from
/// the link the person followed.
/// </summary>
public sealed record PublicApplyRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? LinkedInUrl,
    string? AnswersMarkdown = null,
    string? TimeZone = null,
    string? FileToken = null,
    string? Website = null,
    string? Source = null,
    string? UtmSource = null,
    string? UtmMedium = null,
    string? UtmCampaign = null,
    AnswerInput[]? Answers = null
);

public sealed record PublicPlace(
    string? City,
    string? Region,
    string? Country,
    string[] RemoteCountries
);

/// <summary>Text is the range as people read it ("USD 90,000 – 120,000 a year").</summary>
public sealed record PublicSalary(
    decimal? Min,
    decimal? Max,
    string Currency,
    string Period,
    string? Text
);

public sealed record PublicJobDto(
    Guid Id,
    string Code,
    string Title,
    string Department,
    string Location,
    string EmploymentType,
    string WorkMode,
    int Openings,
    string Description,
    DateOnly? TargetStartDate,
    DateTimeOffset PostedAt,
    DateTimeOffset UpdatedAt,
    PublicPlace Place,
    PublicSalary? Salary,
    object[] Questions,
    string? Status = null,
    bool? Listed = null
);

public sealed record PublicResumeApplyRequest(
    string FirstName,
    string LastName,
    string Email,
    string? Phone,
    string? Location,
    string? LinkedInUrl,
    string? AnswersMarkdown,
    IFormFile Resume
);

/// <summary>Code from an email. <c>ApplicationId</c> narrows it to the application the code was sent for.</summary>
public sealed record VerifyApplicationRequest(
    string Email,
    string Code,
    Guid? ApplicationId = null,
    string? TimeZone = null
);

/// <summary><c>Next</c> is the portal page the person was opening; the emailed link goes there.</summary>
public sealed record RequestPortalCodeRequest(string Email, string? Next = null);

public sealed record MagicLinkRequest(string? Token, string? TimeZone = null);

public sealed record ResendApplicationEmailRequest(string? Email);
