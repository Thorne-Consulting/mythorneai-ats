using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed record WebhookEventInfo(string Type, string Label, string Description, object Sample);

/// <summary>
/// The webhook event catalog, Standard Webhooks signing, and the events found in tracked changes.
/// application.created, stage_changed and hired are still published by PipelineEvents where they
/// happen; everything else is read from what a save changes, so no endpoint can forget one.
/// </summary>
public static class WebhookEvents
{
    private static readonly object SampleCandidate = new
    {
        id = Guid.Parse("4f1c2a7e-0d7b-4a52-9a43-1d3f0b2c6e11"),
        firstName = "Jordan",
        lastName = "Lee",
        email = "jordan.lee@example.com",
    };

    private static readonly object SampleJob = new
    {
        id = Guid.Parse("8b2d6c90-3e1f-4b7a-a5c4-7e9f1a2b3c44"),
        code = "ENG-104",
        title = "Data analyst",
    };

    private static object SampleApplication(string status, string stage) =>
        new
        {
            applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
            status,
            stage,
            candidate = SampleCandidate,
            job = new
            {
                id = Guid.Parse("8b2d6c90-3e1f-4b7a-a5c4-7e9f1a2b3c44"),
                code = "ENG-104",
                title = "Data analyst",
                department = "Engineering",
                targetStartDate = "2027-01-11",
            },
            extra = (object?)null,
        };

    private static object SampleInterview(string status) =>
        new
        {
            interviewId = Guid.Parse("1e2d3c4b-5a69-4788-9a0b-c1d2e3f4a533"),
            applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
            title = "Technical interview",
            status,
            startsAt = "2026-11-20T15:00:00+00:00",
            endsAt = "2026-11-20T16:00:00+00:00",
            timeZone = "America/Chicago",
            interviewerEmails = new[] { "tomas@example.com" },
            candidate = SampleCandidate,
            job = SampleJob,
        };

    private static object SampleOffer(string status) =>
        new
        {
            offerId = Guid.Parse("9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c55"),
            applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
            status,
            startDate = "2027-01-11",
            candidate = SampleCandidate,
            job = SampleJob,
        };

    private static object SampleJobData(string status) =>
        new
        {
            job = new
            {
                id = Guid.Parse("8b2d6c90-3e1f-4b7a-a5c4-7e9f1a2b3c44"),
                code = "ENG-104",
                title = "Data analyst",
                department = "Engineering",
                location = "Chicago, IL",
                openings = 2,
                status,
            },
        };

    public static readonly WebhookEventInfo[] Catalog =
    [
        new(
            "candidate.created",
            "A candidate is added",
            "Someone is added by your team, imported, or applies for the first time.",
            new { candidate = SampleCandidate, source = "Careers site" }
        ),
        new(
            "application.created",
            "Someone applies",
            "A new application to a job, from the careers site or added by your team.",
            SampleApplication("Active", "Applied")
        ),
        new(
            "application.stage_changed",
            "An application moves stage",
            "An application moves to another stage, or its status changes.",
            SampleApplication("Active", "Interview")
        ),
        new(
            "application.rejected",
            "An application is rejected",
            "Your team rejects an application.",
            new
            {
                applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
                status = "Rejected",
                stage = "Review",
                candidate = SampleCandidate,
                job = new
                {
                    id = Guid.Parse("8b2d6c90-3e1f-4b7a-a5c4-7e9f1a2b3c44"),
                    code = "ENG-104",
                    title = "Data analyst",
                    department = "Engineering",
                    targetStartDate = "2027-01-11",
                },
                extra = new { reason = "Not enough experience with SQL" },
            }
        ),
        new(
            "application.hired",
            "Someone is hired",
            "An application reaches Hired.",
            SampleApplication("Hired", "Hired")
        ),
        new(
            "interview.scheduled",
            "An interview is scheduled",
            "An interview gets a confirmed time.",
            SampleInterview("Scheduled")
        ),
        new(
            "interview.cancelled",
            "An interview is cancelled",
            "A scheduled interview is called off.",
            SampleInterview("Cancelled")
        ),
        new(
            "scorecard.submitted",
            "Feedback is submitted",
            "An interviewer submits a scorecard. The written answers are not included.",
            new
            {
                scorecardId = Guid.Parse("2b3c4d5e-6f70-4812-93a4-b5c6d7e8f966"),
                interviewId = Guid.Parse("1e2d3c4b-5a69-4788-9a0b-c1d2e3f4a533"),
                applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
                interviewerEmail = "tomas@example.com",
                recommendation = "Yes",
                rating = 4,
                candidate = SampleCandidate,
                job = SampleJob,
            }
        ),
        new(
            "assessment.completed",
            "An assessment is finished",
            "A candidate submits an assessment (or its time runs out), or your team enters the result of an outside test. Results from outside tests have only the percent.",
            new
            {
                inviteId = Guid.Parse("5d6e7f80-91a2-4b3c-8d4e-5f6a7b8c9d77"),
                assessmentId = Guid.Parse("6e7f8091-a2b3-4c4d-9e5f-6a7b8c9d0e88"),
                applicationId = Guid.Parse("c3a9e5d1-7b2f-4c8e-9d0a-5f6b7c8d9e22"),
                submittedAt = "2026-11-18T17:42:00+00:00",
                autoSubmitted = false,
                percent = 82,
                pending = 1,
            }
        ),
        new(
            "offer.approved",
            "An offer is approved",
            "Every approver has signed off on an offer.",
            SampleOffer("Approved")
        ),
        new(
            "offer.sent",
            "An offer is sent",
            "An offer goes to the candidate.",
            SampleOffer("Sent")
        ),
        new(
            "offer.accepted",
            "An offer is accepted",
            "The candidate says yes to an offer.",
            SampleOffer("Accepted")
        ),
        new(
            "offer.declined",
            "An offer is declined",
            "The candidate says no to an offer.",
            SampleOffer("Declined")
        ),
        new("job.opened", "A job opens", "A job opens for applications.", SampleJobData("Open")),
        new(
            "job.closed",
            "A job closes",
            "A job is closed, filled or cancelled. The status says which.",
            SampleJobData("Filled")
        ),
    ];

    public static readonly string[] Types = Catalog.Select(x => x.Type).ToArray();

    public static string NewSecret() =>
        "whsec_" + Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));

    public static string Mask(string secret) => $"whsec_••••{secret[^4..]}";

    /// <summary>
    /// The Standard Webhooks signature (standardwebhooks.com): base64 HMAC-SHA256 of
    /// "{id}.{timestamp}.{body}", keyed with the base64 part of the secret.
    /// </summary>
    public static string Sign(string secret, string id, long timestamp, string body)
    {
        var key = Convert.FromBase64String(
            secret.StartsWith("whsec_", StringComparison.Ordinal) ? secret[6..] : secret
        );
        return "v1,"
            + Convert.ToBase64String(
                HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"{id}.{timestamp}.{body}"))
            );
    }

    public static string Envelope(string type, object? data) =>
        JsonSerializer.Serialize(
            new
            {
                id = Guid.NewGuid(),
                type,
                occurredAt = DateTimeOffset.UtcNow,
                data,
            },
            Audit.Json
        );

    /// <summary>Queues a delivery for each active endpoint that wants an event this save causes.</summary>
    public static async Task CollectAsync(AtsDbContext db, CancellationToken ct)
    {
        var found = new List<(string Type, object Entity)>();
        foreach (var entry in db.ChangeTracker.Entries().ToList())
        {
            var added = entry.State == EntityState.Added;
            if (!added && entry.State != EntityState.Modified)
                continue;
            string? NewStatus() =>
                added
                    ? entry.Metadata.FindProperty("Status") is null
                        ? null
                        : entry.Property("Status").CurrentValue?.ToString()
                    : entry.Metadata.FindProperty("Status") is not null
                    && entry.Property("Status").IsModified
                        ? entry.Property("Status").CurrentValue?.ToString()
                        : null;
            var status = NewStatus();
            var type = entry.Entity switch
            {
                Candidate when added => "candidate.created",
                Application when !added && status == "Rejected" => "application.rejected",
                Interview when status == "Scheduled" => "interview.scheduled",
                Interview when !added && status == "Cancelled" => "interview.cancelled",
                Scorecard when added => "scorecard.submitted",
                Offer when !added => status switch
                {
                    "Approved" => "offer.approved",
                    "Sent" => "offer.sent",
                    "Accepted" => "offer.accepted",
                    "Declined" => "offer.declined",
                    _ => null,
                },
                Requisition => status switch
                {
                    "Open" => "job.opened",
                    "Closed" or "Filled" or "Cancelled" when !added => "job.closed",
                    _ => null,
                },
                _ => null,
            };
            if (type is not null)
                found.Add((type, entry.Entity));
        }
        if (found.Count == 0)
            return;

        var endpoints = await db
            .WebhookEndpoints.AsNoTracking()
            .Where(x => x.IsActive)
            .Select(x => new
            {
                x.Id,
                x.Url,
                x.Events,
            })
            .ToListAsync(ct);
        foreach (var (type, entity) in found)
        {
            var targets = endpoints
                .Where(x => x.Events.Length == 0 || x.Events.Contains(type))
                .ToList();
            if (targets.Count == 0)
                continue;
            var payload = Envelope(type, await DataAsync(db, entity, ct));
            foreach (var target in targets)
                db.WebhookDeliveries.Add(
                    new WebhookDelivery
                    {
                        EndpointId = target.Id,
                        Url = target.Url,
                        EventType = type,
                        Payload = payload,
                    }
                );
        }
    }

    private static async Task<object?> DataAsync(
        AtsDbContext db,
        object entity,
        CancellationToken ct
    )
    {
        switch (entity)
        {
            case Candidate c:
                return new
                {
                    candidate = new
                    {
                        id = c.Id,
                        firstName = c.FirstName,
                        lastName = c.LastName,
                        email = c.Email,
                    },
                    source = c.Source,
                };
            case Application a:
                // Same shape as PipelineEvents.PublishApplicationAsync, so every application.* event matches.
                return await db
                    .Applications.AsNoTracking()
                    .Where(x => x.Id == a.Id)
                    .Select(x => new
                    {
                        applicationId = x.Id,
                        status = a.Status.ToString(),
                        stage = db
                            .PipelineStages.Where(p => p.Id == a.PipelineStageId)
                            .Select(p => p.Name)
                            .FirstOrDefault(),
                        candidate = new
                        {
                            id = x.CandidateId,
                            firstName = x.Candidate!.FirstName,
                            lastName = x.Candidate.LastName,
                            email = x.Candidate.Email,
                        },
                        job = new
                        {
                            id = x.RequisitionId,
                            code = x.Requisition!.Code,
                            title = x.Requisition.Title,
                            department = x.Requisition.Department,
                            targetStartDate = x.Requisition.TargetStartDate,
                        },
                        extra = new { reason = a.DispositionReason },
                    })
                    .FirstOrDefaultAsync(ct);
            case Interview i:
            {
                var parties = await PartiesAsync(db, i.ApplicationId, ct);
                return new
                {
                    interviewId = i.Id,
                    applicationId = i.ApplicationId,
                    title = i.Title,
                    status = i.Status.ToString(),
                    startsAt = i.StartsAt,
                    endsAt = i.EndsAt,
                    timeZone = i.TimeZone,
                    interviewerEmails = i.InterviewerEmails,
                    candidate = parties?.Candidate,
                    job = parties?.Job,
                };
            }
            case Scorecard s:
            {
                var applicationId =
                    s.Interview?.ApplicationId
                    ?? await db
                        .Interviews.AsNoTracking()
                        .Where(x => x.Id == s.InterviewId)
                        .Select(x => x.ApplicationId)
                        .FirstOrDefaultAsync(ct);
                var parties = await PartiesAsync(db, applicationId, ct);
                return new
                {
                    scorecardId = s.Id,
                    interviewId = s.InterviewId,
                    applicationId,
                    interviewerEmail = s.InterviewerEmail,
                    recommendation = s.Recommendation.ToString(),
                    rating = s.Rating,
                    candidate = parties?.Candidate,
                    job = parties?.Job,
                };
            }
            case Offer o:
            {
                var parties = await PartiesAsync(db, o.ApplicationId, ct);
                return new
                {
                    offerId = o.Id,
                    applicationId = o.ApplicationId,
                    status = o.Status.ToString(),
                    startDate = o.StartDate,
                    candidate = parties?.Candidate,
                    job = parties?.Job,
                };
            }
            case Requisition r:
                return new
                {
                    job = new
                    {
                        id = r.Id,
                        code = r.Code,
                        title = r.Title,
                        department = r.Department,
                        location = r.Location,
                        openings = r.Openings,
                        status = r.Status.ToString(),
                    },
                };
            default:
                return null;
        }
    }

    private sealed record Parties(object Candidate, object Job);

    private static async Task<Parties?> PartiesAsync(
        AtsDbContext db,
        Guid applicationId,
        CancellationToken ct
    ) =>
        await db
            .Applications.AsNoTracking()
            .Where(x => x.Id == applicationId)
            .Select(x => new Parties(
                new
                {
                    id = x.CandidateId,
                    firstName = x.Candidate!.FirstName,
                    lastName = x.Candidate.LastName,
                    email = x.Candidate.Email,
                },
                new
                {
                    id = x.RequisitionId,
                    code = x.Requisition!.Code,
                    title = x.Requisition.Title,
                }
            ))
            .FirstOrDefaultAsync(ct);
}
