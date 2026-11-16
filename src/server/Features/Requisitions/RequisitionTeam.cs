using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>
/// The hiring team as users. Members are the source; OwnerEmail, RecruiterEmail and ViewerEmails
/// are kept as mirrors for the areas that still read them.
/// </summary>
public static class RequisitionTeam
{
    /// <summary>Copies the team into the legacy email fields: the first hiring manager, the first recruiter, everyone else.</summary>
    public static void Mirror(
        Requisition requisition,
        IReadOnlyCollection<(RequisitionRole Role, string Email)> members
    )
    {
        string? First(RequisitionRole role) =>
            members
                .Where(x => x.Role == role)
                .Select(x => x.Email.ToLowerInvariant())
                .FirstOrDefault();
        var manager = First(RequisitionRole.HiringManager);
        var recruiter = First(RequisitionRole.Recruiter);
        requisition.OwnerEmail = manager ?? recruiter ?? requisition.OwnerEmail;
        requisition.RecruiterEmail = recruiter ?? manager ?? requisition.RecruiterEmail;
        requisition.ViewerEmails = members
            .Select(x => x.Email.ToLowerInvariant())
            .Where(x => x != requisition.OwnerEmail && x != requisition.RecruiterEmail)
            .Distinct()
            .ToArray();
    }

    /// <summary>Members for the legacy email fields. Addresses with no user are skipped; one role per person.</summary>
    public static List<RequisitionMember> FromEmails(
        Requisition requisition,
        IReadOnlyDictionary<string, Guid> users
    )
    {
        var wanted = new List<(string Email, RequisitionRole Role)>
        {
            (requisition.OwnerEmail, RequisitionRole.HiringManager),
            (requisition.RecruiterEmail, RequisitionRole.Recruiter),
        };
        wanted.AddRange(requisition.ViewerEmails.Select(x => (x, RequisitionRole.Viewer)));
        var members = new List<RequisitionMember>();
        foreach (var (email, role) in wanted)
            if (
                users.TryGetValue(email.Trim(), out var userId)
                && members.All(x => x.UserId != userId)
            )
                members.Add(
                    new RequisitionMember
                    {
                        RequisitionId = requisition.Id,
                        UserId = userId,
                        Role = role,
                    }
                );
        return members;
    }

    public static async Task<Dictionary<string, Guid>> UserIdsByEmailAsync(
        AtsDbContext db,
        CancellationToken ct
    ) =>
        (await db.Users.AsNoTracking().Select(x => new { x.Email, x.Id }).ToListAsync(ct))
            .GroupBy(x => x.Email.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.First().Id, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Gives jobs from before members a team from their email fields. Runs at startup; a job that
    /// already has members is skipped, so it is safe to run every time.
    /// </summary>
    public static async Task BackfillAsync(AtsDbContext db, CancellationToken ct = default)
    {
        var jobs = await db.Requisitions.Where(x => !x.Members.Any()).ToListAsync(ct);
        if (jobs.Count == 0)
            return;
        var users = await UserIdsByEmailAsync(db, ct);
        foreach (var job in jobs)
            db.RequisitionMembers.AddRange(FromEmails(job, users));
        await db.SaveChangesAsync(ct);
    }

    /// <summary>Swaps who holds a role when a legacy email field changes (PUT /requisitions/{id}).</summary>
    public static async Task ReplaceAsync(
        AtsDbContext db,
        Guid requisitionId,
        RequisitionRole role,
        string oldEmail,
        string newEmail,
        CancellationToken ct
    )
    {
        if (string.Equals(oldEmail, newEmail, StringComparison.OrdinalIgnoreCase))
            return;
        var members = await db
            .RequisitionMembers.Include(x => x.User)
            .Where(x => x.RequisitionId == requisitionId)
            .ToListAsync(ct);
        var old = members.FirstOrDefault(x =>
            x.Role == role
            && string.Equals(x.User!.Email, oldEmail, StringComparison.OrdinalIgnoreCase)
        );
        if (old is not null)
            db.RequisitionMembers.Remove(old);
        var email = newEmail.ToLower();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email.ToLower() == email, ct);
        if (user is null)
            return;
        var existing = members.FirstOrDefault(x => x.UserId == user.Id && x != old);
        if (existing is not null)
            existing.Role = role;
        else
            db.RequisitionMembers.Add(
                new RequisitionMember
                {
                    RequisitionId = requisitionId,
                    UserId = user.Id,
                    Role = role,
                }
            );
    }

    public static string RoleLabel(RequisitionRole role) =>
        role switch
        {
            RequisitionRole.HiringManager => "Hiring manager",
            RequisitionRole.Recruiter => "Recruiter",
            RequisitionRole.Interviewer => "Interviewer",
            _ => "Can view",
        };
}
