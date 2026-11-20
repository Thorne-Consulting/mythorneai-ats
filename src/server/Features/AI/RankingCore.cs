using System.Linq.Expressions;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using NpgsqlTypes;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>A requirement or search word to look for, worth 2 when it is a must-have and 1 when it is nice to have.</summary>
public sealed record RankTerm(string Text, int Weight);

/// <summary>What the database sends back per person: no resume text, just what scoring needs.</summary>
public sealed class RankRow
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public float[]? Embedding { get; set; }

    /// <summary>Bit i is set when term i is on the resume.</summary>
    public long Mask { get; set; }
    public bool Pending { get; set; }
}

/// <summary>One person's match for a job: the number, and what it is made of.</summary>
public sealed record RankScore(
    Guid Id,
    string Name,
    int Score,
    int? KeywordScore,
    int? SemanticScore,
    string[] Matched,
    string[] Missing,
    bool HasEmbedding
);

public sealed record RankResult(List<RankScore> Rows, bool Semantic, string? Note, int Pending);

public static partial class AtsEndpoints
{
    // ponytail: a bit mask holds the matches, so at most 62 terms count; past that the rest are ignored.
    private const int MaxRankTerms = 62;

    private static readonly HashSet<string> FillerWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "and",
        "the",
        "for",
        "with",
        "that",
        "this",
        "from",
        "into",
        "have",
        "has",
        "experience",
        "experienced",
        "years",
        "year",
        "ability",
        "able",
        "strong",
        "good",
        "knowledge",
        "working",
        "work",
        "proven",
        "track",
        "record",
        "using",
    };

    /// <summary>The words of a requirement that carry meaning: "Built production web apps" → built, production, web, app.</summary>
    internal static string[] MeaningfulWords(string phrase) =>
        Regex
            .Split(phrase.ToLowerInvariant(), @"[^a-z0-9#+.]+")
            .Select(word => word.Trim('.'))
            .Where(word => word.Length >= 2 && !FillerWords.Contains(word))
            .Select(word => word.Length > 4 && word.EndsWith('s') ? word[..^1] : word)
            .Distinct()
            .ToArray();

    internal static List<RankTerm> RankTerms(JobRequirements requirements, string query) =>
        requirements
            .Required.Select(text => new RankTerm(text, 2))
            .Concat(requirements.Preferred.Select(text => new RankTerm(text, 1)))
            .Concat(SearchTerms(query).Select(text => new RankTerm(text, 2)))
            .DistinctBy(term => term.Text.ToLowerInvariant())
            .Take(MaxRankTerms)
            .ToList();

    // A word counts when the resume or title has a word starting with it; words with symbols
    // (c#, node.js) fall back to a plain text match.
    private static readonly Expression<Func<Candidate, string, bool>> WordPrefix = (c, query) =>
        EF.Property<NpgsqlTsVector>(c, CandidateSearchConfiguration.SearchVector)
            .Matches(EF.Functions.ToTsQuery("simple", query));
    private static readonly Expression<Func<Candidate, string, bool>> WordLike = (c, pattern) =>
        (c.ResumeText != null && EF.Functions.ILike(c.ResumeText, pattern))
        || (c.CurrentTitle != null && EF.Functions.ILike(c.CurrentTitle, pattern));
    private static readonly Expression<Func<Candidate, string, bool>> SkillLike = (c, pattern) =>
        c.ResumeSkills.Any(skill => EF.Functions.ILike(skill, pattern));
    private static readonly Expression<Func<Candidate, long, RankRow>> RowTemplate = (c, mask) =>
        new RankRow
        {
            Id = c.Id,
            Name = c.FirstName + " " + c.LastName,
            Embedding = c.ResumeEmbedding,
            Mask = mask,
            Pending = c.ResumeText != null && c.ResumeEmbedding == null,
        };

    // LikePattern (escaped "%word%") lives with the inbox search.

    /// <summary>
    /// The SQL projection that marks which terms each person meets. A term is met when a skill
    /// contains it, or when most of its meaningful words (60 percent) are on the resume or title.
    /// </summary>
    internal static Expression<Func<Candidate, RankRow>> RankSelector(IReadOnlyList<RankTerm> terms)
    {
        var c = Expression.Parameter(typeof(Candidate), "c");
        Expression Use(LambdaExpression template, Expression first, Expression second) =>
            new Swap(template.Parameters[0], first, template.Parameters[1], second).Visit(
                template.Body
            )!;
        Expression mask = Expression.Constant(0L);
        for (var i = 0; i < terms.Count; i++)
        {
            var words = MeaningfulWords(terms[i].Text);
            Expression met = Use(SkillLike, c, Expression.Constant(LikePattern(terms[i].Text)));
            if (words.Length > 0)
            {
                Expression count = Expression.Constant(0);
                foreach (var word in words)
                {
                    var hit = Regex.IsMatch(word, "^[a-z0-9]+$")
                        ? Use(WordPrefix, c, Expression.Constant(word + ":*"))
                        : Use(WordLike, c, Expression.Constant(LikePattern(word)));
                    count = Expression.Add(
                        count,
                        Expression.Condition(hit, Expression.Constant(1), Expression.Constant(0))
                    );
                }
                var needed = (int)Math.Ceiling(words.Length * 0.6);
                met = Expression.OrElse(
                    met,
                    Expression.GreaterThanOrEqual(count, Expression.Constant(needed))
                );
            }
            mask = Expression.Add(
                mask,
                Expression.Condition(met, Expression.Constant(1L << i), Expression.Constant(0L))
            );
        }
        return Expression.Lambda<Func<Candidate, RankRow>>(Use(RowTemplate, c, mask), c);
    }

    /// <summary>
    /// Ranks everyone in <paramref name="pool"/> (already narrowed by the list's filters in SQL) for a
    /// job's confirmed requirements and an optional description. The database marks which terms each
    /// person meets and sends only ids, names and embeddings; the score is 40 percent requirements
    /// met and 60 percent closeness in meaning, best first, ties by name.
    /// </summary>
    /// <remarks>
    /// ponytail: every filtered person's embedding comes back to score in memory, fine into the tens of
    /// thousands; move the nearest-neighbour step into SQL with pgvector once the database has the
    /// vector extension.
    /// </remarks>
    internal static async Task<RankResult> RankAsync(
        AtsDbContext db,
        IAiAssistant ai,
        ClaimsPrincipal principal,
        Requisition? requisition,
        string query,
        IQueryable<Candidate> pool,
        CancellationToken ct
    )
    {
        var requirements = JobRequirements.Parse(requisition?.RequirementsJson);
        var terms = RankTerms(requirements, query);
        var rows = await pool.Select(RankSelector(terms)).ToListAsync(ct);

        float[]? target = null;
        string? note = null;
        if (ai.IsConfigured)
        {
            try
            {
                var vectors = new List<float[]>();
                if (query.Length > 0)
                    vectors.Add(
                        await ai.EmbedAsync(
                            query,
                            ct,
                            new AiContext("embed-query", principal.Email())
                        )
                    );
                if (requisition?.RequirementsEmbedding is not null)
                    vectors.Add(requisition.RequirementsEmbedding);
                if (vectors.Count > 0)
                    target = vectors[0].Select((_, i) => vectors.Average(v => v[i])).ToArray();
            }
            catch (Exception exception)
                when (exception is HttpRequestException or AiUnavailableException)
            {
                note =
                    "Matching on meaning is not working right now, so this ranks on requirements met only.";
            }
        }
        else
            note = "AI is not set up, so this ranks on requirements met only.";
        if (target is null && note is null)
            note =
                requisition is not null && requirements.IsEmpty
                    ? "Confirm this job's requirements to get better matches."
                    : "We are still preparing this job's requirements. Try again in a minute.";

        var possible = terms.Sum(term => term.Weight);
        var scored = rows.Select(row =>
            {
                var matched = terms.Where((_, i) => (row.Mask & (1L << i)) != 0).ToList();
                int? keyword =
                    possible == 0
                        ? null
                        : (int)Math.Round(100.0 * matched.Sum(term => term.Weight) / possible);
                int? semantic =
                    target is null || row.Embedding is null
                        ? null
                        : Similarity.ToPercent(Similarity.Cosine(target, row.Embedding));
                var score = (keyword, semantic) switch
                {
                    (int k, int s) => (int)Math.Round(0.4 * k + 0.6 * s),
                    // Without a resume read for meaning, keywords alone cannot outrank someone who has one.
                    (int k, null) => target is null ? k : (int)Math.Round(0.4 * k),
                    (null, int s) => s,
                    _ => 0,
                };
                return new RankScore(
                    row.Id,
                    row.Name,
                    score,
                    keyword,
                    semantic,
                    [.. matched.Select(term => term.Text)],
                    [.. terms.Except(matched).Select(term => term.Text)],
                    row.Embedding is not null
                );
            })
            .OrderByDescending(row => row.Score)
            .ThenBy(row => row.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(row => row.Id)
            .ToList();
        return new RankResult(scored, target is not null, note, rows.Count(row => row.Pending));
    }

    /// <summary>
    /// An AI check of one resume against a job's requirements, cached until the resume, requirements
    /// or title change. Returns a problem message instead when there is nothing to check against.
    /// </summary>
    internal static async Task<(JobFit? Fit, bool Cached, string? Problem)> CheckFitAsync(
        AtsDbContext db,
        IAiAssistant ai,
        Requisition requisition,
        Candidate candidate,
        string actorEmail,
        bool refresh,
        CancellationToken ct
    )
    {
        var requirements = JobRequirements.Parse(requisition.RequirementsJson);
        if (requirements.IsEmpty)
            return (
                null,
                false,
                "Confirm this job's requirements first. The check is made against them."
            );
        if (string.IsNullOrWhiteSpace(candidate.ResumeText))
            return (
                null,
                false,
                "This candidate has no resume read yet, so there is nothing to check."
            );
        var hash = Convert.ToHexString(
            SHA256.HashData(
                Encoding.UTF8.GetBytes(
                    candidate.ResumeText
                        + "\n"
                        + requisition.RequirementsJson
                        + "\n"
                        + requisition.Title
                )
            )
        );
        var cached = await db.JobFits.SingleOrDefaultAsync(
            x => x.RequisitionId == requisition.Id && x.CandidateId == candidate.Id,
            ct
        );
        if (cached is not null && cached.InputHash == hash && !refresh)
            return (cached, true, null);
        var check = await ai.CompleteAsync<FitCheck>(
            "You assess how well a resume evidences each job requirement. summary is two or three plain sentences. Each requirement has kind required or preferred and status met, partial, missing or unknown. Include every listed requirement exactly once, using the given wording. evidence is a short quote or close paraphrase from the resume, or an empty string. Use unknown when the resume doesn't say either way and never guess. Judge only evidence of skills and experience; ignore name, gender, age, nationality and other personal attributes. Do not make a hiring decision.",
            $"Job: {requisition.Title}\nRequired:\n- {string.Join("\n- ", requirements.Required)}\nPreferred:\n- {string.Join("\n- ", requirements.Preferred)}\nMinimum years: {requirements.MinYears?.ToString() ?? "none stated"}\nLocation rule: {(requirements.Location.Length == 0 ? "none" : requirements.Location)}\n\nResume:\n{candidate.ResumeText[..Math.Min(candidate.ResumeText.Length, 12000)]}",
            ct,
            new AiContext("job-fit", actorEmail, "Candidate", candidate.Id.ToString())
        );
        var result = ShapeFit(check, requirements);
        if (cached is null)
        {
            cached = new JobFit
            {
                RequisitionId = requisition.Id,
                CandidateId = candidate.Id,
                ResultJson = result.Json,
                Score = result.Score,
                InputHash = hash,
            };
            db.JobFits.Add(cached);
        }
        else
        {
            cached.ResultJson = result.Json;
            cached.Score = result.Score;
            cached.InputHash = hash;
            cached.CreatedAt = DateTimeOffset.UtcNow;
        }
        await db.SaveChangesAsync(ct);
        return (cached, false, null);
    }

    private sealed class Swap(
        ParameterExpression first,
        Expression firstValue,
        ParameterExpression second,
        Expression secondValue
    ) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) =>
            node == first ? firstValue
            : node == second ? secondValue
            : node;
    }
}
