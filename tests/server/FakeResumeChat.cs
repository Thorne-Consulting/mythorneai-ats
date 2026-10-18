using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.AI;
using MyThorneAI.Ats.Api.Contracts;

namespace MyThorneAI.Ats.Api.Tests;

// Stands in for the model in the API tests: fills the form from the text with a few regexes so the
// pipeline (text → form → verify → rows → search) runs without a key. Not a parser; only the shape matters.
public sealed partial class FakeResumeChat : IChatClient
{
    private static readonly string[] KnownSkills =
    [
        "react", "typescript", "node.js", "postgresql", "aws", "kubernetes", "terraform", "go", "python",
        "java", "sql", "tableau", "excel", "research", "data analysis", "c++", "figma", "django",
    ];

    public static ResumeForm Fill(string text)
    {
        var lines = text.Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var email = EmailRegex().Match(text).Value.ToLowerInvariant();
        var phone = PhoneRegex().Match(text).Value;
        var nameParts = lines.FirstOrDefault(line => line.Split(' ').Length is 2 or 3 && !line.Contains('@') && line.All(c => char.IsLetter(c) || c == ' ' || c == '-' || c == '.'))
            ?.Split(' ', 2) ?? [];
        var skills = KnownSkills
            .Where(skill => Regex.IsMatch(text, $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(skill)}(?![\p{{L}}\p{{N}}])", RegexOptions.IgnoreCase))
            .Select(skill => new ResumeSkill(skill, "Other"))
            .ToArray();
        // "Senior Platform Engineer, Example Systems, 2018 - 2026"
        var work = lines
            .Select(line => JobLineRegex().Match(line))
            .Where(match => match.Success)
            .Select(match => new ResumeWork(
                match.Groups["company"].Value, match.Groups["title"].Value, "Senior", "FullTime", null, null, null, false,
                new ResumeDate(int.Parse(match.Groups["start"].Value), null),
                match.Groups["end"].Success ? new ResumeDate(int.Parse(match.Groups["end"].Value), null) : null,
                null, [], skills.Select(x => x.Name).Take(2).ToArray()))
            .ToArray();
        var education = lines
            .Where(line => line.Contains("University", StringComparison.OrdinalIgnoreCase) || line.Contains("Bachelor", StringComparison.OrdinalIgnoreCase))
            .Take(1)
            .Select(line => new ResumeEducationEntry(line, null, "Bachelor", null, "Other", null, null, false, null, null, null))
            .ToArray();
        return new ResumeForm(
            new ResumeBasics(
                nameParts.ElementAtOrDefault(0), nameParts.ElementAtOrDefault(1), email.Length > 0 ? email : null,
                phone.Length > 0 ? phone : null, null, null, null, null, null, [], null),
            work, education, skills, [], [], [], [], [], []);
    }

    public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default)
    {
        var text = messages.Last(x => x.Role == ChatRole.User).Text;
        var json = JsonSerializer.Serialize(Fill(text));
        return Task.FromResult(new ChatResponse(new ChatMessage(ChatRole.Assistant, json))
        {
            Usage = new UsageDetails { InputTokenCount = text.Length / 4, OutputTokenCount = json.Length / 4 },
        });
    }

    public IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        throw new NotSupportedException();

    public object? GetService(Type serviceType, object? serviceKey = null) => null;

    public void Dispose() { }

    [GeneratedRegex(@"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"(?<!\d)(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}(?!\d)")]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"^(?<title>[A-Z][A-Za-z ]+?),\s*(?<company>[A-Z][A-Za-z ]+?),\s*(?<start>(?:19|20)\d{2})\s*-\s*(?:(?<end>(?:19|20)\d{2})|Present)$")]
    private static partial Regex JobLineRegex();
}
