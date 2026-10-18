namespace MyThorneAI.Ats.Api.Domain;

// The parsed resume, one row per thing a recruiter filters on. Written only by the parser
// (see docs/resume-parsing.md): nobody edits these by hand, so a candidate can't be made to
// look stronger than their resume. A wrong parse is fixed by re-parsing.

public enum Seniority { Unknown, Intern, Junior, Mid, Senior, Lead, Manager, Director, Executive }

public enum EmploymentType { Unknown, FullTime, PartTime, Contract, Internship, Freelance, Volunteer }

public enum DegreeLevel { Unknown, HighSchool, Associate, Bachelor, Master, Doctorate, Certificate, Bootcamp, Other }

public enum FieldOfStudy { Unknown, Engineering, ComputerScience, Business, Health, Education, Arts, Sciences, Law, SocialSciences, Other }

public enum SkillCategory { Other, Programming, Framework, Tool, Cloud, Data, Design, Language, SoftSkill, Domain }

public enum LanguageProficiency { Unknown, Basic, Conversational, Professional, Fluent, Native }

public enum SkillSource { SkillsSection, JobDescription, Both }

/// <summary>Shared across candidates so "react", "ReactJS" and "React.js" are one filter value.</summary>
public sealed class Skill
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
    public SkillCategory Category { get; set; }
    public string[] Aliases { get; set; } = [];
}

public sealed class Company
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
}

public sealed class School
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Name { get; set; }
    public required string NormalizedName { get; set; }
}

public sealed class WorkExperience
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public Guid? CompanyId { get; set; }
    public Company? Company { get; set; }
    public required string CompanyNameRaw { get; set; }
    public required string Title { get; set; }
    public Seniority Seniority { get; set; }
    public EmploymentType EmploymentType { get; set; }
    public string? City { get; set; }
    public string? Region { get; set; }
    public string? Country { get; set; }
    public bool IsRemote { get; set; }
    public int? StartYear { get; set; }
    public int? StartMonth { get; set; }
    public int? EndYear { get; set; }
    public int? EndMonth { get; set; }
    public bool IsCurrent { get; set; }
    public int? DurationMonths { get; set; }
    public int? ManagedPeople { get; set; }
    public string Description { get; set; } = "";
    public int SortOrder { get; set; }
    public bool Verified { get; set; }
    public List<WorkExperienceSkill> Skills { get; set; } = [];
}

public sealed class WorkExperienceSkill
{
    public Guid WorkExperienceId { get; set; }
    public WorkExperience? WorkExperience { get; set; }
    public Guid SkillId { get; set; }
    public Skill? Skill { get; set; }
}

public sealed class Education
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public Guid? SchoolId { get; set; }
    public School? School { get; set; }
    public required string SchoolNameRaw { get; set; }
    public string? Degree { get; set; }
    public DegreeLevel DegreeLevel { get; set; }
    public string? Field { get; set; }
    public FieldOfStudy FieldNormalized { get; set; }
    public int? StartYear { get; set; }
    public int? EndYear { get; set; }
    public bool IsInProgress { get; set; }
    public decimal? Gpa { get; set; }
    public decimal? GpaScale { get; set; }
    public string? Honors { get; set; }
    public int SortOrder { get; set; }
    public bool Verified { get; set; }
}

public sealed class CandidateSkill
{
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public Guid SkillId { get; set; }
    public Skill? Skill { get; set; }
    public SkillSource Source { get; set; }
    public decimal? YearsUsed { get; set; }
    public int? LastUsedYear { get; set; }
    public bool Verified { get; set; }
}

public sealed class Certification
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string Name { get; set; }
    public string? Issuer { get; set; }
    public int? Year { get; set; }
    public int? ExpiresYear { get; set; }
    public string? Url { get; set; }
    public bool Verified { get; set; }
}

public sealed class CandidateLanguage
{
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string Language { get; set; }
    public LanguageProficiency Proficiency { get; set; }
}

public sealed class Project
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string Name { get; set; }
    public string Description { get; set; } = "";
    public string? Url { get; set; }
    public int? Year { get; set; }
    public List<ProjectSkill> Skills { get; set; } = [];
}

public sealed class ProjectSkill
{
    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }
    public Guid SkillId { get; set; }
    public Skill? Skill { get; set; }
}

public sealed class Publication
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string Title { get; set; }
    public string? Venue { get; set; }
    public int? Year { get; set; }
    public string? Url { get; set; }
}

public sealed class Award
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CandidateId { get; set; }
    public Candidate? Candidate { get; set; }
    public required string Name { get; set; }
    public string? Issuer { get; set; }
    public int? Year { get; set; }
}
