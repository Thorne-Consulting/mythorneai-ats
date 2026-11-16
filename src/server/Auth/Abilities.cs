using System.Text.Json.Serialization;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Auth;

/// <summary>
/// One permission rule in the shape the web app's CASL (<c>@casl/ability</c>) reads: an action on a
/// kind of record, optionally only for records whose fields match <see cref="Conditions"/> (several
/// rules for the same action mean "any of these").
/// </summary>
public sealed record AbilityRule(
    string Action,
    string Subject,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        Dictionary<string, object>? Conditions = null
);

/// <summary>
/// What a signed-in person may do, computed once from their role's capabilities
/// (<see cref="Permissions"/>), their teams (departments) and their place on each job. The API
/// enforces the same through its policies, <c>ScopeRequisitions</c> and <c>CanManage</c>; the web app
/// only reads these to hide what someone can't do. Change both together.
/// </summary>
public static class Abilities
{
    public static List<AbilityRule> RulesFor(
        IReadOnlyCollection<string> permissions,
        string email,
        IReadOnlyCollection<string> departments
    )
    {
        if (permissions.Contains(Permissions.Workspace))
            return [new("manage", "all")];

        // Everyone: the interviews they are on, the candidates in them, and their own feedback.
        var rules = new List<AbilityRule>
        {
            new("read", "Candidate"),
            new("read", "Interview", new() { ["interviewerEmails"] = email }),
            new("submit", "Scorecard"),
        };

        if (permissions.Contains(Permissions.Jobs))
        {
            var allJobs = permissions.Contains(Permissions.AllJobs);
            foreach (var conditions in JobScope(allJobs, email, departments, manage: false))
                rules.Add(new("read", "Job", conditions));
            foreach (var conditions in JobScope(allJobs, email, departments, manage: true))
                rules.Add(new("update", "Job", conditions));
            rules.AddRange([
                new("create", "Job"),
                new("create", "Application"),
                new("schedule", "Interview"),
                new("read", "Message"),
                new("send", "Message"),
                new("read", "Assessment"),
                // Offers on jobs they change, and ones they are asked to approve (GET .../offer).
                new("read", "Offer"),
                // Pin notes, mark them private and read private ones (CanSeeContact, the pin
                // endpoints). Your own notes you edit and delete anyway; others' only admins.
                new("update", "Note"),
            ]);
        }

        if (permissions.Contains(Permissions.Candidates))
            rules.AddRange([
                new("create", "Candidate"),
                new("update", "Candidate"),
                new("manage", "InterviewKit"),
                new("manage", "Assessment"),
            ]);

        if (permissions.Contains(Permissions.Reports))
            rules.Add(new("read", "Report"));
        if (permissions.Contains(Permissions.Import))
            rules.Add(new("import", "Candidate"));
        if (permissions.Contains(Permissions.Templates))
            rules.Add(new("manage", "Template"));
        return rules;
    }

    /// <summary>
    /// The jobs someone who works on jobs can see (<paramref name="manage"/> false) or change, as
    /// "any of" conditions on the job's fields. Mirrors <c>ScopeRequisitions</c> and
    /// <c>CanManage</c>: anyone on the hiring team (<c>members</c>) sees the job, its hiring managers
    /// and recruiters change it; confidential jobs stay with the team; with every open job
    /// (<paramref name="allJobs"/>) teams limit them, otherwise teams widen what they see. The owner, recruiter and viewer email fields
    /// are the team's mirrors, for job lists that don't carry <c>members</c>.
    /// </summary>
    public static IEnumerable<Dictionary<string, object>> JobScope(
        bool allJobs,
        string email,
        IReadOnlyCollection<string> departments,
        bool manage
    )
    {
        var member = new Dictionary<string, object> { ["email"] = email };
        if (manage)
            member["role"] = new Dictionary<string, object> { ["$in"] = ManagingRoles };
        yield return new()
        {
            ["members"] = new Dictionary<string, object> { ["$elemMatch"] = member },
        };
        yield return new() { ["ownerEmail"] = email };
        yield return new() { ["recruiterEmail"] = email };
        if (!manage)
            yield return new() { ["viewerEmails"] = email };
        var open = new Dictionary<string, object> { ["isConfidential"] = false };
        if (departments.Count > 0)
            open["department"] = new Dictionary<string, object> { ["$in"] = departments };
        if (allJobs || (!manage && departments.Count > 0))
            yield return open;
    }

    /// <summary>Roles on a job that may change it (see <c>CanManage</c>).</summary>
    public static readonly string[] ManagingRoles =
    [
        nameof(RequisitionRole.HiringManager),
        nameof(RequisitionRole.Recruiter),
    ];
}
