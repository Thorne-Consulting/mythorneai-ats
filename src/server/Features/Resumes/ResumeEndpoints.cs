using System.Globalization;
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
        api.MapPost(
                "/resumes/parse",
                async (HttpRequest request, ResumeParser parser, CancellationToken ct) =>
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
                        var parsed = await parser.ParseAsync(stream, file.FileName, ct);
                        return Results.Ok(ToResumePreview(parsed));
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

        api.MapPost(
                "/resumes/import",
                async (
                    HttpRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    ResumeParser parser,
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

                    ResumeParseResult parsed;
                    try
                    {
                        await using var stream = file.OpenReadStream();
                        parsed = await parser.ParseAsync(stream, file.FileName, ct);
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }

                    var firstName = FormValue(form, "firstName") ?? parsed.FirstName;
                    var lastName = FormValue(form, "lastName") ?? parsed.LastName;
                    var email = (FormValue(form, "email") ?? parsed.Email).ToLowerInvariant();
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

                    var skillOverride = form["skills"]
                        .SelectMany(value => (value ?? string.Empty).Split(','))
                        .Select(value => value.Trim().ToLowerInvariant())
                        .Where(value => value.Length > 0)
                        .Distinct()
                        .ToArray();
                    var candidate = new Candidate
                    {
                        FirstName = firstName.Trim(),
                        LastName = lastName.Trim(),
                        Email = email.Trim(),
                        Phone = Clean(FormValue(form, "phone") ?? parsed.Phone),
                        Location = Clean(FormValue(form, "location") ?? parsed.Location),
                        CurrentTitle = Clean(FormValue(form, "currentTitle") ?? parsed.CurrentTitle),
                        LinkedInUrl = Clean(FormValue(form, "linkedInUrl") ?? parsed.LinkedInUrl),
                        Source = source.Trim(),
                        Tags = skillOverride.Length > 0 ? skillOverride : parsed.Skills.Take(12).ToArray(),
                    };
                    ResumeProfileMapper.Apply(
                        candidate,
                        parsed with
                        {
                            Summary = FormValue(form, "summary") ?? parsed.Summary,
                            Skills = skillOverride.Length > 0 ? skillOverride : parsed.Skills,
                        }
                    );
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
                    db.Candidates.Add(candidate);
                    db.Attachments.Add(attachment);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        candidate.Id,
                        "ResumeImported",
                        new { attachment.Id, attachment.OriginalFileName, parsed.Confidence }
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

        api.MapPost(
                "/candidates/{candidateId:guid}/attachments/{attachmentId:guid}/parse",
                async (
                    Guid candidateId,
                    Guid attachmentId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    ResumeParser parser,
                    LocalFileStore files,
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

    private static object ToResumePreview(ResumeParseResult parsed) => new
    {
        parsed.FirstName,
        parsed.LastName,
        parsed.Email,
        parsed.Phone,
        parsed.Location,
        parsed.CurrentTitle,
        parsed.LinkedInUrl,
        parsed.Summary,
        parsed.Skills,
        parsed.JobTitles,
        parsed.Education,
        parsed.Certifications,
        parsed.Languages,
        parsed.YearsExperience,
        parsed.Confidence,
        parsed.Warnings,
    };

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
