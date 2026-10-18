using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapCandidates(RouteGroupBuilder api)
    {
        // Everyone you can see, one row per person, with the applications you can see on each. Filters
        // cover the person (search, skills, title, location, source, experience, resume) and their
        // applications (job, stage, status, rating); application filters must all hold on one application.
        api.MapGet(
            "/candidates",
            async (HttpRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var query = request.Query;
                var search = query["search"].ToString().Trim();
                var skills = query["skills"].ToString()
                    .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
                    .Select(value => value.ToLowerInvariant())
                    .Distinct()
                    .ToArray();
                var allSkills = query["skillMode"].ToString() == "all";
                var title = query["title"].ToString().Trim();
                var location = query["location"].ToString().Trim();
                var source = query["source"].ToString().Trim();
                var hasResume = bool.TryParse(query["hasResume"], out var resumeValue) ? resumeValue : (bool?)null;
                var includeDnc = bool.TryParse(query["includeDnc"], out var dncValue) && dncValue;
                var minYears = decimal.TryParse(query["minYears"], NumberStyles.Number, CultureInfo.InvariantCulture, out var years)
                    ? years
                    : (decimal?)null;
                var requisitionId = Guid.TryParse(query["requisitionId"], out var jobValue) ? jobValue : (Guid?)null;
                var stageId = Guid.TryParse(query["stageId"], out var stageValue) ? stageValue : (Guid?)null;
                var status = Enum.TryParse<ApplicationStatus>(query["status"], true, out var statusValue)
                    ? statusValue
                    : (ApplicationStatus?)null;
                var minRating = int.TryParse(query["minRating"], out var ratingValue) ? ratingValue : (int?)null;
                var sort = query["sort"].ToString();
                var page = int.TryParse(query["page"], out var pageValue) ? Math.Max(pageValue, 1) : 1;
                var pageSize = int.TryParse(query["pageSize"], out var sizeValue) ? Math.Clamp(sizeValue, 10, 100) : 25;

                var scopedApplications = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var canSeeEveryone = principal.IsHiringStaff();
                var candidates = db.Candidates.AsNoTracking()
                    .Where(candidate =>
                        canSeeEveryone || scopedApplications.Select(x => x.CandidateId).Contains(candidate.Id)
                    );

                if (requisitionId is not null || stageId is not null || status is not null || minRating is not null)
                {
                    var matching = scopedApplications;
                    if (requisitionId is not null)
                        matching = matching.Where(x => x.RequisitionId == requisitionId);
                    if (stageId is not null)
                        matching = matching.Where(x => x.PipelineStageId == stageId);
                    if (status is not null)
                        matching = matching.Where(x => x.Status == status);
                    if (minRating is not null)
                        matching = matching.Where(x => x.Rating >= minRating);
                    var matchingIds = matching.Select(x => x.CandidateId);
                    candidates = candidates.Where(candidate => matchingIds.Contains(candidate.Id));
                }
                if (!includeDnc)
                    candidates = candidates.Where(candidate => !candidate.DoNotContact);
                if (location.Length > 0)
                    candidates = candidates.Where(candidate =>
                        candidate.Location != null && EF.Functions.ILike(candidate.Location, $"%{location}%")
                    );
                if (title.Length > 0)
                    candidates = candidates.Where(candidate =>
                        (candidate.CurrentTitle != null && EF.Functions.ILike(candidate.CurrentTitle, $"%{title}%"))
                        || candidate.ResumeJobTitles.Any(value => EF.Functions.ILike(value, $"%{title}%"))
                    );
                if (source.Length > 0)
                    candidates = candidates.Where(candidate => candidate.Source == source);
                if (hasResume is not null)
                    candidates = hasResume.Value
                        ? candidates.Where(candidate => candidate.ResumeParsedAt != null)
                        : candidates.Where(candidate => candidate.ResumeParsedAt == null);
                if (minYears is not null)
                    candidates = candidates.Where(candidate => candidate.ResumeYearsExperience >= minYears.Value);
                if (skills.Length > 0)
                {
                    if (allSkills)
                        foreach (var skill in skills)
                            candidates = candidates.Where(candidate =>
                                candidate.Tags.Contains(skill) || candidate.ResumeSkills.Contains(skill)
                            );
                    else
                        candidates = candidates.Where(candidate =>
                            candidate.Tags.Any(value => skills.Contains(value))
                            || candidate.ResumeSkills.Any(value => skills.Contains(value))
                        );
                }
                // Every word must match the resume text or one of the person's fields.
                var terms = SearchTerms(search);
                var textQuery = string.Join(' ', terms);
                foreach (var term in terms)
                {
                    var pattern = $"%{term}%";
                    candidates = candidates.Where(candidate =>
                        (candidate.ResumeText != null
                            && EF.Functions.ToTsVector("simple", candidate.ResumeText)
                                .Matches(EF.Functions.PlainToTsQuery("simple", textQuery)))
                        || EF.Functions.ILike(candidate.FirstName, pattern)
                        || EF.Functions.ILike(candidate.LastName, pattern)
                        || EF.Functions.ILike(candidate.Email, pattern)
                        || (candidate.CurrentTitle != null && EF.Functions.ILike(candidate.CurrentTitle, pattern))
                        || (candidate.Location != null && EF.Functions.ILike(candidate.Location, pattern))
                        || candidate.Tags.Any(value => EF.Functions.ILike(value, pattern))
                        || candidate.ResumeSkills.Any(value => EF.Functions.ILike(value, pattern))
                    );
                }

                var total = await candidates.CountAsync(ct);
                var ordered = sort switch
                {
                    "name" => candidates.OrderBy(x => x.LastName).ThenBy(x => x.FirstName),
                    "experience" => candidates.OrderByDescending(x => x.ResumeYearsExperience ?? 0),
                    "rating" => candidates
                        .OrderByDescending(x => scopedApplications
                            .Where(a => a.CandidateId == x.Id)
                            .Max(a => a.Rating) ?? 0)
                        .ThenByDescending(x => x.UpdatedAt),
                    _ when terms.Length > 0 => candidates
                        .OrderByDescending(x => x.ResumeText == null
                            ? 0f
                            : EF.Functions.ToTsVector("simple", x.ResumeText)
                                .Rank(EF.Functions.PlainToTsQuery("simple", textQuery)))
                        .ThenByDescending(x => x.UpdatedAt),
                    // Most recent activity first: the latest application movement, or the record itself.
                    _ => candidates.OrderByDescending(x =>
                        scopedApplications
                            .Where(a => a.CandidateId == x.Id)
                            .Max(a => (DateTimeOffset?)a.LastActivityAt) ?? x.UpdatedAt
                    ),
                };
                var people = await ordered
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(x => new
                    {
                        x.Id,
                        Name = x.FirstName + " " + x.LastName,
                        x.Email,
                        x.Location,
                        x.CurrentTitle,
                        x.Source,
                        x.Tags,
                        x.ResumeSkills,
                        x.ResumeYearsExperience,
                        x.ResumeParsedAt,
                        x.DoNotContact,
                        x.UpdatedAt,
                    })
                    .ToListAsync(ct);

                var ids = people.Select(x => x.Id).ToArray();
                var staleDays = await db.Organizations.Select(x => (int?)x.StaleReminderDays).SingleOrDefaultAsync(ct) ?? 3;
                var staleCutoff = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(staleDays, 1, 30));
                var applications = await scopedApplications
                    .Where(x => ids.Contains(x.CandidateId))
                    .OrderByDescending(x => x.LastActivityAt)
                    .Select(x => new
                    {
                        x.CandidateId,
                        x.Id,
                        x.RequisitionId,
                        RequisitionCode = x.Requisition!.Code,
                        RequisitionTitle = x.Requisition.Title,
                        StageId = x.PipelineStageId,
                        Stage = x.PipelineStage!.Name,
                        Status = x.Status.ToString(),
                        x.Rating,
                        x.AppliedAt,
                        x.LastActivityAt,
                        // What needs a recruiter's eye: unread candidate messages, and no movement for a while.
                        UnreadMessages = x.Messages.Count(m => m.FromCandidate && m.ReadAt == null),
                        Stalled = x.Status == ApplicationStatus.Active
                            && !x.PipelineStage.IsTerminal
                            && x.LastActivityAt < staleCutoff,
                        FitScore = db.JobFits
                            .Where(f => f.RequisitionId == x.RequisitionId && f.CandidateId == x.CandidateId)
                            .Select(f => (int?)f.Score)
                            .FirstOrDefault(),
                    })
                    .ToListAsync(ct);
                var applicationsByPerson = applications.ToLookup(x => x.CandidateId);
                var canSeeContact =
                    canSeeEveryone || principal.IsInRole(nameof(UserRole.HiringManager));

                var items = people.Select(x =>
                {
                    var personSkills = x.Tags
                        .Concat(x.ResumeSkills)
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Order(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                    return new
                    {
                        x.Id,
                        x.Name,
                        Email = canSeeContact ? x.Email : "Restricted",
                        x.Location,
                        x.CurrentTitle,
                        x.Source,
                        Skills = personSkills.Take(10).ToArray(),
                        ExperienceYears = x.ResumeYearsExperience,
                        HasParsedResume = x.ResumeParsedAt != null,
                        x.DoNotContact,
                        x.UpdatedAt,
                        MatchedTerms = skills
                            .Where(skill => personSkills.Contains(skill, StringComparer.OrdinalIgnoreCase))
                            .Concat(terms.Where(term =>
                                personSkills.Any(value => value.Contains(term, StringComparison.OrdinalIgnoreCase))))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToArray(),
                        Applications = applicationsByPerson[x.Id]
                            .Select(a => new
                            {
                                a.Id,
                                a.RequisitionId,
                                a.RequisitionCode,
                                a.RequisitionTitle,
                                a.StageId,
                                a.Stage,
                                a.Status,
                                a.Rating,
                                a.AppliedAt,
                                a.LastActivityAt,
                                a.UnreadMessages,
                                a.Stalled,
                                a.FitScore,
                            })
                            .ToArray(),
                    };
                });
                return Results.Ok(new
                {
                    Items = items,
                    Total = total,
                    Page = page,
                    PageSize = pageSize,
                    StaleDays = staleDays,
                });
            }
        );

        api.MapGet(
            "/candidates/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeContact =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var candidate = await db
                    .Candidates.AsNoTracking()
                    .Where(x =>
                        x.Id == id
                        && (
                            canSeeAllCandidates
                            || x.Applications.Any(a => allowedApplicationIds.Contains(a.Id))
                        )
                    )
                    .Select(x => new
                    {
                        x.Id,
                        x.FirstName,
                        x.LastName,
                        Email = canSeeContact ? x.Email : "Restricted",
                        Phone = canSeeContact ? x.Phone : null,
                        x.Location,
                        x.CurrentTitle,
                        LinkedInUrl = canSeeContact ? x.LinkedInUrl : null,
                        x.Source,
                        x.Tags,
                        x.DoNotContact,
                        x.EmailBounced,
                        x.CustomFieldsJson,
                        x.CreatedAt,
                        x.UpdatedAt,
                        x.ResumeSummary,
                        x.ResumeSkills,
                        x.ResumeJobTitles,
                        x.ResumeEducation,
                        x.ResumeCertifications,
                        x.ResumeLanguages,
                        x.ResumeYearsExperience,
                        x.ResumeParsedAt,
                        Applications = x
                            .Applications.Where(a => allowedApplicationIds.Contains(a.Id))
                            .OrderByDescending(a => a.LastActivityAt)
                            .Select(a => new
                            {
                                a.Id,
                                RequisitionId = a.RequisitionId,
                                RequisitionCode = a.Requisition!.Code,
                                RequisitionTitle = a.Requisition.Title,
                                Stage = a.PipelineStage!.Name,
                                Status = a.Status.ToString(),
                                a.AppliedAt,
                                a.LastActivityAt,
                            }),
                        Attachments = x
                            .Attachments.OrderByDescending(a => a.UploadedAt)
                            .Select(a => new
                            {
                                a.Id,
                                a.OriginalFileName,
                                a.ContentType,
                                a.Length,
                                a.ScanStatus,
                                a.ParseStatus,
                                a.ParseError,
                                a.ParsedAt,
                                a.UploadedAt,
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                return candidate is null ? Results.NotFound() : Results.Ok(candidate);
            }
        );

        api.MapPost(
                "/candidates",
                async (
                    CreateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    var possibleDuplicate = await db
                        .Candidates.AsNoTracking()
                        .Where(x => x.Email == email)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                        })
                        .FirstOrDefaultAsync(ct);
                    if (possibleDuplicate is not null)
                        return Results.Conflict(
                            new
                            {
                                message = "A candidate with this email already exists.",
                                candidate = possibleDuplicate,
                            }
                        );

                    var candidate = new Candidate
                    {
                        FirstName = request.FirstName.Trim(),
                        LastName = request.LastName.Trim(),
                        Email = email,
                        Phone = Clean(request.Phone),
                        Location = Clean(request.Location),
                        CurrentTitle = Clean(request.CurrentTitle),
                        LinkedInUrl = Clean(request.LinkedInUrl),
                        Source = request.Source.Trim(),
                        Tags =
                            request
                                .Tags?.Select(x => x.Trim().ToLowerInvariant())
                                .Where(x => x.Length > 0)
                                .Distinct()
                                .ToArray()
                            ?? [],
                    };
                    db.Candidates.Add(candidate);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        candidate.Id,
                        "Created",
                        new { candidate.Email, candidate.Source }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/candidates/{candidate.Id}", new { candidate.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPut(
                "/candidates/{id:guid}",
                async (
                    Guid id,
                    UpdateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    if (await db.Candidates.AnyAsync(x => x.Id != id && x.Email == email, ct))
                        return Results.Conflict(
                            new { message = "Another candidate has this email." }
                        );

                    candidate.FirstName = request.FirstName.Trim();
                    candidate.LastName = request.LastName.Trim();
                    candidate.Email = email;
                    candidate.Phone = Clean(request.Phone);
                    candidate.Location = Clean(request.Location);
                    candidate.CurrentTitle = Clean(request.CurrentTitle);
                    candidate.LinkedInUrl = Clean(request.LinkedInUrl);
                    candidate.Source = request.Source.Trim();
                    candidate.Tags =
                        request
                            .Tags?.Select(x => x.Trim().ToLowerInvariant())
                            .Where(x => x.Length > 0)
                            .Distinct()
                            .ToArray()
                        ?? [];
                    candidate.DoNotContact = request.DoNotContact;
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPut(
                "/candidates/{id:guid}/resume-profile",
                async (
                    Guid id,
                    UpdateResumeProfileRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    if (request.YearsExperience is < 0 or > 60)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["yearsExperience"] = ["Experience must be between 0 and 60 years."],
                            }
                        );

                    candidate.ResumeSummary = Clean(request.Summary);
                    candidate.CurrentTitle = Clean(request.CurrentTitle);
                    candidate.ResumeSkills = NormalizeSkills(request.Skills);
                    candidate.ResumeJobTitles = NormalizeTerms(request.JobTitles, 20);
                    candidate.ResumeEducation = NormalizeTerms(request.Education, 20);
                    candidate.ResumeCertifications = NormalizeTerms(request.Certifications, 20);
                    candidate.ResumeLanguages = NormalizeTerms(request.Languages, 20);
                    candidate.ResumeYearsExperience = request.YearsExperience;
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "ResumeProfileReviewed");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
                "/candidates/{id:guid}/duplicates",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var candidate = await db.Candidates.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();

                    var email = candidate.Email.Trim().ToLowerInvariant();
                    var phone = NormalizePhone(candidate.Phone);
                    var linkedIn = NormalizeLink(candidate.LinkedInUrl);
                    var firstName = candidate.FirstName.Trim().ToLowerInvariant();
                    var lastName = candidate.LastName.Trim().ToLowerInvariant();
                    var possible = await db.Candidates.AsNoTracking()
                        .Where(x => x.Id != id && (
                            x.Email == email
                            || (phone != null && x.Phone == candidate.Phone)
                            || (linkedIn != null && x.LinkedInUrl == candidate.LinkedInUrl)
                            || (x.FirstName.ToLower() == firstName && x.LastName.ToLower() == lastName)
                        ))
                        .Select(x => new { x.Id, x.FirstName, x.LastName, x.Email, x.Phone, x.LinkedInUrl, x.CurrentTitle })
                        .Take(25)
                        .ToListAsync(ct);

                    var matches = possible.Select(x => new
                    {
                        x.Id,
                        Name = x.FirstName + " " + x.LastName,
                        x.Email,
                        x.CurrentTitle,
                        Reasons = new[]
                        {
                            x.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase) ? "Same email" : null,
                            phone != null && NormalizePhone(x.Phone) == phone ? "Same phone" : null,
                            linkedIn != null && NormalizeLink(x.LinkedInUrl) == linkedIn ? "Same LinkedIn URL" : null,
                            x.FirstName.Trim().Equals(candidate.FirstName.Trim(), StringComparison.OrdinalIgnoreCase)
                                && x.LastName.Trim().Equals(candidate.LastName.Trim(), StringComparison.OrdinalIgnoreCase)
                                    ? "Same name" : null,
                        }.Where(reason => reason is not null).ToArray(),
                    }).Where(x => x.Reasons.Length > 0);
                    return Results.Ok(matches);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        MapCandidateAttachments(api);
    }

    private static string[] NormalizeTerms(string[]? values, int max) => values?
        .Select(value => value.Trim())
        .Where(value => value.Length > 0)
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .Take(max)
        .ToArray() ?? [];

    private static string[] NormalizeSkills(string[]? values) => values?
        .Select(value => value.Trim().ToLowerInvariant())
        .Where(value => value.Length > 0)
        .Distinct()
        .Take(40)
        .ToArray() ?? [];

    private static string? NormalizePhone(string? value)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length >= 7 ? digits : null;
    }

    private static string? NormalizeLink(string? value) => string.IsNullOrWhiteSpace(value)
        ? null
        : value.Trim().TrimEnd('/').ToLowerInvariant();
}
