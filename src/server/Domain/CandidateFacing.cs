namespace MyThorneAI.Ats.Api.Domain;

/// <summary>
/// A careers-site application and what it waits on. The application reaches the team at once.
/// Changes to a candidate who is already on file wait here until the email address is confirmed,
/// so a stranger who knows someone's email cannot rewrite their record.
/// </summary>
public sealed class ApplicationSubmission
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }

    /// <summary>Name, phone, location, LinkedIn and time zone as typed (<see cref="SubmittedProfile"/>). Null once merged or when nothing is held.</summary>
    public string? HeldProfileJson { get; set; }

    /// <summary>The resume sent with it. Read into the profile only after confirmation.</summary>
    public Guid? HeldResumeId { get; set; }

    /// <summary>Campaign tags from the link the person followed (utm_source, utm_medium, utm_campaign).</summary>
    public string? UtmJson { get; set; }

    /// <summary>The details as typed on the form (<see cref="SubmittedProfile"/>), kept so the candidate can see what they sent.</summary>
    public string? SentProfileJson { get; set; }

    /// <summary>The resume sent with this application, for "What you sent". Null when none was added.</summary>
    public Guid? ResumeAttachmentId { get; set; }
    public DateTimeOffset SubmittedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ConfirmedAt { get; set; }
    public DateTimeOffset? ReminderSentAt { get; set; }
}

public sealed record SubmittedProfile(
    string FirstName,
    string LastName,
    string? Phone,
    string? Location,
    string? LinkedInUrl,
    string? TimeZone
);

/// <summary>A one-time link in a candidate email that confirms an application and signs the person in.</summary>
public sealed class CandidateMagicLink
{
    public const string Confirm = "confirm";
    public const string SignIn = "sign-in";

    public Guid Id { get; set; } = Guid.NewGuid();
    public required string TokenHash { get; set; }
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public Guid? ApplicationId { get; set; }
    public required string Purpose { get; set; }

    /// <summary>The portal page the link opens, for example <c>/candidate-portal/applications/{id}</c>. Set by the server only.</summary>
    public string? Path { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>A resume uploaded on the apply page before the application is sent, so it fills the form and is not uploaded twice.</summary>
public sealed class ResumeUpload
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string TokenHash { get; set; }
    public required string StoredFileName { get; set; }
    public required string OriginalFileName { get; set; }
    public required string ContentType { get; set; }
    public long Length { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>
/// How the careers site, the candidate portal and candidate emails look: one row for the
/// organization. Images live in the file store; the stored name keeps the file type.
/// </summary>
public sealed class CareerSite
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid OrganizationId { get; set; }

    /// <summary>The wide logo for light backgrounds.</summary>
    public string? LogoFile { get; set; }

    /// <summary>The same logo for dark backgrounds. Optional; dark mode falls back to the icon and name.</summary>
    public string? LogoDarkFile { get; set; }

    /// <summary>Square mark: the browser tab icon, the share picture and the email header.</summary>
    public string? IconFile { get; set; }

    /// <summary>"#RRGGBB" for buttons on public pages and in emails. Null keeps our blue.</summary>
    public string? BrandColor { get; set; }
    public string? Headline { get; set; }
    public string? IntroMarkdown { get; set; }
    public string? WebsiteUrl { get; set; }
    public string[] SocialUrls { get; set; } = [];

    /// <summary>When on, the apply form needs a resume; when off, people can apply without one.</summary>
    public bool RequireResume { get; set; }
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}

/// <summary>The hiring team asks the candidate for a document. It shows as a to-do in the portal until a file is added.</summary>
public sealed class DocumentRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ApplicationId { get; set; }
    public Application? Application { get; set; }

    /// <summary>What to send, in the team's words, for example "Portfolio" or "Work permit".</summary>
    public required string Label { get; set; }

    /// <summary>The attachment kind the file is filed under (<see cref="AttachmentKinds"/>).</summary>
    public string Kind { get; set; } = AttachmentKinds.Other;
    public string? Note { get; set; }
    public required string RequestedBy { get; set; }
    public DateTimeOffset RequestedAt { get; set; } = DateTimeOffset.UtcNow;
    public Guid? AttachmentId { get; set; }
    public DateTimeOffset? FulfilledAt { get; set; }
}

/// <summary>The brand in the candidate email layout: an absolute icon address (null when unknown) and "#RRGGBB".</summary>
public sealed record EmailBrand(string? IconUrl, string? Color);
