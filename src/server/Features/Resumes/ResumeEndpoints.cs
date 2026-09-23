using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using NpgsqlTypes;

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
                    try
                    {
                        await using var stream = files.OpenRead(attachment.StoredFileName);
                        var parsed = await parser.ParseAsync(stream, attachment.OriginalFileName, ct);
                        ResumeProfileMapper.Apply(candidate, parsed);
                        attachment.ParseStatus = "Parsed";
                        attachment.ParseError = null;
                        attachment.ParsedAt = DateTimeOffset.UtcNow;
                        Audit.Add(
                            db,
                            principal,
                            "Candidate",
                            candidateId,
                            "ResumeParsed",
                            new { attachment.Id, parsed.Confidence }
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.Ok(ToResumePreview(parsed));
                    }
                    catch (Exception exception) when (exception is not OperationCanceledException)
                    {
                        attachment.ParseStatus = "Failed";
                        attachment.ParseError = exception.Message;
                        await db.SaveChangesAsync(ct);
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
            "/talent/search",
            async (HttpRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var queryValues = request.Query;
                var q = queryValues["q"].ToString().Trim();
                var requestedSkills = queryValues["skills"].ToString()
                    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                    .Select(value => value.ToLowerInvariant())
                    .Distinct()
                    .ToArray();
                var skillMode = queryValues["skillMode"].ToString() == "all" ? "all" : "any";
                var location = queryValues["location"].ToString().Trim();
                var title = queryValues["title"].ToString().Trim();
                var source = queryValues["source"].ToString().Trim();
                var hasResume = bool.TryParse(queryValues["hasResume"], out var resumeValue)
                    ? resumeValue
                    : (bool?)null;
                var includeDnc = bool.TryParse(queryValues["includeDnc"], out var dncValue) && dncValue;
                var minYears = decimal.TryParse(
                    queryValues["minYears"],
                    NumberStyles.Number,
                    CultureInfo.InvariantCulture,
                    out var yearsValue
                )
                    ? yearsValue
                    : (decimal?)null;
                var page = int.TryParse(queryValues["page"], out var pageValue)
                    ? Math.Max(pageValue, 1)
                    : 1;
                var pageSize = int.TryParse(queryValues["pageSize"], out var pageSizeValue)
                    ? Math.Clamp(pageSizeValue, 10, 100)
                    : 25;
                var sort = queryValues["sort"].ToString();

                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(application => application.CandidateId);
                var canSeeAll = principal.IsHiringStaff();
                var candidates = db.Candidates.AsNoTracking()
                    .Where(candidate => canSeeAll || allowedCandidateIds.Contains(candidate.Id));
                if (!includeDnc)
                    candidates = candidates.Where(candidate => !candidate.DoNotContact);
                if (location.Length > 0)
                    candidates = candidates.Where(candidate =>
                        candidate.Location != null && EF.Functions.ILike(candidate.Location, $"%{location}%")
                    );
                if (title.Length > 0)
                    candidates = candidates.Where(candidate =>
                        (candidate.CurrentTitle != null
                            && EF.Functions.ILike(candidate.CurrentTitle, $"%{title}%"))
                        || candidate.ResumeJobTitles.Any(value => EF.Functions.ILike(value, $"%{title}%"))
                    );
                if (source.Length > 0)
                    candidates = candidates.Where(candidate => candidate.Source == source);
                if (hasResume is not null)
                    candidates = hasResume.Value
                        ? candidates.Where(candidate => candidate.ResumeParsedAt != null)
                        : candidates.Where(candidate => candidate.ResumeParsedAt == null);
                if (minYears is not null)
                    candidates = candidates.Where(candidate =>
                        candidate.ResumeYearsExperience >= minYears.Value
                    );
                if (requestedSkills.Length > 0)
                {
                    if (skillMode == "all")
                    {
                        foreach (var skill in requestedSkills)
                        {
                            candidates = candidates.Where(candidate =>
                                candidate.Tags.Contains(skill)
                                || candidate.ResumeSkills.Contains(skill)
                            );
                        }
                    }
                    else
                    {
                        candidates = candidates.Where(candidate =>
                            candidate.Tags.Any(value => requestedSkills.Contains(value))
                            || candidate.ResumeSkills.Any(value => requestedSkills.Contains(value))
                        );
                    }
                }
                var qTerms = SearchTerms(q);
                NpgsqlTsQuery? textQuery = null;
                if (qTerms.Length > 0)
                {
                    textQuery = EF.Functions.PlainToTsQuery("simple", string.Join(' ', qTerms));
                    foreach (var term in qTerms)
                    {
                        var pattern = $"%{term}%";
                        candidates = candidates.Where(candidate =>
                            (candidate.ResumeText != null
                                && EF.Functions.ToTsVector("simple", candidate.ResumeText)
                                    .Matches(textQuery))
                            || EF.Functions.ILike(candidate.FirstName, pattern)
                            || EF.Functions.ILike(candidate.LastName, pattern)
                            || EF.Functions.ILike(candidate.Email, pattern)
                            || (candidate.CurrentTitle != null
                                && EF.Functions.ILike(candidate.CurrentTitle, pattern))
                            || (candidate.Location != null
                                && EF.Functions.ILike(candidate.Location, pattern))
                            || candidate.Tags.Any(value => EF.Functions.ILike(value, pattern))
                            || candidate.ResumeSkills.Any(value => EF.Functions.ILike(value, pattern))
                        );
                    }
                }

                var total = await candidates.CountAsync(ct);
                var scoredCandidates = candidates.Select(candidate => new
                {
                    Candidate = candidate,
                    Rank = textQuery == null || candidate.ResumeText == null
                        ? 0f
                        : EF.Functions.ToTsVector("simple", candidate.ResumeText).Rank(textQuery),
                });
                var orderedCandidates = sort switch
                {
                    "recent" => scoredCandidates.OrderByDescending(value => value.Candidate.UpdatedAt),
                    "name" => scoredCandidates.OrderBy(value => value.Candidate.LastName)
                        .ThenBy(value => value.Candidate.FirstName),
                    "experience" => scoredCandidates.OrderByDescending(
                        value => value.Candidate.ResumeYearsExperience ?? 0
                    ),
                    _ when textQuery is not null => scoredCandidates.OrderByDescending(value => value.Rank)
                        .ThenByDescending(value => value.Candidate.UpdatedAt),
                    _ => scoredCandidates.OrderByDescending(value => value.Candidate.UpdatedAt),
                };
                var pool = await orderedCandidates
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(candidate => new
                    {
                        candidate.Candidate.Id,
                        Name = candidate.Candidate.FirstName + " " + candidate.Candidate.LastName,
                        candidate.Candidate.Email,
                        candidate.Candidate.Location,
                        candidate.Candidate.CurrentTitle,
                        candidate.Candidate.Source,
                        candidate.Candidate.Tags,
                        candidate.Candidate.ResumeSkills,
                        candidate.Candidate.ResumeJobTitles,
                        candidate.Candidate.ResumeYearsExperience,
                        candidate.Candidate.ResumeParsedAt,
                        candidate.Candidate.DoNotContact,
                        candidate.Candidate.UpdatedAt,
                        ActiveApplications = candidate.Candidate.Applications.Count(application =>
                            application.Status == ApplicationStatus.Active
                        ),
                    })
                    .ToListAsync(ct);

                var matches = pool
                    .Select(candidate =>
                    {
                        var skills = candidate.Tags
                            .Concat(candidate.ResumeSkills)
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .Order(StringComparer.OrdinalIgnoreCase)
                            .ToArray();
                        var skillMatches = requestedSkills
                            .Where(skill => skills.Contains(skill, StringComparer.OrdinalIgnoreCase))
                            .ToArray();
                        var textMatches = qTerms;
                        int? score = null;
                        if (qTerms.Length > 0 || requestedSkills.Length > 0 || title.Length > 0)
                        {
                            var possible = Math.Max(qTerms.Length + requestedSkills.Length + (title.Length > 0 ? 1 : 0), 1);
                            var earned = textMatches.Length + skillMatches.Length;
                            if (title.Length > 0 && (
                                candidate.CurrentTitle?.Contains(title, StringComparison.OrdinalIgnoreCase) == true
                                || candidate.ResumeJobTitles.Any(value => value.Contains(title, StringComparison.OrdinalIgnoreCase))))
                                earned++;
                            score = Math.Clamp((int)Math.Round(earned * 100m / possible), 1, 100);
                        }
                        return new
                        {
                            CandidateId = candidate.Id,
                            candidate.Name,
                            Email = principal.IsInRole(nameof(UserRole.Interviewer))
                                ? "Restricted"
                                : candidate.Email,
                            candidate.Location,
                            candidate.CurrentTitle,
                            candidate.Source,
                            Skills = skills.Take(10).ToArray(),
                            ExperienceYears = candidate.ResumeYearsExperience,
                            HasParsedResume = candidate.ResumeParsedAt != null,
                            candidate.DoNotContact,
                            candidate.UpdatedAt,
                            candidate.ActiveApplications,
                            MatchScore = score,
                            MatchedTerms = textMatches.Concat(skillMatches).Distinct().Take(8).ToArray(),
                        };
                    })
                    .ToList();
                var items = matches.ToArray();
                return Results.Ok(new { Items = items, Total = total, Page = page, PageSize = pageSize });
            }
        );
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
