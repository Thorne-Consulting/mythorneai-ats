using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
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

public interface IAiAssistant
{
    bool IsConfigured { get; }

    Task<string> CompleteAsync(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null,
        bool json = false
    );

    Task<float[]> EmbedAsync(string text, CancellationToken ct, AiContext? context = null);

    Task<string> TranscribeAsync(
        Stream audio,
        string fileName,
        CancellationToken ct,
        AiContext? context = null
    );
}

public sealed class OpenAiAssistant(
    HttpClient http,
    IConfiguration configuration,
    IServiceScopeFactory scopes,
    ILogger<OpenAiAssistant> logger
) : IAiAssistant
{
    public bool IsConfigured => !string.IsNullOrWhiteSpace(configuration["OpenAI:ApiKey"]);

    public async Task<string> CompleteAsync(
        string instruction,
        string input,
        CancellationToken ct,
        AiContext? context = null,
        bool json = false
    )
    {
        var model = await ModelAsync(ct);
        using var request = Post("chat/completions");
        request.Content = JsonContent.Create(
            new
            {
                model,
                temperature = 0.2,
                response_format = json ? new { type = "json_object" } : null,
                messages = new[]
                {
                    new { role = "system", content = instruction },
                    new { role = "user", content = input },
                },
            }
        );
        var clock = Stopwatch.StartNew();
        string output = "";
        int prompt = 0,
            completion = 0;
        try
        {
            using var response = await http.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();
            using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
            var root = document.RootElement;
            output = root.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
            if (root.TryGetProperty("usage", out var usage))
            {
                prompt = usage.GetProperty("prompt_tokens").GetInt32();
                completion = usage.GetProperty("completion_tokens").GetInt32();
            }
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, instruction + "\n\n" + input, output, prompt, completion, clock, null);
            return output;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            await AiCallLogWriter.WriteAsync(scopes, logger, context, model, instruction + "\n\n" + input, output, prompt, completion, clock, exception.Message);
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
            ? configuration["OpenAI:Model"] ?? "gpt-4o-mini"
            : organization.AiModel;
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
