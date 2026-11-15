namespace MyThorneAI.Ats.Api.Domain;

public sealed class Attachment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string OriginalFileName { get; set; }
    public required string StoredFileName { get; set; }
    public required string ContentType { get; set; }
    public long Length { get; set; }
    public required string UploadedBy { get; set; }

    /// <summary>What the file is (see <see cref="AttachmentKinds"/>). Only resumes are read into the profile.</summary>
    public string Kind { get; set; } = AttachmentKinds.Resume;
    public string ScanStatus { get; set; } = "Pending";
    public string ParseStatus { get; set; } = "NotParsed";
    public string? ParseError { get; set; }
    public DateTimeOffset? ParsedAt { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>The thread message this file was sent with, if any.</summary>
    public Guid? MessageId { get; set; }
}

public static class AttachmentKinds
{
    public const string Resume = "Resume";
    public const string CoverLetter = "CoverLetter";
    public const string Portfolio = "Portfolio";
    public const string Other = "Other";
    public static readonly string[] All = [Resume, CoverLetter, Portfolio, Other];
}
