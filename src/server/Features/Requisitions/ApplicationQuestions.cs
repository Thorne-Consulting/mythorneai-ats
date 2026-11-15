using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>A question as the builder sends it. Id keeps an existing question (and its answers' link).</summary>
public sealed record QuestionInput(
    Guid? Id,
    QuestionType Type,
    string Label,
    string? HelpText = null,
    bool Required = false,
    string[]? Options = null,
    string[]? KnockoutAnswers = null,
    Guid? BankQuestionId = null
);

/// <summary>One answer from the apply page. Values: one item, or several for multiple choice. FileToken: from <c>POST /public/answer-file</c>.</summary>
public sealed record AnswerInput(
    Guid QuestionId,
    string[]? Values = null,
    string? FileToken = null
);

public sealed record SaveQuestionsRequest(QuestionInput[] Questions);

/// <summary>Typed application questions: the rules shared by the builder, the templates, the bank and the apply page.</summary>
public static partial class ApplicationQuestions
{
    public const int MaxQuestions = 50;
    public static readonly string[] YesNo = ["Yes", "No"];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() },
    };

    public static bool HasOptions(QuestionType type) =>
        type is QuestionType.YesNo or QuestionType.SingleChoice or QuestionType.MultipleChoice;

    /// <summary>Cleaned questions in order, or one message per problem (keyed "questions[3].label" and so on).</summary>
    public static (List<QuestionInput> Questions, Dictionary<string, string[]> Errors) Normalize(
        IReadOnlyList<QuestionInput>? input
    )
    {
        var errors = new Dictionary<string, string[]>();
        var list = new List<QuestionInput>();
        input ??= [];
        if (input.Count > MaxQuestions)
            errors["questions"] = [$"Keep it to {MaxQuestions} questions or fewer."];
        for (var i = 0; i < Math.Min(input.Count, MaxQuestions); i++)
        {
            var q = input[i];
            var key = $"questions[{i}]";
            if (!Enum.IsDefined(q.Type))
            {
                errors[$"{key}.type"] = ["Choose a question type."];
                continue;
            }
            var label = q.Label?.Trim() ?? "";
            if (label.Length is 0 or > 300)
                errors[$"{key}.label"] = ["Write the question, up to 300 characters."];
            var help = q.HelpText?.Trim() is { Length: > 0 } h ? h : null;
            if (help?.Length > 600)
                errors[$"{key}.helpText"] = ["Keep the help text under 600 characters."];
            string[] options = q.Type switch
            {
                QuestionType.YesNo => YesNo,
                QuestionType.SingleChoice or QuestionType.MultipleChoice =>
                [
                    .. (q.Options ?? [])
                        .Select(x => x.Trim())
                        .Where(x => x.Length > 0)
                        .Distinct(StringComparer.OrdinalIgnoreCase),
                ],
                _ => [],
            };
            if (
                q.Type is QuestionType.SingleChoice or QuestionType.MultipleChoice
                && options.Length < 2
            )
                errors[$"{key}.options"] = ["Add at least two choices."];
            else if (options.Length > 30 || options.Any(x => x.Length > 200))
                errors[$"{key}.options"] = ["Use up to 30 choices of up to 200 characters each."];
            var knockouts = HasOptions(q.Type)
                ? (q.KnockoutAnswers ?? [])
                    .Select(x =>
                        options.FirstOrDefault(o =>
                            o.Equals(x.Trim(), StringComparison.OrdinalIgnoreCase)
                        )
                    )
                    .OfType<string>()
                    .Distinct()
                    .ToArray()
                : [];
            if (knockouts.Length > 0 && knockouts.Length == options.Length)
                errors[$"{key}.knockoutAnswers"] =
                [
                    "Leave at least one answer that is not flagged.",
                ];
            list.Add(
                new QuestionInput(
                    q.Id,
                    q.Type,
                    label,
                    help,
                    q.Required,
                    options,
                    knockouts,
                    q.BankQuestionId
                )
            );
        }
        return (list, errors);
    }

    public static string ToJson(IEnumerable<QuestionInput> questions) =>
        JsonSerializer.Serialize(questions, Json);

    public static List<QuestionInput> FromJson(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            return JsonSerializer.Deserialize<List<QuestionInput>>(json, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public static ApplicationQuestion ToEntity(QuestionInput q, Guid? requisitionId, int order) =>
        new()
        {
            RequisitionId = requisitionId,
            Type = q.Type,
            Label = q.Label,
            HelpText = q.HelpText,
            Required = q.Required,
            Options = q.Options ?? [],
            KnockoutAnswers = q.KnockoutAnswers ?? [],
            SortOrder = order,
            BankQuestionId = q.BankQuestionId,
        };

    public static object View(ApplicationQuestion q) =>
        new
        {
            q.Id,
            Type = q.Type.ToString(),
            q.Label,
            q.HelpText,
            q.Required,
            q.Options,
            q.KnockoutAnswers,
            q.SortOrder,
            q.BankQuestionId,
        };

    /// <summary>What the apply page needs. Knockout answers are never sent to candidates.</summary>
    public static object PublicView(ApplicationQuestion q) =>
        new
        {
            q.Id,
            Type = q.Type.ToString(),
            q.Label,
            q.HelpText,
            q.Required,
            q.Options,
        };

    /// <summary>
    /// Checks the answers against the job's questions: required ones answered, choices from the
    /// list, numbers, dates and web addresses that parse. File answers carry a token the caller
    /// turns into an attachment. Unknown question ids are ignored.
    /// </summary>
    public static (
        List<(ApplicationQuestion Question, string[] Values, string? FileToken)> Answers,
        Dictionary<string, string[]> Errors
    ) Check(IReadOnlyList<ApplicationQuestion> questions, IReadOnlyList<AnswerInput>? answers)
    {
        var errors = new Dictionary<string, string[]>();
        var result = new List<(ApplicationQuestion, string[], string?)>();
        var given = (answers ?? [])
            .GroupBy(x => x.QuestionId)
            .ToDictionary(g => g.Key, g => g.First());
        foreach (var q in questions.OrderBy(x => x.SortOrder))
        {
            var key = $"answers.{q.Id}";
            given.TryGetValue(q.Id, out var answer);
            var values = (answer?.Values ?? [])
                .Select(x => x?.Trim() ?? "")
                .Where(x => x.Length > 0)
                .ToArray();
            var token = answer?.FileToken?.Trim() is { Length: > 0 } t ? t : null;
            var empty = q.Type == QuestionType.File ? token is null : values.Length == 0;
            if (empty)
            {
                if (q.Required)
                    errors[key] =
                    [
                        q.Type == QuestionType.File ? "Add a file." : "Answer this question.",
                    ];
                result.Add((q, [], null));
                continue;
            }
            string? problem = null;
            switch (q.Type)
            {
                case QuestionType.ShortText when values[0].Length > 300:
                    problem = "Keep this under 300 characters.";
                    break;
                case QuestionType.LongText when values[0].Length > 5000:
                    problem = "Keep this under 5,000 characters.";
                    break;
                case QuestionType.YesNo or QuestionType.SingleChoice:
                    var pick = q.Options.FirstOrDefault(o =>
                        o.Equals(values[0], StringComparison.OrdinalIgnoreCase)
                    );
                    if (pick is null)
                        problem = "Choose one of the answers.";
                    else
                        values = [pick];
                    break;
                case QuestionType.MultipleChoice:
                    var picks = values
                        .Select(v =>
                            q.Options.FirstOrDefault(o =>
                                o.Equals(v, StringComparison.OrdinalIgnoreCase)
                            )
                        )
                        .ToArray();
                    if (picks.Any(x => x is null))
                        problem = "Choose from the answers listed.";
                    else
                        values = [.. picks.OfType<string>().Distinct()];
                    break;
                case QuestionType.Number:
                    if (
                        !decimal.TryParse(
                            values[0],
                            NumberStyles.Number,
                            CultureInfo.InvariantCulture,
                            out var number
                        )
                    )
                        problem = "Enter a number.";
                    else
                        values = [number.ToString(CultureInfo.InvariantCulture)];
                    break;
                case QuestionType.Date:
                    if (
                        !DateOnly.TryParseExact(
                            values[0],
                            "yyyy-MM-dd",
                            CultureInfo.InvariantCulture,
                            DateTimeStyles.None,
                            out _
                        )
                    )
                        problem = "Enter a date.";
                    break;
                case QuestionType.Url:
                    if (
                        values[0].Length > 500
                        || !Uri.TryCreate(values[0], UriKind.Absolute, out var uri)
                        || uri.Scheme is not ("http" or "https")
                    )
                        problem = "Paste the full link, starting with https://";
                    break;
            }
            if (problem is not null)
            {
                errors[key] = [problem];
                continue;
            }
            result.Add(
                (q, q.Type == QuestionType.File ? [] : values[..Math.Min(values.Length, 30)], token)
            );
        }
        return (result, errors);
    }

    /// <summary>Whether an answer is one of the question's knockout answers.</summary>
    public static bool IsKnockout(ApplicationQuestion q, IEnumerable<string> values) =>
        values.Any(v => q.KnockoutAnswers.Contains(v, StringComparer.OrdinalIgnoreCase));

    /// <summary>"### Question\n\nAnswer" blocks, the readable copy older screens show.</summary>
    public static string ToMarkdown(IEnumerable<ApplicationAnswer> answers) =>
        string.Join(
            "\n\n",
            answers
                .OrderBy(x => x.SortOrder)
                .Select(a =>
                    $"### {a.Label}\n\n{(a.Values.Length > 0 ? string.Join(", ", a.Values) : a.AttachmentId is null ? "_No answer_" : "File attached")}"
                )
        );

    /// <summary>
    /// Question and answer pairs for the application record: typed answers when the application
    /// has them, else the older Markdown copy. <c>Flagged</c> marks a knockout answer.
    /// </summary>
    public static async Task<object[]> ForApplicationAsync(
        AtsDbContext db,
        Guid applicationId,
        string? markdown,
        CancellationToken ct
    )
    {
        var rows = await db
            .ApplicationAnswers.AsNoTracking()
            .Where(x => x.ApplicationId == applicationId)
            .OrderBy(x => x.SortOrder)
            .ToListAsync(ct);
        if (rows.Count == 0)
            return
            [
                .. ApplicationAnswers
                    .Parse(markdown)
                    .Select(x =>
                        (object)
                            new
                            {
                                x.Question,
                                x.Answer,
                                Flagged = false,
                            }
                    ),
            ];
        return
        [
            .. rows.Select(x =>
                (object)
                    new
                    {
                        Question = x.Label,
                        Answer = x.Type == QuestionType.Date
                        && DateOnly.TryParse(
                            x.Values.FirstOrDefault(),
                            CultureInfo.InvariantCulture,
                            out var date
                        )
                            ? date.ToString("MMMM d, yyyy", CultureInfo.InvariantCulture)
                            : string.Join(", ", x.Values),
                        x.Flagged,
                        Type = x.Type.ToString(),
                        x.QuestionId,
                        x.AttachmentId,
                    }
            ),
        ];
    }

    // The old careers-site parser (features/careers/questions.ts), once, for the backfill.
    private static readonly Regex ListItem = new(@"^\s*(?:[-*+]|\d+[.)])\s+(.*)$");
    private static readonly Regex RequiredMark = new(
        @"\s*(?:\(required\)|\*)\s*$",
        RegexOptions.IgnoreCase
    );

    public static List<QuestionInput> ParseMarkdown(string? markdown)
    {
        var lines = (markdown ?? "").Replace("\r\n", "\n").Split('\n');
        var items = lines
            .Select(l => ListItem.Match(l))
            .Where(m => m.Success)
            .Select(m => m.Groups[1].Value)
            .ToList();
        var raw =
            items.Count > 0 ? items
            : lines.Any(l => RequiredMark.Replace(l.Trim(), "").EndsWith('?'))
                ? [.. lines.Where(l => RequiredMark.Replace(l.Trim(), "").EndsWith('?'))]
            : (markdown ?? "")
                .Split("\n\n")
                .Select(p => Regex.Replace(p, @"\s*\n\s*", " ").Trim())
                .Where(p => p.Length > 0 && !p.StartsWith('#'))
                .ToList();
        return
        [
            .. raw.Select(r =>
                {
                    var clean = Regex.Replace(r, @"\*\*|__|`", "");
                    var required = RequiredMark.IsMatch(clean);
                    var text = RequiredMark.Replace(clean, "").Trim();
                    return new QuestionInput(
                        null,
                        QuestionType.LongText,
                        text.Length > 300 ? text[..300] : text,
                        Required: required
                    );
                })
                .Where(q => q.Label.Length > 0)
                // The old template starter text was never meant as a question.
                .Where(q => q.Label != "Add any default questions for applicants."),
        ];
    }

    /// <summary>
    /// Moves Markdown questions (jobs and posting templates) into typed questions, once: the Markdown
    /// column is cleared after. Old answers stay in their Markdown copy.
    /// </summary>
    public static async Task BackfillAsync(AtsDbContext db, CancellationToken ct = default)
    {
        var jobs = await db
            .Requisitions.IgnoreAutoIncludes()
            .Where(x => x.ApplicationQuestionsMarkdown != "")
            .ToListAsync(ct);
        foreach (var job in jobs)
        {
            if (!await db.ApplicationQuestions.AnyAsync(x => x.RequisitionId == job.Id, ct))
                db.ApplicationQuestions.AddRange(
                    ParseMarkdown(job.ApplicationQuestionsMarkdown)
                        .Take(MaxQuestions)
                        .Select((q, i) => ToEntity(q, job.Id, i))
                );
            job.ApplicationQuestionsMarkdown = "";
        }
        var templates = await db
            .PostingTemplates.Where(x => x.ApplicationQuestionsMarkdown != "")
            .ToListAsync(ct);
        foreach (var template in templates)
        {
            if (FromJson(template.QuestionsJson).Count == 0)
                template.QuestionsJson = ToJson(
                    ParseMarkdown(template.ApplicationQuestionsMarkdown).Take(MaxQuestions)
                );
            template.ApplicationQuestionsMarkdown = "";
        }
        if (jobs.Count + templates.Count > 0)
            await db.SaveChangesAsync(ct);
    }
}

public static partial class AtsEndpoints
{
    private static void MapApplicationQuestions(RouteGroupBuilder api)
    {
        api.MapGet(
            "/requisitions/{id:guid}/questions",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (
                    !await ScopeRequisitions(db.Requisitions, principal)
                        .AnyAsync(x => x.Id == id, ct)
                )
                    return Results.NotFound();
                var questions = await db
                    .ApplicationQuestions.AsNoTracking()
                    .Where(x => x.RequisitionId == id)
                    .OrderBy(x => x.SortOrder)
                    .ToListAsync(ct);
                return Results.Ok(questions.Select(ApplicationQuestions.View));
            }
        );

        // Replaces the job's questions. A kept Id keeps the question (and its answers' link); a
        // removed question's answers stay on the applications with the question as it was asked.
        api.MapPut(
                "/requisitions/{id:guid}/questions",
                async (
                    Guid id,
                    SaveQuestionsRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var job = await db.Requisitions.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (job is null || !CanManage(job, principal))
                        return Results.NotFound();
                    var (questions, errors) = ApplicationQuestions.Normalize(request.Questions);
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    await ReplaceQuestionsAsync(db, id, questions, ct);
                    job.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "QuestionsSaved",
                        new { Count = questions.Count }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(
                        (
                            await db
                                .ApplicationQuestions.AsNoTracking()
                                .Where(x => x.RequisitionId == id)
                                .OrderBy(x => x.SortOrder)
                                .ToListAsync(ct)
                        ).Select(ApplicationQuestions.View)
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // The question bank: questions saved once and added to any job or template.
        api.MapGet(
                "/question-bank",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        (
                            await db
                                .ApplicationQuestions.AsNoTracking()
                                .Where(x => x.RequisitionId == null)
                                .OrderBy(x => x.Label)
                                .ToListAsync(ct)
                        ).Select(ApplicationQuestions.View)
                    )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/question-bank",
                async (
                    QuestionInput request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var (questions, errors) = ApplicationQuestions.Normalize([request]);
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    if (
                        await db.ApplicationQuestions.AnyAsync(
                            x => x.RequisitionId == null && x.Label == questions[0].Label,
                            ct
                        )
                    )
                        return JobProblem("label", "The question bank already has this question.");
                    var entity = ApplicationQuestions.ToEntity(
                        questions[0] with
                        {
                            BankQuestionId = null,
                        },
                        null,
                        0
                    );
                    db.ApplicationQuestions.Add(entity);
                    Audit.Add(
                        db,
                        principal,
                        "QuestionBank",
                        entity.Id,
                        "Created",
                        new { entity.Label }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(ApplicationQuestions.View(entity));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPut(
                "/question-bank/{id:guid}",
                async (
                    Guid id,
                    QuestionInput request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var entity = await db.ApplicationQuestions.SingleOrDefaultAsync(
                        x => x.Id == id && x.RequisitionId == null,
                        ct
                    );
                    if (entity is null)
                        return Results.NotFound();
                    var (questions, errors) = ApplicationQuestions.Normalize([request]);
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var q = questions[0];
                    entity.Type = q.Type;
                    entity.Label = q.Label;
                    entity.HelpText = q.HelpText;
                    entity.Required = q.Required;
                    entity.Options = q.Options ?? [];
                    entity.KnockoutAnswers = q.KnockoutAnswers ?? [];
                    Audit.Add(db, principal, "QuestionBank", id, "Updated", new { entity.Label });
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(ApplicationQuestions.View(entity));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Jobs that used it keep their own copy.
        api.MapDelete(
                "/question-bank/{id:guid}",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var entity = await db.ApplicationQuestions.SingleOrDefaultAsync(
                        x => x.Id == id && x.RequisitionId == null,
                        ct
                    );
                    if (entity is null)
                        return Results.NotFound();
                    db.ApplicationQuestions.Remove(entity);
                    Audit.Add(db, principal, "QuestionBank", id, "Deleted", new { entity.Label });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static async Task ReplaceQuestionsAsync(
        AtsDbContext db,
        Guid requisitionId,
        IReadOnlyList<QuestionInput> questions,
        CancellationToken ct
    )
    {
        var existing = await db
            .ApplicationQuestions.Where(x => x.RequisitionId == requisitionId)
            .ToListAsync(ct);
        var kept = new HashSet<Guid>();
        for (var i = 0; i < questions.Count; i++)
        {
            var q = questions[i];
            var row = q.Id is { } qid ? existing.FirstOrDefault(x => x.Id == qid) : null;
            if (row is null)
            {
                db.ApplicationQuestions.Add(ApplicationQuestions.ToEntity(q, requisitionId, i));
                continue;
            }
            kept.Add(row.Id);
            row.Type = q.Type;
            row.Label = q.Label;
            row.HelpText = q.HelpText;
            row.Required = q.Required;
            row.Options = q.Options ?? [];
            row.KnockoutAnswers = q.KnockoutAnswers ?? [];
            row.SortOrder = i;
            row.BankQuestionId = q.BankQuestionId;
        }
        db.ApplicationQuestions.RemoveRange(existing.Where(x => !kept.Contains(x.Id)));
    }
}
