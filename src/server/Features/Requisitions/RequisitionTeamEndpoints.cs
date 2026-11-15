using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapRequisitionTeam(RouteGroupBuilder api)
    {
        // Everyone who can be put on a hiring team, for the Team tab's people picker.
        api.MapGet(
                "/requisitions/people",
                async (AtsDbContext db, CancellationToken ct) =>
                    Results.Ok(
                        await db
                            .Users.AsNoTracking()
                            .Where(x => x.IsActive)
                            .OrderBy(x => x.DisplayName)
                            .Select(x => new
                            {
                                x.Id,
                                x.Email,
                                x.DisplayName,
                                Role = x.Role.ToString(),
                            })
                            .ToListAsync(ct)
                    )
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        // Replaces the job's hiring team. At least one hiring manager; interviewers (by account)
        // can only interview or view. The old email fields are kept in step for other areas.
        api.MapPut(
                "/requisitions/{id:guid}/members",
                async (
                    Guid id,
                    SaveMembersRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var requisition = await db
                        .Requisitions.Include(x => x.Members)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (requisition is null || !CanManage(requisition, principal))
                        return Results.NotFound();
                    var input = (request.Members ?? []).ToList();
                    if (input.Count > 50)
                        return JobProblem("members", "A hiring team can have up to 50 people.");
                    if (input.Select(x => x.UserId).Distinct().Count() != input.Count)
                        return JobProblem("members", "Give each person one role on this job.");
                    if (input.Any(x => !Enum.IsDefined(x.Role)))
                        return JobProblem("members", "Choose a role for each person.");
                    if (input.All(x => x.Role != RequisitionRole.HiringManager))
                        return JobProblem("members", "A job needs at least one hiring manager.");
                    var userIds = input.Select(x => x.UserId).ToArray();
                    var users = await db
                        .Users.Where(x => userIds.Contains(x.Id) && x.IsActive)
                        .ToDictionaryAsync(x => x.Id, ct);
                    if (users.Count != input.Count)
                        return JobProblem(
                            "members",
                            "Someone on the list no longer has an account."
                        );
                    if (
                        input.Any(x =>
                            users[x.UserId].Role == UserRole.Interviewer
                            && x.Role is not (RequisitionRole.Interviewer or RequisitionRole.Viewer)
                        )
                    )
                        return JobProblem(
                            "members",
                            "People with an interviewer account can interview or view, not run the job."
                        );

                    var before = requisition.Members.ToDictionary(x => x.UserId, x => x.Role);
                    db.RequisitionMembers.RemoveRange(
                        requisition.Members.Where(x => !users.ContainsKey(x.UserId))
                    );
                    foreach (var item in input)
                    {
                        var member = requisition.Members.FirstOrDefault(x =>
                            x.UserId == item.UserId
                        );
                        if (member is null)
                            db.RequisitionMembers.Add(
                                new RequisitionMember
                                {
                                    RequisitionId = id,
                                    UserId = item.UserId,
                                    Role = item.Role,
                                }
                            );
                        else
                            member.Role = item.Role;
                    }
                    RequisitionTeam.Mirror(
                        requisition,
                        input.Select(x => (x.Role, users[x.UserId].Email)).ToList()
                    );
                    requisition.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(
                        db,
                        principal,
                        "Requisition",
                        id,
                        "TeamUpdated",
                        new
                        {
                            Added = input
                                .Where(x => !before.ContainsKey(x.UserId))
                                .Select(x => users[x.UserId].Email)
                                .ToArray(),
                            Removed = before.Keys.Count(x => !users.ContainsKey(x)),
                            Members = input.Count,
                        }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
