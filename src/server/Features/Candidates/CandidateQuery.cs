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
        if (skills.Length > 0)
        {
            if (allSkills)
                foreach (var skill in skills)
                    candidates = candidates.Where(candidate =>
                        candidate.ResumeSkills.Contains(skill)
                    );
            else
                candidates = candidates.Where(candidate =>
                    candidate.ResumeSkills.Any(value => skills.Contains(value))
                );
        }
        if (tags.Length > 0)
            candidates = candidates.Where(candidate =>
                candidate.Tags.Any(value => tags.Contains(value))
            );

        candidates = ApplyCustomFieldFilters(candidates, query["cf"]);

        var search = CandidateSearch.Parse(query["search"]);
        candidates = ApplySearch(candidates, search);
        return (candidates, scopedApplications, search);
    }

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
