using System.Text.Json;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// The permission rules sent to the web app must say what the API enforces.
public sealed class AbilitiesTests
{
    private const string Email = "person@example.test";

    // A built-in role's capabilities, plus any extras (dropped when what they need is missing).
    private static List<AbilityRule> Rules(
        UserRole role,
        string[]? teams = null,
        params string[] extras
    ) =>
        Abilities.RulesFor(
            Permissions.Normalize(Permissions.BuiltIn[role].Concat(extras)),
            Email,
            teams ?? []
        );

    private static string[] Conditions(List<AbilityRule> rules, string action, string subject) =>
        rules
            .Where(x => x.Action == action && x.Subject == subject)
            .Select(x => JsonSerializer.Serialize(x.Conditions))
            .ToArray();

    [Fact]
    public void Admins_can_do_everything()
    {
        var rules = Rules(UserRole.Admin);
        rules.ShouldHaveSingleItem();
        rules[0].ShouldBe(new AbilityRule("manage", "all"));
    }

    private static readonly string Managing =
        """{"members":{"$elemMatch":{"email":"EMAIL","role":{"$in":["HiringManager","Recruiter"]}}}}""".Replace(
            "EMAIL",
            Email
        );

    [Fact]
    public void Recruiters_manage_every_open_job_until_teams_narrow_it()
    {
        Conditions(Rules(UserRole.Recruiter), "update", "Job")
            .ShouldBe(
                [
                    Managing,
                    $$"""{"ownerEmail":"{{Email}}"}""",
                    $$"""{"recruiterEmail":"{{Email}}"}""",
                    """{"isConfidential":false}""",
                ],
                ignoreOrder: true
            );
        Conditions(Rules(UserRole.Recruiter, ["Engineering"]), "update", "Job")
            .ShouldContain("""{"isConfidential":false,"department":{"$in":["Engineering"]}}""");
        // Anyone on the team sees the job; only hiring managers and recruiters on it change it.
        Conditions(Rules(UserRole.Recruiter), "read", "Job")
            .ShouldContain(
                """{"members":{"$elemMatch":{"email":"EMAIL"}}}""".Replace("EMAIL", Email)
            );
        Conditions(Rules(UserRole.Recruiter), "update", "Job")
            .ShouldNotContain($$"""{"viewerEmails":"{{Email}}"}""");
    }

    [Fact]
    public void Teams_widen_what_a_hiring_manager_sees_but_not_what_they_change()
    {
        Conditions(Rules(UserRole.HiringManager), "read", "Job")
            .ShouldNotContain(x => x.Contains("isConfidential"));
        Conditions(Rules(UserRole.HiringManager, ["Design"]), "read", "Job")
            .ShouldContain("""{"isConfidential":false,"department":{"$in":["Design"]}}""");
        Conditions(Rules(UserRole.HiringManager, ["Design"]), "update", "Job")
            .ShouldBe(
                [
                    Managing,
                    $$"""{"ownerEmail":"{{Email}}"}""",
                    $$"""{"recruiterEmail":"{{Email}}"}""",
                ],
                ignoreOrder: true
            );
    }

    [Fact]
    public void Interviewers_see_their_interviews_and_extras_follow_the_role_settings()
    {
        var interviewer = Rules(UserRole.Interviewer);
        interviewer.ShouldNotContain(x => x.Subject == "Job");
        // Pinning and private notes belong to the hiring team; deleting others' notes to admins.
        interviewer.ShouldNotContain(x => x.Subject == "Note");
        Rules(UserRole.HiringManager).ShouldContain(new AbilityRule("update", "Note"));
        Rules(UserRole.Recruiter)
            .ShouldNotContain(x => x.Action == "delete" && x.Subject == "Note");
        interviewer.ShouldContain(x => x.Action == "submit" && x.Subject == "Scorecard");
        Conditions(interviewer, "read", "Interview")
            .ShouldBe([$$"""{"interviewerEmails":"{{Email}}"}"""]);

        Rules(UserRole.Interviewer, null, Permissions.Reports)
            .ShouldContain(new AbilityRule("read", "Report"));
        // Import needs the right to add candidates, which only recruiters (and admins) have.
        Rules(UserRole.HiringManager, null, Permissions.Import)
            .ShouldNotContain(x => x.Action == "import");
        Rules(UserRole.Recruiter, null, Permissions.Import)
            .ShouldContain(new AbilityRule("import", "Candidate"));
    }

    [Fact]
    public void Custom_capabilities_decide_the_rules_and_the_role_claims_the_api_reads()
    {
        // Candidates without every open job: their own jobs, but they keep candidate records.
        var sourcer = Abilities.RulesFor(
            Permissions.Normalize([Permissions.Jobs, Permissions.Candidates]),
            Email,
            []
        );
        sourcer.ShouldContain(new AbilityRule("create", "Candidate"));
        Conditions(sourcer, "update", "Job").ShouldNotContain(x => x.Contains("isConfidential"));
        sourcer.ShouldNotContain(x => x.Subject == "Report");

        // Every open job without candidate records: a coordinator.
        var coordinator = Abilities.RulesFor(
            Permissions.Normalize([Permissions.Jobs, Permissions.AllJobs]),
            Email,
            []
        );
        Conditions(coordinator, "update", "Job").ShouldContain("""{"isConfidential":false}""");
        coordinator.ShouldNotContain(x => x.Action == "create" && x.Subject == "Candidate");

        // A capability without what it needs is dropped; managing the workspace includes everything.
        Permissions
            .Normalize([Permissions.Import, Permissions.AllJobs, Permissions.Reports])
            .ShouldBe([Permissions.Reports]);
        Permissions.Normalize([Permissions.Workspace]).ShouldBe(Permissions.All);

        // The role claims say one capability each, so the API's IsInRole checks follow the role.
        Permissions
            .RoleClaims(Permissions.BuiltIn[UserRole.Recruiter])
            .ShouldBe(["Recruiter", "HiringManager"]);
        Permissions
            .RoleClaims(Permissions.Normalize([Permissions.Jobs, Permissions.Candidates]))
            .ShouldBe(["HiringManager"]);
        Permissions.RoleClaims([Permissions.Reports]).ShouldBe(["Interviewer"]);
        Permissions.RoleClaims(Permissions.All).ShouldBe(["Admin"]);
        Permissions
            .KindOf(Permissions.Normalize([Permissions.Jobs, Permissions.AllJobs]))
            .ShouldBe(UserRole.Recruiter);
        Permissions.KindOf([Permissions.Reports]).ShouldBe(UserRole.Interviewer);
        foreach (var (role, permissions) in Permissions.BuiltIn)
            Permissions.KindOf(permissions).ShouldBe(role);
    }
}
