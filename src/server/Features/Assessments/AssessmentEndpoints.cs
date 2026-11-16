using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>The whole editable assessment. A PUT replaces every field; RemindAfterDays null turns reminders off.</summary>
public sealed record AssessmentSaveRequest(
    string? Name,
    string? Department,
    AssessmentKind? Kind,
    int? ExpiryDays,
    int? RemindAfterDays,
    bool? BlindReview,
    string? ProviderName,
    string? ExternalUrl,
    AssessmentContent? Content
);

public static partial class AtsEndpoints
{
    /// <summary>Registered from Program.cs. Admins, recruiters and hiring managers; interviewers never see tests.</summary>
    public static RouteGroupBuilder MapAssessments(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("").RequireAuthorization(AtsPolicies.ManageHiring);
        MapAssessmentLibrary(group);
        MapAssessmentInvites(group);
        return api;
    }

    private static IResult AssessmentProblem(string field, string message) =>
        Results.ValidationProblem(new Dictionary<string, string[]> { [field] = [message] });

    /// <summary>Invites on applications this person can see.</summary>
    private static IQueryable<AssessmentInvite> ScopedInvites(
        AtsDbContext db,
        ClaimsPrincipal principal
    )
    {
        var applications = ScopeApplications(db.Applications, principal).Select(x => x.Id);
        return db.AssessmentInvites.Where(x => applications.Contains(x.ApplicationId));
    }

    private static void MapAssessmentLibrary(RouteGroupBuilder api)
    {
        // Departments come from the jobs, so the library filters line up with them.
        api.MapGet(
            "/assessments/options",
            async (AtsDbContext db, CancellationToken ct) =>
            {
                var fromJobs = await db
                    .Requisitions.AsNoTracking()
                    .Select(x => x.Department)
                    .Distinct()
                    .ToListAsync(ct);
                var fromTests = await db
                    .Assessments.AsNoTracking()
                    .Where(x => x.Department != null)
                    .Select(x => x.Department!)
                    .Distinct()
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        departments = fromJobs
                            .Concat(fromTests)
                            .Where(x => !string.IsNullOrWhiteSpace(x))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .Order()
                            .ToArray(),
                    }
                );
            }
        );

        api.MapGet(
            "/assessments",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var assessments = await db
                    .Assessments.AsNoTracking()
                    .OrderByDescending(x => x.UpdatedAt)
                    .ToListAsync(ct);
                var versionIds = assessments
                    .Where(x => x.CurrentVersionId != null)
                    .Select(x => x.CurrentVersionId!.Value)
                    .ToArray();
                var versions = await db
                    .AssessmentVersions.AsNoTracking()
                    .Where(x => versionIds.Contains(x.Id))
                    .ToDictionaryAsync(x => x.Id, ct);
                var stats = await ScopedInvites(db, principal)
                    .Where(x => x.Status != AssessmentInviteStatus.Revoked && x.ReplacedAt == null)
                    .GroupBy(x => x.AssessmentId)
                    .Select(g => new
                    {
                        g.Key,
                        Invited = g.Count(),
                        Completed = g.Count(x => x.Status == AssessmentInviteStatus.Submitted),
                        ToReview = g.Count(x =>
                            x.Status == AssessmentInviteStatus.Submitted && x.Decision == null
                        ),
                        Decided = g.Count(x => x.Decision != null),
                        Passed = g.Count(x => x.Decision == AssessmentDecision.Passed),
                        Open = g.Count(x =>
                            x.Status == AssessmentInviteStatus.NotStarted
                            || x.Status == AssessmentInviteStatus.InProgress
                        ),
                        Last = g.Max(x => x.SubmittedAt ?? x.StartedAt ?? x.InvitedAt),
                    })
                    .ToDictionaryAsync(x => x.Key, ct);
                return Results.Ok(
                    assessments.Select(a =>
                    {
                        var content = AssessmentScoring.Read(
                            a.CurrentVersionId is { } v && versions.TryGetValue(v, out var version)
                                ? version.ContentJson
                                : a.ContentJson
                        );
                        var questions = AssessmentScoring.Questions(content).ToList();
                        stats.TryGetValue(a.Id, out var s);
                        return new
                        {
                            a.Id,
                            a.Name,
                            a.Department,
                            a.Kind,
                            a.Status,
                            a.ProviderName,
                            a.ExpiryDays,
                            Questions = questions.Count,
                            Points = questions.Sum(x => x.Points),
                            content.Minutes,
                            content.Timed,
                            content.PassMark,
                            Invited = s?.Invited ?? 0,
                            Completed = s?.Completed ?? 0,
                            ToReview = s?.ToReview ?? 0,
                            Open = s?.Open ?? 0,
                            PassRate = s is { Decided: > 0 }
                                ? (int?)Math.Round(100.0 * s.Passed / s.Decided)
                                : null,
                            LastActivityAt = s?.Last ?? a.UpdatedAt,
                            a.UpdatedAt,
                        };
                    })
                );
            }
        );

        api.MapPost(
                "/assessments",
                async (
                    AssessmentSaveRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var assessment = new Assessment { Name = "", CreatedBy = principal.Email() };
                    if (Fill(assessment, request) is { } problem)
                        return problem;
                    db.Assessments.Add(assessment);
                    Audit.Add(
                        db,
                        principal,
                        "Assessment",
                        assessment.Id,
                        "Created",
                        new { assessment.Name }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created(
                        $"/api/assessments/{assessment.Id}",
                        new { assessment.Id }
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
            "/assessments/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var a = await db
                    .Assessments.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (a is null)
                    return Results.NotFound();
                var draft = AssessmentScoring.Read(a.ContentJson);
                var version = a.CurrentVersionId is { } vid
                    ? await db
                        .AssessmentVersions.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == vid, ct)
                    : null;
                var published = version is null
                    ? null
                    : AssessmentScoring.Read(version.ContentJson);
                var now = DateTimeOffset.UtcNow;
                var invites = await ScopedInvites(db, principal)
                    .AsNoTracking()
                    .Where(x =>
                        x.AssessmentId == id
                        && x.Status != AssessmentInviteStatus.Revoked
                        && x.ReplacedAt == null
                    )
                    .Select(x => new
                    {
                        x.Status,
                        x.ExpiresAt,
                        x.Decision,
                        x.VersionId,
                    })
                    .ToListAsync(ct);
                int Count(Func<AssessmentInviteStatus, bool> match) =>
                    invites.Count(x =>
                        match(
                            x.Status == AssessmentInviteStatus.NotStarted && x.ExpiresAt <= now
                                ? AssessmentInviteStatus.Expired
                                : x.Status
                        )
                    );
                var publishedBy = version is null
                    ? null
                    : await db
                        .Users.AsNoTracking()
                        .Where(x => x.Email == version.PublishedBy)
                        .Select(x => x.DisplayName)
                        .SingleOrDefaultAsync(ct);
                return Results.Ok(
                    new
                    {
                        a.Id,
                        a.Name,
                        a.Department,
                        a.Kind,
                        a.Status,
                        a.ExpiryDays,
                        a.RemindAfterDays,
                        a.BlindReview,
                        a.ProviderName,
                        a.ExternalUrl,
                        a.UpdatedAt,
                        Content = draft,
                        Published = published,
                        Version = version is null
                            ? null
                            : new
                            {
                                version.Number,
                                version.PublishedAt,
                                PublishedBy = publishedBy ?? version.PublishedBy,
                            },
                        HasUnpublishedChanges = published is not null
                            && AssessmentScoring.Write(published) != AssessmentScoring.Write(draft),
                        Problems = AssessmentScoring.Problems(a, draft),
                        Counts = new
                        {
                            NotStarted = Count(s => s == AssessmentInviteStatus.NotStarted),
                            InProgress = Count(s => s == AssessmentInviteStatus.InProgress),
                            Submitted = Count(s => s == AssessmentInviteStatus.Submitted),
                            Expired = Count(s => s == AssessmentInviteStatus.Expired),
                            ToReview = invites.Count(x =>
                                x.Status == AssessmentInviteStatus.Submitted && x.Decision == null
                            ),
                            Passed = invites.Count(x => x.Decision == AssessmentDecision.Passed),
                            Failed = invites.Count(x => x.Decision == AssessmentDecision.Failed),
                        },
                        OlderVersionResults = invites.Count(x =>
                            x.Status == AssessmentInviteStatus.Submitted
                            && x.VersionId != a.CurrentVersionId
                        ),
                        CanEdit = principal.IsHiringStaff(),
                    }
                );
            }
        );

        api.MapPut(
                "/assessments/{id:guid}",
                async (
                    Guid id,
                    AssessmentSaveRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var assessment = await db.Assessments.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (assessment is null)
                        return Results.NotFound();
                    if (
                        request.Kind is { } kind
                        && kind != assessment.Kind
                        && assessment.CurrentVersionId is not null
                    )
                        return AssessmentProblem(
                            "kind",
                            "A published assessment keeps its kind. Duplicate it to make the other kind."
                        );
                    if (Fill(assessment, request) is { } problem)
                        return problem;
                    assessment.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Freezes the draft as a new version when it changed; new invites use it, open ones keep theirs.
        api.MapPost(
                "/assessments/{id:guid}/publish",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var assessment = await db.Assessments.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (assessment is null)
                        return Results.NotFound();
                    var draft = AssessmentScoring.Read(assessment.ContentJson);
                    var problems = AssessmentScoring.Problems(assessment, draft);
                    if (problems.Count > 0)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["problems"] = [.. problems] }
                        );
                    var current = assessment.CurrentVersionId is { } vid
                        ? await db
                            .AssessmentVersions.AsNoTracking()
                            .SingleOrDefaultAsync(x => x.Id == vid, ct)
                        : null;
                    var json = AssessmentScoring.Write(draft);
                    var created = false;
                    if (
                        current is null
                        || AssessmentScoring.Write(AssessmentScoring.Read(current.ContentJson))
                            != json
                    )
                    {
                        var number =
                            await db
                                .AssessmentVersions.Where(x => x.AssessmentId == id)
                                .MaxAsync(x => (int?)x.Number, ct)
                            ?? 0;
                        var version = new AssessmentVersion
                        {
                            AssessmentId = id,
                            Number = number + 1,
                            ContentJson = json,
                            PublishedBy = principal.Email(),
                        };
                        db.AssessmentVersions.Add(version);
                        assessment.CurrentVersionId = version.Id;
                        created = true;
                    }
                    assessment.Status = AssessmentStatus.Active;
                    assessment.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Assessment",
                        id,
                        "Published",
                        new { assessment.Name, newVersion = created }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Unpublished changes go back to what candidates get today.
        api.MapPost(
                "/assessments/{id:guid}/revert",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var assessment = await db.Assessments.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (assessment?.CurrentVersionId is not { } vid)
                        return Results.NotFound();
                    assessment.ContentJson = await db
                        .AssessmentVersions.Where(x => x.Id == vid)
                        .Select(x => x.ContentJson)
                        .SingleAsync(ct);
                    assessment.UpdatedAt = DateTimeOffset.UtcNow;
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Open links keep working until they expire; nobody new can be invited.
        api.MapPost(
                "/assessments/{id:guid}/archive",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    SetStatusAsync(db, principal, id, AssessmentStatus.Archived, "Archived", ct)
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/assessments/{id:guid}/restore",
                (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                    SetStatusAsync(db, principal, id, AssessmentStatus.Draft, "Restored", ct)
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // A draft copy with new ids for every section, question and answer.
        api.MapPost(
                "/assessments/{id:guid}/duplicate",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var source = await db
                        .Assessments.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (source is null)
                        return Results.NotFound();
                    var copy = new Assessment
                    {
                        Name = $"{source.Name} (copy)"[..Math.Min(200, source.Name.Length + 7)],
                        Department = source.Department,
                        Kind = source.Kind,
                        Status = AssessmentStatus.Draft,
                        ExpiryDays = source.ExpiryDays,
                        RemindAfterDays = source.RemindAfterDays,
                        BlindReview = source.BlindReview,
                        ProviderName = source.ProviderName,
                        ExternalUrl = source.ExternalUrl,
                        ContentJson = AssessmentScoring.Write(
                            AssessmentScoring.WithNewIds(AssessmentScoring.Read(source.ContentJson))
                        ),
                        CreatedBy = principal.Email(),
                    };
                    db.Assessments.Add(copy);
                    Audit.Add(
                        db,
                        principal,
                        "Assessment",
                        copy.Id,
                        "Duplicated",
                        new { from = id }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/assessments/{copy.Id}", new { copy.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        // Question analysis for the current version: who got each question right, and the score spread.
        api.MapGet(
            "/assessments/{id:guid}/analysis",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var assessment = await db
                    .Assessments.AsNoTracking()
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (assessment?.CurrentVersionId is not { } vid)
                    return Results.Ok(
                        new
                        {
                            versionNumber = (int?)null,
                            percents = Array.Empty<int>(),
                            questions = Array.Empty<object>(),
                        }
                    );
                var version = await db
                    .AssessmentVersions.AsNoTracking()
                    .SingleAsync(x => x.Id == vid, ct);
                var content = AssessmentScoring.Read(version.ContentJson);
                var invites = await ScopedInvites(db, principal)
                    .AsNoTracking()
                    .Where(x =>
                        x.VersionId == vid
                        && x.Status == AssessmentInviteStatus.Submitted
                        && x.ReplacedAt == null
                    )
                    .Select(x => new { x.Id, x.Percent })
                    .ToListAsync(ct);
                var ids = invites.Select(x => x.Id).ToArray();
                var answers = await db
                    .AssessmentAnswers.AsNoTracking()
                    .Where(x => ids.Contains(x.InviteId))
                    .ToListAsync(ct);
                var scored = invites
                    .Where(x => x.Percent != null)
                    .OrderByDescending(x => x.Percent)
                    .ToList();
                var topHalf = scored
                    .Take(Math.Max(1, scored.Count / 2))
                    .Select(x => x.Id)
                    .ToHashSet();
                var number = 0;
                var questions = AssessmentScoring
                    .Questions(content)
                    .Select(q =>
                    {
                        number++;
                        var mine = answers.Where(x => x.QuestionId == q.Id).ToList();
                        var points = mine.Select(x =>
                                AssessmentScoring.IsAuto(q)
                                    ? x.AutoPoints
                                    : x.ReviewerPoints ?? x.AutoPoints
                            )
                            .Where(x => x != null)
                            .Select(x => x!.Value)
                            .ToList();
                        double? Rate(IEnumerable<Guid> who)
                        {
                            var set = who.ToList();
                            if (!AssessmentScoring.IsAuto(q) || set.Count == 0)
                                return null;
                            return Math.Round(
                                100.0
                                    * set.Count(i =>
                                        mine.Any(a => a.InviteId == i && a.AutoPoints == q.Points)
                                    )
                                    / set.Count
                            );
                        }
                        return new
                        {
                            q.Id,
                            Number = number,
                            q.Type,
                            q.Prompt,
                            q.Points,
                            Answered = mine.Count(x => !AssessmentScoring.IsBlank(q, x)),
                            AveragePoints = points.Count > 0
                                ? (decimal?)Math.Round(points.Average(), 1)
                                : null,
                            CorrectRate = Rate(ids),
                            TopHalfRate = scored.Count >= 4 ? Rate(topHalf) : null,
                        };
                    })
                    .ToList();
                return Results.Ok(
                    new
                    {
                        versionNumber = version.Number,
                        content.PassMark,
                        total = invites.Count,
                        percents = scored.Select(x => x.Percent!.Value).ToArray(),
                        questions,
                    }
                );
            }
        );
    }

    private static async Task<IResult> SetStatusAsync(
        AtsDbContext db,
        ClaimsPrincipal principal,
        Guid id,
        AssessmentStatus status,
        string action,
        CancellationToken ct
    )
    {
        var assessment = await db.Assessments.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (assessment is null)
            return Results.NotFound();
        assessment.Status = status;
        assessment.UpdatedAt = DateTimeOffset.UtcNow;
        Audit.Add(db, principal, "Assessment", id, action, new { assessment.Name });
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    /// <summary>Copies a save request onto the assessment, cleaning the content. Returns a problem or null.</summary>
    private static IResult? Fill(Assessment assessment, AssessmentSaveRequest request)
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length > 200)
            return AssessmentProblem("name", "Keep the name under 200 characters.");
        assessment.Name = name.Length == 0 ? "Untitled assessment" : name;
        assessment.Department = Clean(request.Department) is { Length: <= 120 } department
            ? department
            : null;
        if (assessment.CurrentVersionId is null && request.Kind is { } kind)
            assessment.Kind = kind;
        assessment.ExpiryDays = Math.Clamp(request.ExpiryDays ?? 7, 1, 90);
        assessment.RemindAfterDays = request.RemindAfterDays is { } days
            ? Math.Clamp(days, 1, 30)
            : null;
        assessment.BlindReview = request.BlindReview ?? false;
        assessment.ProviderName = Clean(request.ProviderName) is { Length: <= 120 } provider
            ? provider
            : null;
        var url = Clean(request.ExternalUrl);
        if (url is not null && (url.Length > 2000 || !AssessmentScoring.IsWebLink(url)))
            return AssessmentProblem(
                "externalUrl",
                "Enter a web address that starts with https://."
            );
        assessment.ExternalUrl = url;
        var content = request.Content ?? new AssessmentContent();
        if (content.Sections.Count > 50 || AssessmentScoring.Questions(content).Count() > 200)
            return AssessmentProblem(
                "content",
                "An assessment can have up to 50 sections and 200 questions."
            );
        content.Minutes = Math.Clamp(content.Minutes, 0, 600);
        content.PassMark = Math.Clamp(content.PassMark, 0, 100);
        // Answers are keyed by question id, so ids must be unique; a repeat gets a new one.
        var seen = new HashSet<string>();
        string Unique(string? id)
        {
            var safe = SafeId(id);
            return seen.Add(safe) ? safe : Unique(null);
        }
        foreach (var section in content.Sections)
        {
            section.Id = Unique(section.Id);
            section.Title = Trim(section.Title, 200);
            foreach (var q in section.Questions)
            {
                q.Id = Unique(q.Id);
                if (!QuestionTypes.All.Contains(q.Type))
                    q.Type = QuestionTypes.Single;
                q.Points = Math.Clamp(q.Points, 0, 1000);
                q.Prompt = Trim(q.Prompt, 20_000);
                q.Rubric = Trim(q.Rubric, 10_000);
                q.StarterCode = Trim(q.StarterCode, 20_000);
                q.Language = Trim(q.Language, 40);
                q.Accept = Trim(q.Accept, 200);
                if (!AssessmentScoring.IsAuto(q))
                    q.Options = [];
                q.PartialCredit = q.Type == QuestionTypes.Multi && q.PartialCredit;
                if (q.Options.Count > 20)
                    return AssessmentProblem("content", "A question can have up to 20 answers.");
                foreach (var option in q.Options)
                {
                    option.Id = Unique(option.Id);
                    option.Text = Trim(option.Text, 1000);
                }
            }
        }
        content.Instructions = Trim(content.Instructions, 20_000);
        assessment.ContentJson = AssessmentScoring.Write(content);
        return null;
    }

    private static string Trim(string? value, int max) =>
        (value ?? "").Length > max ? value![..max] : value ?? "";

    private static string SafeId(string? id) =>
        id is { Length: > 0 and <= 64 } && id.All(c => char.IsLetterOrDigit(c) || c is '-' or '_')
            ? id
            : Guid.NewGuid().ToString("N");
}
