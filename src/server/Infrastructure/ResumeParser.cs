using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using FieldCure.DocumentParsers;
using MyThorneAI.Ats.Api.Contracts;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed partial class ResumeParser
{
    private const int MaxFileBytes = 10 * 1024 * 1024;
    private const int MaxExtractedCharacters = 250_000;

    private static readonly string[] KnownSkills =
    [
        "accessibility", "adobe", "agile", "angular", "ansible", "aws", "azure", "c#",
        "c++", "ci/cd", "css", "customer success", "data analysis", "data engineering",
        "datadog", "dbt", "design systems", "django", "docker", "dotnet", ".net", "excel",
        "figma", "gcp", "git", "github actions", "go", "golang", "graphql", "java",
        "javascript", "jenkins", "jira", "kafka", "kotlin", "kubernetes", "linux", "looker",
        "machine learning", "mongodb", "mysql", "next.js", "node.js", "notion", "observability",
        "openapi", "oracle", "pandas", "playwright", "postgresql", "power bi", "product design",
        "product management", "python", "react", "redis", "research", "rest", "ruby", "rust",
        "salesforce", "scrum", "snowflake", "sql", "tableau", "terraform", "testing",
        "typescript", "user research", "vue", "zendesk"
    ];

    private static readonly string[] TitleTerms =
    [
        "engineer", "developer", "designer", "manager", "director", "analyst", "architect",
        "consultant", "specialist", "lead", "scientist", "recruiter", "administrator", "owner",
        "president", "officer", "coordinator", "researcher", "strategist"
    ];

    public async Task<ResumeParseResult> ParseAsync(
        Stream stream,
        string fileName,
        CancellationToken cancellationToken
    )
    {
        if (!stream.CanRead)
            throw new InvalidDataException("The resume could not be read.");
        if (stream.CanSeek && stream.Length is <= 0 or > MaxFileBytes)
            throw new InvalidDataException("Resumes must be between 1 byte and 10 MB.");

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        if (extension == ".doc")
            throw new InvalidDataException(
                "Legacy DOC files cannot be parsed. Convert the resume to PDF or DOCX and try again."
            );
        var documentParser = DocumentParserFactory.GetParser(extension)
            ?? throw new InvalidDataException("Only PDF and DOCX resumes can be parsed.");

        using var content = new MemoryStream();
        await stream.CopyToAsync(content, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        var text = documentParser.ExtractText(content.ToArray());

        text = NormalizeDocumentText(text);
        if (text.Length < 40)
            throw new InvalidDataException(
                "No readable text was found. If this is a scanned PDF, run OCR and try again."
            );
        if (text.Length > MaxExtractedCharacters)
            text = text[..MaxExtractedCharacters];

        return BuildResult(text);
    }

    private static ResumeParseResult BuildResult(string text)
    {
        var lines = text
            .Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(line => line.Length is > 1 and < 240)
            .ToArray();
        var email = EmailRegex().Match(text).Value.ToLowerInvariant();
        var phone = PhoneRegex().Match(text).Value.Trim();
        var linkedIn = LinkedInRegex().Match(text).Value.TrimEnd('.', ',', ';');
        var name = FindName(lines, email);
        var currentTitle = lines.FirstOrDefault(line =>
            line.Length < 100
            && TitleTerms.Any(term => line.Contains(term, StringComparison.OrdinalIgnoreCase))
            && !line.Contains("experience", StringComparison.OrdinalIgnoreCase)
        );
        var location = lines.FirstOrDefault(line =>
            line.Length < 90 && LocationRegex().IsMatch(line)
        );
        var skills = KnownSkills
            .Where(skill => ContainsTerm(text, skill))
            .Select(skill => skill == ".net" ? "dotnet" : skill)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var jobTitles = lines
            .Where(line =>
                line.Length < 100
                && TitleTerms.Any(term => line.Contains(term, StringComparison.OrdinalIgnoreCase))
            )
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToArray();
        var education = lines
            .Where(line => EducationRegex().IsMatch(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(6)
            .ToArray();
        var certifications = lines
            .Where(line => CertificationRegex().IsMatch(line))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(8)
            .ToArray();
        var languages = ExtractLanguages(text);
        var years = EstimateYearsExperience(text);
        var summaryLines = lines
            .Where(line =>
                !line.Equals(name, StringComparison.OrdinalIgnoreCase)
                && !line.Contains(email, StringComparison.OrdinalIgnoreCase)
                && !SectionHeadingRegex().IsMatch(line)
            )
            .Take(4);
        var summary = string.Join(" ", summaryLines);
        if (summary.Length > 520)
            summary = summary[..517].TrimEnd() + "...";

        var warnings = new List<string>();
        if (string.IsNullOrWhiteSpace(email))
            warnings.Add("No email address was found.");
        if (skills.Length == 0)
            warnings.Add("No recognized skills were found; add them during review.");
        if (years is null)
            warnings.Add("Experience length could not be estimated from the dates in the resume.");
        var confidence = 25;
        confidence += string.IsNullOrWhiteSpace(email) ? 0 : 20;
        confidence += string.IsNullOrWhiteSpace(name) ? 0 : 15;
        confidence += string.IsNullOrWhiteSpace(currentTitle) ? 0 : 10;
        confidence += skills.Length == 0 ? 0 : 15;
        confidence += years is null ? 0 : 10;
        confidence += string.IsNullOrWhiteSpace(location) ? 0 : 5;

        var parts = name.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        return new ResumeParseResult(
            parts.FirstOrDefault() ?? string.Empty,
            parts.Length > 1 ? parts[1] : string.Empty,
            email,
            string.IsNullOrWhiteSpace(phone) ? null : phone,
            location,
            currentTitle,
            string.IsNullOrWhiteSpace(linkedIn) ? null : linkedIn,
            summary,
            skills,
            jobTitles,
            education,
            certifications,
            languages,
            years,
            Math.Min(confidence, 100),
            warnings.ToArray(),
            text
        );
    }

    private static string FindName(string[] lines, string email)
    {
        var candidate = lines.FirstOrDefault(line =>
            NameRegex().IsMatch(line)
            && !line.Contains('@')
            && !TitleTerms.Any(term => line.Contains(term, StringComparison.OrdinalIgnoreCase))
            && !SectionHeadingRegex().IsMatch(line)
        );
        if (!string.IsNullOrWhiteSpace(candidate))
            return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(candidate.ToLowerInvariant());
        if (string.IsNullOrWhiteSpace(email))
            return string.Empty;
        var local = email.Split('@')[0].Replace('.', ' ').Replace('-', ' ').Replace('_', ' ');
        return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(local);
    }

    private static decimal? EstimateYearsExperience(string text)
    {
        var years = YearRegex()
            .Matches(text)
            .Select(match => int.Parse(match.Value, CultureInfo.InvariantCulture))
            .Where(year => year is >= 1970 and <= 2100)
            .Distinct()
            .Order()
            .ToArray();
        if (years.Length == 0)
            return null;
        return Math.Clamp(Math.Min(years[^1], DateTime.UtcNow.Year) - years[0], 0, 50);
    }

    private static string[] ExtractLanguages(string text)
    {
        var section = LanguagesSectionRegex().Match(text);
        if (!section.Success)
            return [];
        var known = new[]
        {
            "Arabic", "Bengali", "Chinese", "English", "French", "German", "Hindi", "Italian",
            "Japanese", "Korean", "Polish", "Portuguese", "Russian", "Spanish", "Swedish", "Urdu"
        };
        return known.Where(language => ContainsTerm(section.Value, language)).ToArray();
    }

    private static bool ContainsTerm(string text, string term) =>
        Regex.IsMatch(
            text,
            $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(term)}(?![\p{{L}}\p{{N}}])",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant
        );

    private static string NormalizeDocumentText(string value)
    {
        var normalized = MultiSpaceRegex()
            .Replace(value.Replace('\r', '\n').Replace('\t', ' '), " ")
            .Replace(" \n", "\n");
        var lines = normalized.Split('\n');
        var builder = new StringBuilder(normalized.Length);
        var inMetadata = lines.FirstOrDefault()?.Trim() == "---";
        for (var index = 0; index < lines.Length; index++)
        {
            var line = lines[index].Trim();
            if (inMetadata)
            {
                if (index > 0 && line == "---")
                    inMetadata = false;
                continue;
            }
            line = MarkdownPrefixRegex().Replace(line, string.Empty);
            if (PageHeadingRegex().IsMatch(line) || line.Length == 0)
                continue;
            builder.AppendLine(line);
        }
        return builder.ToString().Trim();
    }

    [GeneratedRegex(@"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", RegexOptions.IgnoreCase)]
    private static partial Regex EmailRegex();

    [GeneratedRegex(@"^(?:#{1,6}|[-*+])\s+")]
    private static partial Regex MarkdownPrefixRegex();

    [GeneratedRegex(@"^Page\s+\d+$", RegexOptions.IgnoreCase)]
    private static partial Regex PageHeadingRegex();

    [GeneratedRegex(@"(?<!\d)(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}(?!\d)")]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"https?://(?:www\.)?linkedin\.com/in/[A-Z0-9_\-/]+", RegexOptions.IgnoreCase)]
    private static partial Regex LinkedInRegex();

    [GeneratedRegex(@"^[\p{L}][\p{L}'\-]+(?:\s+[\p{L}][\p{L}'\-]+){1,3}$")]
    private static partial Regex NameRegex();

    [GeneratedRegex(@"\b(?:remote|[A-Z][A-Za-z .'-]+,\s*[A-Z]{2})\b", RegexOptions.IgnoreCase)]
    private static partial Regex LocationRegex();

    [GeneratedRegex(@"\b(?:university|college|bachelor|master|ph\.?d|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?b\.?a\.?)\b", RegexOptions.IgnoreCase)]
    private static partial Regex EducationRegex();

    [GeneratedRegex(@"\b(?:certified|certification|certificate|pmp|cissp|cpa|aws certified|azure fundamentals)\b", RegexOptions.IgnoreCase)]
    private static partial Regex CertificationRegex();

    [GeneratedRegex(@"^(?:summary|profile|experience|work experience|education|skills|certifications|languages|projects|contact)$", RegexOptions.IgnoreCase)]
    private static partial Regex SectionHeadingRegex();

    [GeneratedRegex(@"\b(?:19|20)\d{2}\b")]
    private static partial Regex YearRegex();

    [GeneratedRegex(@"languages?\s*[:\n].{0,300}", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex LanguagesSectionRegex();

    [GeneratedRegex(@"[ ]{2,}")]
    private static partial Regex MultiSpaceRegex();
}
