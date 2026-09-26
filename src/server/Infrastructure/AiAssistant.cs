using System.Net.Http.Json;
using System.Text.Json;

namespace MyThorneAI.Ats.Api.Infrastructure;

public interface IAiAssistant
{
    Task<string> CompleteAsync(string instruction, string input, CancellationToken ct);
}

public sealed class OpenAiAssistant(
    HttpClient http,
    IConfiguration configuration
) : IAiAssistant
{
    public async Task<string> CompleteAsync(string instruction, string input, CancellationToken ct)
    {
        var key = configuration["OpenAI:ApiKey"];
        if (string.IsNullOrWhiteSpace(key))
            throw new InvalidOperationException("OpenAI:ApiKey is not configured.");
        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions");
        request.Headers.Authorization = new("Bearer", key);
        request.Content = JsonContent.Create(new
        {
            model = configuration["OpenAI:Model"] ?? "gpt-4o-mini",
            temperature = 0.2,
            messages = new[]
            {
                new { role = "system", content = instruction },
                new { role = "user", content = input },
            },
        });
        using var response = await http.SendAsync(request, ct);
        response.EnsureSuccessStatusCode();
        using var document = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        return document.RootElement.GetProperty("choices")[0].GetProperty("message")
            .GetProperty("content").GetString() ?? "";
    }
}
