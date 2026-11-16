using System.Globalization;
using System.Text.RegularExpressions;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// Contact details read from a resume's text with plain patterns, to fill the apply form. No AI:
/// it runs for anyone who uploads a file, and it must be instant.
/// </summary>
public static partial class ResumeAutofill
{
    public sealed record Fields(
        string? FirstName,
        string? LastName,
        string? Email,
        string? Phone,
        string? LinkedInUrl
    );

    public static Fields Read(string text)
    {
        var email = EmailPattern().Match(text) is { Success: true } e
            ? e.Value.TrimEnd('.').ToLowerInvariant()
            : null;
        var linkedIn = LinkedInPattern().Match(text) is { Success: true } l
            ? $"https://www.linkedin.com/in/{l.Groups[1].Value}"
            : null;
        // A number written with + is international; otherwise the usual 3-3-4 shape, so a zip code
        // or a year range next to it is not swallowed.
        var phone = (
            InternationalPhone().Match(text) is { Success: true } i
            && i.Value.Count(char.IsDigit) is >= 8 and <= 15
                ? i.Value
            : LocalPhone().Match(text) is { Success: true } p ? p.Value
            : null
        )?.Trim();
        phone = phone is null ? null : WhiteSpace().Replace(phone, " ");
        var (first, last) = Name(text);
        return new Fields(first, last, email, phone, linkedIn);
    }

    // The name is almost always the first short line made only of words.
    private static (string?, string?) Name(string text)
    {
        foreach (var raw in text.Split('\n').Take(8))
        {
            var line = raw.Trim();
            if (line.Length is < 3 or > 60 || !NameLine().IsMatch(line))
                continue;
            var words = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (words.Length is < 2 or > 4)
                continue;
            var cased = words
                .Select(w =>
                    w.All(c => !char.IsLetter(c) || char.IsUpper(c)) && w.Length > 1
                        ? CultureInfo.InvariantCulture.TextInfo.ToTitleCase(w.ToLowerInvariant())
                        : w
                )
                // A middle initial ("Andrew H. Peters") is not part of the last name.
                .Where(
                    (w, index) =>
                        index == 0 || index == words.Length - 1 || w.TrimEnd('.').Length > 1
                )
                .ToArray();
            return (cased[0], string.Join(' ', cased[1..]));
        }
        return (null, null);
    }

    [GeneratedRegex(@"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"linkedin\.com/in/([A-Za-z0-9_%-]{3,100})", RegexOptions.IgnoreCase)]
    private static partial Regex LinkedInPattern();

    [GeneratedRegex(@"\+\d[\d\s().-]{6,}\d")]
    private static partial Regex InternationalPhone();

    [GeneratedRegex(@"(?<![\d-])\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}(?![\d-])")]
    private static partial Regex LocalPhone();

    [GeneratedRegex(@"^[\p{L}][\p{L}'’.\- ]+$")]
    private static partial Regex NameLine();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhiteSpace();
}
