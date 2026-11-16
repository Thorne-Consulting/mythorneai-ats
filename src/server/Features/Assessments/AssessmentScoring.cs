using System.Text.Json;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>One check the candidate was told about, as the browser reported it.</summary>
public sealed record IntegrityEvent(
    string Type,
    DateTimeOffset At,
    string? QuestionId = null,
    int? Seconds = null
);

/// <summary>
/// Pure assessment rules: reading content, scoring, the order a candidate sees, and what stops a
/// publish. The web app's <c>scoring.ts</c> mirrors the scoring and checks; <c>scoring.check.mjs</c> is the shared spec.
/// </summary>
public static class AssessmentScoring
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Time the server still accepts answers after the clock runs out (slow networks).</summary>
    public static readonly TimeSpan Grace = TimeSpan.FromSeconds(30);

    public static readonly string[] IntegrityTypes =
    [
        "left",
        "returned",
        "fullscreen-exit",
        "paste",
        "paste-blocked",
    ];

    public static AssessmentContent Read(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new();
        try
        {
            return JsonSerializer.Deserialize<AssessmentContent>(json, Json) ?? new();
        }
        catch (JsonException)
        {
            return new();
        }
    }

    public static string Write(AssessmentContent content) =>
        JsonSerializer.Serialize(content, Json);

    public static IEnumerable<AssessmentQuestion> Questions(AssessmentContent content) =>
        content.Sections.SelectMany(x => x.Questions);

    public static bool IsAuto(AssessmentQuestion question) =>
        question.Type is QuestionTypes.Single or QuestionTypes.Multi;

    /// <summary>
    /// Choice questions: the exact set of correct options, or with partial credit
    /// (several answers only) correct picks minus wrong picks, never below zero.
    /// </summary>
    public static decimal AutoPoints(
        AssessmentQuestion question,
        IReadOnlyCollection<string>? picked
    )
    {
        if (!IsAuto(question) || picked is null)
            return 0;
        var correct = question.Options.Where(x => x.Correct).Select(x => x.Id).ToHashSet();
        var chosen = picked.Where(id => question.Options.Any(o => o.Id == id)).ToHashSet();
        if (correct.Count == 0)
            return 0;
        if (question.Type == QuestionTypes.Multi && question.PartialCredit)
        {
            var right = chosen.Count(correct.Contains);
            var wrong = chosen.Count - right;
            return Math.Round(
                question.Points * (decimal)Math.Max(0, right - wrong) / correct.Count,
                2
            );
        }
        return chosen.SetEquals(correct) ? question.Points : 0;
    }

    /// <summary>Nothing to score: no choice, no text, no file, or code left as the starter.</summary>
    public static bool IsBlank(AssessmentQuestion question, AssessmentAnswer? answer) =>
        answer is null
        || (
            IsAuto(question) ? answer.ChoiceIds.Length == 0
            : question.Type == QuestionTypes.File ? answer.AttachmentId is null
            : string.IsNullOrWhiteSpace(answer.Text)
                || (
                    question.Type == QuestionTypes.Code
                    && answer.Text.Trim() == question.StarterCode.Trim()
                )
        );

    /// <summary>At submit: choice questions are scored, and blank answers get 0 so nobody has to grade them.</summary>
    public static void ScoreOnSubmit(
        AssessmentContent content,
        IEnumerable<AssessmentAnswer> answers
    )
    {
        var byId = answers.ToDictionary(x => x.QuestionId);
        foreach (var question in Questions(content))
        {
            if (!byId.TryGetValue(question.Id, out var answer))
                continue;
            if (IsAuto(question))
                answer.AutoPoints = AutoPoints(question, answer.ChoiceIds);
            else if (IsBlank(question, answer))
                answer.AutoPoints = 0;
        }
    }

    public sealed record Totals(decimal Earned, decimal Max, int Pending, int? Percent);

    public static Totals Total(AssessmentContent content, IEnumerable<AssessmentAnswer> answers)
    {
        var byId = answers.ToDictionary(x => x.QuestionId);
        decimal earned = 0,
            max = 0;
        var pending = 0;
        foreach (var question in Questions(content))
        {
            max += question.Points;
            byId.TryGetValue(question.Id, out var answer);
            if (IsAuto(question))
                earned += answer?.AutoPoints ?? AutoPoints(question, answer?.ChoiceIds);
            else if (IsBlank(question, answer))
                continue;
            else if (answer!.ReviewerPoints is { } points)
                earned += Math.Clamp(points, 0, question.Points);
            else
                pending++;
        }
        int? percent =
            pending == 0 && max > 0
                ? (int)Math.Round(earned / max * 100, MidpointRounding.AwayFromZero)
                : null;
        return new(earned, max, pending, percent);
    }

    /// <summary>Copies the totals onto the invite (what lists and reports read).</summary>
    public static void Apply(
        AssessmentInvite invite,
        AssessmentContent content,
        IEnumerable<AssessmentAnswer> answers
    )
    {
        var totals = Total(content, answers);
        invite.EarnedPoints = totals.Earned;
        invite.MaxPoints = totals.Max;
        invite.PendingCount = totals.Pending;
        invite.Percent = totals.Percent;
    }

    /// <summary>
    /// The order one candidate sees. Shuffles are seeded by the invite, so the reviewer sees the
    /// same order and a reload never reshuffles.
    /// </summary>
    public static List<AssessmentSection> Ordered(AssessmentContent content, Guid inviteId) =>
        content
            .Sections.Select(section => new AssessmentSection
            {
                Id = section.Id,
                Title = section.Title,
                Questions = (
                    content.ShuffleQuestions
                        ? section.Questions.OrderBy(q => Hash($"{inviteId}:{q.Id}")).ToList()
                        : section.Questions
                )
                    .Select(q =>
                        content.ShuffleOptions && IsAuto(q)
                            ? Clone(q, q.Options.OrderBy(o => Hash($"{inviteId}:{o.Id}")).ToList())
                            : q
                    )
                    .ToList(),
            })
            .ToList();

    private static AssessmentQuestion Clone(AssessmentQuestion q, List<AssessmentOption> options) =>
        new()
        {
            Id = q.Id,
            Type = q.Type,
            Prompt = q.Prompt,
            Points = q.Points,
            Options = options,
            PartialCredit = q.PartialCredit,
            Rubric = q.Rubric,
            Language = q.Language,
            StarterCode = q.StarterCode,
            Accept = q.Accept,
        };

    /// <summary>The questions without answers or scoring notes: what the candidate's browser gets.</summary>
    public static object ForCandidate(List<AssessmentSection> sections) =>
        sections.Select(section => new
        {
            section.Id,
            section.Title,
            Questions = section.Questions.Select(q => new
            {
                q.Id,
                q.Type,
                q.Prompt,
                q.Points,
                Options = q.Options.Select(o => new { o.Id, o.Text }),
                q.Language,
                q.StarterCode,
                q.Accept,
            }),
        });

    /// <summary>What stops a publish, in plain words. Empty means it can be published.</summary>
    public static List<string> Problems(Assessment assessment, AssessmentContent content)
    {
        var problems = new List<string>();
        if (string.IsNullOrWhiteSpace(assessment.Name))
            problems.Add("Give the assessment a name.");
        if (assessment.ExpiryDays is < 1 or > 90)
            problems.Add("Invites must stay open between 1 and 90 days.");
        if (MediaEndpoints.HasImageWithoutAlt(content.Instructions))
            problems.Add("Instructions: describe every picture.");
        if (assessment.Kind == AssessmentKind.External)
        {
            if (string.IsNullOrWhiteSpace(assessment.ProviderName))
                problems.Add("Name the provider that runs the test.");
            if (!IsWebLink(assessment.ExternalUrl))
                problems.Add("Add the test's web address, starting with https://.");
            return problems;
        }
        if (content.Timed && content.Minutes is < 5 or > 600)
            problems.Add("The timer must be between 5 and 600 minutes.");
        if (content.PassMark is < 1 or > 100)
            problems.Add("The pass mark must be between 1 and 100.");
        if (content.Sections.Any(x => string.IsNullOrWhiteSpace(x.Title)))
            problems.Add("Give every section a title.");
        var questions = Questions(content).ToList();
        if (questions.Count == 0)
            problems.Add("Add at least one question.");
        for (var i = 0; i < questions.Count; i++)
            foreach (var problem in QuestionProblems(questions[i]))
                problems.Add($"Question {i + 1}: {problem}");
        return problems;
    }

    public static IEnumerable<string> QuestionProblems(AssessmentQuestion q)
    {
        if (!QuestionTypes.All.Contains(q.Type))
            yield return "pick a question type.";
        if (string.IsNullOrWhiteSpace(q.Prompt))
            yield return "write the question.";
        else if (MediaEndpoints.HasImageWithoutAlt(q.Prompt))
            yield return "describe every picture.";
        if (q.Points < 1)
            yield return "give it at least 1 point.";
        if (IsAuto(q))
        {
            var filled = q.Options.Count(x => !string.IsNullOrWhiteSpace(x.Text));
            var correct = q.Options.Count(x => x.Correct);
            if (filled < 2 || filled != q.Options.Count)
                yield return "fill in at least two answers and remove empty ones.";
            if (q.Type == QuestionTypes.Single && correct != 1)
                yield return "mark exactly one correct answer.";
            if (q.Type == QuestionTypes.Multi && correct < 1)
                yield return "mark at least one correct answer.";
        }
        if (q.Type == QuestionTypes.Code && string.IsNullOrWhiteSpace(q.Language))
            yield return "pick a language.";
    }

    public static bool IsWebLink(string? url) =>
        Uri.TryCreate(url?.Replace("{{", "").Replace("}}", ""), UriKind.Absolute, out var uri)
        && uri.Scheme == Uri.UriSchemeHttps;

    /// <summary>An external test's link for one candidate: {{email}}, {{firstName}}, {{lastName}} and {{inviteId}} filled in.</summary>
    public static string ExternalLink(string url, Candidate candidate, Guid inviteId) =>
        url.Replace("{{email}}", Uri.EscapeDataString(candidate.Email))
            .Replace("{{firstName}}", Uri.EscapeDataString(candidate.FirstName))
            .Replace("{{lastName}}", Uri.EscapeDataString(candidate.LastName))
            .Replace("{{inviteId}}", inviteId.ToString());

    /// <summary>A copy with new section, question and option ids, so nothing is shared with the original.</summary>
    public static AssessmentContent WithNewIds(AssessmentContent content)
    {
        var copy = Read(Write(content));
        foreach (var section in copy.Sections)
        {
            section.Id = Guid.NewGuid().ToString("N");
            foreach (var question in section.Questions)
            {
                question.Id = Guid.NewGuid().ToString("N");
                foreach (var option in question.Options)
                    option.Id = Guid.NewGuid().ToString("N");
            }
        }
        return copy;
    }

    public static List<IntegrityEvent> Events(string? json)
    {
        try
        {
            return JsonSerializer.Deserialize<List<IntegrityEvent>>(json ?? "[]", Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>When answers stop being accepted: the timer's deadline, or the invite's expiry when untimed.</summary>
    public static DateTimeOffset ClosesAt(AssessmentInvite invite) =>
        invite.DeadlineAt ?? invite.ExpiresAt;

    /// <summary>Stable 32-bit FNV-1a, the same as the web app's <c>hash</c>.</summary>
    public static uint Hash(string value)
    {
        var hash = 0x811c9dc5u;
        foreach (var c in value)
        {
            hash ^= c;
            hash *= 0x01000193u;
        }
        return hash;
    }
}
