using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// Steps 3 to 5 of parsing: check the form against the text, replace the candidate's parsed rows,
/// and recompute the columns the list filters on. The candidate must be loaded with
/// <see cref="WithProfile"/> so the old rows are tracked and get deleted.
/// </summary>
public static class ResumeProfileWriter
{
    public static IQueryable<Candidate> WithProfile(this IQueryable<Candidate> candidates) =>
        candidates
            .Include(x => x.WorkExperiences).ThenInclude(x => x.Skills)
            .Include(x => x.Educations)
            .Include(x => x.Skills)
            .Include(x => x.Certifications)
            .Include(x => x.Languages)
            .Include(x => x.Projects).ThenInclude(x => x.Skills)
            .Include(x => x.Publications)
            .Include(x => x.Awards)
            .AsSplitQuery();

    public static async Task ApplyAsync(
        AtsDbContext db,
        Candidate candidate,
        ResumeExtraction extraction,
        string text,
        CancellationToken ct,
        DateOnly? today = null
    )
    {
        var now = DateTimeOffset.UtcNow;
        var date = today ?? DateOnly.FromDateTime(now.UtcDateTime);
        var form = extraction.Form;
        var haystack = ResumeDerived.NormalizeName(text);
        bool Found(string? value) =>
            !string.IsNullOrWhiteSpace(value) && haystack.Contains(ResumeDerived.NormalizeName(value));

        db.WorkExperiences.RemoveRange(candidate.WorkExperiences);
        db.Educations.RemoveRange(candidate.Educations);
        db.CandidateSkills.RemoveRange(candidate.Skills);
        db.Certifications.RemoveRange(candidate.Certifications);
        db.CandidateLanguages.RemoveRange(candidate.Languages);
        db.Projects.RemoveRange(candidate.Projects);
        db.Publications.RemoveRange(candidate.Publications);
        db.Awards.RemoveRange(candidate.Awards);
        candidate.WorkExperiences = [];
        candidate.Educations = [];
        candidate.Skills = [];
        candidate.Certifications = [];
        candidate.Languages = [];
        candidate.Projects = [];
        candidate.Publications = [];
        candidate.Awards = [];

        // New rows are added explicitly: rows EF only discovers through a navigation can end up
        // tracked as updates, which then fail because there is nothing to update.
        var lookups = new Lookups(db);

        // Work history, most recent first as the model was told; SortOrder pins it either way.
        var roles = new List<WorkExperience>();
        foreach (var (job, index) in form.Work.Select((job, index) => (job, index)))
        {
            var company = job.Company?.Trim() ?? "";
            var role = new WorkExperience
            {
                CandidateId = candidate.Id,
                CompanyId = company.Length > 0 ? (await lookups.CompanyAsync(company, ct)).Id : null,
                CompanyNameRaw = company,
                Title = job.Title?.Trim() ?? "",
                Seniority = ResumeDerived.ParseEnum<Seniority>(job.Seniority),
                EmploymentType = ResumeDerived.ParseEnum<EmploymentType>(job.EmploymentType),
                City = Clean(job.City),
                Region = Clean(job.Region),
                Country = Clean(job.Country),
                IsRemote = job.IsRemote ?? false,
                StartYear = Year(job.Start?.Year),
                StartMonth = Month(job.Start?.Month),
                EndYear = Year(job.End?.Year),
                EndMonth = Month(job.End?.Month),
                IsCurrent = job.End is null || job.End.Year is null,
                ManagedPeople = job.ManagedPeople is > 0 ? job.ManagedPeople : null,
                Description = string.Join("\n", job.Bullets.Select(x => x.Trim()).Where(x => x.Length > 0)),
                SortOrder = index,
                Verified = Found(company) && Found(job.Title),
            };
            role.DurationMonths = ResumeDerived.Months(role.StartYear, role.StartMonth, role.IsCurrent ? null : role.EndYear, role.EndMonth, date);
            foreach (var name in job.SkillsUsed)
            {
                var skill = await lookups.SkillAsync(name, "Other", ct);
                if (skill is not null && role.Skills.All(x => x.SkillId != skill.Id))
                    role.Skills.Add(new WorkExperienceSkill { WorkExperienceId = role.Id, SkillId = skill.Id });
            }
            roles.Add(role);
        }
        candidate.WorkExperiences = roles;
        db.WorkExperiences.AddRange(roles);

        candidate.Educations = form.Education.Select((entry, index) => new Education
        {
            CandidateId = candidate.Id,
            SchoolNameRaw = entry.School?.Trim() ?? "",
            Degree = Clean(entry.Degree),
            DegreeLevel = ResumeDerived.ParseEnum<DegreeLevel>(entry.DegreeLevel),
            Field = Clean(entry.Field),
            FieldNormalized = ResumeDerived.ParseEnum<FieldOfStudy>(entry.FieldNormalized),
            StartYear = Year(entry.StartYear),
            EndYear = Year(entry.EndYear),
            IsInProgress = entry.InProgress ?? false,
            Gpa = entry.Gpa is > 0 and < 100 ? entry.Gpa : null,
            GpaScale = entry.GpaScale is > 0 and < 100 ? entry.GpaScale : null,
            Honors = Clean(entry.Honors),
            SortOrder = index,
            Verified = Found(entry.School) && (entry.Degree is null || Found(entry.Degree)),
        }).ToList();
        foreach (var education in candidate.Educations.Where(x => x.SchoolNameRaw.Length > 0))
            education.SchoolId = (await lookups.SchoolAsync(education.SchoolNameRaw, ct)).Id;
        db.Educations.AddRange(candidate.Educations);

        // Skills: the skills section first, then anything only a job mentioned.
        var skillRows = new Dictionary<Guid, CandidateSkill>();
        foreach (var entry in form.Skills)
        {
            var skill = await lookups.SkillAsync(entry.Name, entry.Category, ct);
            if (skill is not null && !skillRows.ContainsKey(skill.Id))
                skillRows[skill.Id] = new CandidateSkill
                {
                    CandidateId = candidate.Id,
                    SkillId = skill.Id,
                    Source = SkillSource.SkillsSection,
                    Verified = Found(entry.Name),
                };
        }
        foreach (var role in roles)
        foreach (var used in role.Skills)
        {
            if (skillRows.TryGetValue(used.SkillId, out var existing))
                existing.Source = existing.Source == SkillSource.SkillsSection ? SkillSource.Both : existing.Source;
            else
                skillRows[used.SkillId] = new CandidateSkill
                {
                    CandidateId = candidate.Id,
                    SkillId = used.SkillId,
                    Source = SkillSource.JobDescription,
                    Verified = Found(lookups.Name(used.SkillId)),
                };
        }
        foreach (var row in skillRows.Values)
        {
            var usedIn = roles.Where(role => role.Skills.Any(x => x.SkillId == row.SkillId)).ToList();
            row.YearsUsed = ResumeDerived.YearsCovered(usedIn, date);
            row.LastUsedYear = usedIn.Count == 0 ? null : usedIn.Max(role => role.IsCurrent ? date.Year : role.EndYear);
        }
        candidate.Skills = skillRows.Values.ToList();
        db.CandidateSkills.AddRange(candidate.Skills);

        candidate.Certifications = form.Certifications.Select(entry => new Certification
        {
            CandidateId = candidate.Id,
            Name = entry.Name.Trim(),
            Issuer = Clean(entry.Issuer),
            Year = Year(entry.Year),
            ExpiresYear = Year(entry.ExpiresYear),
            Url = Clean(entry.Url),
            Verified = Found(entry.Name),
        }).ToList();
        db.Certifications.AddRange(candidate.Certifications);

        candidate.Languages = form.Languages
            .GroupBy(x => x.Language.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new CandidateLanguage
            {
                CandidateId = candidate.Id,
                Language = ResumeDerived.TitleCase(group.Key),
                Proficiency = ResumeDerived.ParseEnum<LanguageProficiency>(group.First().Proficiency),
            }).ToList();
        db.CandidateLanguages.AddRange(candidate.Languages);

        var projects = new List<Project>();
        foreach (var entry in form.Projects)
        {
            var project = new Project
            {
                CandidateId = candidate.Id,
                Name = entry.Name.Trim(),
                Description = entry.Description?.Trim() ?? "",
                Url = Clean(entry.Url),
                Year = Year(entry.Year),
            };
            foreach (var name in entry.SkillsUsed)
            {
                var skill = await lookups.SkillAsync(name, "Other", ct);
                if (skill is not null && project.Skills.All(x => x.SkillId != skill.Id))
                    project.Skills.Add(new ProjectSkill { ProjectId = project.Id, SkillId = skill.Id });
            }
            projects.Add(project);
        }
        candidate.Projects = projects;
        db.Projects.AddRange(projects);

        candidate.Publications = form.Publications.Select(entry => new Publication
        {
            CandidateId = candidate.Id,
            Title = entry.Title.Trim(),
            Venue = Clean(entry.Venue),
            Year = Year(entry.Year),
            Url = Clean(entry.Url),
        }).ToList();
        db.Publications.AddRange(candidate.Publications);
        candidate.Awards = form.Awards.Select(entry => new Award
        {
            CandidateId = candidate.Id,
            Name = entry.Name.Trim(),
            Issuer = Clean(entry.Issuer),
            Year = Year(entry.Year),
        }).ToList();
        db.Awards.AddRange(candidate.Awards);

        // Contact details only fill gaps: the record's own name, email and phone stay as entered.
        var basics = form.Basics;
        candidate.Phone ??= Clean(basics.Phone);
        candidate.City = Clean(basics.City);
        candidate.Region = Clean(basics.Region);
        candidate.Country = Clean(basics.Country);
        candidate.Location ??= Clean(string.Join(", ", new[] { candidate.City, candidate.Region, candidate.Country }.Where(x => x is not null)));
        candidate.WillingToRelocate = basics.WillingToRelocate;
        candidate.OpenToRemote = basics.OpenToRemote;
        var links = basics.Links.Where(x => Uri.IsWellFormedUriString(WithScheme(x.Url), UriKind.Absolute)).ToList();
        candidate.LinkedInUrl ??= links.FirstOrDefault(x => Kind(x) == "linkedin")?.Url is { } linkedIn ? WithScheme(linkedIn) : null;
        candidate.GitHubUrl = links.FirstOrDefault(x => Kind(x) == "github")?.Url is { } gitHub ? WithScheme(gitHub) : null;
        candidate.PortfolioUrl = links.FirstOrDefault(x => Kind(x) == "portfolio")?.Url is { } portfolio ? WithScheme(portfolio) : null;
        candidate.OtherUrls = links.Where(x => Kind(x) is not ("linkedin" or "github" or "portfolio")).Select(x => WithScheme(x.Url)).ToArray();
        candidate.ResumeSummary = Clean(basics.Summary);

        // Computed columns.
        var current = ResumeDerived.CurrentRole(roles);
        candidate.CurrentTitle = current?.Title is { Length: > 0 } title ? title : candidate.CurrentTitle;
        candidate.CurrentEmployerId = current?.CompanyId;
        candidate.Seniority = ResumeDerived.OverallSeniority(roles);
        candidate.ResumeYearsExperience = ResumeDerived.YearsCovered(roles.Where(ResumeDerived.CountsAsExperience), date);
        candidate.YearsManagement = ResumeDerived.YearsCovered(roles.Where(ResumeDerived.CountsAsManagement), date);
        candidate.HighestDegreeLevel = ResumeDerived.HighestDegree(candidate.Educations);

        // Flat copies for the list filters and the in-memory ranking.
        candidate.ResumeSkills = skillRows.Values.Select(x => lookups.Name(x.SkillId).ToLowerInvariant()).Distinct().Order(StringComparer.Ordinal).ToArray();
        candidate.ResumeJobTitles = roles.Select(x => x.Title).Where(x => x.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        candidate.ResumeEducation = candidate.Educations
            .Select(x => string.Join(", ", new[] { x.Degree, x.Field, x.SchoolNameRaw, x.EndYear?.ToString() }.Where(v => !string.IsNullOrWhiteSpace(v))))
            .ToArray();
        candidate.ResumeCertifications = candidate.Certifications.Select(x => x.Name).ToArray();
        candidate.ResumeLanguages = candidate.Languages.Select(x => x.Language).ToArray();

        candidate.ResumeText = text;
        candidate.ResumeTextHash = extraction.TextHash;
        candidate.ResumeProfileJson = extraction.RawJson;
        candidate.ResumeModel = extraction.Model;
        candidate.ResumePromptVersion = extraction.PromptVersion;
        candidate.ResumeParsedAt = now;
        candidate.UpdatedAt = now;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static int? Year(int? value) => value is >= 1950 and <= 2100 ? value : null;

    private static int? Month(int? value) => value is >= 1 and <= 12 ? value : null;

    private static string Kind(ResumeLink link) => link.Kind?.Trim().ToLowerInvariant() switch
    {
        { } kind when kind.Contains("linkedin") => "linkedin",
        { } kind when kind.Contains("github") => "github",
        { } kind when kind.Contains("portfolio") || kind.Contains("website") => "portfolio",
        _ => link.Url.Contains("linkedin.com", StringComparison.OrdinalIgnoreCase) ? "linkedin"
            : link.Url.Contains("github.com", StringComparison.OrdinalIgnoreCase) ? "github"
            : "other",
    };

    private static string WithScheme(string url) =>
        url.Contains("://", StringComparison.Ordinal) ? url.Trim() : "https://" + url.Trim();

    // Get-or-create for the shared name tables, remembered for the length of one parse.
    private sealed class Lookups(AtsDbContext db)
    {
        private readonly Dictionary<string, Skill> _skills = new();
        private readonly Dictionary<Guid, string> _skillNames = new();
        private readonly Dictionary<string, Company> _companies = new();
        private readonly Dictionary<string, School> _schools = new();

        public string Name(Guid skillId) => _skillNames[skillId];

        public async Task<Skill?> SkillAsync(string name, string category, CancellationToken ct)
        {
            var clean = name.Trim();
            var key = ResumeDerived.NormalizeName(clean);
            if (key.Length == 0 || clean.Length > 120)
                return null;
            if (!_skills.TryGetValue(key, out var skill))
            {
                skill = await db.Skills.FirstOrDefaultAsync(x => x.NormalizedName == key || x.Aliases.Contains(key), ct)
                    ?? db.Skills.Local.FirstOrDefault(x => x.NormalizedName == key);
                if (skill is null)
                {
                    skill = new Skill
                    {
                        Name = clean,
                        NormalizedName = key,
                        Category = ResumeDerived.ParseEnum<SkillCategory>(category),
                    };
                    db.Skills.Add(skill);
                }
                _skills[key] = skill;
                _skillNames[skill.Id] = skill.Name;
            }
            return skill;
        }

        public async Task<Company> CompanyAsync(string name, CancellationToken ct)
        {
            var key = ResumeDerived.NormalizeName(name, stripCompanySuffix: true);
            if (key.Length == 0)
                key = ResumeDerived.NormalizeName(name);
            if (!_companies.TryGetValue(key, out var company))
            {
                company = await db.Companies.FirstOrDefaultAsync(x => x.NormalizedName == key, ct)
                    ?? db.Companies.Local.FirstOrDefault(x => x.NormalizedName == key);
                if (company is null)
                {
                    company = new Company { Name = name.Trim(), NormalizedName = key };
                    db.Companies.Add(company);
                }
                _companies[key] = company;
            }
            return company;
        }

        public async Task<School> SchoolAsync(string name, CancellationToken ct)
        {
            var key = ResumeDerived.NormalizeSchool(name);
            if (key.Length == 0)
                key = ResumeDerived.NormalizeName(name);
            if (!_schools.TryGetValue(key, out var school))
            {
                school = await db.Schools.FirstOrDefaultAsync(x => x.NormalizedName == key, ct)
                    ?? db.Schools.Local.FirstOrDefault(x => x.NormalizedName == key);
                if (school is null)
                {
                    school = new School { Name = name.Trim(), NormalizedName = key };
                    db.Schools.Add(school);
                }
                _schools[key] = school;
            }
            return school;
        }
    }
}
