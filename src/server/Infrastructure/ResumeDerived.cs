using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>Pure functions over the parsed rows: the numbers the list filters on, and name normalisation.</summary>
public static partial class ResumeDerived
{
    /// <summary>Lower-case letters and digits only: "React.js" → "reactjs", "Google, Inc." → "google".</summary>
    public static string NormalizeName(string value, bool stripCompanySuffix = false)
    {
        var text = value.Trim().ToLowerInvariant();
        if (stripCompanySuffix)
            text = CompanySuffix().Replace(text, "");
        text = text.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(text.Length);
        foreach (var ch in text)
            if (char.IsLetterOrDigit(ch))
                builder.Append(ch);
        return builder.ToString();
    }

    public static string NormalizeSchool(string value) =>
        NormalizeName(SchoolPrefix().Replace(value.Trim().ToLowerInvariant(), ""));

    /// <summary>Whole months from a start to an end, where a missing month means the middle of the year.</summary>
    public static int? Months(int? startYear, int? startMonth, int? endYear, int? endMonth, DateOnly today)
    {
        if (startYear is null)
            return null;
        var start = startYear.Value * 12 + (startMonth ?? 6);
        var end = endYear is null ? today.Year * 12 + today.Month : endYear.Value * 12 + (endMonth ?? 6);
        return Math.Max(end - start, 0);
    }

    /// <summary>Years covered by the given roles, overlaps merged, to one decimal.</summary>
    public static decimal? YearsCovered(IEnumerable<WorkExperience> roles, DateOnly today)
    {
        var ranges = roles
            .Where(x => x.StartYear is not null)
            .Select(x => (
                Start: x.StartYear!.Value * 12 + (x.StartMonth ?? 6),
                End: x.IsCurrent || x.EndYear is null
                    ? today.Year * 12 + today.Month
                    : x.EndYear.Value * 12 + (x.EndMonth ?? 6)))
            .Where(x => x.End > x.Start)
            .OrderBy(x => x.Start)
            .ToList();
        if (ranges.Count == 0)
            return null;
        var total = 0;
        var (currentStart, currentEnd) = ranges[0];
        foreach (var (start, end) in ranges.Skip(1))
        {
            if (start <= currentEnd)
                currentEnd = Math.Max(currentEnd, end);
            else
            {
                total += currentEnd - currentStart;
                (currentStart, currentEnd) = (start, end);
            }
        }
        total += currentEnd - currentStart;
        return Math.Round(total / 12m, 1);
    }

    public static bool CountsAsExperience(WorkExperience role) =>
        role.EmploymentType is not (EmploymentType.Internship or EmploymentType.Volunteer);

    public static bool CountsAsManagement(WorkExperience role) =>
        role.ManagedPeople > 0 || role.Seniority is Seniority.Manager or Seniority.Director or Seniority.Executive;

    public static DegreeLevel HighestDegree(IEnumerable<Education> rows) =>
        rows.Select(x => x.DegreeLevel).DefaultIfEmpty(DegreeLevel.Unknown).MaxBy(DegreeRank);

    // Order a recruiter means by "at least a bachelor's".
    public static int DegreeRank(DegreeLevel level) => level switch
    {
        DegreeLevel.Doctorate => 7,
        DegreeLevel.Master => 6,
        DegreeLevel.Bachelor => 5,
        DegreeLevel.Associate => 4,
        DegreeLevel.Bootcamp => 3,
        DegreeLevel.Certificate => 2,
        DegreeLevel.HighSchool => 1,
        _ => 0,
    };

    /// <summary>The role to call "current": the one still running, else the most recent.</summary>
    public static WorkExperience? CurrentRole(IEnumerable<WorkExperience> roles) =>
        roles.OrderBy(x => x.SortOrder).FirstOrDefault(x => x.IsCurrent)
        ?? roles.OrderBy(x => x.SortOrder).FirstOrDefault();

    public static Seniority OverallSeniority(IEnumerable<WorkExperience> roles) =>
        roles.Select(x => x.Seniority).DefaultIfEmpty(Seniority.Unknown).Max();

    public static TEnum ParseEnum<TEnum>(string? value) where TEnum : struct, Enum =>
        Enum.TryParse<TEnum>(NormalizeName(value ?? ""), true, out var parsed) ? parsed : default;

    public static string TitleCase(string value) =>
        CultureInfo.InvariantCulture.TextInfo.ToTitleCase(value.ToLowerInvariant());

    [GeneratedRegex(@"\b(inc|llc|ltd|limited|corp|corporation|co|company|gmbh|plc|pvt|sa)\b\.?")]
    private static partial Regex CompanySuffix();

    [GeneratedRegex(@"^(the\s+)?(university\s+of\s+|)")]
    private static partial Regex SchoolPrefix();
}
