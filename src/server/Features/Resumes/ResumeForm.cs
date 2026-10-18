using System.ComponentModel;

namespace MyThorneAI.Ats.Api.Contracts;

// The form the model fills in from a resume's text. Same shape as the tables in
// Domain/ResumeProfile.cs and as the Resume tab in the web app. Enums are plain strings
// here so an off-list answer degrades to Unknown instead of failing the whole parse.
// Bump ResumePrompt.Version in ResumeExtractor when this shape or the instructions change.

public sealed record ResumeForm(
    ResumeBasics Basics,
    [property: Description("Jobs, most recent first. Internships and volunteer roles count.")]
    ResumeWork[] Work,
    [property: Description("Degrees and programs, most recent first.")]
    ResumeEducationEntry[] Education,
    [property: Description("Every skill, tool, technology or domain the resume names. Keep the resume's wording.")]
    ResumeSkill[] Skills,
    ResumeCertification[] Certifications,
    ResumeLanguage[] Languages,
    ResumeProject[] Projects,
    ResumePublication[] Publications,
    ResumeAward[] Awards,
    [property: Description("Lines of the resume you could not place in any field above. Copy them exactly.")]
    string[] UnassignedText
);

public sealed record ResumeBasics(
    string? FirstName,
    string? LastName,
    string? Email,
    string? Phone,
    string? City,
    [property: Description("State, province or region, as written. Use the two-letter code for US states.")]
    string? Region,
    string? Country,
    [property: Description("true only if the resume says so; null if it doesn't say.")]
    bool? WillingToRelocate,
    bool? OpenToRemote,
    ResumeLink[] Links,
    [property: Description("The resume's own summary or objective paragraph, verbatim. Null if there is none.")]
    string? Summary
);

public sealed record ResumeLink(
    [property: Description("linkedin, github, portfolio or other")] string Kind,
    string Url
);

public sealed record ResumeDate(int? Year, [property: Description("1-12, or null if the resume gives only a year.")] int? Month);

public sealed record ResumeWork(
    string Company,
    string Title,
    [property: Description("Intern, Junior, Mid, Senior, Lead, Manager, Director, Executive or Unknown. Judge from the title and the responsibilities.")]
    string Seniority,
    [property: Description("FullTime, PartTime, Contract, Internship, Freelance, Volunteer or Unknown.")]
    string EmploymentType,
    string? City,
    string? Region,
    string? Country,
    bool IsRemote,
    ResumeDate? Start,
    [property: Description("Null when the role is current (Present, Now, ongoing).")]
    ResumeDate? End,
    [property: Description("How many people they managed, if the resume gives a number. Otherwise null.")]
    int? ManagedPeople,
    [property: Description("The bullet points under this job, each copied verbatim.")]
    string[] Bullets,
    [property: Description("Skills named in this job's bullets, using the resume's wording.")]
    string[] SkillsUsed
);

public sealed record ResumeEducationEntry(
    string School,
    [property: Description("The degree as written, e.g. 'Bachelor of Science'.")]
    string? Degree,
    [property: Description("HighSchool, Associate, Bachelor, Master, Doctorate, Certificate, Bootcamp, Other or Unknown.")]
    string DegreeLevel,
    [property: Description("The major or field as written, e.g. 'Computer Science'.")]
    string? Field,
    [property: Description("Engineering, ComputerScience, Business, Health, Education, Arts, Sciences, Law, SocialSciences, Other or Unknown.")]
    string FieldNormalized,
    int? StartYear,
    [property: Description("Graduation or expected graduation year.")]
    int? EndYear,
    bool InProgress,
    decimal? Gpa,
    [property: Description("The GPA scale, usually 4 or 5. Null if not stated.")]
    decimal? GpaScale,
    [property: Description("Honors as written: 'magna cum laude', 'Dean's List', etc.")]
    string? Honors
);

public sealed record ResumeSkill(
    string Name,
    [property: Description("Programming, Framework, Tool, Cloud, Data, Design, Language, SoftSkill, Domain or Other.")]
    string Category
);

public sealed record ResumeCertification(string Name, string? Issuer, int? Year, int? ExpiresYear, string? Url);

public sealed record ResumeLanguage(
    string Language,
    [property: Description("Basic, Conversational, Professional, Fluent, Native or Unknown.")]
    string Proficiency
);

public sealed record ResumeProject(string Name, string? Description, string? Url, int? Year, string[] SkillsUsed);

public sealed record ResumePublication(string Title, string? Venue, int? Year, string? Url);

public sealed record ResumeAward(string Name, string? Issuer, int? Year);
