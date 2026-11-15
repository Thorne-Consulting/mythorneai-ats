using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class CandidateFacingEndpoints
{
    /// <summary>
    /// The team asks the candidate for a document. It shows as a to-do in the portal, and the
    /// candidate gets an email with a link straight to the application.
    /// </summary>
    private static void MapDocumentRequests(RouteGroupBuilder api)
    {
        api.MapGet(
            "/applications/{id:guid}/document-requests",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                if (await ManagedAsync(db, id, principal, ct) is null)
                    return Results.NotFound();
                return Results.Ok(await ListAsync(db, id, ct));
            }
        );

        api.MapPost(
                "/applications/{id:guid}/document-requests",
                async (
                    Guid id,
                    DocumentRequestBody body,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var application = await ManagedAsync(db, id, principal, ct);
                    if (application is null)
                        return Results.NotFound();
                    var label = body.Label?.Trim() ?? "";
                    var note = string.IsNullOrWhiteSpace(body.Note) ? null : body.Note.Trim();
                    var kind = string.IsNullOrWhiteSpace(body.Kind)
                        ? AttachmentKinds.Other
                        : body.Kind;
                    var errors = new Dictionary<string, string[]>();
                    if (label.Length is 0 or > 80)
                        errors["label"] = ["Name the document in up to 80 characters."];
                    if (note?.Length > 500)
                        errors["note"] = ["Keep the note under 500 characters."];
                    if (!AttachmentKinds.All.Contains(kind))
                        errors["kind"] = ["Choose what kind of document this is."];
                    if (application.Status != ApplicationStatus.Active)
                        errors["label"] =
                        [
                            "You can ask for documents only on an open application.",
                        ];
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    var request = new DocumentRequest
                    {
                        ApplicationId = id,
                        Label = label,
                        Kind = kind,
                        Note = note,
                        RequestedBy = principal.Email(),
                    };
                    db.DocumentRequests.Add(request);
                    var candidate = application.Candidate!;
                    if (!candidate.DoNotContact)
                    {
                        var link = await CandidateLinks.CreateAsync(
                            db,
                            candidate.Id,
                            id,
                            CandidateLinks.ApplicationPath(id, "documents"),
                            ct
                        );
                        var email = await EmailTemplates.RenderAsync(
                            db,
                            DocumentRequestKey,
                            application.RequisitionId,
                            new Dictionary<string, string>
                            {
                                ["firstName"] = candidate.FirstName,
                                ["lastName"] = candidate.LastName,
                                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                                ["jobTitle"] = application.Requisition!.Title,
                                ["documentName"] = label.ToLowerInvariant(),
                                ["note"] = note ?? "",
                                ["portalLink"] = link ?? "",
                            },
                            ct
                        );
                        db.EmailOutbox.Add(
                            new EmailOutboxItem
                            {
                                ApplicationId = id,
                                Recipient = candidate.Email,
                                Subject = email.Subject,
                                Body = email.Body,
                                TemplateKey = DocumentRequestKey,
                                TemplateVersion = email.Version,
                            }
                        );
                    }
                    Audit.Add(
                        db,
                        principal,
                        "Application",
                        id,
                        "DocumentRequested",
                        new { request.Label, request.Kind }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(await ListAsync(db, id, ct));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapDelete(
                "/applications/{id:guid}/document-requests/{requestId:guid}",
                async (
                    Guid id,
                    Guid requestId,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    if (await ManagedAsync(db, id, principal, ct) is null)
                        return Results.NotFound();
                    // Only an open request can be taken back; a sent file stays on record.
                    var removed = await db
                        .DocumentRequests.Where(x =>
                            x.Id == requestId && x.ApplicationId == id && x.FulfilledAt == null
                        )
                        .ExecuteDeleteAsync(ct);
                    if (removed > 0)
                    {
                        Audit.Add(db, principal, "Application", id, "DocumentRequestCancelled");
                        await db.SaveChangesAsync(ct);
                    }
                    return Results.Ok(await ListAsync(db, id, ct));
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);
    }

    private static async Task<Application?> ManagedAsync(
        AtsDbContext db,
        Guid id,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var application = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        return
            application?.Requisition is null
            || !AtsEndpoints.CanManage(application.Requisition, principal)
            ? null
            : application;
    }

    private static async Task<object> ListAsync(AtsDbContext db, Guid id, CancellationToken ct) =>
        await db
            .DocumentRequests.AsNoTracking()
            .Where(x => x.ApplicationId == id)
            .OrderBy(x => x.FulfilledAt != null)
            .ThenByDescending(x => x.RequestedAt)
            .Select(x => new
            {
                x.Id,
                x.Label,
                x.Kind,
                x.Note,
                x.RequestedBy,
                x.RequestedAt,
                x.FulfilledAt,
                x.AttachmentId,
                FileName = db
                    .Attachments.Where(a => a.Id == x.AttachmentId)
                    .Select(a => a.OriginalFileName)
                    .FirstOrDefault(),
            })
            .ToListAsync(ct);
}
