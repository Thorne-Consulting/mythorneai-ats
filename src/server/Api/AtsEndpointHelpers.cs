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
    private static IQueryable<Requisition> ScopeRequisitions(
        IQueryable<Requisition> query,
        ClaimsPrincipal principal
    )
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return query;
        var email = principal.Email();
        // Confidential jobs are visible only to their owner, recruiter and named viewers (admins aside).
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return query.Where(x =>
                !x.IsConfidential
                || x.OwnerEmail == email
                || x.RecruiterEmail == email
                || x.ViewerEmails.Contains(email)
            );
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x => x.OwnerEmail == email || x.RecruiterEmail == email || x.ViewerEmails.Contains(email));
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
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return query.Where(x =>
                !x.Requisition!.IsConfidential
                || x.Requisition.OwnerEmail == email
                || x.Requisition.RecruiterEmail == email
                || x.Requisition.ViewerEmails.Contains(email)
            );
        if (principal.IsInRole(nameof(UserRole.HiringManager)))
            return query.Where(x =>
                x.Requisition!.OwnerEmail == email
                || x.Requisition.RecruiterEmail == email
                || x.Requisition.ViewerEmails.Contains(email)
            );
        return query.Where(x => x.Interviews.Any(i => i.InterviewerEmails.Contains(email)));
    }

    internal static bool CanManage(Requisition requisition, ClaimsPrincipal principal)
    {
        if (principal.IsInRole(nameof(UserRole.Admin)))
            return true;
        var email = principal.Email();
        var involved =
            requisition.OwnerEmail == email
            || requisition.RecruiterEmail == email
            || requisition.ViewerEmails.Contains(email);
        if (principal.IsInRole(nameof(UserRole.Recruiter)))
            return !requisition.IsConfidential || involved;
        return principal.IsInRole(nameof(UserRole.HiringManager)) && involved;
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

    private static async Task<bool> RequiresApprovedAcceptanceAsync(AtsDbContext db, CancellationToken ct) =>
        await db.Organizations.Select(x => (bool?)x.RequireOfferApproval).SingleOrDefaultAsync(ct) ?? true;

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
