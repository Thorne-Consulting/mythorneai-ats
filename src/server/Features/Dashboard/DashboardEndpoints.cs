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
    private static void MapDashboard(RouteGroupBuilder api)
    {
        api.MapGet(
            "/dashboard",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var requisitions = ScopeRequisitions(db.Requisitions.AsNoTracking(), principal);
                var applications = ScopeApplications(db.Applications.AsNoTracking(), principal);
                var applicationIds = applications.Select(x => x.Id);
                var email = principal.Email();
                var now = DateTimeOffset.UtcNow;

                var summary = new
                {
                    OpenRequisitions = await requisitions.CountAsync(
                        x => x.Status == RequisitionStatus.Open,
                        ct
                    ),
                    ActiveCandidates = await applications.CountAsync(
                        x => x.Status == ApplicationStatus.Active,
                        ct
                    ),
                    InterviewsThisWeek = await db
                        .Interviews.AsNoTracking()
                        .CountAsync(
                            x =>
                                applicationIds.Contains(x.ApplicationId)
                                && (
                                    principal.IsHiringStaff()
                                    || principal.IsInRole(nameof(UserRole.HiringManager))
                                    || x.InterviewerEmails.Contains(email)
                                )
                                && x.StartsAt >= now
                                && x.StartsAt < now.AddDays(7)
                                && x.Status == InterviewStatus.Scheduled,
                            ct
                        ),
                    // Everything active, by stage, so the chart agrees with the "active applicants" count.
                    Pipeline = await applications
                        .Where(x => x.Status == ApplicationStatus.Active)
                        .GroupBy(x => x.PipelineStage!.Name)
                        .Select(g => new
                        {
                            Stage = g.Key,
                            Count = g.Count(),
                            Order = g.Min(x => x.PipelineStage!.SortOrder),
                        })
                        .OrderBy(x => x.Order)
                        .ToListAsync(ct),
                    // Interviews I'm assigned to that have started and still have no scorecard from me.
                    ScorecardsDue = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && x.InterviewerEmails.Contains(email)
                            && (x.Status == InterviewStatus.Scheduled || x.Status == InterviewStatus.Completed)
                            && x.StartsAt < now
                            && !x.Scorecards.Any(s => s.InterviewerEmail == email)
                        )
                        .OrderBy(x => x.EndsAt)
                        .Take(10)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.EndsAt,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            RequisitionTitle = x.Application.Requisition!.Title,
                        })
                        .ToListAsync(ct),
                    RecentApplications = await applications
                        .OrderByDescending(x => x.LastActivityAt)
                        .Take(6)
                        .Select(x => new
                        {
                            x.Id,
                            CandidateName = x.Candidate!.FirstName + " " + x.Candidate.LastName,
                            CandidateTitle = x.Candidate.CurrentTitle,
                            RequisitionTitle = x.Requisition!.Title,
                            Stage = x.PipelineStage!.Name,
                            x.LastActivityAt,
                        })
                        .ToListAsync(ct),
                    UpcomingInterviews = await db
                        .Interviews.AsNoTracking()
                        .Where(x =>
                            applicationIds.Contains(x.ApplicationId)
                            && (
                                principal.IsHiringStaff()
                                || principal.IsInRole(nameof(UserRole.HiringManager))
                                || x.InterviewerEmails.Contains(email)
                            )
                            && x.StartsAt >= now
                            && x.Status == InterviewStatus.Scheduled
                        )
                        .OrderBy(x => x.StartsAt)
                        .Take(5)
                        .Select(x => new
                        {
                            x.Id,
                            x.ApplicationId,
                            x.Title,
                            x.StartsAt,
                            x.EndsAt,
                            CandidateName = x.Application!.Candidate!.FirstName
                                + " "
                                + x.Application.Candidate.LastName,
                            RequisitionTitle = x.Application.Requisition!.Title,
                        })
                        .ToListAsync(ct),
                };

                return Results.Ok(summary);
            }
        );
    }
}
