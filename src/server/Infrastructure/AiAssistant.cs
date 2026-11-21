using System.ClientModel;
using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using OpenAI.Responses;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed record AiContext(
    string Purpose,
    string? UserEmail = null,
    string? SubjectType = null,
    string? SubjectId = null
);

public sealed class AiUnavailableException(string message) : InvalidOperationException(message);

/// <summary>One stretch of speech, in seconds from the start. Speaker is a label like "A" when the model tells speakers apart.</summary>
public sealed record TranscriptSegment(double Start, double End, string? Speaker, string Text);

public sealed record DetailedTranscript(string Model, string Text, IReadOnlyList<TranscriptSegment> Segments);

public interface IAiAssistant
{
    bool IsConfigured { get; }

    Task<string> CompleteAsync(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null
    );

    /// <summary>The model answers in the shape of T (a strict JSON schema), so callers read fields instead of parsing JSON.</summary>
    Task<T> CompleteAsync<T>(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null
    );

    Task<float[]> EmbedAsync(string text, CancellationToken ct, AiContext? context = null);

    Task<string> TranscribeAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    );

    /// <summary>A transcript with timestamps, and speaker labels when the configured model gives them.</summary>
    Task<DetailedTranscript> TranscribeDetailedAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    );
}

public sealed class OpenAiAssistant(
    IChatClient chat,
    HttpClient http,
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    ILogger<OpenAiAssistant> logger
) : IAiAssistant
{
    /// <summary>What OpenAI names as the replacement for gpt-4o-mini. Set OpenAI:Model (OPENAI_MODEL) to use another.</summary>
    public const string DefaultModel = "gpt-6-luna";

    public static string ModelName(IConfiguration configuration) =>
        configuration["OpenAI:Model"] ?? DefaultModel;

    /// <summary>
    /// Options for one call: the model, and no copy kept at OpenAI. The Responses API stores every response
    /// for 30 days unless told not to, and these prompts hold resumes and interview notes.
    /// No temperature: current models reject anything but the default.
    /// </summary>
    public static ChatOptions Options(string model) =>
        new()
        {
            ModelId = model,
            RawRepresentationFactory = _ => new CreateResponseOptions { StoredOutputEnabled = false },
        };

    public bool IsConfigured => !string.IsNullOrWhiteSpace(configuration["OpenAI:ApiKey"]);

    public Task<string> CompleteAsync(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null
    ) =>
        RunAsync(
            instruction,
            input,
            context,
            ct,
            async (messages, model) =>
            {
                var response = await chat.GetResponseAsync(messages, Options(model), ct);
                return (response.Text, response.Text, response.Usage);
            }
        );

    public Task<T> CompleteAsync<T>(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null
    ) =>
        RunAsync(
            instruction,
            input,
            context,
            ct,
            async (messages, model) =>
            {
                var response = await chat.GetResponseAsync<T>(messages, Options(model), cancellationToken: ct);
                return response.TryGetResult(out var result)
                    ? (result, response.Text, response.Usage)
                    : throw new JsonException("The model's answer did not fit the requested shape.");
            }
        );

    // One place for the model lookup, the call log and the error mapping.
    private async Task<T> RunAsync<T>(
        string instruction,
        string input,
        AiContext? context,
        CancellationToken ct,
        Func<ChatMessage[], string, Task<(T Value, string Output, UsageDetails? Usage)>> call
    )
    {
        var model = await ModelAsync(ct);
        var clock = Stopwatch.StartNew();
        try
        {
            var (value, output, usage) = await call(
                [new(ChatRole.System, instruction), new(ChatRole.User, input)],
                model
            );
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, instruction + "\n\n" + input, output, (int)(usage?.InputTokenCount ?? 0), (int)(usage?.OutputTokenCount ?? 0), clock, null);
            return value;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // The SDK's message carries OpenAI's own error text (which field it rejected), so the log says why.
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, instruction + "\n\n" + input, "", 0, 0, clock, exception.Message);
            // Callers already turn HttpRequestException into a 502; the SDK throws its own type instead.
            if (exception is ClientResultException failed)
                throw new HttpRequestException(failed.Message, failed, (HttpStatusCode)failed.Status);
            throw;
        }
    }

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct, AiContext? context = null)
    {
        await ModelAsync(ct);
        var model = configuration["OpenAI:EmbeddingModel"] ?? "text-embedding-3-small";
        using var request = Post("embeddings");
        request.Content = JsonContent.Create(new { model, input = text.Length > 24000 ? text[..24000] : text });
        var clock = Stopwatch.StartNew();
        try
        {
            using var response = await http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
            var root = document.RootElement;
            var vector = root
                .GetProperty("data")[0]
                .GetProperty("embedding")
                .EnumerateArray()
                .Select(x => x.GetSingle())
                .ToArray();
            var tokens = root.TryGetProperty("usage", out var usage) ? usage.GetProperty("prompt_tokens").GetInt32() : 0;
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[{text.Length} characters]", $"[{vector.Length} dimensions]", tokens, 0, clock, null);
            return vector;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[{text.Length} characters]", "", 0, 0, clock, exception.Message);
            throw;
        }
    }

    public async Task<string> TranscribeAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    )
    {
        await ModelAsync(ct);
        var model = configuration["OpenAI:TranscriptionModel"] ?? "whisper-1";
        using var request = Post("audio/transcriptions");
        var form = new MultipartFormDataContent { { new StringContent(model), "model" } };
        var file = new StreamContent(audio);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", fileName);
        request.Content = form;
        var clock = Stopwatch.StartNew();
        try
        {
            using var response = await http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
            var text = document.RootElement.GetProperty("text").GetString() ?? "";
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[audio {fileName}]", text, 0, 0, clock, null);
            return text;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[audio {fileName}]", "", 0, 0, clock, exception.Message);
            throw;
        }
    }

    public async Task<DetailedTranscript> TranscribeDetailedAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    )
    {
        await ModelAsync(ct);
        var model = configuration["OpenAI:TranscriptionModel"] ?? "whisper-1";
        // whisper-1 gives timestamps (verbose_json); the diarize models add speakers; others give text only.
        var format = model.Contains("diarize", StringComparison.OrdinalIgnoreCase)
            ? "diarized_json"
            : model.StartsWith("whisper", StringComparison.OrdinalIgnoreCase)
                ? "verbose_json"
                : "json";
        using var request = Post("audio/transcriptions");
        var form = new MultipartFormDataContent
        {
            { new StringContent(model), "model" },
            { new StringContent(format), "response_format" },
        };
        if (format == "verbose_json")
            form.Add(new StringContent("segment"), "timestamp_granularities[]");
        if (format == "diarized_json")
            form.Add(new StringContent("auto"), "chunking_strategy");
        var file = new StreamContent(audio);
        file.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        form.Add(file, "file", fileName);
        request.Content = form;
        var clock = Stopwatch.StartNew();
        try
        {
            using var response = await http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
            var root = document.RootElement;
            var text = root.TryGetProperty("text", out var value) ? value.GetString() ?? "" : "";
            var segments =
                root.TryGetProperty("segments", out var list) && list.ValueKind == JsonValueKind.Array
                    ? list.EnumerateArray()
                        .Select(x => new TranscriptSegment(
                            x.GetProperty("start").GetDouble(),
                            x.GetProperty("end").GetDouble(),
                            x.TryGetProperty("speaker", out var speaker) ? speaker.GetString() : null,
                            (x.GetProperty("text").GetString() ?? "").Trim()
                        ))
                        .Where(x => x.Text.Length > 0)
                        .ToList()
                    : [];
            if (segments.Count == 0 && text.Length > 0)
                segments.Add(new TranscriptSegment(0, root.TryGetProperty("duration", out var duration) ? duration.GetDouble() : 0, null, text.Trim()));
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[audio {fileName}]", $"[{segments.Count} segments, {text.Length} characters]", 0, 0, clock, null);
            return new DetailedTranscript(model, text, segments);
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, $"[audio {fileName}]", "", 0, 0, clock, exception.Message);
            throw;
        }
    }

    private HttpRequestMessage Post(string path)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path);
        request.Headers.Authorization = new("Bearer", configuration["OpenAI:ApiKey"]);
        return request;
    }

    // Throws when the key is missing or an admin switched AI off; returns the model to use for chat.
    private async Task<string> ModelAsync(CancellationToken ct)
    {
        if (!IsConfigured)
            throw new AiUnavailableException("OpenAI:ApiKey is not configured.");
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.AiEnabled, x.AiModel })
            .SingleOrDefaultAsync(ct);
        if (organization is { AiEnabled: false })
            throw new AiUnavailableException("AI assistance is turned off in settings.");
        return string.IsNullOrWhiteSpace(organization?.AiModel)
            ? ModelName(configuration)
            : organization.AiModel;
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
