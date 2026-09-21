using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class ResumeProfileMapper
{
    public static void Apply(
        Candidate candidate,
        ResumeParseResult parsed,
        DateTimeOffset? parsedAt = null
    )
    {
        var now = parsedAt ?? DateTimeOffset.UtcNow;
        candidate.ResumeText = parsed.RawText;
        candidate.ResumeSummary = parsed.Summary;
        candidate.ResumeSkills = parsed.Skills;
        candidate.ResumeJobTitles = parsed.JobTitles;
        candidate.ResumeEducation = parsed.Education;
        candidate.ResumeCertifications = parsed.Certifications;
        candidate.ResumeLanguages = parsed.Languages;
        candidate.ResumeYearsExperience = parsed.YearsExperience;
        candidate.ResumeParsedAt = now;
        candidate.UpdatedAt = now;
    }
}
