using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private static DevelopmentApplications CreateDevelopmentApplications(
        DateTimeOffset now,
        Candidate[] people,
        DevelopmentJobs jobs
    )
    {
        var engineering = jobs.Engineering;
        var platform = jobs.Platform;
        var designer = jobs.Designer;
        var analyst = jobs.Analyst;
        var operations = jobs.Operations;
        var engManager = jobs.EngineeringManager;
        var technicalKit = jobs.TechnicalKit;
        var valuesKit = jobs.ValuesKit;

        var applications = new List<Application>();

        Application Apply(
            Candidate candidate,
            Requisition job,
            int stageIndex,
            int appliedDaysAgo,
            int activityDaysAgo,
            int? rating = null,
            ApplicationStatus status = ApplicationStatus.Active,
            string? disposition = null
        )
        {
            var application = new Application
            {
                Candidate = candidate,
                Requisition = job,
                PipelineStage = job.Stages[stageIndex],
                Source = candidate.Source,
                Rating = rating,
                Status = status,
                DispositionReason = disposition,
                AppliedAt = now.AddDays(-appliedDaysAgo),
                LastActivityAt = now.AddDays(-activityDaysAgo),
            };
            applications.Add(application);
            return application;
        }

        // Senior product engineer — the busiest pipeline.
        var jordanApp = Apply(people[0], engineering, 2, 9, 1, 4);
        Apply(people[1], engineering, 1, 4, 2);
        Apply(people[2], engineering, 1, 6, 3, 3);
        Apply(people[3], engineering, 0, 2, 2);
        Apply(people[4], engineering, 3, 21, 4, 5);
        Apply(people[5], engineering, 0, 1, 1);
        Apply(people[21], engineering, 2, 12, 5, 3);
        Apply(
            people[23],
            engineering,
            1,
            8,
            6,
            2,
            ApplicationStatus.Rejected,
            "Experience mismatch"
        );
        Apply(people[22], engineering, 0, 15, 10, null, ApplicationStatus.Withdrawn, "Withdrew");

        // Platform engineer.
        Apply(people[6], platform, 2, 11, 2, 4);
        Apply(people[7], platform, 1, 7, 3, 3);
        Apply(people[8], platform, 3, 18, 1, 5);
        Apply(people[9], platform, 0, 3, 3);

        // Product designer.
        Apply(people[10], designer, 2, 10, 2, 4);
        Apply(people[11], designer, 1, 5, 1, 4);
        Apply(people[12], designer, 0, 2, 2);
        Apply(people[13], designer, 1, 9, 7, 2, ApplicationStatus.Rejected, "Skills mismatch");

        // Data analyst.
        Apply(people[14], analyst, 2, 14, 3, 4);
        Apply(people[15], analyst, 1, 6, 2, 3);
        Apply(people[16], analyst, 0, 4, 4);

        // Customer operations lead — on hold.
        Apply(people[17], operations, 1, 25, 12, 3);
        Apply(people[18], operations, 2, 28, 14, 4);
        Apply(
            people[19],
            operations,
            0,
            20,
            18,
            null,
            ApplicationStatus.Rejected,
            "Position closed"
        );

        // Engineering manager — filled.
        Apply(people[20], engManager, 4, 60, 16, 5, ApplicationStatus.Hired);

        jordanApp.Notes.Add(
            new ApplicationNote
            {
                Body = "Strong product instincts and clear examples of cross-functional delivery.",
                AuthorEmail = "recruiter@example.test",
                CreatedAt = now.AddDays(-8),
            }
        );
        jordanApp.Notes.Add(
            new ApplicationNote
            {
                Body =
                    "Screen went well. Wants to stay hands on, which matches how we have scoped the role.",
                AuthorEmail = "manager@example.test",
                CreatedAt = now.AddDays(-6),
            }
        );

        var completedInterview = new Interview
        {
            Title = "Technical interview",
            InterviewKit = technicalKit,
            StartsAt = now.AddDays(-3).AddHours(-2),
            EndsAt = now.AddDays(-3).AddHours(-1),
            TimeZone = "America/Chicago",
            MeetingLink = "https://meet.example.com/eng-104-technical",
            InterviewerEmails = ["tomas.interviewer@example.test", "asha.interviewer@example.test"],
            Status = InterviewStatus.Completed,
            MeetingNotes =
                "Walked through a checkout rewrite. Owned the rollout plan and named the failure mode that caused a rollback, then explained how they would catch it earlier next time.",
            MeetingNotesSource = "Fireflies",
            MeetingNotesUpdatedAt = now.AddDays(-3),
        };
        completedInterview.Scorecards.Add(
            new Scorecard
            {
                InterviewerEmail = "tomas.interviewer@example.test",
                Recommendation = Recommendation.Yes,
                Rating = 4,
                Evidence =
                    "Handled the debugging exercise methodically and explained each step before making it.",
                Strengths = "Clear reasoning under pressure, strong instinct for observability.",
                Concerns = "Less depth on data modelling than the rest of the panel wanted.",
                SubmittedAt = now.AddDays(-3).AddMinutes(20),
                CriterionRatings =
                [
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[0],
                        Rating = 4,
                        Evidence = "Named the exact services they owned and what changed after.",
                    },
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[1],
                        Rating = 4,
                        Evidence = "Listed three options and picked one for stated reasons.",
                    },
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[2],
                        Rating = 5,
                        Evidence = "Explained the tradeoff without a single acronym.",
                    },
                ],
            }
        );
        completedInterview.Scorecards.Add(
            new Scorecard
            {
                InterviewerEmail = "asha.interviewer@example.test",
                Recommendation = Recommendation.StrongYes,
                Rating = 5,
                Evidence = "Best rollout story we have heard for this role so far.",
                Strengths = "Ownership, and a habit of measuring what shipped.",
                Concerns = "None observed.",
                SubmittedAt = now.AddDays(-3).AddMinutes(35),
                CriterionRatings =
                [
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[0],
                        Rating = 5,
                        Evidence = "Directly comparable work at a similar scale.",
                    },
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[1],
                        Rating = 5,
                        Evidence = "Framed the problem before reaching for a solution.",
                    },
                    new()
                    {
                        InterviewCriterion = technicalKit.Criteria[2],
                        Rating = 4,
                        Evidence = "Checked we were following along twice.",
                    },
                ],
            }
        );
        jordanApp.Interviews.Add(
            new Interview
            {
                Title = "Engineering screen",
                StartsAt = now.AddDays(2).AddHours(2),
                EndsAt = now.AddDays(2).AddHours(3),
                TimeZone = "America/Chicago",
                MeetingLink = "https://meet.example.com/eng-104-screen",
                InterviewerEmails = ["interviewer@example.test"],
            }
        );
        jordanApp.Interviews.Add(
            new Interview
            {
                Title = "Team and values interview",
                InterviewKit = valuesKit,
                StartsAt = now.AddDays(4).AddHours(2),
                EndsAt = now.AddDays(4).AddHours(3),
                TimeZone = "America/Chicago",
                MeetingLink = "https://meet.example.com/eng-104-values",
                InterviewerEmails = ["tomas.interviewer@example.test"],
            }
        );

        // The candidate furthest along carries the completed interview and its feedback.
        applications[4].Interviews.Add(completedInterview);
        applications[4]
            .Interviews.Add(
                new Interview
                {
                    Title = "Hiring manager interview",
                    StartsAt = now.AddDays(1).AddHours(3),
                    EndsAt = now.AddDays(1).AddHours(4),
                    TimeZone = "America/Chicago",
                    MeetingLink = "https://meet.example.com/eng-104-manager",
                    InterviewerEmails = ["manager@example.test"],
                }
            );
        applications[9]
            .Interviews.Add(
                new Interview
                {
                    Title = "Systems design interview",
                    StartsAt = now.AddDays(3).AddHours(1),
                    EndsAt = now.AddDays(3).AddHours(2),
                    TimeZone = "America/Chicago",
                    InterviewerEmails = ["tomas.interviewer@example.test"],
                }
            );
        applications[13]
            .Interviews.Add(
                new Interview
                {
                    Title = "Portfolio review",
                    StartsAt = now.AddDays(4).AddHours(5),
                    EndsAt = now.AddDays(4).AddHours(6),
                    TimeZone = "America/New_York",
                    InterviewerEmails = ["priya.manager@example.test"],
                }
            );
        applications[17]
            .Interviews.Add(
                new Interview
                {
                    Title = "Analytics exercise review",
                    StartsAt = now.AddDays(5).AddHours(2),
                    EndsAt = now.AddDays(5).AddHours(3),
                    TimeZone = "America/Chicago",
                    InterviewerEmails = ["asha.interviewer@example.test"],
                }
            );

        applications[9]
            .Notes.Add(
                new ApplicationNote
                {
                    Body =
                        "Deep Kubernetes background. Checking whether they want on-call rotation.",
                    AuthorEmail = "recruiter@example.test",
                    CreatedAt = now.AddDays(-2),
                }
            );
        applications[13]
            .Notes.Add(
                new ApplicationNote
                {
                    Body =
                        "Portfolio is strong on systems thinking, lighter on marketing surfaces.",
                    AuthorEmail = "dana.recruiter@example.test",
                    CreatedAt = now.AddDays(-1),
                }
            );
        applications[17]
            .Notes.Add(
                new ApplicationNote
                {
                    Body = "Took the analytics exercise seriously and shipped a readable notebook.",
                    AuthorEmail = "asha.interviewer@example.test",
                    CreatedAt = now.AddDays(-3),
                }
            );

        return new(applications, jordanApp, completedInterview);
    }
}
