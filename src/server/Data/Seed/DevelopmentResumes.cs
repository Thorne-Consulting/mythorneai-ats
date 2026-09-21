using System.Reflection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private sealed record DevelopmentResume(string CandidateEmail, string FileName);

    private static readonly DevelopmentResume[] DevelopmentResumeFiles =
    [
        new("maya.fernandez@example.com", "maya-fernandez-resume.pdf"),
        new("elliot.shaw@example.com", "elliot-shaw-resume.docx"),
        new("ada.whitfield@example.com", "ada-whitfield-resume.pdf"),
    ];

    private static async Task EnsureDevelopmentResumesAsync(
        AtsDbContext db,
        LocalFileStore files,
        ResumeParser parser,
        CancellationToken cancellationToken
    )
    {
        var emails = DevelopmentResumeFiles.Select(value => value.CandidateEmail).ToArray();
        var candidates = await db.Candidates
            .Include(candidate => candidate.Attachments)
            .Where(candidate => emails.Contains(candidate.Email))
            .ToDictionaryAsync(candidate => candidate.Email, cancellationToken);
        var assembly = Assembly.GetExecutingAssembly();
        var resourceNames = assembly.GetManifestResourceNames();
        var storedNames = new List<string>();

        try
        {
            foreach (var seed in DevelopmentResumeFiles)
            {
                if (!candidates.TryGetValue(seed.CandidateEmail, out var candidate))
                    continue;
                if (candidate.Attachments.Any(attachment =>
                    attachment.OriginalFileName == seed.FileName
                ))
                    continue;

                var resourceName = resourceNames.Single(name =>
                    name.EndsWith($".Resumes.{seed.FileName}", StringComparison.Ordinal)
                );
                await using var resource = assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException(
                        $"Embedded resume fixture {seed.FileName} could not be opened."
                    );
                var stored = await files.SaveValidatedAsync(
                    resource,
                    seed.FileName,
                    resource.Length,
                    cancellationToken
                );
                storedNames.Add(stored.StoredName);
                resource.Position = 0;
                var parsed = await parser.ParseAsync(resource, seed.FileName, cancellationToken);
                var parsedAt = DateTimeOffset.UtcNow;
                ResumeProfileMapper.Apply(candidate, parsed, parsedAt);
                candidate.Attachments.Add(
                    new Attachment
                    {
                        CandidateId = candidate.Id,
                        OriginalFileName = seed.FileName,
                        StoredFileName = stored.StoredName,
                        ContentType = stored.ContentType,
                        Length = resource.Length,
                        UploadedBy = "recruiter@example.test",
                        ScanStatus = "ValidationOnly",
                        ParseStatus = "Parsed",
                        ParsedAt = parsedAt,
                    }
                );
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            foreach (var storedName in storedNames)
                files.Delete(storedName);
            var entries = string.Join(
                ", ",
                exception.Entries.Select(entry =>
                    $"{entry.Metadata.ClrType.Name}:{entry.State}"
                )
            );
            throw new InvalidOperationException(
                $"Development resume seed concurrency failure for {entries}.",
                exception
            );
        }
        catch
        {
            foreach (var storedName in storedNames)
                files.Delete(storedName);
            throw;
        }
    }
}
