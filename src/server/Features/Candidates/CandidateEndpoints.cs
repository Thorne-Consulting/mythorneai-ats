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
    private static void MapCandidates(RouteGroupBuilder api)
    {
        api.MapGet(
            "/candidates",
            async (
                string? search,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var query = db
                    .Candidates.AsNoTracking()
                    .Where(x => canSeeAllCandidates || allowedCandidateIds.Contains(x.Id));
                if (!string.IsNullOrWhiteSpace(search))
                {
                    var term = search.Trim().ToLower();
                    query = query.Where(x =>
                        x.FirstName.ToLower().Contains(term)
                        || x.LastName.ToLower().Contains(term)
                        || x.Email.ToLower().Contains(term)
                        || (x.CurrentTitle != null && x.CurrentTitle.ToLower().Contains(term))
                    );
                }

                return Results.Ok(
                    await query
                        .OrderByDescending(x => x.UpdatedAt)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                            x.Phone,
                            x.Location,
                            x.CurrentTitle,
                            x.Source,
                            x.Tags,
                            x.DoNotContact,
                            ActiveApplications = x.Applications.Count(a =>
                                a.Status == ApplicationStatus.Active
                            ),
                            x.UpdatedAt,
                        })
                        .ToListAsync(ct)
                );
            }
        );

        api.MapGet(
            "/candidates/{id:guid}",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var canSeeContact =
                    principal.IsHiringStaff() || principal.IsInRole(nameof(UserRole.HiringManager));
                var allowedApplicationIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.Id);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var candidate = await db
                    .Candidates.AsNoTracking()
                    .Where(x =>
                        x.Id == id
                        && (
                            canSeeAllCandidates
                            || x.Applications.Any(a => allowedApplicationIds.Contains(a.Id))
                        )
                    )
                    .Select(x => new
                    {
                        x.Id,
                        x.FirstName,
                        x.LastName,
                        Email = canSeeContact ? x.Email : "Restricted",
                        Phone = canSeeContact ? x.Phone : null,
                        x.Location,
                        x.CurrentTitle,
                        LinkedInUrl = canSeeContact ? x.LinkedInUrl : null,
                        x.Source,
                        x.Tags,
                        x.DoNotContact,
                        x.CreatedAt,
                        x.UpdatedAt,
                        Applications = x
                            .Applications.Where(a => allowedApplicationIds.Contains(a.Id))
                            .OrderByDescending(a => a.LastActivityAt)
                            .Select(a => new
                            {
                                a.Id,
                                RequisitionId = a.RequisitionId,
                                RequisitionCode = a.Requisition!.Code,
                                RequisitionTitle = a.Requisition.Title,
                                Stage = a.PipelineStage!.Name,
                                Status = a.Status.ToString(),
                                a.AppliedAt,
                                a.LastActivityAt,
                            }),
                        Attachments = x
                            .Attachments.OrderByDescending(a => a.UploadedAt)
                            .Select(a => new
                            {
                                a.Id,
                                a.OriginalFileName,
                                a.ContentType,
                                a.Length,
                                a.ScanStatus,
                                a.UploadedAt,
                            }),
                    })
                    .SingleOrDefaultAsync(ct);
                return candidate is null ? Results.NotFound() : Results.Ok(candidate);
            }
        );

        api.MapPost(
                "/candidates",
                async (
                    CreateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    var possibleDuplicate = await db
                        .Candidates.AsNoTracking()
                        .Where(x => x.Email == email)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.FirstName + " " + x.LastName,
                            x.Email,
                        })
                        .FirstOrDefaultAsync(ct);
                    if (possibleDuplicate is not null)
                        return Results.Conflict(
                            new
                            {
                                message = "A candidate with this email already exists.",
                                candidate = possibleDuplicate,
                            }
                        );

                    var candidate = new Candidate
                    {
                        FirstName = request.FirstName.Trim(),
                        LastName = request.LastName.Trim(),
                        Email = email,
                        Phone = Clean(request.Phone),
                        Location = Clean(request.Location),
                        CurrentTitle = Clean(request.CurrentTitle),
                        LinkedInUrl = Clean(request.LinkedInUrl),
                        Source = request.Source.Trim(),
                        Tags =
                            request
                                .Tags?.Select(x => x.Trim().ToLowerInvariant())
                                .Where(x => x.Length > 0)
                                .Distinct()
                                .ToArray()
                            ?? [],
                    };
                    db.Candidates.Add(candidate);
                    Audit.Add(
                        db,
                        principal,
                        "Candidate",
                        candidate.Id,
                        "Created",
                        new { candidate.Email, candidate.Source }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Created($"/api/candidates/{candidate.Id}", new { candidate.Id });
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPut(
                "/candidates/{id:guid}",
                async (
                    Guid id,
                    UpdateCandidateRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var candidate = await db.Candidates.SingleOrDefaultAsync(x => x.Id == id, ct);
                    if (candidate is null)
                        return Results.NotFound();
                    var errors = ValidateCandidate(
                        request.FirstName,
                        request.LastName,
                        request.Email,
                        request.Source
                    );
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);
                    var email = request.Email.Trim().ToLowerInvariant();
                    if (await db.Candidates.AnyAsync(x => x.Id != id && x.Email == email, ct))
                        return Results.Conflict(
                            new { message = "Another candidate has this email." }
                        );

                    candidate.FirstName = request.FirstName.Trim();
                    candidate.LastName = request.LastName.Trim();
                    candidate.Email = email;
                    candidate.Phone = Clean(request.Phone);
                    candidate.Location = Clean(request.Location);
                    candidate.CurrentTitle = Clean(request.CurrentTitle);
                    candidate.LinkedInUrl = Clean(request.LinkedInUrl);
                    candidate.Source = request.Source.Trim();
                    candidate.Tags =
                        request
                            .Tags?.Select(x => x.Trim().ToLowerInvariant())
                            .Where(x => x.Length > 0)
                            .Distinct()
                            .ToArray()
                        ?? [];
                    candidate.DoNotContact = request.DoNotContact;
                    candidate.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "Candidate", id, "Updated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapPost(
                "/candidates/{id:guid}/attachments",
                async (
                    Guid id,
                    IFormFile file,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    if (!await db.Candidates.AnyAsync(x => x.Id == id, ct))
                        return Results.NotFound();
                    try
                    {
                        var stored = await files.SaveValidatedAsync(file, ct);
                        var attachment = new Attachment
                        {
                            CandidateId = id,
                            OriginalFileName = Path.GetFileName(file.FileName),
                            StoredFileName = stored.StoredName,
                            ContentType = stored.ContentType,
                            Length = file.Length,
                            UploadedBy = principal.Email(),
                            ScanStatus = "ValidationOnly",
                        };
                        db.Attachments.Add(attachment);
                        Audit.Add(
                            db,
                            principal,
                            "Candidate",
                            id,
                            "AttachmentUploaded",
                            new
                            {
                                attachment.Id,
                                attachment.OriginalFileName,
                                attachment.Length,
                            }
                        );
                        await db.SaveChangesAsync(ct);
                        return Results.Created(
                            $"/api/attachments/{attachment.Id}",
                            new { attachment.Id }
                        );
                    }
                    catch (InvalidDataException exception)
                    {
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                        );
                    }
                }
            )
            .RequireAuthorization(AtsPolicies.ManageCandidates);

        api.MapGet(
            "/attachments/{id:guid}",
            async (
                Guid id,
                bool inline,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var allowedCandidateIds = ScopeApplications(
                        db.Applications.AsNoTracking(),
                        principal
                    )
                    .Select(x => x.CandidateId);
                var canSeeAllCandidates = principal.IsHiringStaff();
                var attachment = await db
                    .Attachments.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.Id == id
                            && (canSeeAllCandidates || allowedCandidateIds.Contains(x.CandidateId)),
                        ct
                    );
                return attachment is null
                    ? Results.NotFound()
                    : Results.File(
                        files.OpenRead(attachment.StoredFileName),
                        attachment.ContentType,
                        inline ? null : attachment.OriginalFileName,
                        attachment.UploadedAt,
                        enableRangeProcessing: true
                    );
            }
        );
    }
}
