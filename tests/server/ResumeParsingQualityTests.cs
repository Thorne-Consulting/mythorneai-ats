using System.Text;
using System.Text.RegularExpressions;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Scores ResumeParser against hand-checked answers for every seeded sample resume
// (src/server/Data/Seed/Resumes). The baseline is the score today: the test fails if the
// parser gets worse, and when it gets better, raise the baseline to lock the gain in.
public sealed partial class ResumeParsingQualityTests
{
    // Read off each resume by hand. Null means the resume doesn't state it, so it isn't scored.
    private sealed record Expected(string File, string Name, string Email, string? Phone, string? Location);

    private static readonly Expected[] Answers =
    [
        new("Andrew-Peters.pdf", "Andrew Peters", "andrewpeters@uw.edu", "206-110-0089", "Seattle, WA"),
        new("Arts-Media-Marketing-Sample-Resume.pdf", "Jalila Asha", "jasha@uw.edu", "206.222.3344", "Seattle, WA"),
        new("D-Daniel-Garcia.docx.pdf", "Daniel Garcia", "jfg@email.com", "(206) 999-9876", null),
        new("E-Huy-Nguyen.docx.pdf", "Huy Nguyen", "hnguyen@uw.edu", "(206) 345-6767", "Seattle, WA"),
        new("Health-Sample-Resume.pdf", "Eniola Viglionese", "viglionesee@uw.edu", "(306) 999-1234", null),
        new("Miranda-Hudson.pdf", "Miranda Hudson", "mhudson@uw.edu", "123-123-4557", "Seattle, WA"),
        new("Non-profit-Social-Justice-Education-Resume-1.pdf", "Shirley Gallo", "sgallo@uw.edu", "(206) 555-3281", null),
        new("Non-profit-Social-Justice-Education-Resume-2.pdf", "Yasmine Hejazi", "yhejazi@uw.edu", "206.555.5555", null),
        new("Physical-and-LIfe-Science-Sample-Resume.pdf", "Stephen Artur", "sartur@uw.edu", "360-222-5555", null),
        new("Undergraduate-Sample-Resume.pdf", "Morgan Lander", "landerm@uw.edu", "(206) 123-4567", "Seattle, WA"),
        new("Climate-Conservation-Sustainability-Resume.pdf", "Marina Johnson", "marinajohnson@uw.edu", "(206) 555-7890", "Seattle, WA"),
        new("Law-Government-Policy-Resume.pdf", "Taylor Morgan", "taylorm@uw.edu", "(206) 555-4567", "Seattle, WA"),
        new("AS-Resume-Sample-22_AM-approved.docx", "Ally Bama", "ally.bama@crimson.ua.edu", "205-348-5848", null),
        new("Business-Resume-Sample-22_SC-revised.docx", "Mary Jane Washington", "mjwash@gmail.com", "205.348.2691", null),
        new("CIS-Resume-Sample-22_AB-approved.docx", "Casey Carter", "casey.carter@gmail.com", "205-348-5848", null),
        new("Education-Resume-Sample-22_TG-approved.docx", "Taylor Thompson", "taylor_thompson@gmail.com", "205-348-5848", null),
        new("Engineering-Resume-Sample-22_Dill-approved.docx", "Morgan Martinez", "mmartinez7@crimson.ua.edu", "205-348-4839", null),
        new("First-Year-Resume-Sample-22.docx", "Frankie First-Year", "frankie.firstyear@crimson.ua.edu", "205-348-5848", null),
        new("HES-Resume-Sample-22_PM-approved.docx", "Peyton Parker", "peyton.parker@gmail.com", "205-348-5848", null),
        new("Nursing-Sample-Resume-22_KWG-approved-1.docx", "Jordan Jones", "jordan.jones@gmail.com", "205-348-5848", "Tuscaloosa, AL"),
        new("SW-Resume-Sample-22_TG-approved.docx", "Kendall King", "kmking9@crimson.ua.edu", "205-348-5848", null),
        new("MITCAPD-MastersII.pdf", "Charles Meng", "csmeng@mit.edu", "617.123.4567", "Cambridge, MA"),
        new("MITCAPD-PhDI.pdf", "Jean Upeg", "upeg@mit.edu", null, "Cambridge, MA"),
        new("MITCAPD-PostDocI.pdf", "Claudio di Leo", "phd@mit.edu", "617-555-5555", "Cambridge, MA"),
    ];

    // Correct answers out of the scored resumes, after the name and location fixes (2026-10-17, no ocrmypdf).
    private static readonly Dictionary<string, int> Baseline = new()
    {
        ["parsed"] = 22,
        ["name"] = 22,
        ["email"] = 22,
        ["phone"] = 21,
        ["location"] = 9,
    };

    [Fact]
    public async Task Parser_scores_at_least_the_baseline_on_the_seed_resumes()
    {
        var ct = TestContext.Current.CancellationToken;
        var assembly = typeof(SeedData).Assembly;
        var resources = assembly.GetManifestResourceNames()
            .Where(name => name.Contains(".Data.Seed.Resumes.", StringComparison.Ordinal))
            .ToDictionary(name => name[(name.IndexOf(".Resumes.", StringComparison.Ordinal) + 9)..]);
        resources.Keys.Order().ShouldBe(Answers.Select(x => x.File).Order(), "every seed resume needs an answer here");

        var parser = new ResumeParser(new LocalResumeOcr());
        var hits = Baseline.Keys.ToDictionary(key => key, _ => 0);
        var scored = Baseline.Keys.ToDictionary(key => key, _ => 0);
        var report = new StringBuilder("| file | name | email | phone | location |\n|---|---|---|---|---|\n");

        foreach (var answer in Answers)
        {
            await using var stream = assembly.GetManifestResourceStream(resources[answer.File])!;
            Contracts.ResumeParseResult? parsed = null;
            string? error = null;
            try { parsed = await parser.ParseAsync(stream, answer.File, ct); }
            catch (InvalidDataException exception) { error = exception.Message; }

            Score("parsed", true, parsed is not null);
            var cells = new[]
            {
                Score("name", true, parsed is not null && Name(parsed.FirstName + " " + parsed.LastName) == Name(answer.Name), parsed?.FirstName + " " + parsed?.LastName),
                Score("email", true, string.Equals(parsed?.Email, answer.Email, StringComparison.OrdinalIgnoreCase), parsed?.Email),
                Score("phone", answer.Phone is not null, Digits(parsed?.Phone) == Digits(answer.Phone), parsed?.Phone),
                Score("location", answer.Location is not null, string.Equals(Location(parsed?.Location), answer.Location, StringComparison.OrdinalIgnoreCase), parsed?.Location),
            };
            report.AppendLine($"| {answer.File} | {(error is null ? string.Join(" | ", cells) : $"failed: {error} | | |")} |");
        }

        report.Insert(0, string.Join("  ", Baseline.Keys.Select(key => $"{key} {hits[key]}/{scored[key]}")) + "\n\n");
        // Passing tests hide their output, so the scorecard also lands in tests/server/TestResults.
        var reportPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../TestResults/resume-parsing-quality.md"));
        Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
        await File.WriteAllTextAsync(reportPath, report.ToString(), ct);
        TestContext.Current.TestOutputHelper?.WriteLine(report.ToString());
        foreach (var (key, floor) in Baseline)
            hits[key].ShouldBeGreaterThanOrEqualTo(floor, $"{key} got worse.\n{report}");

        string Score(string key, bool counts, bool correct, string? value = null)
        {
            if (!counts)
                return "–";
            scored[key]++;
            if (correct)
                hits[key]++;
            return (correct ? "✓ " : "✗ ") + value?.Trim().Replace("|", "\\|");
        }
    }

    [Theory]
    [InlineData("Seattle, WA | jasha@uw.edu | 206.222.3344", "Seattle, WA")]
    [InlineData("100 Charles St., Cambridge, MA 02139 ☞ 617.123.4567", "Cambridge, MA")]
    [InlineData("1177 Mass Ave. Cambridge, MA 02139", "Cambridge, MA")]
    [InlineData("St. Louis, MO", "St. Louis, MO")]
    [InlineData("New York, NY 10001", "New York, NY")]
    [InlineData("Bachelor of Arts, May 2023", null)]
    public void Location_is_just_the_city_and_state(string line, string? expected) =>
        ResumeParser.FindLocation([line]).ShouldBe(expected);

    // "Mary Jane “MJ” Washington" and "Taylor R. Thompson" count as the plain name.
    private static string Name(string value) =>
        Spaces().Replace(Nickname().Replace(Initial().Replace(value, " "), " "), " ").Trim().ToLowerInvariant();

    private static string Digits(string? value) =>
        new((value ?? string.Empty).Where(char.IsDigit).ToArray());

    private static string? Location(string? value) =>
        value is null ? null : Zip().Replace(value.Trim(), string.Empty);

    [GeneratedRegex(@"\b\p{L}\.(?=\s)")]
    private static partial Regex Initial();

    [GeneratedRegex(@"[“""][^”""]*[”""]")]
    private static partial Regex Nickname();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"\s+\d{5}(?:-\d{4})?$")]
    private static partial Regex Zip();
}
