using System.Globalization;
using System.Linq.Expressions;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using NpgsqlTypes;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// A search box query split into what it asks for: plain words (each must match somewhere), quoted
/// phrases, and a phone number. <see cref="RankQuery"/> is the same query in Postgres web-search
/// syntax with every part OR'ed, for ranking and highlighting.
/// </summary>
public sealed record CandidateSearch(
    string[] Words,
    string[] Phrases,
    string? Phone,
    string? RankQuery
)
{
    public bool IsEmpty => Words.Length == 0 && Phrases.Length == 0 && Phone is null;

    public static CandidateSearch Parse(string? text)
    {
        text = (text ?? "").Trim();
        if (text.Length == 0)
            return new([], [], null, null);
        // "+1 (555) 010-0100": only phone characters and at least seven digits.
        var digits = new string(text.Where(char.IsDigit).ToArray());
        if (digits.Length >= 7 && text.All(c => char.IsDigit(c) || " +-().".Contains(c)))
            return new([], [], digits[^Math.Min(10, digits.Length)..], null);

        var phrases = Regex
            .Matches(text, "\"([^\"]+)\"")
            .Select(match => match.Groups[1].Value.Trim())
            .Where(value => value.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(4)
            .ToArray();
        var words = Regex
            .Replace(text, "\"[^\"]*\"?", " ")
            .Split(
                [' ', ',', ';'],
                StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries
            )
            .Where(term => term.Length >= 2)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToArray();
        var rank = string.Join(
            " or ",
            words
                .Select(word => word.Replace("\"", ""))
                .Concat(phrases.Select(phrase => $"\"{phrase}\""))
        );
        return new(words, phrases, null, rank.Length == 0 ? null : rank);
    }
}

public static partial class AtsEndpoints
{
    // ts_headline marks around matched words; the web app turns them into <mark>.
    internal const string SnippetOptions =
        "StartSel=⟦, StopSel=⟧, MaxWords=22, MinWords=10, MaxFragments=1, FragmentDelimiter=\" … \"";

    /// <summary>
    /// The people the current user can see who match the list filters in <paramref name="query"/>:
    /// search, skills, tags, title, location, source, experience, resume, talent pool, and their applications (job,
    /// stage, status, rating), which must all hold on one application. Shared by the list, export,
    /// counts and bulk actions on "everyone matching".
    /// </summary>
    private static (
        IQueryable<Candidate> People,
        IQueryable<Application> Scoped,
        CandidateSearch Search
    ) FilterCandidates(IQueryCollection query, ClaimsPrincipal principal, AtsDbContext db)
    {
        var skills = ListParam(query, "skills");
        var tags = ListParam(query, "tags");
        var allSkills = query["skillMode"].ToString() == "all";
        var title = query["title"].ToString().Trim();
        var location = query["location"].ToString().Trim();
        var source = query["source"].ToString().Trim();
        var hasResume = bool.TryParse(query["hasResume"], out var resumeValue)
            ? resumeValue
            : (bool?)null;
        var hasApplications = bool.TryParse(query["hasApplications"], out var applicationsValue)
            ? applicationsValue
            : (bool?)null;
        var seniority =
            Enum.TryParse<Seniority>(query["seniority"], true, out var seniorityValue)
            && seniorityValue != Seniority.Unknown
                ? seniorityValue
                : (Seniority?)null;
        var minDegree =
            Enum.TryParse<DegreeLevel>(query["minDegree"], true, out var degreeValue)
            && degreeValue != DegreeLevel.Unknown
                ? degreeValue
                : (DegreeLevel?)null;
        var company = query["company"].ToString().Trim();
        var school = query["school"].ToString().Trim();
        var includeDnc = bool.TryParse(query["includeDnc"], out var dncValue) && dncValue;
        var minYears = decimal.TryParse(
            query["minYears"],
            NumberStyles.Number,
            CultureInfo.InvariantCulture,
            out var years
        )
            ? years
            : (decimal?)null;
        var requisitionId = Guid.TryParse(query["requisitionId"], out var jobValue)
            ? jobValue
            : (Guid?)null;
        var stageId = Guid.TryParse(query["stageId"], out var stageValue)
            ? stageValue
            : (Guid?)null;
        var status = Enum.TryParse<ApplicationStatus>(query["status"], true, out var statusValue)
            ? statusValue
            : (ApplicationStatus?)null;
        var minRating = int.TryParse(query["minRating"], out var ratingValue)
            ? ratingValue
            : (int?)null;
        var poolId = Guid.TryParse(query["poolId"], out var poolValue) ? poolValue : (Guid?)null;
        var stageType = Enum.TryParse<StageType>(query["stageType"], true, out var typeValue)
            ? typeValue
            : (StageType?)null;
        var openJobs = bool.TryParse(query["openJobs"], out var openValue) && openValue;
        // Answers on the application form: one question, any of these values, or flagged answers.
        var questionId = Guid.TryParse(query["questionId"], out var questionValue)
            ? questionValue
            : (Guid?)null;
        var answers = query["answer"]
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim())
            .Distinct()
            .Take(20)
            .ToArray();
        var flagged = bool.TryParse(query["flagged"], out var flaggedValue) && flaggedValue;

        // More about the person: where they live, what the resume says, what to leave out.
        var city = query["city"].ToString().Trim();
        var region = query["region"].ToString().Trim();
        var country = query["country"].ToString().Trim();
        var openToRemote = bool.TryParse(query["openToRemote"], out var remoteValue) && remoteValue;
        var willingToRelocate =
            bool.TryParse(query["willingToRelocate"], out var relocateValue) && relocateValue;
        var excludeSkills = ListParam(query, "excludeSkills");
        var excludeTags = ListParam(query, "excludeTags");
        var certification = query["certification"].ToString().Trim();
        var language = query["language"].ToString().Trim();
        var languageLevel =
            Enum.TryParse<LanguageProficiency>(query["languageLevel"], true, out var levelValue)
            && levelValue != LanguageProficiency.Unknown
                ? levelValue
                : (LanguageProficiency?)null;
        var field =
            Enum.TryParse<FieldOfStudy>(query["field"], true, out var fieldValue)
            && fieldValue != FieldOfStudy.Unknown
                ? fieldValue
                : (FieldOfStudy?)null;
        var employmentType =
            Enum.TryParse<EmploymentType>(query["employmentType"], true, out var employmentValue)
            && employmentValue != EmploymentType.Unknown
                ? employmentValue
                : (EmploymentType?)null;
        var minManagementYears = Decimal(query["minManagementYears"]);
        var minSkillYears = Decimal(query["minSkillYears"]);
        var addedFrom = Day(query["addedFrom"]);
        var addedTo = Day(query["addedTo"])?.AddDays(1);

        // More about their applications. Like the rest, these must all hold on one application.
        var appliedFrom = Day(query["appliedFrom"]);
        var appliedTo = Day(query["appliedTo"])?.AddDays(1);
        var activityFrom = Day(query["activityFrom"]);
        var activityTo = Day(query["activityTo"])?.AddDays(1);
        var idleDays = int.TryParse(query["idleDays"], out var idleValue)
            ? Math.Clamp(idleValue, 1, 365)
            : (int?)null;
        var minFit = int.TryParse(query["minFit"], out var fitValue)
            ? Math.Clamp(fitValue, 0, 100)
            : (int?)null;
        var assignee = query["assignee"].ToString().Trim().ToLowerInvariant();
        var reason = query["reason"].ToString().Trim();
        var applicationSource = query["applicationSource"].ToString().Trim();
        var unread = bool.TryParse(query["unread"], out var unreadValue) && unreadValue;
        var feedbackOwed =
            bool.TryParse(query["feedbackOwed"], out var owedValue) && owedValue;

        var scopedApplications = ScopeApplications(db.Applications.AsNoTracking(), principal);
        var canSeeEveryone = principal.IsHiringStaff();
        var candidates = db
            .Candidates.AsNoTracking()
            .Where(candidate =>
                canSeeEveryone
                || scopedApplications.Select(x => x.CandidateId).Contains(candidate.Id)
            );

        if (
            requisitionId is not null
            || stageId is not null
            || status is not null
            || minRating is not null
            || stageType is not null
            || openJobs
            || questionId is not null
            || flagged
            || appliedFrom is not null
            || appliedTo is not null
            || activityFrom is not null
            || activityTo is not null
            || idleDays is not null
            || minFit is not null
            || assignee.Length > 0
            || reason.Length > 0
            || applicationSource.Length > 0
            || unread
            || feedbackOwed
        )
        {
            var matching = scopedApplications;
            if (stageType is not null)
                matching = matching.Where(x => x.PipelineStage!.Type == stageType);
            if (openJobs)
                matching = matching.Where(x => x.Requisition!.Status == RequisitionStatus.Open);
            if (questionId is not null || flagged)
                matching = matching.Where(x =>
                    db.ApplicationAnswers.Any(answer =>
                        answer.ApplicationId == x.Id
                        && (questionId == null || answer.QuestionId == questionId)
                        && (!flagged || answer.Flagged)
                        && (answers.Length == 0 || answer.Values.Any(v => answers.Contains(v)))
                    )
                );
            if (requisitionId is not null)
                matching = matching.Where(x => x.RequisitionId == requisitionId);
            if (stageId is not null)
                matching = matching.Where(x => x.PipelineStageId == stageId);
            if (status is not null)
                matching = matching.Where(x => x.Status == status);
            if (minRating is not null)
                matching = matching.Where(x => x.Rating >= minRating);
            if (appliedFrom is not null)
                matching = matching.Where(x => x.AppliedAt >= appliedFrom);
            if (appliedTo is not null)
                matching = matching.Where(x => x.AppliedAt < appliedTo);
            if (activityFrom is not null)
                matching = matching.Where(x => x.LastActivityAt >= activityFrom);
            if (activityTo is not null)
                matching = matching.Where(x => x.LastActivityAt < activityTo);
            // "No movement for a while": still in play, and untouched for this many days.
            if (idleDays is { } days)
            {
                var idleBefore = DateTimeOffset.UtcNow.AddDays(-days);
                matching = matching.Where(x =>
                    x.Status == ApplicationStatus.Active
                    && !x.PipelineStage!.IsTerminal
                    && x.LastActivityAt < idleBefore
                );
            }
            if (minFit is not null)
                matching = matching.Where(x =>
                    db.JobFits.Any(f =>
                        f.RequisitionId == x.RequisitionId
                        && f.CandidateId == x.CandidateId
                        && f.Score >= minFit
                    )
                );
            if (assignee.Length > 0)
                matching = matching.Where(x =>
                    x.AssigneeEmail != null && x.AssigneeEmail.ToLower() == assignee
                );
            if (reason.Length > 0)
                matching = matching.Where(x => x.DispositionReason == reason);
            if (applicationSource.Length > 0)
                matching = matching.Where(x => x.Source == applicationSource);
            if (unread)
                matching = matching.Where(x =>
                    x.Messages.Any(m => m.FromCandidate && m.ReadAt == null)
                );
            // Scorecards still missing from interviews that have happened.
            if (feedbackOwed)
            {
                var now = DateTimeOffset.UtcNow;
                matching = matching.Where(x =>
                    x.Interviews.Any(i =>
                        (
                            i.Status == InterviewStatus.Completed
                            || (i.Status == InterviewStatus.Scheduled && i.EndsAt < now)
                        )
                        && i.InterviewerEmails.Length > i.Scorecards.Count
                    )
                );
            }
            var matchingIds = matching.Select(x => x.CandidateId);
            candidates = candidates.Where(candidate => matchingIds.Contains(candidate.Id));
        }
        // "Not in a job": nobody has added them to any job yet, whoever can see it.
        if (hasApplications is not null)
            candidates = hasApplications.Value
                ? candidates.Where(candidate => candidate.Applications.Any())
                : candidates.Where(candidate => !candidate.Applications.Any());
        if (poolId is not null)
            candidates = candidates.Where(candidate =>
                db.TalentPoolMembers.Any(member =>
                    member.PoolId == poolId && member.CandidateId == candidate.Id
                )
            );
        if (!includeDnc)
            candidates = candidates.Where(candidate => !candidate.DoNotContact);
        if (location.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Location != null
                && EF.Functions.ILike(candidate.Location, $"%{location}%")
            );
        if (city.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.City != null && EF.Functions.ILike(candidate.City, $"%{city}%")
            );
        if (region.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Region != null && EF.Functions.ILike(candidate.Region, $"%{region}%")
            );
        // Older records have only the free-text location, so a country matches there too.
        if (country.Length > 0)
            candidates = candidates.Where(candidate =>
                (candidate.Country != null && EF.Functions.ILike(candidate.Country, $"%{country}%"))
                || (
                    candidate.Location != null
                    && EF.Functions.ILike(candidate.Location, $"%{country}%")
                )
            );
        if (openToRemote)
            candidates = candidates.Where(candidate => candidate.OpenToRemote == true);
        if (willingToRelocate)
            candidates = candidates.Where(candidate => candidate.WillingToRelocate == true);
        if (certification.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Certifications.Any(entry =>
                    EF.Functions.ILike(entry.Name, $"%{certification}%")
                    || (entry.Issuer != null && EF.Functions.ILike(entry.Issuer, $"%{certification}%"))
                )
            );
        if (language.Length > 0 || languageLevel is not null)
        {
            // Proficiency is declared in order, so "Fluent" means Fluent or Native.
            var levels = Enum.GetValues<LanguageProficiency>()
                .Where(level => languageLevel is null || level >= languageLevel)
                .ToArray();
            candidates = candidates.Where(candidate =>
                candidate.Languages.Any(entry =>
                    (language.Length == 0 || EF.Functions.ILike(entry.Language, $"%{language}%"))
                    && levels.Contains(entry.Proficiency)
                )
            );
        }
        if (field is not null)
            candidates = candidates.Where(candidate =>
                candidate.Educations.Any(entry => entry.FieldNormalized == field)
            );
        if (employmentType is not null)
            candidates = candidates.Where(candidate =>
                candidate.WorkExperiences.Any(role => role.EmploymentType == employmentType)
            );
        if (minManagementYears is not null)
            candidates = candidates.Where(candidate =>
                candidate.YearsManagement >= minManagementYears
            );
        if (addedFrom is not null)
            candidates = candidates.Where(candidate => candidate.CreatedAt >= addedFrom);
        if (addedTo is not null)
            candidates = candidates.Where(candidate => candidate.CreatedAt < addedTo);
        if (title.Length > 0)
            candidates = candidates.Where(candidate =>
                (
                    candidate.CurrentTitle != null
                    && EF.Functions.ILike(candidate.CurrentTitle, $"%{title}%")
                )
                || candidate.WorkExperiences.Any(role =>
                    EF.Functions.ILike(role.Title, $"%{title}%")
                )
            );
        if (company.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.WorkExperiences.Any(role =>
                    EF.Functions.ILike(role.CompanyNameRaw, $"%{company}%")
                )
            );
        if (school.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Educations.Any(entry =>
                    EF.Functions.ILike(entry.SchoolNameRaw, $"%{school}%")
                )
            );
        // "Senior and up", "at least a bachelor's": the enums are stored as strings, so compare against the set.
        if (seniority is not null)
        {
            var levels = Enum.GetValues<Seniority>().Where(level => level >= seniority).ToArray();
            candidates = candidates.Where(candidate => levels.Contains(candidate.Seniority));
        }
        if (minDegree is not null)
        {
            var floor = ResumeDerived.DegreeRank(minDegree.Value);
            var levels = Enum.GetValues<DegreeLevel>()
                .Where(level => ResumeDerived.DegreeRank(level) >= floor)
                .ToArray();
            candidates = candidates.Where(candidate =>
                levels.Contains(candidate.HighestDegreeLevel)
            );
        }
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
        // Skills come from the resume only; tags are a recruiter's labels and filter on their own.
        // A skill matches by its name or any alias ("reactjs" finds "react"), and can need years of use.
        if (skills.Length > 0)
        {
            if (allSkills)
                foreach (var skill in skills)
                    candidates = candidates.Where(HasAnySkill([skill], minSkillYears));
            else
                candidates = candidates.Where(HasAnySkill(skills, minSkillYears));
        }
        if (excludeSkills.Length > 0)
            candidates = candidates.Where(Negate(HasAnySkill(excludeSkills, null)));
        if (tags.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Tags.Any(value => tags.Contains(value))
            );
        if (excludeTags.Length > 0)
            candidates = candidates.Where(candidate =>
                !candidate.Tags.Any(value => excludeTags.Contains(value))
            );

        candidates = ApplyCustomFieldFilters(candidates, query["cf"]);

        var search = CandidateSearch.Parse(query["search"]);
        candidates = ApplySearch(candidates, search);
        return (candidates, scopedApplications, search);
    }

    /// <summary>Has any of these skills, by the resume's list or by a shared skill's name or alias; with years, only the shared skills count.</summary>
    private static Expression<Func<Candidate, bool>> HasAnySkill(string[] terms, decimal? years)
    {
        if (years is { } least)
            return candidate =>
                candidate.Skills.Any(entry =>
                    (
                        terms.Contains(entry.Skill!.NormalizedName)
                        || entry.Skill.Aliases.Any(alias => terms.Contains(alias))
                    )
                    && entry.YearsUsed >= least
                );
        return candidate =>
            candidate.ResumeSkills.Any(value => terms.Contains(value))
            || candidate.Skills.Any(entry =>
                terms.Contains(entry.Skill!.NormalizedName)
                || entry.Skill.Aliases.Any(alias => terms.Contains(alias))
            );
    }

    private static Expression<Func<Candidate, bool>> Negate(Expression<Func<Candidate, bool>> test) =>
        Expression.Lambda<Func<Candidate, bool>>(Expression.Not(test.Body), test.Parameters);

    private static decimal? Decimal(string? text) =>
        decimal.TryParse(text, NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            ? value
            : null;

    /// <summary>A date as "2026-11-19", from the start of that day (UTC).</summary>
    private static DateTimeOffset? Day(string? text) =>
        DateTimeOffset.TryParse(
            text,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
            out var value
        )
            ? new DateTimeOffset(value.UtcDateTime.Date, TimeSpan.Zero)
            : null;

    private static readonly Expression<Func<Candidate, string, bool>> HasCustomValue = (c, json) =>
        EF.Functions.JsonContains(
            EF.Property<string>(c, CandidateSearchConfiguration.CustomFields),
            json
        );

    /// <summary>
    /// Pick-one and pick-many custom fields, as <c>cf=key=value</c> pairs: any of a field's values,
    /// and every field given. A pick-one value is stored as a string, a pick-many value as an array.
    /// </summary>
    private static IQueryable<Candidate> ApplyCustomFieldFilters(
        IQueryable<Candidate> candidates,
        StringValues pairs
    )
    {
        var fields = pairs
            .Select(pair => pair?.Split('=', 2))
            .Where(pair => pair is { Length: 2 } && pair[0].Length > 0 && pair[1].Length > 0)
            .GroupBy(pair => pair![0], pair => pair![1])
            .Take(10);
        foreach (var field in fields)
        {
            var c = Expression.Parameter(typeof(Candidate), "c");
            Expression? any = null;
            foreach (var value in field.Distinct().Take(20))
            foreach (var shape in new object[] { value, new[] { value } })
            {
                var json = JsonSerializer.Serialize(
                    new Dictionary<string, object> { [field.Key] = shape }
                );
                var hit = new Swap(
                    HasCustomValue.Parameters[0],
                    c,
                    HasCustomValue.Parameters[1],
                    Expression.Constant(json)
                ).Visit(HasCustomValue.Body)!;
                any = any is null ? hit : Expression.OrElse(any, hit);
            }
            if (any is not null)
                candidates = candidates.Where(Expression.Lambda<Func<Candidate, bool>>(any, c));
        }
        return candidates;
    }

    /// <summary>Every word must match a field (name with typos, email, phone, title, location, tags, skills or resume).</summary>
    private static IQueryable<Candidate> ApplySearch(
        IQueryable<Candidate> candidates,
        CandidateSearch search
    )
    {
        if (search.Phone is { } phone)
            return candidates.Where(candidate =>
                candidate.PhoneDigits != null && candidate.PhoneDigits.Contains(phone)
            );
        foreach (var word in search.Words)
        {
            var pattern = $"%{word}%";
            var digits = new string(word.Where(char.IsDigit).ToArray());
            var fuzzy = word.Length >= 4;
            candidates = candidates.Where(candidate =>
                EF.Property<NpgsqlTsVector>(candidate, CandidateSearchConfiguration.SearchVector)
                    .Matches(EF.Functions.PlainToTsQuery("simple", word))
                || EF.Functions.ILike(candidate.FirstName, pattern)
                || EF.Functions.ILike(candidate.LastName, pattern)
                || EF.Functions.ILike(candidate.Email, pattern)
                || (fuzzy && EF.Functions.TrigramsAreSimilar(candidate.FirstName, word))
                || (fuzzy && EF.Functions.TrigramsAreSimilar(candidate.LastName, word))
                || (
                    digits.Length >= 3
                    && candidate.PhoneDigits != null
                    && candidate.PhoneDigits.Contains(digits)
                )
                || (
                    candidate.CurrentTitle != null
                    && EF.Functions.ILike(candidate.CurrentTitle, pattern)
                )
                || (candidate.Location != null && EF.Functions.ILike(candidate.Location, pattern))
                || candidate.Tags.Any(value => EF.Functions.ILike(value, pattern))
                || candidate.ResumeSkills.Any(value => EF.Functions.ILike(value, pattern))
            );
        }
        foreach (var phrase in search.Phrases)
        {
            var pattern = $"%{phrase}%";
            candidates = candidates.Where(candidate =>
                EF.Property<NpgsqlTsVector>(candidate, CandidateSearchConfiguration.SearchVector)
                    .Matches(EF.Functions.PhraseToTsQuery("simple", phrase))
                || EF.Functions.ILike(candidate.FirstName + " " + candidate.LastName, pattern)
                || (
                    candidate.CurrentTitle != null
                    && EF.Functions.ILike(candidate.CurrentTitle, pattern)
                )
            );
        }
        return candidates;
    }

    /// <summary>Best match first: names that look like the query, then hits weighted name, title, resume.</summary>
    private static IOrderedQueryable<Candidate> OrderBySearch(
        IQueryable<Candidate> candidates,
        CandidateSearch search
    )
    {
        if (search.RankQuery is not { } rank)
            return candidates.OrderBy(x => 0);
        var name = string.Join(' ', search.Words.Concat(search.Phrases));
        return candidates.OrderByDescending(x =>
            EF.Functions.TrigramsSimilarity(x.FirstName + " " + x.LastName, name)
            + EF.Property<NpgsqlTsVector>(x, CandidateSearchConfiguration.SearchVector)
                .Rank(EF.Functions.WebSearchToTsQuery("simple", rank))
        );
    }

    private static string[] ListParam(IQueryCollection query, string key) =>
        query[key]
            .ToString()
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(value => value.ToLowerInvariant())
            .Distinct()
            .ToArray();

    /// <summary>A resume snippet with the matched words between ⟦ and ⟧, when the match came from the resume.</summary>
    private static string? Snippet(string? headline) =>
        headline is not null && headline.Contains('⟦')
            ? headline.ReplaceLineEndings(" ").Trim()
            : null;
}
