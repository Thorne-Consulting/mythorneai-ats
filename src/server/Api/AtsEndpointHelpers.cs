using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    // Access to a job comes from its hiring team (RequisitionMember): anyone on the team sees it,
    // its hiring managers and recruiters change it. Teams (departments) limit a recruiter to their
    // departments and let a hiring manager see the open jobs there too. Confidential jobs stay with
    // their team. The web app gets the same rules from Abilities.RulesFor; change both together.
    private static IQueryable<Requisition> ScopeRequisitions(
        IQueryable<Requisition> query,
        ClaimsPrincipal principal
    )
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return query;
        var email = principal.Email();
        var teams = principal.Departments();
        var anyTeam = teams.Length == 0;
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return query.Where(x =>
                (!x.IsConfidential && (anyTeam || teams.Contains(x.Department)))
                || x.Members.Any(m => m.User!.Email == email)
            );
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x =>
                x.Members.Any(m => m.User!.Email == email)
                || (!anyTeam && !x.IsConfidential && teams.Contains(x.Department))
            );
        return query.Where(x =>
            x.Applications.Any(a => a.Interviews.Any(i => i.InterviewerEmails.Contains(email)))
        );
    }

    private static IQueryable<Application> ScopeApplications(
        IQueryable<Application> query,
        ClaimsPrincipal principal
    )
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return query;
        var email = principal.Email();
        var teams = principal.Departments();
        var anyTeam = teams.Length == 0;
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return query.Where(x =>
                (
                    !x.Requisition!.IsConfidential
                    && (anyTeam || teams.Contains(x.Requisition.Department))
                )
                || x.Requisition!.Members.Any(m => m.User!.Email == email)
            );
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x =>
                x.Requisition!.Members.Any(m => m.User!.Email == email)
                || (
                    !anyTeam
                    && !x.Requisition.IsConfidential
                    && teams.Contains(x.Requisition.Department)
                )
            );
        return query.Where(x => x.Interviews.Any(i => i.InterviewerEmails.Contains(email)));
    }

    /// <summary>
    /// Whether someone may change a job and move its candidates. Members (with their users) load
    /// with every job (auto-included, see RequisitionAccessConfiguration), so every caller gets the
    /// whole team; the first hiring manager and recruiter mirrors stay as a fallback.
    /// </summary>
    internal static bool CanManage(Requisition requisition, ClaimsPrincipal principal)
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return true;
        var email = principal.Email();
        var manages =
            requisition.OwnerEmail == email
            || requisition.RecruiterEmail == email
            || requisition.Members.Any(m =>
                m.Role is RequisitionRole.HiringManager or RequisitionRole.Recruiter
                && string.Equals(m.User?.Email, email, StringComparison.OrdinalIgnoreCase)
            );
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
        {
            var teams = principal.Departments();
            return manages
                || (
                    !requisition.IsConfidential
                    && (teams.Length == 0 || teams.Contains(requisition.Department))
                );
        }
        return principal.IsInRole(nameof(UserRole.HiringManager)) && manages;
    }

    private static Dictionary<string, string[]> ValidateRequisition(
        string? title,
        string? department,
        string? location,
        string? owner,
        string? recruiter,
        int openings
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(title))
            errors["title"] = ["Title is required."];
        if (string.IsNullOrWhiteSpace(department))
            errors["department"] = ["Department is required."];
        if (string.IsNullOrWhiteSpace(location))
            errors["location"] = ["Location is required."];
        if (!LooksLikeEmail(owner))
            errors["ownerEmail"] = ["A valid owner email is required."];
        if (!LooksLikeEmail(recruiter))
            errors["recruiterEmail"] = ["A valid recruiter email is required."];
        if (openings < 1)
            errors["openings"] = ["At least one opening is required."];
        return errors;
    }

    private static Dictionary<string, string[]> ValidateCandidate(
        string firstName,
        string lastName,
        string email,
        string source
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(firstName))
            errors["firstName"] = ["First name is required."];
        if (string.IsNullOrWhiteSpace(lastName))
            errors["lastName"] = ["Last name is required."];
        if (!LooksLikeEmail(email))
            errors["email"] = ["A valid email is required."];
        if (string.IsNullOrWhiteSpace(source))
            errors["source"] = ["Source is required."];
        return errors;
    }

    private static bool LooksLikeEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Contains('@') && value.Length <= 320;

    private static bool IsHiredStage(PipelineStage stage) => stage.Type == StageType.Hired;

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static void QueueEmail(
        AtsDbContext db,
        string recipient,
        string subject,
        string body,
        Guid? applicationId = null
    ) => db.EmailOutbox.Add(new EmailOutboxItem
    {
        ApplicationId = applicationId,
        Recipient = recipient,
        Subject = subject,
        Body = body,
    });
}
