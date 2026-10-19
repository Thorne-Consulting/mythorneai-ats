using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    // Every seeded candidate comes with the CV they applied with, like a real applicant. The file is
    // embedded from Data/Seed/Resumes and queued for ResumeParseWorker, which fills in the profile.
    private sealed record DevelopmentPerson(
        string FirstName,
        string LastName,
        string Title,
        string Location,
        string Source,
        string ResumeFile,
        string[]? Tags = null,
        string? Phone = null
    )
    {
        // ponytail: the real sample resumes carry real-looking inboxes, so every candidate gets an example.com one.
        public string Email =>
            $"{new string(FirstName.Where(char.IsLetter).ToArray())}.{new string(LastName.Where(char.IsLetter).ToArray())}@example.com"
                .ToLowerInvariant();
    }

    private static readonly DevelopmentPerson[] DevelopmentPeople =
    [
        // Invented people for the product and engineering jobs. Their CVs come from
        // tools/generate_seed_resumes.py; the order matters, applications below refer to it.
        new("Jordan", "Lee", "Product engineer", "Chicago, IL", "Referral", "jordan-lee-resume.pdf", ["react", "dotnet", "referred"], "+1 312 555 0142"),
        new("Sam", "Patel", "Senior software engineer", "Madison, WI", "Direct applicant", "sam-patel-resume.pdf", ["platform", "postgresql"]),
        new("Maya", "Fernandez", "Full stack engineer", "Chicago, IL", "LinkedIn", "maya-fernandez-resume.pdf", ["typescript", "react"]),
        new("Elliot", "Shaw", "Backend engineer", "Denver, CO", "Direct applicant", "elliot-shaw-resume.docx", ["dotnet", "aws"]),
        new("Nina", "Kowalski", "Staff engineer", "Remote, US", "Referral", "nina-kowalski-resume.pdf", ["distributed-systems", "referred"]),
        new("Omar", "Haddad", "Product engineer", "Detroit, MI", "Job board", "omar-haddad-resume.pdf", ["react", "graphql"]),
        new("Grace", "Oyelaran", "Site reliability engineer", "Remote, US", "LinkedIn", "grace-oyelaran-resume.pdf", ["kubernetes", "terraform"]),
        new("Ben", "Ortiz", "DevOps engineer", "Phoenix, AZ", "Direct applicant", "ben-ortiz-resume.pdf", ["ci-cd", "aws"]),
        new("Hana", "Suzuki", "Platform engineer", "Seattle, WA", "Referral", "hana-suzuki-resume.pdf", ["golang", "observability", "referred"]),
        new("Luis", "Moreno", "Infrastructure engineer", "Remote, US", "Job board", "luis-moreno-resume.pdf", ["terraform", "postgresql"]),
        new("Ada", "Whitfield", "Product designer", "New York, NY", "Portfolio site", "ada-whitfield-resume.pdf", ["figma", "design-systems"]),
        new("Theo", "Brandt", "Senior product designer", "Brooklyn, NY", "Referral", "theo-brandt-resume.pdf", ["figma", "research", "referred"]),
        new("Ines", "Duarte", "UX designer", "Remote, US", "LinkedIn", "ines-duarte-resume.pdf", ["research", "accessibility"]),
        new("Kofi", "Mensah", "Design lead", "New York, NY", "Direct applicant", "kofi-mensah-resume.pdf", ["design-systems", "leadership"]),
        new("Rosa", "Iglesias", "Data analyst", "Austin, TX", "Job board", "rosa-iglesias-resume.docx", ["sql", "dbt"]),
        new("Felix", "Novak", "Analytics engineer", "Austin, TX", "Referral", "felix-novak-resume.pdf", ["dbt", "python", "referred"]),
        new("Priyanka", "Iyer", "Business analyst", "Dallas, TX", "LinkedIn", "priyanka-iyer-resume.pdf", ["sql", "tableau"]),
        new("Marcus", "Bell", "Operations manager", "Chicago, IL", "Direct applicant", "marcus-bell-resume.docx", ["operations", "support"]),
        new("Sofia", "Lindqvist", "Customer success lead", "Chicago, IL", "Referral", "sofia-lindqvist-resume.pdf", ["customer-success", "referred"]),
        new("Devon", "Clarke", "Support operations", "Milwaukee, WI", "Job board", "devon-clarke-resume.docx", ["support", "zendesk"]),
        new("Aisha", "Rahman", "Engineering manager", "Chicago, IL", "Referral", "aisha-rahman-resume.pdf", ["leadership", "referred"]),
        new("Victor", "Almeida", "Frontend engineer", "Remote, US", "Job board", "victor-almeida-resume.pdf", ["react", "css"]),
        new("Lena", "Hofmann", "QA engineer", "Remote, US", "Direct applicant", "lena-hofmann-resume.docx", ["testing", "playwright"]),
        new("Caleb", "Wright", "Junior engineer", "Chicago, IL", "University fair", "caleb-wright-resume.pdf", ["python", "new-grad"]),

        // Public sample resumes from the UW, MIT and University of Alabama career centers:
        // careers.uw.edu/resources/sample-resumes, capd.mit.edu/resources/sample-resumes,
        // career.sa.ua.edu/develop/resumes/sample-resumes. They apply to the early-career jobs.
        new("Andrew", "Peters", "Microbiology PhD candidate", "Seattle, WA", "LinkedIn", "Andrew-Peters.pdf"),
        new("Jalila", "Asha", "Marketing and communications", "Seattle, WA", "Job board", "Arts-Media-Marketing-Sample-Resume.pdf"),
        new("Daniel", "Garcia", "Applied mathematics student", "Seattle, WA", "University fair", "D-Daniel-Garcia.docx.pdf"),
        new("Huy", "Nguyen", "Economics student", "Seattle, WA", "Career site", "E-Huy-Nguyen.docx.pdf"),
        new("Eniola", "Viglionese", "Undergraduate researcher", "Seattle, WA", "University fair", "Health-Sample-Resume.pdf"),
        new("Miranda", "Hudson", "Mechanical engineering graduate student", "Seattle, WA", "Referral", "Miranda-Hudson.pdf"),
        new("Shirley", "Gallo", "Gender studies student", "Seattle, WA", "Career site", "Non-profit-Social-Justice-Education-Resume-1.pdf"),
        new("Yasmine", "Hejazi", "Psychology student", "Seattle, WA", "Job board", "Non-profit-Social-Justice-Education-Resume-2.pdf"),
        new("Stephen", "Artur", "Marine and environmental affairs", "Seattle, WA", "Direct applicant", "Physical-and-LIfe-Science-Sample-Resume.pdf"),
        new("Morgan", "Lander", "Psychology student", "Seattle, WA", "Career site", "Undergraduate-Sample-Resume.pdf"),
        new("Ally", "Bama", "Criminal justice student", "Tuscaloosa, AL", "Job board", "AS-Resume-Sample-22_AM-approved.docx"),
        new("Mary Jane", "Washington", "Marketing student", "Tuscaloosa, AL", "University fair", "Business-Resume-Sample-22_SC-revised.docx"),
        new("Casey", "Carter", "Public relations student", "Tuscaloosa, AL", "LinkedIn", "CIS-Resume-Sample-22_AB-approved.docx"),
        new("Taylor", "Thompson", "Education student", "Tuscaloosa, AL", "Career site", "Education-Resume-Sample-22_TG-approved.docx"),
        new("Morgan", "Martinez", "Mechanical engineering student", "Tuscaloosa, AL", "University fair", "Engineering-Resume-Sample-22_Dill-approved.docx"),
        new("Peyton", "Parker", "Human development student", "Tuscaloosa, AL", "Job board", "HES-Resume-Sample-22_PM-approved.docx"),
        new("Jordan", "Jones", "Nursing student", "Tuscaloosa, AL", "University fair", "Nursing-Sample-Resume-22_KWG-approved-1.docx"),
        new("Kendall", "King", "Social work student", "Tuscaloosa, AL", "Referral", "SW-Resume-Sample-22_TG-approved.docx"),
        new("Charles", "Meng", "Computer science MEng candidate", "Cambridge, MA", "LinkedIn", "MITCAPD-MastersII.pdf"),
        new("Jean", "Upeg", "Urban political economy PhD candidate", "Cambridge, MA", "Direct applicant", "MITCAPD-PhDI.pdf"),
        new("Claudio", "di Leo", "Mechanical engineering PhD", "Cambridge, MA", "Referral", "MITCAPD-PostDocI.pdf"),
        // Text in this one is drawn as outlines, so it only parses once OCR is available (NeedsOcr until then).
        new("Marina", "Johnson", "Environmental studies student", "Seattle, WA", "Career site", "Climate-Conservation-Sustainability-Resume.pdf"),

        // Met at a career fair and kept on file: a CV, no application yet.
        new("Frankie", "First-Year", "First-year student", "Tuscaloosa, AL", "Career fair", "First-Year-Resume-Sample-22.docx"),
        new("Taylor", "Morgan", "Law, societies and justice student", "Seattle, WA", "Career fair", "Law-Government-Policy-Resume.pdf"),
    ];

    private static Candidate[] CreateDevelopmentCandidates(DateTimeOffset now)
    {
        var people = DevelopmentPeople
            .Select(person => new Candidate
            {
                FirstName = person.FirstName,
                LastName = person.LastName,
                Email = person.Email,
                Phone = person.Phone,
                Location = person.Location,
                CurrentTitle = person.Title,
                Source = person.Source,
                Tags = person.Tags ?? [],
                // Applying moves this back to the application date; people on file were met a month ago.
                CreatedAt = now.AddDays(-30),
            })
            .ToArray();
        people[0].LinkedInUrl = "https://www.linkedin.com/in/example";
        people[22].DoNotContact = true;
        return people;
    }
}
