using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    // ponytail: export runs in the request; move to a background export with a download link past this.
    private const int ExportLimit = 10_000;

    private static void MapCandidates(RouteGroupBuilder api)
    {
        // Everyone you can see, one row per person, with the applications you can see on each.
        api.MapGet(
            "/candidates",
            async (
                HttpRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var query = request.Query;
                var (candidates, scopedApplications, search) = FilterCandidates(
                    query,
                    principal,
                    db
                );
                var sort = query["sort"].ToString();
                var page = int.TryParse(query["page"], out var pageValue)
                    ? Math.Max(pageValue, 1)
                    : 1;
                var pageSize = int.TryParse(query["pageSize"], out var sizeValue)
                    ? Math.Clamp(sizeValue, 10, 100)
                    : 25;

                var total = await candidates.CountAsync(ct);
                var poolId = Guid.TryParse(query["poolId"], out var poolValue)
                    ? poolValue
                    : (Guid?)null;
                var jobId = Guid.TryParse(query["requisitionId"], out var jobValue)
                    ? jobValue
                    : (Guid?)null;
                var ordered = sort switch
                {
                    // In a talent pool: the people added last first.
                    "added" when poolId is not null => candidates.OrderByDescending(x =>
                        db.TalentPoolMembers.Where(m => m.PoolId == poolId && m.CandidateId == x.Id)
                            .Max(m => (DateTimeOffset?)m.AddedAt)
                    ),
                    "name" => candidates.OrderBy(x => x.LastName).ThenBy(x => x.FirstName),
                    // The best AI fit among the jobs you can see (or the chosen job); people not checked yet go last.
                    "fit" => candidates.OrderByDescending(x =>
                        db.JobFits.Where(f =>
                                f.CandidateId == x.Id
                                && (jobId == null || f.RequisitionId == jobId)
                                && scopedApplications.Any(a =>
                                    a.CandidateId == f.CandidateId
                                    && a.RequisitionId == f.RequisitionId
                                )
                            )
                            .Max(f => (int?)f.Score)
                        ?? -1
                    ),
                    // Latest application first; people who never applied go last (Postgres puts nulls first on a descending sort).
                    "applied" => candidates
                        .OrderByDescending(x => scopedApplications.Any(a => a.CandidateId == x.Id))
                        .ThenByDescending(x =>
                            scopedApplications
                                .Where(a => a.CandidateId == x.Id)
                                .Max(a => (DateTimeOffset?)a.AppliedAt)
                        ),
                    // Waiting longest first, so nobody is forgotten.
                    "idle" => candidates.OrderBy(x =>
                        scopedApplications
                            .Where(a => a.CandidateId == x.Id)
                            .Max(a => (DateTimeOffset?)a.LastActivityAt)
                        ?? x.UpdatedAt
                    ),
                    "experience" => candidates.OrderByDescending(x => x.ResumeYearsExperience ?? 0),
                    "created" => candidates.OrderByDescending(x => x.CreatedAt),
                    "rating" => candidates
                        .OrderByDescending(x =>
                            scopedApplications.Where(a => a.CandidateId == x.Id).Max(a => a.Rating)
                            ?? 0
                        )
                        .ThenByDescending(x => x.UpdatedAt),
                    _ when search.RankQuery is not null => OrderBySearch(candidates, search)
                        .ThenByDescending(x => x.UpdatedAt),
                    // Most recent activity first: the latest application movement, or the record itself.
                    _ => candidates.OrderByDescending(x =>
                        scopedApplications
                            .Where(a => a.CandidateId == x.Id)
                            .Max(a => (DateTimeOffset?)a.LastActivityAt)
                        ?? x.UpdatedAt
                    ),
                };
                var rankQuery = search.RankQuery;
                var people = await ordered
                    .ThenBy(x => x.Id)
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
                        x.CreatedAt,
                        x.UpdatedAt,
                        x.CustomFieldsJson,
                        Headline = rankQuery != null && x.ResumeText != null
                            ? EF
                                .Functions.WebSearchToTsQuery("simple", rankQuery)
                                .GetResultHeadline("simple", x.ResumeText, SnippetOptions)
                            : null,
                    })
                    .ToListAsync(ct);

                var ids = people.Select(x => x.Id).ToArray();
                var staleDays =
                    await db
                        .Organizations.Select(x => (int?)x.StaleReminderDays)
                        .SingleOrDefaultAsync(ct)
                    ?? 3;
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
                        StageType = x.PipelineStage.Type.ToString(),
                        StageColor = x.PipelineStage.Color,
                        Status = x.Status.ToString(),
                        x.Rating,
                        x.AppliedAt,
                        x.LastActivityAt,
                        // What needs a recruiter's eye: unread candidate messages, and no movement for a while.
                        UnreadMessages = x.Messages.Count(m => m.FromCandidate && m.ReadAt == null),
                        Stalled = x.Status == ApplicationStatus.Active
                            && !x.PipelineStage.IsTerminal
                            && x.LastActivityAt < staleCutoff,
                        FitScore = db
                            .JobFits.Where(f =>
                                f.RequisitionId == x.RequisitionId && f.CandidateId == x.CandidateId
                            )
                            .Select(f => (int?)f.Score)
                            .FirstOrDefault(),
                    })
                    .ToListAsync(ct);
                var applicationsByPerson = applications.ToLookup(x => x.CandidateId);
                var poolMembers = poolId is null
                    ? []
                    : await db
                        .TalentPoolMembers.AsNoTracking()
                        .Where(m => m.PoolId == poolId && ids.Contains(m.CandidateId))
                        .Select(m => new
                        {
                            m.CandidateId,
                            m.AddedBy,
                            AddedByName = db.Users.Where(u => u.Email.ToLower() == m.AddedBy)
                                .Select(u => u.DisplayName)
                                .FirstOrDefault()
                                ?? m.AddedBy,
                            m.AddedAt,
                        })
                        .ToDictionaryAsync(m => m.CandidateId, ct);
                var canSeeContact = CanSeeContact(principal);
                var terms = search.Words.Concat(search.Phrases).ToArray();
                var skills = ListParam(query, "skills");

                var items = people.Select(x =>
                {
                    var personSkills = x
                        .ResumeSkills.Order(StringComparer.OrdinalIgnoreCase)
                        .ToArray();
                    // The snippet only helps when the words are not already in the name, email or title.
                    var plain = $"{x.Name} {x.Email} {x.CurrentTitle}";
                    var fromResume = terms.Any(term =>
                        !plain.Contains(term, StringComparison.OrdinalIgnoreCase)
                    );
                    return new
                    {
                        x.Id,
                        x.Name,
                        Email = canSeeContact ? x.Email : "Restricted",
                        x.Location,
                        x.CurrentTitle,
                        x.Source,
                        x.Tags,
                        Skills = personSkills.Take(10).ToArray(),
                        ExperienceYears = x.ResumeYearsExperience,
                        HasParsedResume = x.ResumeParsedAt != null,
                        x.DoNotContact,
                        x.CreatedAt,
                        x.UpdatedAt,
                        Snippet = fromResume ? Snippet(x.Headline) : null,
                        Pool = poolMembers.GetValueOrDefault(x.Id),
                        CustomFields = CustomFieldValues(x.CustomFieldsJson),
                        MatchedTerms = skills
                            .Where(skill =>
                                personSkills.Contains(skill, StringComparer.OrdinalIgnoreCase)
                            )
                            .Concat(
                                terms.Where(term =>
                                    personSkills.Any(value =>
                                        value.Contains(term, StringComparison.OrdinalIgnoreCase)
                                    )
                                )
                            )
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
                                a.StageType,
                                a.StageColor,
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
                return Results.Ok(
                    new
                    {
                        Items = items,
                        Total = total,
                        Page = page,
                        PageSize = pageSize,
                        StaleDays = staleDays,
                    }
                );
            }
        );

        // How many people are in each segment of the Candidates sidebar (people marked do not
        // contact are left out, as the list leaves them out).
        api.MapGet(
            "/candidates/counts",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var (people, scoped, _) = FilterCandidates(new QueryCollection(), principal, db);
                async Task<int> WithStatus(ApplicationStatus status)
                {
                    var ids = scoped.Where(a => a.Status == status).Select(a => a.CandidateId);
                    return await people.CountAsync(x => ids.Contains(x.Id), ct);
                }
                // Pools and saved views count the same way their lists do.
                var pools = new Dictionary<Guid, int>();
                var views = new Dictionary<Guid, int>();
                if (principal.IsHiringStaff())
                {
                    pools = await db
                        .TalentPoolMembers.Where(m =>
                            people.Select(x => x.Id).Contains(m.CandidateId)
                        )
                        .GroupBy(m => m.PoolId)
                        .ToDictionaryAsync(g => g.Key, g => g.Count(), ct);
                }
                var me = principal.Email();
                foreach (
                    var view in await db
                        .SavedViews.AsNoTracking()
                        .Where(x => x.Area == "talent" && (x.OwnerEmail == me || x.Shared))
                        .Select(x => new { x.Id, x.ParamsJson })
                        .ToListAsync(ct)
                )
                    if (SavedViewQuery(view.ParamsJson) is { } filter)
                        views[view.Id] = await FilterCandidates(
                            new QueryCollection(QueryHelpers.ParseQuery(filter)),
                            principal,
                            db
                        )
                            .People.CountAsync(ct);
                return Results.Ok(
                    new
                    {
                        All = await people.CountAsync(ct),
                        Active = await WithStatus(ApplicationStatus.Active),
                        Hired = await WithStatus(ApplicationStatus.Hired),
                        Rejected = await WithStatus(ApplicationStatus.Rejected),
                        Withdrawn = await WithStatus(ApplicationStatus.Withdrawn),
                        NoJob = await people.CountAsync(x => !x.Applications.Any(), ct),
                        Pools = pools,
                        Views = views,
                    }
                );
            }
        );

        // Every row matching the list's filters (or only `ids`), as a spreadsheet (CSV).
        api.MapGet(
            "/candidates/export",
            async (
                HttpRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var (candidates, scoped, _) = FilterCandidates(request.Query, principal, db);
                var ids = request
                    .Query["ids"]
                    .ToString()
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Select(value => Guid.TryParse(value, out var id) ? id : Guid.Empty)
                    .Where(id => id != Guid.Empty)
                    .ToArray();
                if (ids.Length > 0)
                    candidates = candidates.Where(x => ids.Contains(x.Id));
                var people = await candidates
                    .OrderBy(x => x.LastName)
                    .ThenBy(x => x.FirstName)
                    .Take(ExportLimit)
                    .Select(x => new
                    {
                        x.Id,
                        x.FirstName,
                        x.LastName,
                        x.Email,
                        x.Phone,
                        x.CurrentTitle,
                        x.Location,
                        x.Source,
                        x.Tags,
                        x.DoNotContact,
                        x.CustomFieldsJson,
                        x.CreatedAt,
                        x.UpdatedAt,
                    })
                    .ToListAsync(ct);
                var personIds = people.Select(x => x.Id).ToArray();
                var applications = (
                    await scoped
                        .Where(a => personIds.Contains(a.CandidateId))
                        .OrderByDescending(a => a.LastActivityAt)
                        .Select(a => new
                        {
                            a.CandidateId,
                            a.Requisition!.Title,
                            Stage = a.PipelineStage!.Name,
                            a.Status,
                            a.LastActivityAt,
                        })
                        .ToListAsync(ct)
                ).ToLookup(a => a.CandidateId);
                var fields = await db
                    .CustomFieldDefinitions.AsNoTracking()
                    .OrderBy(x => x.SortOrder)
                    .Select(x => new { x.Key, x.Label })
                    .ToListAsync(ct);
                var canSeeContact = CanSeeContact(principal);

                var csv = new StringBuilder();
                void Row(IEnumerable<string?> cells) =>
                    csv.Append(string.Join(',', cells.Select(Csv.Escape))).Append("\r\n");
                Row(
                    new[]
                    {
                        "First name",
                        "Last name",
                        "Email",
                        "Phone",
                        "Current title",
                        "Location",
                        "Source",
                        "Tags",
                        "Do not contact",
                    }
                        .Concat(fields.Select(x => x.Label))
                        .Concat(["Applications", "Last activity", "Added"])
                );
                foreach (var person in people)
                {
                    var values = CustomFieldValues(person.CustomFieldsJson);
                    var apps = applications[person.Id].ToList();
                    var lastActivity = apps.Select(a => a.LastActivityAt)
                        .DefaultIfEmpty(person.UpdatedAt)
                        .Max();
                    Row(
                        new[]
                        {
                            person.FirstName,
                            person.LastName,
                            canSeeContact ? person.Email : "",
                            canSeeContact ? person.Phone : "",
                            person.CurrentTitle,
                            person.Location,
                            person.Source,
                            string.Join("; ", person.Tags),
                            person.DoNotContact ? "Yes" : "",
                        }
                            .Concat(fields.Select(field => values.GetValueOrDefault(field.Key)))
                            .Concat([
                                string.Join(
                                    "; ",
                                    apps.Select(a =>
                                        a.Status == ApplicationStatus.Active
                                            ? $"{a.Title}: {a.Stage}"
                                            : $"{a.Title}: {a.Status} at {a.Stage}"
                                    )
                                ),
                                lastActivity.ToString("yyyy-MM-dd"),
                                person.CreatedAt.ToString("yyyy-MM-dd"),
                            ])
                    );
                }
                // The byte order mark makes Excel read the file as UTF-8.
                var bytes = Encoding
                    .UTF8.GetPreamble()
                    .Concat(Encoding.UTF8.GetBytes(csv.ToString()))
                    .ToArray();
                return Results.File(
                    bytes,
                    "text/csv; charset=utf-8",
                    $"candidates-{DateTime.UtcNow:yyyy-MM-dd}.csv"
                );
            }
        );

        // Every tag in use, with how many people carry it, for autocomplete and the Tags filter.
        api.MapGet(
                "/candidates/tags",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Candidates.AsNoTracking()
                            .SelectMany(x => x.Tags)
                            .GroupBy(tag => tag)
                            .Select(group => new { Tag = group.Key, Count = group.Count() })
                            .OrderByDescending(x => x.Count)
                            .ThenBy(x => x.Tag)
                            .Take(500)
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The managed source names, for older callers; the web app reads /sources.
        api.MapGet(
                "/candidates/sources",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Sources.AsNoTracking()
                            .OrderBy(x => x.Name)
                            .Select(x => x.Name)
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapGet(
            "/candidates/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeContact = CanSeeContact(principal);
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var now = DateTimeOffset.UtcNow;
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
                        GitHubUrl = canSeeContact ? x.GitHubUrl : null,
                        PortfolioUrl = canSeeContact ? x.PortfolioUrl : null,
                        OtherUrls = canSeeContact ? x.OtherUrls : Array.Empty<string>(),
                        x.Source,
                        Referrer = x.Referrer == null
                            ? null
                            : new { x.Referrer.Id, Name = x.Referrer.DisplayName },
                        x.Tags,
                        x.DoNotContact,
                        x.DoNotContactReason,
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
                                StageId = a.PipelineStageId,
                                Stage = a.PipelineStage!.Name,
                                StageType = a.PipelineStage.Type.ToString(),
                                StageColor = a.PipelineStage.Color,
                                Status = a.Status.ToString(),
                                a.AppliedAt,
                                a.LastActivityAt,
                            }),
                        NextInterview = x
                            .Applications.Where(a => allowedApplicationIds.Contains(a.Id))
                            .SelectMany(a => a.Interviews)
                            .Where(i => i.StartsAt >= now && i.Status == InterviewStatus.Scheduled)
                            .OrderBy(i => i.StartsAt)
                            .Select(i => new
                            {
                                i.Id,
                                i.ApplicationId,
                                i.Title,
                                i.StartsAt,
                                RequisitionTitle = i.Application!.Requisition!.Title,
                            })
                            .FirstOrDefault(),
                        Attachments = x
                            .Attachments.OrderByDescending(a => a.UploadedAt)
                            .Select(a => new
                            {
                                a.Id,
                                a.OriginalFileName,
                                a.ContentType,
                                a.Length,
                                a.Kind,
                                a.ScanStatus,
                                a.ParseStatus,
                                a.ParseError,
                                a.ParsedAt,
                                a.UploadedAt,
                            }),
                        // The resume the profile was read from: the latest one read.
                        ResumeAttachmentId = x
                            .Attachments.Where(a =>
                                a.Kind == AttachmentKinds.Resume && a.ParseStatus == "Parsed"
                            )
                            .OrderByDescending(a => a.ParsedAt)
                            .Select(a => (Guid?)a.Id)
                            .FirstOrDefault(),
                        Pools = db
                            .TalentPoolMembers.Where(m => m.CandidateId == x.Id)
                            .OrderBy(m => m.Pool!.Name)
                            .Select(m => new
                            {
                                Id = m.PoolId,
                                m.Pool!.Name,
                                m.AddedBy,
                                m.AddedAt,
                            })
                            .ToList(),
                        Dismissals = db
                            .CandidateDismissals.Where(d => d.CandidateId == x.Id)
                            .Select(d => new
                            {
                                d.RequisitionId,
                                d.Reason,
                                d.DismissedBy,
                                d.CreatedAt,
                            })
                            .ToList(),
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
                    var (source, referrerId) = await CheckSourceAsync(
                        db,
                        request.Source,
                        request.ReferrerId,
                        errors,
                        ct
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
                        Source = source!,
                        ReferrerId = referrerId,
                        Tags = NormalizeTags(request.Tags),
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

        // Edit details. A new email clears the bounce flag; nothing here touches the resume or its embedding.
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
                    foreach (
                        var (key, value) in new[]
                        {
                            ("linkedInUrl", request.LinkedInUrl),
                            ("gitHubUrl", request.GitHubUrl),
                            ("portfolioUrl", request.PortfolioUrl),
                        }
                    )
                        if (Clean(value) is { } link && !IsWebLink(link))
                            errors[key] = ["Enter a full web address that starts with https://."];
                    var (source, referrerId) = await CheckSourceAsync(
                        db,
                        request.Source,
                        request.ReferrerId,
                        errors,
                        ct
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    var other = await db
                        .Candidates.AsNoTracking()
                        .Where(x => x.Id != id && x.Email == email)
                        .Select(x => new { x.Id, Name = x.FirstName + " " + x.LastName })
                        .FirstOrDefaultAsync(ct);
                    if (other is not null)
                        return Results.Conflict(
                            new { message = "Another candidate has this email.", candidate = other }
                        );

                    if (candidate.Email != email)
                        candidate.EmailBounced = false;
                    candidate.FirstName = request.FirstName.Trim();
                    candidate.LastName = request.LastName.Trim();
                    candidate.Email = email;
                    candidate.Phone = Clean(request.Phone);
                    candidate.Location = Clean(request.Location);
                    candidate.CurrentTitle = Clean(request.CurrentTitle);
                    candidate.LinkedInUrl = Clean(request.LinkedInUrl);
                    candidate.GitHubUrl = Clean(request.GitHubUrl);
                    candidate.PortfolioUrl = Clean(request.PortfolioUrl);
                    candidate.Source = source!;
                    candidate.ReferrerId = referrerId;
                    if (request.Tags is not null)
                        candidate.Tags = NormalizeTags(request.Tags);
                    candidate.DoNotContact = request.DoNotContact;
                    candidate.DoNotContactReason = request.DoNotContact
                        ? Clean(request.DoNotContactReason)
                        : null;
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPatch(
                "/candidates/{id:guid}/tags",
                async (
                    Guid id,
                    CandidateTagsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    candidate.Tags = NormalizeTags(request.Tags);
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        id,
                        "TagsChanged",
                        new { candidate.Tags }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { candidate.Tags });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Data hygiene: test records, spam and accidental imports. Applications, interviews,
        // scorecards, messages, offers and files go with the person.
        api.MapDelete(
                "/candidates/{id:guid}",
                async (
                    Guid id,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var stored = await DeleteCandidatesAsync(db, principal, [id], ct);
                    if (stored is null)
                        return Results.NotFound();
                    foreach (var name in stored)
                        files.Delete(name);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.Admin);

        api.MapGet(
                "/candidates/{id:guid}/duplicates",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var candidate = await db
                        .Candidates.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();

                    var email = candidate.Email.Trim().ToLowerInvariant();
                    var phone = NormalizePhone(candidate.Phone);
                    var linkedIn = NormalizeLink(candidate.LinkedInUrl);
                    var firstName = candidate.FirstName.Trim().ToLowerInvariant();
                    var lastName = candidate.LastName.Trim().ToLowerInvariant();
                    var possible = await db
                        .Candidates.AsNoTracking()
                        .Where(x =>
                            x.Id != id
                            && (
                                x.Email == email
                                || (phone != null && x.PhoneDigits == phone)
                                || (linkedIn != null && x.LinkedInUrl == candidate.LinkedInUrl)
                                || (
                                    x.FirstName.ToLower() == firstName
                                    && x.LastName.ToLower() == lastName
                                )
                            )
                        )
                        .Select(x => new
                        {
                            x.Id,
                            x.FirstName,
                            x.LastName,
                            x.Email,
                            x.Phone,
                            x.LinkedInUrl,
                            x.CurrentTitle,
                        })
                        .Take(25)
                        .ToListAsync(ct);

                    var matches = possible
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                            x.CurrentTitle,
                            Reasons = new[]
                            {
                                x.Email.Trim().Equals(email, StringComparison.OrdinalIgnoreCase)
                                    ? "Same email"
                                    : null,
                                phone != null && NormalizePhone(x.Phone) == phone
                                    ? "Same phone"
                                    : null,
                                linkedIn != null && NormalizeLink(x.LinkedInUrl) == linkedIn
                                    ? "Same LinkedIn URL"
                                    : null,
                                x.FirstName.Trim()
                                    .Equals(
                                        candidate.FirstName.Trim(),
                                        StringComparison.OrdinalIgnoreCase
                                    )
                                && x.LastName.Trim()
                                    .Equals(
                                        candidate.LastName.Trim(),
                                        StringComparison.OrdinalIgnoreCase
                                    )
                                    ? "Same name"
                                    : null,
                            }
                                .Where(reason => reason is not null)
                                .ToArray(),
                        })
                        .Where(x => x.Reasons.Length > 0);
                    return Results.Ok(matches);
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        MapCandidateAttachments(api);
        MapCandidateBulk(api);
        MapCandidateImport(api);
        MapCandidateNotes(api);
        MapCandidateActivity(api);
        MapTalentPools(api);
        MapSavedViews(api);
        MapCandidateCompare(api);
        MapCustomFields(api);
        MapSources(api);
    }

    /// <summary>
    /// The managed name for a source (the form offers the list; a name it lacks joins it,
    /// for an admin to merge), and a referrer only on referral sources: an active teammate.
    /// </summary>
    private static async Task<(string? Source, Guid? ReferrerId)> CheckSourceAsync(
        AtsDbContext db,
        string? value,
        Guid? referrerId,
        Dictionary<string, string[]> errors,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(value))
            return (null, null);
        var list = await SourceList.LoadAsync(db, ct);
        var name = list.Resolve(value);
        if (referrerId is null || list.Find(name)!.Category != SourceCategory.Referral)
            return (name, null);
        if (!await db.Users.AnyAsync(x => x.Id == referrerId && x.IsActive, ct))
            errors["referrerId"] = ["Choose someone in your workspace."];
        return (name, referrerId);
    }

    private static bool CanSeeContact(ClaimsPrincipal principal) =>
        principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));

    private static bool IsWebLink(string value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";

    private static string[] NormalizeTags(IEnumerable<string>? values) =>
        values
            ?.Select(x => x.Trim().ToLowerInvariant())
            .Where(x => x.Length is > 0 and <= 60)
            .Distinct()
            .Take(40)
            .ToArray()
        ?? [];

    private static Dictionary<string, string> CustomFieldValues(string json)
    {
        try
        {
            using var document = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "{}" : json);
            return document.RootElement.ValueKind != JsonValueKind.Object
                ? []
                : document
                    .RootElement.EnumerateObject()
                    .ToDictionary(
                        x => x.Name,
                        // Pick-many values read "Sales; Support".
                        x =>
                            x.Value.ValueKind == JsonValueKind.Array
                                ? string.Join(
                                    "; ",
                                    x.Value.EnumerateArray().Select(v => v.ToString())
                                )
                                : x.Value.ToString()
                    );
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>
    /// Deletes people and everything that hangs off them, records it in activity history, and returns
    /// the stored file names to remove once the transaction commits (null when nobody was found).
    /// </summary>
    private static async Task<List<string>?> DeleteCandidatesAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid[] ids,
        CancellationToken ct
    )
    {
        var people = await db
            .Candidates.Where(x => ids.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.Email,
                Applications = x.Applications.Count,
                Files = x.Attachments.Count,
            })
            .ToListAsync(ct);
        if (people.Count == 0)
            return null;
        var found = people.Select(x => x.Id).ToArray();
        var stored = await db
            .Attachments.Where(x => found.Contains(x.CandidateId))
            .Select(x => x.StoredFileName)
            .ToListAsync(ct);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Rows that point at a person by id only, with no foreign key.
        await db.JobFits.Where(x => found.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db
            .CandidateDismissals.Where(x => found.Contains(x.CandidateId))
            .ExecuteDeleteAsync(ct);
        var attachmentIds = db
            .Attachments.Where(x => found.Contains(x.CandidateId))
            .Select(x => x.Id);
        await db
            .ResumeParseJobs.Where(x => attachmentIds.Contains(x.AttachmentId))
            .ExecuteDeleteAsync(ct);
        await db.Candidates.Where(x => found.Contains(x.Id)).ExecuteDeleteAsync(ct);
        foreach (var person in people)
            Audit.Add(
                db,
                principal,
                "Candidate",
                person.Id,
                "Deleted",
                new
                {
                    person.Email,
                    person.Applications,
                    person.Files,
                }
            );
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return stored;
    }

    private static string[] NormalizeTerms(string[]? values, int max) =>
        values
            ?.Select(value => value.Trim())
            .Where(value => value.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(max)
            .ToArray()
        ?? [];

    private static string[] NormalizeSkills(string[]? values) =>
        values
            ?.Select(value => value.Trim().ToLowerInvariant())
            .Where(value => value.Length > 0)
            .Distinct()
            .Take(40)
            .ToArray()
        ?? [];

    private static string? NormalizePhone(string? value)
    {
        var digits = new string((value ?? string.Empty).Where(char.IsDigit).ToArray());
        return digits.Length >= 7 ? digits : null;
    }

    private static string? NormalizeLink(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim().TrimEnd('/').ToLowerInvariant();
}
