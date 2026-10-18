using System.ClientModel;
using System.Text;
using Microsoft.Extensions.AI;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using OpenAI;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Scores the real model against hand-checked answers for the seeded sample resumes
// (src/server/Data/Seed/Resumes). Needs OPENAI_API_KEY in the environment and skips without it,
// so it never runs in CI by accident. Run it whenever the prompt, the form or the model changes:
// the baseline is the score today, and the test fails if any field drops below it. When the score
// goes up, raise the baseline to lock the gain in.
public sealed class ResumeParsingQualityTests
{
    private sealed record Job(string Company, string Title, int? StartYear, int? EndYear);

    private sealed record Degree(string School, string? Name, int? EndYear);

    // Null means the resume doesn't state it, so it isn't scored. Jobs and degrees are only
    // listed for resumes somebody has read through; others score basics only.
    private sealed record Expected(
        string File,
        string Name,
        string Email,
        string? Phone,
        string? City,
        string? Region,
        Job[]? Jobs = null,
        Degree[]? Degrees = null,
        string[]? Skills = null
    );

    private static readonly Expected[] Answers =
    [
        new("Andrew-Peters.pdf", "Andrew Peters", "andrewpeters@uw.edu", "206-110-0089", "Seattle", "WA"),
        new("Arts-Media-Marketing-Sample-Resume.pdf", "Jalila Asha", "jasha@uw.edu", "206.222.3344", "Seattle", "WA"),
        new("D-Daniel-Garcia.docx.pdf", "Daniel Garcia", "jfg@email.com", "(206) 999-9876", null, null,
            Jobs:
            [
                new("Hackfest, University of Washington", "Participant", 2026, 2026),
                new("DubHacks, University of Washington", "Logistics Director", 2025, 2025),
                new("UW Housing & Food Services", "Systems Assistant", 2026, null),
                new("First Year Programs, University of Washington", "Dawg Daze Volunteer", 2025, 2025),
                new("UW Latinx Student Union", "Recruitment Officer", 2024, 2025),
            ],
            Degrees: [new("University of Washington", "Bachelor of Science", 2028)],
            Skills: ["SQL", "R", "Java", "HTML", "CSS", "Angular", "Django", "ASP.NET", "Flask", "SAS", "Excel", "Azure", "Tableau"]),
        new("E-Huy-Nguyen.docx.pdf", "Huy Nguyen", "hnguyen@uw.edu", "(206) 345-6767", "Seattle", "WA",
            Jobs:
            [
                new("Global Business Case Competition", "Participant", 2022, 2022),
                new("Penn Schoen and Berland", "Market Research Analyst Intern", 2021, 2022),
                new("Alpha Sigma Phi Fraternity", "Treasurer", 2021, 2022),
                new("Unite UW", "Facilitator", 2021, null),
                new("Bank of China", "Marketing Intern", 2020, 2020),
            ],
            Degrees: [new("University of Washington", "Bachelor of Arts in Economics", 2024)],
            Skills: ["Tableau", "SPSS", "Excel", "Access", "PowerPoint"]),
        new("Health-Sample-Resume.pdf", "Eniola Viglionese", "viglionesee@uw.edu", "(306) 999-1234", null, null,
            Jobs:
            [
                new("PhysAssist", "Scribe", 2024, null),
                new("UW Ochowicz Lab", "Undergraduate Researcher", 2023, 2024),
                new("Healthcare Alternative Spring Break", "Volunteer", 2022, 2022),
                new("UW Medical Center", "Patient Services Volunteer", 2022, null),
                new("University District Food Bank", "Volunteer", 2022, null),
            ],
            Degrees: [new("University of Washington", "Bachelor of Science", 2027)],
            Skills: ["DNA cloning", "PCR", "Southern blot", "Western blot", "EPIC", "Excel"]),
        new("Miranda-Hudson.pdf", "Miranda Hudson", "mhudson@uw.edu", "123-123-4557", "Seattle", "WA"),
        new("Non-profit-Social-Justice-Education-Resume-1.pdf", "Shirley Gallo", "sgallo@uw.edu", "(206) 555-3281", null, null),
        new("Non-profit-Social-Justice-Education-Resume-2.pdf", "Yasmine Hejazi", "yhejazi@uw.edu", "206.555.5555", null, null),
        new("Physical-and-LIfe-Science-Sample-Resume.pdf", "Stephen Artur", "sartur@uw.edu", "360-222-5555", null, null),
        // Dates are "20xx" placeholders on this one, so only the entries are scored.
        new("Undergraduate-Sample-Resume.pdf", "Morgan Lander", "landerm@uw.edu", "(206) 123-4567", "Seattle", "WA",
            Jobs:
            [
                new("Community Support Center", "Child and Family Services Intern", null, null),
                new("Camp Evergreen", "Summer Camp Counselor", null, null),
                new("Café Solstice", "Barista", null, null),
                new("University of Washington", "Active Minds Club Advisor", null, null),
            ],
            Degrees:
            [
                new("University of Washington", "Bachelor of Arts", null),
                new("Seattle Central Community College", "Associate of Arts", null),
            ]),
        new("Climate-Conservation-Sustainability-Resume.pdf", "Marina Johnson", "marinajohnson@uw.edu", "(206) 555-7890", "Seattle", "WA",
            Jobs:
            [
                new("School of Environmental and Forest Sciences, University of Washington", "Student Research Assistant", 2024, null),
                new("Discovery Park Environmental Learning Center", "Environmental Education Intern", 2023, 2023),
                new("U.S. Forest Service", "Field Crew Member", 2022, 2022),
                new("UW Campus Sustainability Fund", "Volunteer", 2024, null),
                new("UW Society for Ecological Restoration", "President", 2023, 2025),
            ],
            Degrees: [new("University of Washington", "Bachelor of Science in Environmental Studies", 2026)],
            Skills: ["ArcGIS", "QGIS", "GPS data collection", "R", "Excel", "Google Sheets"]),
        new("Law-Government-Policy-Resume.pdf", "Taylor Morgan", "taylorm@uw.edu", "(206) 555-4567", "Seattle", "WA",
            Jobs:
            [
                new("King County Dept of Public Defense", "Community Justice Intern", 2025, 2025),
                new("Office of State Representative Jane Doe", "Legislative Affairs Intern", 2024, 2024),
                new("UW Department of Law, Societies, and Justice", "Honors Thesis", 2024, 2025),
                new("UW Pre-Law Society", "Vice President", 2023, 2025),
                new("ASUW Student Senate", "Student Representative", 2022, 2024),
            ],
            Degrees: [new("University of Washington", "Bachelor of Arts in Law, Societies, and Justice", 2025)]),
        new("AS-Resume-Sample-22_AM-approved.docx", "Ally Bama", "ally.bama@crimson.ua.edu", "205-348-5848", null, null),
        new("Business-Resume-Sample-22_SC-revised.docx", "Mary Jane Washington", "mjwash@gmail.com", "205.348.2691", null, null),
        new("CIS-Resume-Sample-22_AB-approved.docx", "Casey Carter", "casey.carter@gmail.com", "205-348-5848", null, null,
            Jobs:
            [
                new("Healing Hands International", "Public Relations/Marketing Intern", 2022, 2022),
                new("Public Relations Campaigns class project, The University of Alabama", "Account Executive", 2022, 2022),
                new("The Crimson White", "Senior Staff Reporter", 2021, 2021),
                new("Tidy Lawn", "Landscape Laborer", 2018, 2021),
            ],
            Degrees: [new("The University of Alabama", "Bachelor of Arts in Communication and Information Sciences", 2023)],
            Skills: ["Adobe InDesign", "Illustrator", "Premiere Pro", "Microsoft Office Suite"]),
        new("Education-Resume-Sample-22_TG-approved.docx", "Taylor Thompson", "taylor_thompson@gmail.com", "205-348-5848", null, null),
        new("Engineering-Resume-Sample-22_Dill-approved.docx", "Morgan Martinez", "mmartinez7@crimson.ua.edu", "205-348-4839", null, null),
        new("First-Year-Resume-Sample-22.docx", "Frankie First-Year", "frankie.firstyear@crimson.ua.edu", "205-348-5848", null, null),
        new("HES-Resume-Sample-22_PM-approved.docx", "Peyton Parker", "peyton.parker@gmail.com", "205-348-5848", null, null),
        new("Nursing-Sample-Resume-22_KWG-approved-1.docx", "Jordan Jones", "jordan.jones@gmail.com", "205-348-5848", "Tuscaloosa", "AL"),
        new("SW-Resume-Sample-22_TG-approved.docx", "Kendall King", "kmking9@crimson.ua.edu", "205-348-5848", null, null,
            Jobs:
            [
                new("Raeford Village", "Resident Counselor", 2022, 2022),
                new("Brewer-Porch Children's Center", "Instructional Assistant", 2021, 2021),
                new("Eagles' Wings, Inc.", "Extern", 2021, 2021),
                new("Chick-fil-A", "Team Member", 2019, null),
            ],
            Degrees: [new("The University of Alabama", "Bachelor of Social Work", 2023)]),
        // MIT's samples use "20XX" for every year, so only the entries are scored.
        new("MITCAPD-MastersII.pdf", "Charles Meng", "csmeng@mit.edu", "617.123.4567", "Cambridge", "MA",
            Jobs:
            [
                new("User Interface Design Group; CSAIL, MIT", "Researcher", null, null),
                new("Assistive Technologies; MIT", "Student leader", null, null),
                new("Introduction to Electrical Engineering and Computer Science; MIT", "Teaching assistant", null, null),
                new("Middle East Education Through Technology (MEET)", "Curriculum developer", null, null),
                new("MIT International Science and Technology Initiative", "Curriculum developer and instructor", null, null),
                new("The Server Labs", "Software engineering intern", null, null),
                new("Affective Computing; Media Lab, MIT", "Undergraduate researcher", null, null),
            ],
            Degrees:
            [
                new("Massachusetts Institute of Technology", "Master of Engineering in Computer Science", null),
                new("Massachusetts Institute of Technology", "Bachelor of Science in Computer Science", null),
            ],
            Skills: ["Django", "HTML", "CSS", "Javascript", "jQuery", "Python", "C++", "Java", "MATLAB"]),
        new("MITCAPD-PhDI.pdf", "Jean Upeg", "upeg@mit.edu", null, "Cambridge", "MA"),
        new("MITCAPD-PostDocI.pdf", "Claudio di Leo", "phd@mit.edu", "617-555-5555", "Cambridge", "MA"),
    ];

    // Correct out of scored, per field. All zero until the first run against a real key: run the
    // test, read TestResults/resume-parsing-quality.md, and copy the numbers here.
    private static readonly Dictionary<string, int> Baseline = new()
    {
        ["parsed"] = 0,
        ["name"] = 0,
        ["email"] = 0,
        ["phone"] = 0,
        ["city"] = 0,
        ["jobs"] = 0,
        ["jobDates"] = 0,
        ["degrees"] = 0,
        ["skills"] = 0,
    };

    [Fact]
    public async Task Model_scores_at_least_the_baseline_on_the_seed_resumes()
    {
        var ct = TestContext.Current.CancellationToken;
        var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey))
            Assert.Skip("Needs OPENAI_API_KEY; the quality test runs against the real model.");
        var model = Environment.GetEnvironmentVariable("OPENAI_RESUME_MODEL") ?? "gpt-5-mini";
        IChatClient chat = new OpenAIClient(apiKey).GetChatClient(model).AsIChatClient();

        var assembly = typeof(SeedData).Assembly;
        var resources = assembly.GetManifestResourceNames()
            .Where(name => name.Contains(".Data.Seed.Resumes.", StringComparison.Ordinal))
            .ToDictionary(name => name[(name.IndexOf(".Resumes.", StringComparison.Ordinal) + 9)..]);
        resources.Keys.Order().ShouldBe(Answers.Select(x => x.File).Order(), "every seed resume needs an answer here");

        var textExtractor = new ResumeTextExtractor(new LocalResumeOcr());
        var hits = Baseline.Keys.ToDictionary(key => key, _ => 0);
        var scored = Baseline.Keys.ToDictionary(key => key, _ => 0);
        var report = new StringBuilder("| file | name | email | phone | city | jobs | job dates | degrees | skills |\n|---|---|---|---|---|---|---|---|---|\n");

        foreach (var answer in Answers)
        {
            await using var stream = assembly.GetManifestResourceStream(resources[answer.File])!;
            ResumeForm? form = null;
            string? error = null;
            try
            {
                var text = await textExtractor.ExtractAsync(stream, answer.File, ct);
                form = (await ResumeExtractor.CallAsync(chat, model, text, ct)).Form;
            }
            catch (ResumeNeedsOcrException exception) { error = exception.Message; }
            catch (ClientResultException exception) when (exception.Status is 401 or 403)
            {
                Assert.Skip($"OPENAI_API_KEY was rejected ({exception.Status}); set a real key to run the quality test.");
            }

            Score("parsed", true, form is not null);
            if (form is null)
            {
                report.AppendLine($"| {answer.File} | failed: {error} | | | | | | | |");
                continue;
            }
            var name = $"{form.Basics.FirstName} {form.Basics.LastName}".Trim();
            var cells = new[]
            {
                Score("name", true, Loose(name) == Loose(answer.Name), name),
                Score("email", true, string.Equals(form.Basics.Email, answer.Email, StringComparison.OrdinalIgnoreCase), form.Basics.Email),
                Score("phone", answer.Phone is not null, Digits(form.Basics.Phone) == Digits(answer.Phone), form.Basics.Phone),
                Score("city", answer.City is not null, Loose(form.Basics.City) == Loose(answer.City) && Loose(form.Basics.Region) == Loose(answer.Region),
                    $"{form.Basics.City}, {form.Basics.Region}"),
                JobsCell(answer, form),
                JobDatesCell(answer, form),
                DegreesCell(answer, form),
                SkillsCell(answer, form),
            };
            report.AppendLine($"| {answer.File} | {string.Join(" | ", cells)} |");
        }

        report.Insert(0, $"Model {model}, prompt {ResumeExtractor.PromptVersion}\n\n"
            + string.Join("  ", Baseline.Keys.Select(key => $"{key} {hits[key]}/{scored[key]}")) + "\n\n");
        var reportPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../TestResults/resume-parsing-quality.md"));
        Directory.CreateDirectory(Path.GetDirectoryName(reportPath)!);
        await File.WriteAllTextAsync(reportPath, report.ToString(), ct);
        TestContext.Current.TestOutputHelper?.WriteLine(report.ToString());
        foreach (var (key, floor) in Baseline)
            hits[key].ShouldBeGreaterThanOrEqualTo(floor, $"{key} got worse.\n{report}");

        string Score(string key, bool counts, bool correct, string? value = null)
        {
            if (!counts)
                return "–";
            scored[key]++;
            if (correct)
                hits[key]++;
            return (correct ? "✓ " : "✗ ") + value?.Trim().Replace("|", "\\|");
        }

        // Jobs: each expected job must align with a parsed one on company and title.
        string JobsCell(Expected answer, ResumeForm form)
        {
            if (answer.Jobs is null)
                return "–";
            var pairs = Align(answer.Jobs, form.Work, (gold, got) =>
                (Similarity(gold.Company, got.Company) + Similarity(gold.Title, got.Title)) / 2);
            var matched = pairs.Count(pair => pair.Score >= 0.6);
            var correct = matched == answer.Jobs.Length && form.Work.Length == answer.Jobs.Length;
            return Score("jobs", true, correct, $"{matched}/{answer.Jobs.Length} matched, {form.Work.Length} parsed");
        }

        // Job dates: of the aligned jobs, start and end years must match.
        string JobDatesCell(Expected answer, ResumeForm form)
        {
            if (answer.Jobs is null)
                return "–";
            var pairs = Align(answer.Jobs, form.Work, (gold, got) =>
                (Similarity(gold.Company, got.Company) + Similarity(gold.Title, got.Title)) / 2)
                .Where(pair => pair.Score >= 0.6).ToList();
            var right = pairs.Count(pair => pair.Gold.StartYear == pair.Got.Start?.Year && pair.Gold.EndYear == pair.Got.End?.Year);
            return Score("jobDates", true, pairs.Count == answer.Jobs.Length && right == pairs.Count, $"{right}/{pairs.Count}");
        }

        string DegreesCell(Expected answer, ResumeForm form)
        {
            if (answer.Degrees is null)
                return "–";
            var pairs = Align(answer.Degrees, form.Education, (gold, got) =>
                (Similarity(gold.School, got.School) + (gold.Name is null ? 1 : Similarity(gold.Name, got.Degree ?? ""))) / 2)
                .Where(pair => pair.Score >= 0.6).ToList();
            var right = pairs.Count(pair => pair.Gold.EndYear is null || pair.Gold.EndYear == pair.Got.EndYear);
            return Score("degrees", true, right == answer.Degrees.Length && form.Education.Length == answer.Degrees.Length,
                $"{right}/{answer.Degrees.Length}, {form.Education.Length} parsed");
        }

        // Skills: recall of the expected list, so extra skills the model found don't count against it.
        string SkillsCell(Expected answer, ResumeForm form)
        {
            if (answer.Skills is null)
                return "–";
            var got = form.Skills.Select(x => Loose(x.Name)).ToHashSet();
            var found = answer.Skills.Count(skill => got.Contains(Loose(skill)));
            return Score("skills", true, found == answer.Skills.Length, $"{found}/{answer.Skills.Length}");
        }
    }

    // ponytail: greedy best-pair alignment, fine for the handful of entries a resume has;
    // swap in the Hungarian algorithm if lists get long enough for greedy to pick wrong.
    private static List<(TGold Gold, TGot Got, double Score)> Align<TGold, TGot>(TGold[] gold, TGot[] got, Func<TGold, TGot, double> similarity)
    {
        var candidates = gold.SelectMany((g, i) => got.Select((p, j) => (i, j, score: similarity(g, p))))
            .OrderByDescending(x => x.score)
            .ToList();
        var usedGold = new HashSet<int>();
        var usedGot = new HashSet<int>();
        var pairs = new List<(TGold, TGot, double)>();
        foreach (var (i, j, score) in candidates)
        {
            if (usedGold.Contains(i) || usedGot.Contains(j))
                continue;
            usedGold.Add(i);
            usedGot.Add(j);
            pairs.Add((gold[i], got[j], score));
        }
        return pairs;
    }

    // 1 when one normalised string contains the other, else token overlap.
    private static double Similarity(string a, string b)
    {
        var x = Loose(a);
        var y = Loose(b);
        if (x.Length == 0 || y.Length == 0)
            return 0;
        if (x.Contains(y) || y.Contains(x))
            return 1;
        var tokensA = Tokens(a);
        var tokensB = Tokens(b);
        return tokensA.Count == 0 ? 0 : (double)tokensA.Intersect(tokensB).Count() / Math.Max(tokensA.Count, tokensB.Count);
    }

    private static HashSet<string> Tokens(string value) =>
        value.ToLowerInvariant().Split([' ', ',', '.', '-', '/', '(', ')', '&'], StringSplitOptions.RemoveEmptyEntries)
            .Where(token => token.Length > 2 && token is not ("the" or "and" or "of" or "for"))
            .ToHashSet();

    private static string Loose(string? value) => ResumeDerived.NormalizeName(value ?? "");

    private static string Digits(string? value) => new((value ?? string.Empty).Where(char.IsDigit).ToArray());
}
