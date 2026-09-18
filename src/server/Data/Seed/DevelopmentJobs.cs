using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Data;

public static partial class SeedData
{
    private static DevelopmentJobs CreateDevelopmentJobs(DateTimeOffset now)
    {
        Requisition Job(
            string code,
            string title,
            string department,
            string location,
            string workMode,
            string employmentType,
            int openings,
            string owner,
            string recruiter,
            RequisitionStatus status,
            int targetInDays,
            string description
        )
        {
            var job = new Requisition
            {
                Code = code,
                Title = title,
                Department = department,
                Location = location,
                EmploymentType = employmentType,
                WorkMode = workMode,
                Openings = openings,
                OwnerEmail = owner,
                RecruiterEmail = recruiter,
                Description = description,
                Status = status,
                TargetStartDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(targetInDays)),
                CreatedAt = now.AddDays(-targetInDays / 2 - 20),
            };
            job.Stages.AddRange(CreateDefaultStages(job.Id));
            return job;
        }

        var engineering = Job(
            "ENG-104",
            "Senior product engineer",
            "Engineering",
            "Chicago, IL",
            "Hybrid",
            "Full time",
            2,
            "manager@example.test",
            "recruiter@example.test",
            RequisitionStatus.Open,
            60,
            "Build reliable product experiences across our internal platforms. You will own features end to end, from the data model through the interface, and partner closely with operations on what to build next."
        );
        var platform = Job(
            "ENG-118",
            "Platform engineer",
            "Engineering",
            "Remote, US",
            "Remote",
            "Full time",
            1,
            "manager@example.test",
            "recruiter@example.test",
            RequisitionStatus.Open,
            45,
            "Keep our deployment, observability, and data pipelines boring and dependable."
        );
        var designer = Job(
            "DES-032",
            "Product designer",
            "Design",
            "New York, NY",
            "Hybrid",
            "Full time",
            1,
            "priya.manager@example.test",
            "dana.recruiter@example.test",
            RequisitionStatus.Open,
            75,
            "Shape the end to end experience of our internal tools, from first sketch to shipped interface."
        );
        var analyst = Job(
            "DAT-011",
            "Data analyst",
            "Data",
            "Austin, TX",
            "On-site",
            "Full time",
            1,
            "manager@example.test",
            "dana.recruiter@example.test",
            RequisitionStatus.Open,
            30,
            "Turn hiring, product, and support data into decisions the team can act on this quarter."
        );
        var operations = Job(
            "OPS-007",
            "Customer operations lead",
            "Operations",
            "Chicago, IL",
            "Hybrid",
            "Full time",
            1,
            "priya.manager@example.test",
            "recruiter@example.test",
            RequisitionStatus.OnHold,
            90,
            "Lead the team that keeps customer onboarding predictable. On hold until the budget review closes."
        );
        var engManager = Job(
            "ENG-096",
            "Engineering manager",
            "Engineering",
            "Chicago, IL",
            "Hybrid",
            "Full time",
            1,
            "manager@example.test",
            "recruiter@example.test",
            RequisitionStatus.Filled,
            -14,
            "Lead the product engineering group. Filled internally in the last cycle."
        );
        var contractWriter = Job(
            "MKT-021",
            "Technical writer",
            "Marketing",
            "Remote, US",
            "Remote",
            "Contract",
            1,
            "priya.manager@example.test",
            "dana.recruiter@example.test",
            RequisitionStatus.Draft,
            120,
            "Document the internal platform so new engineers can ship in their first week."
        );

        var technicalKit = new InterviewKit
        {
            RequisitionId = engineering.Id,
            Name = "Technical interview",
            DurationMinutes = 60,
            SortOrder = 0,
            Instructions =
                "Work through one real problem together. Let the candidate drive and only steer when they are stuck for more than a few minutes.",
            Criteria =
            [
                new()
                {
                    Name = "Role expertise",
                    Question = "Tell me about the most relevant work you have done for this role.",
                    Description =
                        "Gives specific examples and explains their personal contribution.",
                    Weight = 3,
                    SortOrder = 0,
                },
                new()
                {
                    Name = "Problem solving",
                    Question = "Walk me through a difficult problem and the tradeoffs you made.",
                    Description =
                        "Frames the problem, considers alternatives, and measures the result.",
                    Weight = 3,
                    SortOrder = 1,
                },
                new()
                {
                    Name = "Communication",
                    Question = "Explain a technical decision to someone outside engineering.",
                    Description = "Plain language, no jargon, checks for understanding.",
                    Weight = 2,
                    SortOrder = 2,
                },
            ],
        };
        var valuesKit = new InterviewKit
        {
            RequisitionId = engineering.Id,
            Name = "Team and values interview",
            DurationMinutes = 45,
            SortOrder = 1,
            Instructions = "Focus on collaboration and how they handle disagreement.",
            Criteria =
            [
                new()
                {
                    Name = "Collaboration",
                    Question = "Describe a disagreement with a teammate and how you handled it.",
                    Description = "Listens, communicates directly, reaches a constructive outcome.",
                    Weight = 2,
                    SortOrder = 0,
                },
                new()
                {
                    Name = "Ownership",
                    Question = "Tell me about something you shipped that nobody asked you to.",
                    Description = "Saw a real problem, took it on, followed through.",
                    Weight = 2,
                    SortOrder = 1,
                },
            ],
        };
        engineering.InterviewKits.AddRange([technicalKit, valuesKit]);

        designer.InterviewKits.Add(
            new InterviewKit
            {
                RequisitionId = designer.Id,
                Name = "Portfolio review",
                DurationMinutes = 60,
                SortOrder = 0,
                Instructions = "Ask the candidate to walk through two projects of their choosing.",
                Criteria =
                [
                    new()
                    {
                        Name = "Craft",
                        Question = "Walk me through the decisions behind this screen.",
                        Description = "Explains hierarchy, states, and edge cases, not just looks.",
                        Weight = 3,
                        SortOrder = 0,
                    },
                    new()
                    {
                        Name = "Research",
                        Question = "How did you learn what users actually needed here?",
                        Description = "Talked to users and changed the design because of it.",
                        Weight = 2,
                        SortOrder = 1,
                    },
                ],
            }
        );

        return new(
            engineering,
            platform,
            designer,
            analyst,
            operations,
            engManager,
            contractWriter,
            technicalKit,
            valuesKit
        );
    }
}
