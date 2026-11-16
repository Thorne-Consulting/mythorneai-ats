using System.Reflection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    // Attaches each development candidate's CV, queued like a real upload so it goes through
    // ResumeParseWorker. Safe to run on every start: people who already have their file are skipped.
    private static async Task EnsureDevelopmentResumesAsync(
        AtsDbContext db,
        LocalFileStore files,
        CancellationToken cancellationToken
    )
    {
        var emails = DevelopmentPeople.Select(value => value.Email).ToArray();
        var candidates = await db.Candidates
            .Include(candidate => candidate.Attachments)
            .Where(candidate => emails.Contains(candidate.Email))
            .ToDictionaryAsync(candidate => candidate.Email, cancellationToken);
        var assembly = Assembly.GetExecutingAssembly();
        var resourceNames = assembly.GetManifestResourceNames();
        var storedNames = new List<string>();

        try
        {
            foreach (var person in DevelopmentPeople)
            {
                if (!candidates.TryGetValue(person.Email, out var candidate))
                {
                    candidate = new Candidate
                    {
                        FirstName = person.FirstName,
                        LastName = person.LastName,
                        Email = person.Email,
                        Phone = person.Phone,
                        CurrentTitle = person.Title,
                        Location = person.Location,
                        Source = person.Source,
                        Tags = person.Tags ?? [],
                    };
                    db.Candidates.Add(candidate);
                }
                else if (candidate.Attachments.Any(attachment => attachment.OriginalFileName == person.ResumeFile))
                    continue;

                var resourceName = resourceNames.Single(name =>
                    name.EndsWith($".Resumes.{person.ResumeFile}", StringComparison.Ordinal)
                );
                await using var resource = assembly.GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException(
                        $"Embedded resume fixture {person.ResumeFile} could not be opened."
                    );
                var stored = await files.SaveValidatedAsync(
                    resource,
                    person.ResumeFile,
                    resource.Length,
                    cancellationToken
                );
                storedNames.Add(stored.StoredName);
                var attachment = new Attachment
                {
                    CandidateId = candidate.Id,
                    OriginalFileName = person.ResumeFile,
                    StoredFileName = stored.StoredName,
                    ContentType = stored.ContentType,
                    Length = resource.Length,
                    UploadedBy = "recruiter@example.test",
                    UploadedAt = candidate.CreatedAt,
                    ScanStatus = "ValidationOnly",
                    ParseStatus = "Pending",
                };
                db.Attachments.Add(attachment);
                db.ResumeParseJobs.Add(new ResumeParseJob { AttachmentId = attachment.Id });
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            foreach (var storedName in storedNames)
                files.Delete(storedName);
            var entries = string.Join(
                ", ",
                exception.Entries.Select(entry => $"{entry.Metadata.ClrType.Name}:{entry.State}")
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
