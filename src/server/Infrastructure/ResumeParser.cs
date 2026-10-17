using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using FieldCure.DocumentParsers;
using MyThorneAI.Ats.Api.Contracts;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed partial class ResumeParser(LocalResumeOcr ocr)
{
    private const int MaxFileBytes = 10 * 1024 * 1024;
    private const int MaxExtractedCharacters = 250_000;
    // ponytail: name and location are only looked for in the top lines; widen if real resumes bury them.
    private const int HeaderLines = 8;

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
        var bytes = content.ToArray();
        var text = documentParser.ExtractText(bytes);
        if (string.IsNullOrWhiteSpace(text) && extension == ".docx")
            text = ExtractDocxText(bytes);

        text = NormalizeDocumentText(text);
        if (text.Length < 40 && extension == ".pdf")
        {
            var ocrPdf = await ocr.ProcessAsync(bytes, cancellationToken);
            if (ocrPdf is not null)
                text = NormalizeDocumentText(documentParser.ExtractText(ocrPdf));
        }
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
        var (name, nameLine) = FindName(lines, email);
        var currentTitle = lines.FirstOrDefault(line =>
            line.Length < 100
            && TitleTerms.Any(term => line.Contains(term, StringComparison.OrdinalIgnoreCase))
            && !line.Contains("experience", StringComparison.OrdinalIgnoreCase)
        );
        var header = lines.Take(HeaderLines).ToArray();
        var location = FindLocation(header);
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
                line != nameLine
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

    private static (string Name, string? Line) FindName(string[] lines, string email)
    {
        var local = new string(email.Split('@')[0].Where(char.IsLetter).ToArray());
        foreach (var raw in lines.Take(HeaderLines))
        {
            if (raw.Contains('@') || ResumeLabelRegex().IsMatch(raw) || SectionHeadingRegex().IsMatch(raw))
                continue;
            var line = SplitGluedName(MultiSpaceRegex().Replace(NicknameRegex().Replace(raw, " "), " ").Trim(), local);
            if (!NameRegex().IsMatch(line) || TitleTerms.Any(term => ContainsTerm(line, term)))
                continue;
            // Middle initials ("Miranda W. Hudson", "Claudio V di Leo") are dropped.
            var words = line.Split(' ').Where(word => word.TrimEnd('.').Length > 1).ToArray();
            if (words.Length < 2)
                continue;
            var name = string.Join(' ', words);
            return (name.Any(char.IsLower)
                ? name
                : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(name.ToLowerInvariant()), raw);
        }
        if (string.IsNullOrWhiteSpace(email))
            return (string.Empty, null);
        var fallback = email.Split('@')[0].Replace('.', ' ').Replace('-', ' ').Replace('_', ' ');
        return (CultureInfo.InvariantCulture.TextInfo.ToTitleCase(fallback), null);
    }

    public static string? FindLocation(IEnumerable<string> headerLines)
    {
        var lines = headerLines.ToArray();
        var match = lines.Select(line => CityStateRegex().Match(line)).FirstOrDefault(value => value.Success);
        if (match is null)
            return lines.Any(line => ContainsTerm(line, "remote")) ? "Remote" : null;
        // "1177 Mass Ave. Cambridge, MA" has no comma before the city, so drop the street words.
        var city = match.Groups["city"].Value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var street = Array.FindLastIndex(city, word => StreetWords.Contains(word.TrimEnd('.')));
        return $"{string.Join(' ', street > 0 ? city[(street + 1)..] : city)}, {match.Groups["state"].Value}";
    }

    private static readonly HashSet<string> StreetWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "street", "st", "avenue", "ave", "av", "drive", "dr", "road", "rd", "boulevard", "blvd",
        "lane", "ln", "way", "court", "ct", "place", "pl", "parkway", "pkwy",
    };

    // PDFs set in small caps can lose the space: "YasmineHejazi", or "SHIRLEYGALLO" next to sgallo@.
    private static string SplitGluedName(string line, string emailLocal)
    {
        if (line.Length < 5 || !line.All(char.IsLetter))
            return line;
        var camel = CamelCaseRegex().Replace(line, " ");
        if (camel != line)
            return camel;
        for (var length = line.Length - 2; length >= 3; length--)
            if (emailLocal.EndsWith(line[^length..], StringComparison.OrdinalIgnoreCase))
                return $"{line[..^length]} {line[^length..]}";
        return line;
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

    private static string ExtractDocxText(byte[] bytes)
    {
        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        var document = archive.GetEntry("word/document.xml");
        if (document is null)
            return string.Empty;
        using var stream = document.Open();
        var xml = XDocument.Load(stream);
        return string.Join(
            "\n",
            xml.Descendants().Where(node => node.Name.LocalName == "t").Select(node => node.Value)
        );
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

    // Two to four words; anything after the first may be a bare initial.
    [GeneratedRegex(@"^[\p{L}][\p{L}'\-]+(?:\s+(?:\p{L}\.?|[\p{L}][\p{L}'\-]+)){1,3}$")]
    private static partial Regex NameRegex();

    [GeneratedRegex(@"[“""][^”""]*[”""]")]
    private static partial Regex NicknameRegex();

    [GeneratedRegex(@"(?<=\p{Ll})(?=\p{Lu})")]
    private static partial Regex CamelCaseRegex();

    [GeneratedRegex(@"\b(?:sample|resumes?|résumé|curriculum vitae|cv|address)\b", RegexOptions.IgnoreCase)]
    private static partial Regex ResumeLabelRegex();

    // "Cambridge, MA" out of "100 Charles St., Cambridge, MA 02139 ☞ 617.123.4567"; case-sensitive on purpose.
    [GeneratedRegex(@"(?<!\p{L})(?<city>\p{Lu}[\p{L}.'\-]*(?:\s+\p{Lu}[\p{L}.'\-]*){0,3}),\s*(?<state>AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?!\p{L})")]
    private static partial Regex CityStateRegex();

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
