using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private static Candidate[] CreateDevelopmentCandidates(DateTimeOffset now)
    {
        Candidate Person(
            string first,
            string last,
            string title,
            string location,
            string source,
            string[] tags,
            string? phone = null
        ) =>
            new()
            {
                FirstName = first,
                LastName = last,
                Email = $"{first.ToLowerInvariant()}.{last.ToLowerInvariant()}@example.com",
                Phone = phone,
                Location = location,
                CurrentTitle = title,
                Source = source,
                Tags = tags,
                CreatedAt = now.AddDays(-45),
            };

        var jordan = Person(
            "Jordan",
            "Lee",
            "Product engineer",
            "Chicago, IL",
            "Referral",
            ["react", "dotnet", "referred"],
            "+1 312 555 0142"
        );
        jordan.LinkedInUrl = "https://www.linkedin.com/in/example";
        var people = new[]
        {
            jordan,
            Person(
                "Sam",
                "Patel",
                "Senior software engineer",
                "Madison, WI",
                "Direct applicant",
                ["platform", "postgresql"]
            ),
            Person(
                "Maya",
                "Fernandez",
                "Full stack engineer",
                "Chicago, IL",
                "LinkedIn",
                ["typescript", "react"]
            ),
            Person(
                "Elliot",
                "Shaw",
                "Backend engineer",
                "Denver, CO",
                "Direct applicant",
                ["dotnet", "aws"]
            ),
            Person(
                "Nina",
                "Kowalski",
                "Staff engineer",
                "Remote, US",
                "Referral",
                ["distributed-systems", "referred"]
            ),
            Person(
                "Omar",
                "Haddad",
                "Product engineer",
                "Detroit, MI",
                "Job board",
                ["react", "graphql"]
            ),
            Person(
                "Grace",
                "Oyelaran",
                "Site reliability engineer",
                "Remote, US",
                "LinkedIn",
                ["kubernetes", "terraform"]
            ),
            Person(
                "Ben",
                "Ortiz",
                "DevOps engineer",
                "Phoenix, AZ",
                "Direct applicant",
                ["ci-cd", "aws"]
            ),
            Person(
                "Hana",
                "Suzuki",
                "Platform engineer",
                "Seattle, WA",
                "Referral",
                ["golang", "observability", "referred"]
            ),
            Person(
                "Luis",
                "Moreno",
                "Infrastructure engineer",
                "Remote, US",
                "Job board",
                ["terraform", "postgresql"]
            ),
            Person(
                "Ada",
                "Whitfield",
                "Product designer",
                "New York, NY",
                "Portfolio site",
                ["figma", "design-systems"]
            ),
            Person(
                "Theo",
                "Brandt",
                "Senior product designer",
                "Brooklyn, NY",
                "Referral",
                ["figma", "research", "referred"]
            ),
            Person(
                "Ines",
                "Duarte",
                "UX designer",
                "Remote, US",
                "LinkedIn",
                ["research", "accessibility"]
            ),
            Person(
                "Kofi",
                "Mensah",
                "Design lead",
                "New York, NY",
                "Direct applicant",
                ["design-systems", "leadership"]
            ),
            Person("Rosa", "Iglesias", "Data analyst", "Austin, TX", "Job board", ["sql", "dbt"]),
            Person(
                "Felix",
                "Novak",
                "Analytics engineer",
                "Austin, TX",
                "Referral",
                ["dbt", "python", "referred"]
            ),
            Person(
                "Priyanka",
                "Iyer",
                "Business analyst",
                "Dallas, TX",
                "LinkedIn",
                ["sql", "tableau"]
            ),
            Person(
                "Marcus",
                "Bell",
                "Operations manager",
                "Chicago, IL",
                "Direct applicant",
                ["operations", "support"]
            ),
            Person(
                "Sofia",
                "Lindqvist",
                "Customer success lead",
                "Chicago, IL",
                "Referral",
                ["customer-success", "referred"]
            ),
            Person(
                "Devon",
                "Clarke",
                "Support operations",
                "Milwaukee, WI",
                "Job board",
                ["support", "zendesk"]
            ),
            Person(
                "Aisha",
                "Rahman",
                "Engineering manager",
                "Chicago, IL",
                "Referral",
                ["leadership", "referred"]
            ),
            Person(
                "Victor",
                "Almeida",
                "Frontend engineer",
                "Remote, US",
                "Job board",
                ["react", "css"]
            ),
            Person(
                "Lena",
                "Hofmann",
                "QA engineer",
                "Remote, US",
                "Direct applicant",
                ["testing", "playwright"]
            ),
            Person(
                "Caleb",
                "Wright",
                "Junior engineer",
                "Chicago, IL",
                "University fair",
                ["python", "new-grad"]
            ),
        };
        people[22].DoNotContact = true;

        return people;
    }
}
