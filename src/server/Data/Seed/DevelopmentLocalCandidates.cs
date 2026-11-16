using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    /// <summary>
    /// Development only: delete every <c>@local.dev</c> candidate with everything hanging off them
    /// (applications, interviews, messages, offers, emails, sessions, files), then seed them again.
    /// Explicit delete order instead of relying on each foreign key's cascade setting.
    /// </summary>
    public static async Task ResetLocalPortalCandidatesAsync(AtsDbContext db, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var candidateIds = await db.Candidates.Where(x => x.Email.EndsWith(CandidateCodes.LocalDomain)).Select(x => x.Id).ToListAsync(ct);
        var appIds = await db.Applications.Where(x => candidateIds.Contains(x.CandidateId)).Select(x => x.Id).ToListAsync(ct);
        var interviewIds = await db.Interviews.Where(x => appIds.Contains(x.ApplicationId)).Select(x => x.Id).ToListAsync(ct);
        var scorecardIds = await db.Set<Scorecard>().Where(x => interviewIds.Contains(x.InterviewId)).Select(x => x.Id).ToListAsync(ct);
        var offerIds = await db.Offers.Where(x => appIds.Contains(x.ApplicationId)).Select(x => x.Id).ToListAsync(ct);
        var attachmentIds = await db.Attachments.Where(x => candidateIds.Contains(x.CandidateId)).Select(x => x.Id).ToListAsync(ct);

        await db.ScorecardCriterionRatings.Where(x => scorecardIds.Contains(x.ScorecardId)).ExecuteDeleteAsync(ct);
        await db.Set<Scorecard>().Where(x => scorecardIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        await db.InterviewRecordings.Where(x => interviewIds.Contains(x.InterviewId)).ExecuteDeleteAsync(ct);
        await db.Interviews.Where(x => interviewIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        await db.Approvals.Where(x => offerIds.Contains(x.SubjectId)).ExecuteDeleteAsync(ct);
        await db.Offers.Where(x => offerIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        await db.ApplicationMessages.Where(x => appIds.Contains(x.ApplicationId)).ExecuteDeleteAsync(ct);
        await db.Notes.Where(x => x.ApplicationId != null && appIds.Contains(x.ApplicationId.Value)).ExecuteDeleteAsync(ct);
        await db.StageTransitions.Where(x => appIds.Contains(x.ApplicationId)).ExecuteDeleteAsync(ct);
        await db.EmailOutbox.Where(x => x.ApplicationId != null && appIds.Contains(x.ApplicationId.Value)).ExecuteDeleteAsync(ct);
        await db.Applications.Where(x => appIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        await db.ResumeParseJobs.Where(x => attachmentIds.Contains(x.AttachmentId)).ExecuteDeleteAsync(ct);
        await db.Attachments.Where(x => attachmentIds.Contains(x.Id)).ExecuteDeleteAsync(ct);
        await db.CandidatePortalSessions.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.JobFits.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.CandidateDismissals.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.WorkExperiences.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Educations.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.CandidateSkills.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Certifications.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.CandidateLanguages.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Projects.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Publications.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Awards.Where(x => candidateIds.Contains(x.CandidateId)).ExecuteDeleteAsync(ct);
        await db.Candidates.Where(x => candidateIds.Contains(x.Id)).ExecuteDeleteAsync(ct);

        await EnsureLocalPortalCandidatesAsync(db, ct);
        await tx.CommitAsync(ct);
    }

    /// <summary>The seeded local candidates, for the dev panel on the portal sign-in page.</summary>
    public static Task<List<LocalCandidate>> ListLocalPortalCandidatesAsync(AtsDbContext db, CancellationToken ct) =>
        db.Candidates.AsNoTracking()
            .Where(x => x.Email.EndsWith(CandidateCodes.LocalDomain))
            .OrderBy(x => x.Email)
            .Select(x => new LocalCandidate(
                x.Email,
                x.FirstName + " " + x.LastName,
                db.Applications.Where(a => a.CandidateId == x.Id).OrderByDescending(a => a.LastActivityAt).Select(a => a.Status.ToString() + " · " + a.PipelineStage!.Name).FirstOrDefault(),
                db.Applications.Count(a => a.CandidateId == x.Id)
            ))
            .ToListAsync(ct);

    public sealed record LocalCandidate(string Email, string Name, string? Latest, int Applications);

    /// <summary>
    /// Local-only candidates for trying the candidate portal and career site end to end. Every one
    /// uses an <c>@local.dev</c> address, so in Development the sign-in code is always
    /// <see cref="CandidateCodes.LocalCode"/>. Each sits at a different point of the process.
    /// Runs on every Development start and does nothing once they exist.
    /// </summary>
    private static async Task EnsureLocalPortalCandidatesAsync(AtsDbContext db, CancellationToken ct)
    {
        if (await db.Candidates.AnyAsync(x => x.Email.EndsWith(CandidateCodes.LocalDomain), ct))
            return;

        // Open jobs on the standard pipeline (New → Review → Interview → … → Offer → Hired).
        var jobs = (
            await db.Requisitions.Include(x => x.Stages)
                .Where(x => x.Status == RequisitionStatus.Open)
                .OrderBy(x => x.Title)
                .ToListAsync(ct)
        )
            .Where(job =>
                job.Stages.Any(s => s.Name == "Review")
                && job.Stages.Any(s => s.Name == "Interview")
                && job.Stages.Any(s => s.Name.StartsWith("Offer"))
                && job.Stages.Any(s => s.IsTerminal)
            )
            .Take(4)
            .ToList();
        if (jobs.Count == 0)
            return;
        Requisition Job(int index) => jobs[index % jobs.Count];
        PipelineStage First(Requisition job) => job.Stages.OrderBy(s => s.SortOrder).First();
        PipelineStage Named(Requisition job, string name) => job.Stages.First(s => s.Name.StartsWith(name));
        PipelineStage Hired(Requisition job) => job.Stages.First(s => s.IsTerminal);

        var now = DateTimeOffset.UtcNow;
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);

        Candidate Person(string first, string last, string email, string title, string location, string source)
        {
            var person = new Candidate
            {
                FirstName = first,
                LastName = last,
                Email = email,
                CurrentTitle = title,
                Location = location,
                Source = source,
                Phone = "+1 555 0100",
                Tags = ["local-test"],
            };
            db.Candidates.Add(person);
            return person;
        }

        Application Apply(
            Candidate person,
            Requisition job,
            PipelineStage stage,
            int appliedDaysAgo,
            int activityDaysAgo = 0,
            ApplicationStatus status = ApplicationStatus.Active,
            string? disposition = null
        )
        {
            var application = new Application
            {
                Candidate = person,
                RequisitionId = job.Id,
                PipelineStageId = stage.Id,
                Source = person.Source,
                Status = status,
                DispositionReason = disposition,
                AppliedAt = now.AddDays(-appliedDaysAgo),
                LastActivityAt = now.AddDays(-activityDaysAgo),
                VerifiedAt = now.AddDays(-appliedDaysAgo),
            };
            db.Applications.Add(application);
            Mail(
                application,
                $"We received your application for {job.Title}",
                $"Hi {person.FirstName},\n\nThanks for applying for {job.Title}. We'll review your application and let you know the next step.\n\nYou can follow your application in the candidate portal.",
                appliedDaysAgo * 24
            );
            return application;
        }

        // Copies of emails the candidate "received"; the portal shows these under "Emails we sent you".
        void Mail(Application application, string subject, string body, int hoursAgo) =>
            db.EmailOutbox.Add(
                new EmailOutboxItem
                {
                    ApplicationId = application.Id,
                    Recipient = application.Candidate!.Email,
                    Subject = subject,
                    Body = body,
                    Status = EmailOutboxStatus.Succeeded,
                    Attempts = 1,
                    CreatedAt = now.AddHours(-hoursAgo),
                    CompletedAt = now.AddHours(-hoursAgo),
                }
            );

        void Message(Application application, bool fromCandidate, string body, int hoursAgo, bool read = true) =>
            db.ApplicationMessages.Add(
                new ApplicationMessage
                {
                    ApplicationId = application.Id,
                    FromCandidate = fromCandidate,
                    AuthorEmail = fromCandidate ? null : "recruiter@example.test",
                    Body = body,
                    CreatedAt = now.AddHours(-hoursAgo),
                    ReadAt = fromCandidate || !read ? null : now.AddHours(-hoursAgo + 1),
                }
            );

        Interview Interview(
            Application application,
            string title,
            DateTimeOffset startsAt,
            int minutes,
            InterviewStatus status,
            string? meetingLink = null
        )
        {
            var interview = new Interview
            {
                ApplicationId = application.Id,
                Title = title,
                StartsAt = startsAt,
                EndsAt = startsAt.AddMinutes(minutes),
                TimeZone = "UTC",
                Status = status,
                MeetingLink = meetingLink,
                // Not a workspace user, so seeded test users keep the access scope the tests expect.
                InterviewerEmails = ["panel@local.dev"],
            };
            db.Interviews.Add(interview);
            return interview;
        }

        // 1. Several applications at once: one in review, one rejected, one withdrawn.
        var casey = Person("Casey", "Morgan", "candidate@local.dev", "Product engineer", "Austin, TX", "Career site");
        var caseyActive = Apply(casey, Job(0), Named(Job(0), "Review"), 6, 1);
        Message(caseyActive, false, "Hi Casey, thanks for applying! We're reviewing your application and will be in touch this week.", 20, read: false);
        var caseyRejected = Apply(casey, Job(1), Named(Job(1), "Interview"), 30, 12, ApplicationStatus.Rejected, "Skills mismatch");
        Mail(caseyRejected, $"Update on your {Job(1).Title} application", "Hi Casey,\n\nThank you for your time with the team. We've decided to move forward with other candidates whose experience is a closer match for this role.\n\nWe'd be glad to see you apply again.", 12 * 24);
        Apply(casey, Job(2), First(Job(2)), 20, 18, ApplicationStatus.Withdrawn, "Withdrew");

        // 2. Just applied.
        var avery = Person("Avery", "Quinn", "applied@local.dev", "Junior analyst", "Remote, US", "Career site");
        Apply(avery, Job(0), First(Job(0)), 0);

        // 3. Interview times proposed; the candidate picks one in the portal.
        var blake = Person("Blake", "Rivera", "booking@local.dev", "Backend engineer", "Denver, CO", "Referral");
        var blakeApp = Apply(blake, Job(1), Named(Job(1), "Interview"), 8, 0);
        foreach (var (day, hour) in new[] { (1, 15), (2, 17), (3, 14) })
            Interview(blakeApp, "Phone screen", today.AddDays(day).AddHours(hour), 30, InterviewStatus.Proposed);
        Mail(blakeApp, "Pick a time for your phone screen", "Hi Blake,\n\nWe'd like to talk with you. Choose the time that suits you best in the candidate portal.", 2);

        // 4. Interview booked, with a conversation going.
        var ivy = Person("Ivy", "Chen", "interview@local.dev", "Product designer", "New York, NY", "LinkedIn");
        var ivyApp = Apply(ivy, Job(0), Named(Job(0), "Interview"), 10, 0);
        Interview(ivyApp, "Technical interview", today.AddDays(2).AddHours(16), 45, InterviewStatus.Scheduled, "https://meet.example.com/ivy-chen");
        Message(ivyApp, false, "Hi Ivy, looking forward to speaking with you on Thursday!", 48);
        Message(ivyApp, true, "Thank you! Is there anything I should prepare?", 30);
        Message(ivyApp, false, "Please bring one project you're proud of. We'll talk through how you approached it.", 6, read: false);
        Mail(ivyApp, "Your interview is booked", "Hi Ivy,\n\nYour technical interview is confirmed. You'll find the meeting link in the candidate portal.", 47);

        // 5. Interviewed, waiting on the decision.
        var morgan = Person("Morgan", "Ellis", "completed@local.dev", "Data analyst", "Chicago, IL", "Job board");
        var morganApp = Apply(morgan, Job(2), Named(Job(2), "Interview"), 14, 2);
        Interview(morganApp, "Panel interview", today.AddDays(-2).AddHours(15), 60, InterviewStatus.Completed);

        // 6. Offer out.
        var olivia = Person("Olivia", "Grant", "offer@local.dev", "Senior engineer", "Seattle, WA", "Referral");
        var oliviaApp = Apply(olivia, Job(1), Named(Job(1), "Offer"), 25, 1);
        db.Offers.Add(
            new Offer
            {
                ApplicationId = oliviaApp.Id,
                Status = OfferStatus.Sent,
                Note = "Strong panel. Pay matches the band for the level.",
                BaseSalary = 145000m,
                StartDate = DateOnly.FromDateTime(now.AddDays(28).UtcDateTime),
                EmploymentType = "Full-time",
                WorkMode = "Hybrid",
                Location = "Seattle, WA",
                Bonus = "10% yearly target",
                ExpiresOn = DateOnly.FromDateTime(now.AddDays(4).UtcDateTime),
                ExpiresAt = new DateTimeOffset(now.AddDays(5).UtcDateTime.Date, TimeSpan.Zero),
                // The evaluation area's letter, as it reads once sent (frozen, details filled in).
                LetterSent =
                    $"Dear Olivia,\n\nWe are delighted to offer you the position of **{Job(1).Title}**. Everyone you met enjoyed getting to know you, and we would love to have you on the team.\n\n## Your offer\n\n- **Base salary:** USD 145,000 per year\n- **Bonus:** 10% yearly target\n- **Start date:** {now.AddDays(28):MMMM d, yyyy}\n- **Role:** Full-time, Hybrid, Seattle, WA\n\n## Next steps\n\nTo accept, choose **Accept offer** on this page. If anything here raises a question, message us and we will get back to you quickly.\n\nSincerely,\n\nRiley Recruiter",
                CreatedBy = "recruiter@example.test",
                CreatedAt = now.AddDays(-2),
                UpdatedAt = now.AddDays(-1),
                SentAt = now.AddDays(-1),
            }
        );
        Mail(oliviaApp, $"Your offer for {Job(1).Title}", "Hi Olivia,\n\nWe're delighted to offer you the role. Your recruiter will walk you through the details and next steps.", 24);

        // 7. Hired.
        var harper = Person("Harper", "Lewis", "hired@local.dev", "Operations lead", "Boston, MA", "Career site");
        var harperApp = Apply(harper, Job(3), Hired(Job(3)), 40, 5, ApplicationStatus.Hired);
        Mail(harperApp, "Welcome to the team", "Hi Harper,\n\nCongratulations and welcome aboard! Your manager will reach out before your first day.", 5 * 24);

        // 8. Rejected after review.
        var riley = Person("Riley", "Brooks", "rejected@local.dev", "Marketing specialist", "Remote, US", "Job board");
        var rileyApp = Apply(riley, Job(0), Named(Job(0), "Review"), 12, 4, ApplicationStatus.Rejected, "Experience mismatch");
        Mail(rileyApp, $"Update on your {Job(0).Title} application", "Hi Riley,\n\nThank you for applying. After reviewing your application, we've decided not to move forward for this role.", 4 * 24);

        // 9. Withdrew while in review.
        var wes = Person("Wes", "Turner", "withdrawn@local.dev", "QA engineer", "Phoenix, AZ", "LinkedIn");
        Apply(wes, Job(2), Named(Job(2), "Review"), 9, 3, ApplicationStatus.Withdrawn, "Withdrew");

        await db.SaveChangesAsync(ct);
        db.ChangeTracker.Clear();
    }
}
