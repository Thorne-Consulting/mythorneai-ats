using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Caching.Memory;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed record ResumeExtraction(
    ResumeForm Form,
    string TextHash,
    string Model,
    string PromptVersion,
    string RawJson
);

/// <summary>Step 2 of parsing: the text goes to the model with the blank form, and the filled form comes back.</summary>
public sealed class ResumeExtractor(
    IChatClient chat,
    AtsDbContext db,
    IConfiguration configuration,
    IMemoryCache cache,
    IServiceScopeFactory scopes,
    ILogger<ResumeExtractor> logger
)
{
    // Bump when the instructions or ResumeForm change, so old parses are redone rather than reused.
    public const string PromptVersion = "2026-10-18.1";

    private const string Instructions = """
        You read a resume and fill in a form. Rules:
        - Copy values from the resume text. Never invent, infer or "correct" a name, employer, school, date or number.
        - Leave a field null or empty when the resume does not state it.
        - Keep the resume's wording for titles, employers, schools, degrees, skills and bullet points.
        - Jobs and education go most recent first. A role marked Present, Current, Now or ongoing has end = null.
        - Dates: give the year and, when written, the month as 1-12. "Expected June 2027" is endYear 2027 with inProgress true.
        - The fields seniority, employmentType, degreeLevel, fieldNormalized, category and proficiency must be one of the listed values; use Unknown (or Other) when unsure.
        - Skills: list everything the resume names as a skill, tool, technology, method or domain. Also attach to each job the skills its bullets mention.
        - Put every line you could not place anywhere into unassignedText, copied exactly. Do not drop content.
        - Output only the form.
        """;

    public static string ModelName(IConfiguration configuration) =>
        configuration["OpenAI:ResumeModel"] ?? configuration["OpenAI:Model"] ?? "gpt-5-mini";

    public bool IsConfigured => chat is not UnconfiguredChatClient;

    public string Model => ModelName(configuration);

    public async Task<ResumeExtraction> ExtractAsync(string text, AiContext context, CancellationToken ct)
    {
        var model = Model;
        var hash = TextHash(text);
        var cacheKey = $"resume-form:{hash}:{model}:{PromptVersion}";
        if (cache.TryGetValue(cacheKey, out ResumeExtraction? cached) && cached is not null)
            return cached;

        if (await db.Organizations.AsNoTracking().Select(x => (bool?)x.AiEnabled).SingleOrDefaultAsync(ct) == false)
            throw new AiUnavailableException("AI assistance is turned off in settings.");

        var clock = Stopwatch.StartNew();
        try
        {
            var (form, rawJson, inputTokens, outputTokens) = await CallAsync(chat, model, text, ct);
            var extraction = new ResumeExtraction(form, hash, model, PromptVersion, rawJson);
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, text, rawJson, inputTokens, outputTokens, clock, null);
            cache.Set(cacheKey, extraction, TimeSpan.FromHours(1));
            return extraction;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, text, "", 0, 0, clock, exception.Message);
            throw;
        }
    }

    /// <summary>The model call on its own, so the quality test can run it against a real key without the app around it.</summary>
    public static async Task<(ResumeForm Form, string RawJson, int InputTokens, int OutputTokens)> CallAsync(
        IChatClient chat,
        string model,
        string text,
        CancellationToken ct
    )
    {
        var options = new ChatOptions
        {
            // ponytail: reasoning models (gpt-5*, o*) reject any temperature but the default.
            Temperature = model.StartsWith("gpt-5", StringComparison.OrdinalIgnoreCase) || model.StartsWith('o') ? null : 0,
            Seed = 7,
        };
        var messages = new[]
        {
            new ChatMessage(ChatRole.System, Instructions),
            new ChatMessage(ChatRole.User, text),
        };
        var response = await chat.GetResponseAsync<ResumeForm>(messages, options, cancellationToken: ct);
        return (Sanitize(response.Result), response.Text,
            (int)(response.Usage?.InputTokenCount ?? 0), (int)(response.Usage?.OutputTokenCount ?? 0));
    }

    public static string TextHash(string text) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)));

    // The model may leave arrays null or pad strings; the writer expects neither.
    private static ResumeForm Sanitize(ResumeForm form) => form with
    {
        Basics = (form.Basics ?? new ResumeBasics(null, null, null, null, null, null, null, null, null, [], null)) with
        {
            Links = form.Basics?.Links ?? [],
        },
        Work = (form.Work ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Company) || !string.IsNullOrWhiteSpace(x.Title))
            .Select(x => x with { Bullets = x.Bullets ?? [], SkillsUsed = x.SkillsUsed ?? [] }).ToArray(),
        Education = (form.Education ?? []).Where(x => !string.IsNullOrWhiteSpace(x.School) || !string.IsNullOrWhiteSpace(x.Degree)).ToArray(),
        Skills = (form.Skills ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Name)).ToArray(),
        Certifications = (form.Certifications ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Name)).ToArray(),
        Languages = (form.Languages ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Language)).ToArray(),
        Projects = (form.Projects ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .Select(x => x with { SkillsUsed = x.SkillsUsed ?? [] }).ToArray(),
        Publications = (form.Publications ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Title)).ToArray(),
        Awards = (form.Awards ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Name)).ToArray(),
        UnassignedText = (form.UnassignedText ?? []).Where(x => !string.IsNullOrWhiteSpace(x)).ToArray(),
    };
}

/// <summary>Stands in for the model when OpenAI:ApiKey is missing, so parsing fails with a clear message.</summary>
public sealed class UnconfiguredChatClient : IChatClient
{
    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new AiUnavailableException("OpenAI:ApiKey is not configured, so resumes cannot be parsed.");

    public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new AiUnavailableException("OpenAI:ApiKey is not configured, so resumes cannot be parsed.");

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }
}

/// <summary>Every model call lands in AiCallLogs, on its own context so a failure here can't touch the caller's unsaved changes.</summary>
public static class AiCallLogWriter
{
    public static async Task WriteAsync(
        IServiceScopeFactory scopes,
        ILogger logger,
        AiContext? context,
        string model,
        string input,
        string output,
        int promptTokens,
        int completionTokens,
        Stopwatch clock,
        string? error
    )
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            db.AiCallLogs.Add(
                new Domain.AiCallLog
                {
                    Purpose = context?.Purpose ?? "unspecified",
                    Model = model,
                    UserEmail = context?.UserEmail,
                    SubjectType = context?.SubjectType,
                    SubjectId = context?.SubjectId,
                    Input = Truncate(input, 6000),
                    Output = Truncate(output, 6000),
                    PromptTokens = promptTokens,
                    CompletionTokens = completionTokens,
                    LatencyMs = (int)clock.ElapsedMilliseconds,
                    Error = error is null ? null : Truncate(error, 1000),
                }
            );
            await db.SaveChangesAsync();
        }
        catch (Exception exception)
        {
            logger.LogWarning(exception, "Could not write the AI call log.");
        }
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
