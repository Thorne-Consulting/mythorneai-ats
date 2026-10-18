using System.Reflection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private sealed record DevelopmentResume(
        string FileName,
        string FirstName,
        string LastName,
        string Title,
        string Location
    )
    {
        // ponytail: the resumes carry real-looking inboxes, so seeded candidates get example.com ones.
        public string Email =>
            $"{new string(FirstName.Where(char.IsLetter).ToArray())}.{new string(LastName.Where(char.IsLetter).ToArray())}@example.com"
                .ToLowerInvariant();
    }

    // Public sample resumes from the UW, MIT and University of Alabama career centers:
    // careers.uw.edu/resources/sample-resumes, capd.mit.edu/resources/sample-resumes,
    // career.sa.ua.edu/develop/resumes/sample-resumes. Composites, templates and placeholder-name samples are left out.
    private static readonly DevelopmentResume[] DevelopmentResumeFiles =
    [
        new("Andrew-Peters.pdf", "Andrew", "Peters", "Microbiology PhD candidate", "Seattle, WA"),
        new("Arts-Media-Marketing-Sample-Resume.pdf", "Jalila", "Asha", "Marketing and communications", "Seattle, WA"),
        new("D-Daniel-Garcia.docx.pdf", "Daniel", "Garcia", "Applied mathematics student", "Seattle, WA"),
        new("E-Huy-Nguyen.docx.pdf", "Huy", "Nguyen", "Economics student", "Seattle, WA"),
        new("Health-Sample-Resume.pdf", "Eniola", "Viglionese", "Undergraduate researcher", "Seattle, WA"),
        new("Miranda-Hudson.pdf", "Miranda", "Hudson", "Mechanical engineering graduate student", "Seattle, WA"),
        new("Non-profit-Social-Justice-Education-Resume-1.pdf", "Shirley", "Gallo", "Gender studies student", "Seattle, WA"),
        new("Non-profit-Social-Justice-Education-Resume-2.pdf", "Yasmine", "Hejazi", "Psychology student", "Seattle, WA"),
        new("Physical-and-LIfe-Science-Sample-Resume.pdf", "Stephen", "Artur", "Marine and environmental affairs", "Seattle, WA"),
        new("Undergraduate-Sample-Resume.pdf", "Morgan", "Lander", "Psychology student", "Seattle, WA"),
        new("AS-Resume-Sample-22_AM-approved.docx", "Ally", "Bama", "Criminal justice student", "Tuscaloosa, AL"),
        new("Business-Resume-Sample-22_SC-revised.docx", "Mary Jane", "Washington", "Marketing student", "Tuscaloosa, AL"),
        new("CIS-Resume-Sample-22_AB-approved.docx", "Casey", "Carter", "Public relations student", "Tuscaloosa, AL"),
        new("Education-Resume-Sample-22_TG-approved.docx", "Taylor", "Thompson", "Education student", "Tuscaloosa, AL"),
        new("Engineering-Resume-Sample-22_Dill-approved.docx", "Morgan", "Martinez", "Mechanical engineering student", "Tuscaloosa, AL"),
        new("First-Year-Resume-Sample-22.docx", "Frankie", "First-Year", "First-year student", "Tuscaloosa, AL"),
        new("HES-Resume-Sample-22_PM-approved.docx", "Peyton", "Parker", "Human development student", "Tuscaloosa, AL"),
        new("Nursing-Sample-Resume-22_KWG-approved-1.docx", "Jordan", "Jones", "Nursing student", "Tuscaloosa, AL"),
        new("SW-Resume-Sample-22_TG-approved.docx", "Kendall", "King", "Social work student", "Tuscaloosa, AL"),
        new("MITCAPD-MastersII.pdf", "Charles", "Meng", "Computer science MEng candidate", "Cambridge, MA"),
        new("MITCAPD-PhDI.pdf", "Jean", "Upeg", "Urban political economy PhD candidate", "Cambridge, MA"),
        new("MITCAPD-PostDocI.pdf", "Claudio", "di Leo", "Mechanical engineering PhD", "Cambridge, MA"),
        // Text in these two is drawn as outlines, so they only parse when ocrmypdf is installed.
        new("Climate-Conservation-Sustainability-Resume.pdf", "Marina", "Johnson", "Environmental studies student", "Seattle, WA"),
        new("Law-Government-Policy-Resume.pdf", "Taylor", "Morgan", "Law, societies and justice student", "Seattle, WA"),
    ];

    private static async Task EnsureDevelopmentResumesAsync(
        AtsDbContext db,
        LocalFileStore files,
        CancellationToken cancellationToken
    )
    {
        var emails = DevelopmentResumeFiles.Select(value => value.Email).ToArray();
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
                if (!candidates.TryGetValue(seed.Email, out var candidate))
                {
                    candidate = new Candidate
                    {
                        FirstName = seed.FirstName,
                        LastName = seed.LastName,
                        Email = seed.Email,
                        CurrentTitle = seed.Title,
                        Location = seed.Location,
                        Source = "Career center sample",
                    };
                    db.Candidates.Add(candidate);
                }
                else if (candidate.Attachments.Any(attachment =>
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
                // Queued like a real upload so the seed goes through ResumeParseWorker.
                var attachment = new Attachment
                {
                    CandidateId = candidate.Id,
                    OriginalFileName = seed.FileName,
                    StoredFileName = stored.StoredName,
                    ContentType = stored.ContentType,
                    Length = resource.Length,
                    UploadedBy = "recruiter@example.test",
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
