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
    public string ScanStatus { get; set; } = "Pending";
    public string ParseStatus { get; set; } = "NotParsed";
    public string? ParseError { get; set; }
    public DateTimeOffset? ParsedAt { get; set; }
    public DateTimeOffset UploadedAt { get; set; } = DateTimeOffset.UtcNow;
}
