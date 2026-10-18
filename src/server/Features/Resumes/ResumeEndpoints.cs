using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapResumes(RouteGroupBuilder api)
    {
        // Reads a resume without saving anything: the import modal shows the result before the candidate is created.
        api.MapPost(
                "/resumes/parse",
                async (
                    HttpRequest request,
                    ClaimsPrincipal principal,
                    ResumeTextExtractor textExtractor,
                    ResumeExtractor extractor,
                    CancellationToken ct
                ) =>
                {
                    var form = await request.ReadFormAsync(ct);
                    var file = form.Files.GetFile("file");
                    if (file is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = ["Choose a resume."] }
                        );
                    try
                    {
                        await using var stream = file.OpenReadStream();
                        var text = await textExtractor.ExtractAsync(stream, file.FileName, ct);
                        var extraction = await extractor.ExtractAsync(
                            text,
                            new AiContext("parse-resume", principal.Email()),
                            ct
                        );
                        return Results.Ok(new { extraction.Form, extraction.Model, TextLength = text.Length });
                    }
                    catch (AiUnavailableException exception)
                    {
                        return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Creates a candidate from a resume. Only identity (name, email, source) can be typed over;
        // everything the resume says comes from the parse and stays read-only.
        api.MapPost(
                "/resumes/import",
                async (
                    HttpRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    ResumeTextExtractor textExtractor,
                    ResumeExtractor extractor,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var form = await request.ReadFormAsync(ct);
                    var file = form.Files.GetFile("file");
                    if (file is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = ["Choose a resume."] }
                        );

                    string text;
                    ResumeExtraction extraction;
                    try
                    {
                        await using var stream = file.OpenReadStream();
                        text = await textExtractor.ExtractAsync(stream, file.FileName, ct);
                        extraction = await extractor.ExtractAsync(
                            text,
                            new AiContext("parse-resume", principal.Email()),
                            ct
                        );
                    }
                    catch (AiUnavailableException exception)
                    {
                        return Results.Problem(exception.Message, statusCode: StatusCodes.Status503ServiceUnavailable);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }

                    var basics = extraction.Form.Basics;
                    var firstName = FormValue(form, "firstName") ?? basics.FirstName ?? "";
                    var lastName = FormValue(form, "lastName") ?? basics.LastName ?? "";
                    var email = (FormValue(form, "email") ?? basics.Email ?? "").ToLowerInvariant();
                    var source = FormValue(form, "source") ?? "Resume import";
                    var errors = ValidateCandidate(firstName, lastName, email, source);
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var duplicate = await db.Candidates.AsNoTracking()
                        .Where(candidate => candidate.Email == email)
                        .Select(candidate => new
                        {
                            candidate.Id,
                            Name = candidate.FirstName + " " + candidate.LastName,
                        })
                        .SingleOrDefaultAsync(ct);
                    if (duplicate is not null)
                        return Results.Conflict(
                            new
                            {
                                message = "A candidate with this email already exists.",
                                candidate = duplicate,
                            }
                        );

                    (string StoredName, string ContentType) stored;
                    try
                    {
                        stored = await files.SaveValidatedAsync(file, ct);
                    }
                    catch (InvalidDataException exception)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }

                    var candidate = new Candidate
                    {
                        FirstName = firstName.Trim(),
                        LastName = lastName.Trim(),
                        Email = email.Trim(),
                        Source = source.Trim(),
                    };
                    db.Candidates.Add(candidate);
                    await ResumeProfileWriter.ApplyAsync(db, candidate, extraction, text, ct);
                    var attachment = new Attachment
                    {
                        CandidateId = candidate.Id,
                        OriginalFileName = Path.GetFileName(file.FileName),
                        StoredFileName = stored.StoredName,
                        ContentType = stored.ContentType,
                        Length = file.Length,
                        UploadedBy = principal.Email(),
                        ScanStatus = "ValidationOnly",
                        ParseStatus = "Parsed",
                        ParsedAt = DateTimeOffset.UtcNow,
                    };
                    db.Attachments.Add(attachment);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        candidate.Id,
                        "ResumeImported",
                        new { attachment.Id, attachment.OriginalFileName, extraction.Model, extraction.PromptVersion }
                    );
                    try
                    {
                        await db.SaveChangesAsync(ct);
                    }
                    catch
                    {
                        files.Delete(stored.StoredName);
                        throw;
                    }
                    return Results.Created(
                        $"/api/candidates/{candidate.Id}",
                        new
                        {
                            CandidateId = candidate.Id,
                            CandidateName = candidate.FirstName + " " + candidate.LastName,
                        }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // The parsed profile for the Resume tab. Read-only by design: a wrong parse is fixed by re-parsing.
        api.MapGet(
                "/candidates/{id:guid}/resume",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var canSeeContact = principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                    var allowedApplicationIds = ScopeApplications(db.Applications.AsNoTracking(), principal).Select(x => x.Id);
                    var candidate = await db.Candidates.AsNoTracking()
                        .WithProfile()
                        .Include(x => x.WorkExperiences).ThenInclude(x => x.Skills).ThenInclude(x => x.Skill)
                        .Include(x => x.Skills).ThenInclude(x => x.Skill)
                        .Include(x => x.Projects).ThenInclude(x => x.Skills).ThenInclude(x => x.Skill)
                        .Include(x => x.CurrentEmployer)
                        .SingleOrDefaultAsync(x => x.Id == id
                            && (principal.IsHiringStaff() || x.Applications.Any(a => allowedApplicationIds.Contains(a.Id))), ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var attachment = await db.Attachments.AsNoTracking()
                        .Where(x => x.CandidateId == id)
                        .OrderByDescending(x => x.ParsedAt)
                        .ThenByDescending(x => x.UploadedAt)
                        .Select(x => new { x.Id, x.OriginalFileName, x.ContentType, x.ParseStatus, x.ParseError, x.ParsedAt })
                        .FirstOrDefaultAsync(ct);
                    var unassigned = Array.Empty<string>();
                    if (candidate.ResumeProfileJson is not null)
                    {
                        try
                        {
                            using var document = System.Text.Json.JsonDocument.Parse(candidate.ResumeProfileJson);
                            if (document.RootElement.TryGetProperty("unassignedText", out var lines) && lines.ValueKind == System.Text.Json.JsonValueKind.Array)
                                unassigned = lines.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToArray();
                        }
                        catch (System.Text.Json.JsonException) { }
                    }
                    return Results.Ok(new
                    {
                        candidate.Id,
                        Name = candidate.FirstName + " " + candidate.LastName,
                        Email = canSeeContact ? candidate.Email : null,
                        Phone = canSeeContact ? candidate.Phone : null,
                        candidate.City,
                        candidate.Region,
                        candidate.Country,
                        candidate.Location,
                        candidate.WillingToRelocate,
                        candidate.OpenToRemote,
                        LinkedInUrl = canSeeContact ? candidate.LinkedInUrl : null,
                        GitHubUrl = canSeeContact ? candidate.GitHubUrl : null,
                        PortfolioUrl = canSeeContact ? candidate.PortfolioUrl : null,
                        OtherUrls = canSeeContact ? candidate.OtherUrls : [],
                        Summary = candidate.ResumeSummary,
                        candidate.CurrentTitle,
                        CurrentEmployer = candidate.CurrentEmployer?.Name,
                        candidate.Seniority,
                        YearsExperience = candidate.ResumeYearsExperience,
                        candidate.YearsManagement,
                        candidate.HighestDegreeLevel,
                        Work = candidate.WorkExperiences.OrderBy(x => x.SortOrder).Select(x => new
                        {
                            x.Id,
                            Company = x.CompanyNameRaw,
                            x.Title,
                            x.Seniority,
                            x.EmploymentType,
                            x.City,
                            x.Region,
                            x.Country,
                            x.IsRemote,
                            x.StartYear,
                            x.StartMonth,
                            x.EndYear,
                            x.EndMonth,
                            x.IsCurrent,
                            x.DurationMonths,
                            x.ManagedPeople,
                            Bullets = x.Description.Split('\n', StringSplitOptions.RemoveEmptyEntries),
                            Skills = x.Skills.Select(s => s.Skill!.Name).Order(StringComparer.OrdinalIgnoreCase).ToArray(),
                            x.Verified,
                        }),
                        Education = candidate.Educations.OrderBy(x => x.SortOrder).Select(x => new
                        {
                            x.Id,
                            School = x.SchoolNameRaw,
                            x.Degree,
                            x.DegreeLevel,
                            x.Field,
                            x.FieldNormalized,
                            x.StartYear,
                            x.EndYear,
                            x.IsInProgress,
                            x.Gpa,
                            x.GpaScale,
                            x.Honors,
                            x.Verified,
                        }),
                        Skills = candidate.Skills.Select(x => new
                        {
                            Name = x.Skill!.Name,
                            x.Skill.Category,
                            x.Source,
                            x.YearsUsed,
                            x.LastUsedYear,
                            x.Verified,
                        }).OrderBy(x => x.Category).ThenBy(x => x.Name, StringComparer.OrdinalIgnoreCase),
                        Certifications = candidate.Certifications.Select(x => new { x.Id, x.Name, x.Issuer, x.Year, x.ExpiresYear, x.Url, x.Verified }),
                        Languages = candidate.Languages.Select(x => new { x.Language, x.Proficiency }),
                        Projects = candidate.Projects.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Description,
                            x.Url,
                            x.Year,
                            Skills = x.Skills.Select(s => s.Skill!.Name).ToArray(),
                        }),
                        Publications = candidate.Publications.Select(x => new { x.Id, x.Title, x.Venue, x.Year, x.Url }),
                        Awards = candidate.Awards.Select(x => new { x.Id, x.Name, x.Issuer, x.Year }),
                        // The raw text carries the contact details, so it follows the same rule as they do.
                        UnassignedText = canSeeContact ? unassigned : [],
                        ResumeText = canSeeContact ? candidate.ResumeText : null,
                        ParsedAt = candidate.ResumeParsedAt,
                        Model = candidate.ResumeModel,
                        PromptVersion = candidate.ResumePromptVersion,
                        Attachment = attachment,
                    });
                }
            )
            .RequireAuthorization(AtsPolicies.Read);

        api.MapPost(
                "/candidates/{candidateId:guid}/attachments/{attachmentId:guid}/parse",
                async (
                    Guid candidateId,
                    Guid attachmentId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(
                        value => value.Id == candidateId,
                        ct
                    );
                    var attachment = await db.Attachments.SingleOrDefaultAsync(
                        value => value.Id == attachmentId && value.CandidateId == candidateId,
                        ct
                    );
                    if (candidate is null || attachment is null)
                        return Results.NotFound();
                    var job = await db.ResumeParseJobs.SingleOrDefaultAsync(
                        value => value.AttachmentId == attachmentId,
                        ct
                    );
                    if (job is null)
                    {
                        job = new ResumeParseJob { AttachmentId = attachmentId };
                        db.ResumeParseJobs.Add(job);
                    }
                    else
                    {
                        job.Status = "Pending";
                        job.Attempts = 0;
                        job.NextAttemptAt = DateTimeOffset.UtcNow;
                        job.LockedUntil = null;
                        job.LastError = null;
                        job.CompletedAt = null;
                    }
                    attachment.ParseStatus = "Pending";
                    attachment.ParseError = null;
                    attachment.ParsedAt = null;
                    Audit.Add(db, principal, "Candidate", candidateId, "ResumeParseQueued", new { attachment.Id });
                    await db.SaveChangesAsync(ct);
                    return Results.Accepted($"/api/attachments/{attachment.Id}", new { attachment.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }

    private static string? FormValue(IFormCollection form, string key)
    {
        var value = form[key].ToString().Trim();
        return value.Length == 0 ? null : value;
    }

    private static string[] SearchTerms(string value) => value
        .Split([' ', ',', ';'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
        .Where(term => term.Length >= 2)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(12)
        .ToArray();
}
