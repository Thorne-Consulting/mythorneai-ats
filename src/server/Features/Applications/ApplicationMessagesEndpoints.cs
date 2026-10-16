using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record StaffMessageRequest(string Body);

public static partial class AtsEndpoints
{
    private static void MapApplicationMessages(RouteGroupBuilder api)
    {
        api.MapPost(
                "/applications/{id:guid}/messages",
                async (Guid id, StaffMessageRequest request, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var body = request.Body?.Trim() ?? "";
                    if (body.Length is 0 or > 2000)
                        return Results.ValidationProblem(new Dictionary<string, string[]> { ["body"] = ["Write a message of up to 2,000 characters."] });
                    var application = await db.Applications.Include(x => x.Candidate).Include(x => x.Requisition)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (application?.Requisition is null || !CanManage(application.Requisition, principal))
                        return Results.NotFound();
                    if (application.Status == ApplicationStatus.PendingVerification)
                        return Results.Conflict(new { message = "This candidate hasn't confirmed their email yet." });
                    if (application.Candidate!.DoNotContact)
                        return Results.Conflict(new { message = "This candidate is marked do not contact." });
                    db.ApplicationMessages.Add(new ApplicationMessage { ApplicationId = id, FromCandidate = false, Body = body, AuthorEmail = principal.Email() });
                    application.LastActivityAt = DateTimeOffset.UtcNow;
                    var company = await db.Organizations.Select(x => x.Name).SingleOrDefaultAsync(ct) ?? "The hiring team";
                    QueueEmail(db, application.Candidate.Email, $"A message about your {application.Requisition.Title} application",
                        $"Hi {application.Candidate.FirstName},\n\n{company} sent you a message:\n\n{body}\n\nYou can reply from your candidate portal.", id);
                    Audit.Add(db, principal, "Application", id, "MessageSent");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);

        api.MapPost(
                "/applications/{id:guid}/messages/read",
                async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var application = await db.Applications.AsNoTracking().Include(x => x.Requisition).SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (application?.Requisition is null || !CanManage(application.Requisition, principal))
                        return Results.NotFound();
                    await db.ApplicationMessages.Where(x => x.ApplicationId == id && x.FromCandidate && x.ReadAt == null)
                        .ExecuteUpdateAsync(u => u.SetProperty(x => x.ReadAt, DateTimeOffset.UtcNow), ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }
}
