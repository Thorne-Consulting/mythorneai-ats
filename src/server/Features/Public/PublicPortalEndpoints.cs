using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    private static void MapPublicPortal(RouteGroupBuilder api)
    {
        api.MapGet(
            "/portal",
            async (
                [FromHeader(Name = SessionHeader)] string? token,
                HttpContext http,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                // Nobody signed in is not an error: the portal shows the sign-in page.
                if (string.IsNullOrWhiteSpace(token))
                    return Results.NoContent();
                var session = await CurrentSessionAsync(http, db, token, ct);
                if (session?.Candidate is null)
                {
                    ClearSessionCookie(http);
                    return Results.Unauthorized();
                }
                var secret = ApplicationIntake.SecretKeys;
                var applications = await db
                    .Applications.AsNoTracking()
                    .Where(x =>
                        x.CandidateId == session.CandidateId
                        && x.Status != ApplicationStatus.PendingVerification
                    )
                    .OrderByDescending(x => x.LastActivityAt)
                    .Select(x => new
                    {
                        x.Id,
                        x.RequisitionId,
                        JobTitle = x.Requisition!.Title,
                        // Whether "View job" can open the public posting.
                        JobListed = x.Requisition.Status == RequisitionStatus.Open
                            && !x.Requisition.IsConfidential,
                        // Candidates see the stage's candidate label, never the team's internal name.
                        Stage = x.PipelineStage!.CandidateLabel != null
                        && x.PipelineStage.CandidateLabel != ""
                            ? x.PipelineStage.CandidateLabel
                            : x.PipelineStage.Type == StageType.Applied ? "Application received"
                            : x.PipelineStage.Type == StageType.Screen ? "Under review"
                            : x.PipelineStage.Type == StageType.Interview ? "Interviewing"
                            : x.PipelineStage.Type == StageType.Offer ? "Offer"
                            : x.PipelineStage.Type == StageType.Hired ? "Hired"
                            : "In progress",
                        StageType = x.PipelineStage.Type.ToString(),
                        Status = x.Status.ToString(),
                        x.AppliedAt,
                        x.LastActivityAt,
                        EmailConfirmed = !db.ApplicationSubmissions.Any(s =>
                            s.ApplicationId == x.Id && s.ConfirmedAt == null
                        ),
                        CanWithdraw = x.Status == ApplicationStatus.Active
                            && x.Requisition.AllowCandidateWithdraw,
                        CanReschedule = x.Requisition.AllowCandidateReschedule,
                        // What the team asked for that has not arrived yet (a to-do on Home).
                        DocumentRequests = db
                            .DocumentRequests.Where(r =>
                                r.ApplicationId == x.Id && r.FulfilledAt == null
                            )
                            .OrderBy(r => r.RequestedAt)
                            .Select(r => new
                            {
                                r.Id,
                                r.Label,
                                r.Kind,
                                r.Note,
                                r.RequestedAt,
                            })
                            .ToList(),
                        // Only an offer the team has actually sent; never one still waiting for approval.
                        OfferSentAt = db
                            .Offers.Where(o =>
                                o.ApplicationId == x.Id && o.Status == OfferStatus.Sent
                            )
                            .Max(o => o.SentAt),
                        Thread = x
                            .Messages.Where(m => m.ScheduledFor == null || m.ScheduledFor <= DateTimeOffset.UtcNow)
                            .OrderBy(m => m.CreatedAt)
                            .Select(m => new
                            {
                                m.Id,
                                m.FromCandidate,
                                m.Body,
                                m.CreatedAt,
                                Unread = !m.FromCandidate && m.ReadAt == null,
                                // Files sent with the message, by either side.
                                Files = db
                                    .Attachments.Where(a => a.MessageId == m.Id)
                                    .Select(a => new
                                    {
                                        a.Id,
                                        FileName = a.OriginalFileName,
                                        a.Length,
                                    })
                                    .ToList(),
                            }),
                        Interviews = x
                            .Interviews.Where(i => i.Status == InterviewStatus.Scheduled)
                            .Select(i => new
                            {
                                i.Id,
                                i.Title,
                                i.StartsAt,
                                i.EndsAt,
                                i.TimeZone,
                                i.MeetingLink,
                            }),
                        ProposedInterviews = x
                            .Interviews.Where(i => i.Status == InterviewStatus.Proposed)
                            .Select(i => new
                            {
                                i.Id,
                                i.Title,
                                i.StartsAt,
                                i.EndsAt,
                                i.TimeZone,
                            }),
                        // What we emailed about this application. Copies of team messages are already in
                        // the thread, and emails with a sign-in link or code show only their subject.
                        Emails = db
                            .EmailOutbox.Where(message =>
                                message.ApplicationId == x.Id
                                && message.Recipient == session.Candidate.Email
                                && message.Status == EmailOutboxStatus.Succeeded
                                && message.TemplateKey != "message"
                            )
                            .OrderByDescending(message => message.CreatedAt)
                            .Take(25)
                            .Select(message => new
                            {
                                message.Id,
                                message.Subject,
                                Body = message.TemplateKey != null
                                && secret.Contains(message.TemplateKey)
                                    ? null
                                    : message.Body,
                                message.CreatedAt,
                            })
                            .ToList(),
                    })
                    .ToListAsync(ct);
                var company = await db.Organizations.Select(x => x.Name).SingleOrDefaultAsync(ct);
                var candidate = session.Candidate;
                return Results.Ok(
                    new
                    {
                        candidate = new
                        {
                            candidate.FirstName,
                            candidate.LastName,
                            candidate.Email,
                            candidate.TimeZone,
                            candidate.Phone,
                            candidate.Location,
                            candidate.LinkedInUrl,
                        },
                        company,
                        applications,
                    }
                );
            }
        );

        // Signed in by code proves the address, so the person can confirm an application here too.
        api.MapPost(
            "/portal/applications/{applicationId:guid}/confirm",
            async (
                Guid applicationId,
                [FromHeader(Name = SessionHeader)] string? token,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var candidateId = await CandidateIdFromTokenAsync(db, token, ct);
                if (candidateId is null)
                    return Results.Unauthorized();
                var application = await db
                    .Applications.Include(x => x.Candidate)
                    .SingleOrDefaultAsync(
                        x => x.Id == applicationId && x.CandidateId == candidateId,
                        ct
                    );
                if (application is null)
                    return Results.NotFound();
                await ApplicationIntake.ConfirmAsync(db, application, ct);
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );
    }
}
