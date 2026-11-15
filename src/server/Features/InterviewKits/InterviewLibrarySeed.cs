using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// The starter interview library: six kits that follow common structured-interviewing practice
/// (one kit per round, three to five competencies that do not overlap, mostly behavioral questions
/// with follow-ups, and "good looks like" notes that describe what you can observe), and a
/// question bank made from their competencies.
/// </summary>
public static class InterviewLibrarySeed
{
    private const string Fairness =
        "Score each competency from 1 to 5 against its \"good looks like\" notes, then give an overall recommendation. Write down what the candidate said, not how you felt about it. Submit your scorecard before you talk to anyone else on the panel.";

    private sealed record Seed(
        string Name,
        string Summary,
        int Minutes,
        string Instructions,
        (string Tag, KitTemplateCompetency Item)[] Competencies
    );

    private static (string, KitTemplateCompetency) C(
        string tag,
        string name,
        string question,
        string followUp,
        string good,
        int weight
    ) => (tag, new KitTemplateCompetency(name, question, followUp, good, weight));

    private static readonly Seed[] Kits =
    [
        new(
            "Recruiter screen",
            "Motivation, must-haves and logistics",
            30,
            "Confirm the must-haves and the candidate's interest before the team spends time on them. Leave five minutes for their questions and explain the next steps.",
            [
                C(
                    "Screening",
                    "Motivation for the role",
                    "What made you apply for this role, and what are you looking for in your next one?",
                    "What would make you turn this role down?",
                    "Gives specific reasons tied to this role and team, not a general wish for a new job.",
                    3
                ),
                C(
                    "Screening",
                    "Relevant experience",
                    "Walk me through the part of your experience that is closest to this role.",
                    "What was your part, as opposed to the team's?",
                    "Clearly describes their own scope and results, and it matches the must-haves in the job description.",
                    4
                ),
                C(
                    "Screening",
                    "Must-haves and logistics",
                    "Confirm work authorization, location or working pattern, notice period and salary expectations.",
                    "Is anything here likely to change?",
                    "Every must-have is met, or a gap is stated openly with a realistic plan.",
                    3
                ),
                C(
                    "Communication",
                    "Communication",
                    "Rate across the whole call: how clearly and briefly does the candidate explain things?",
                    "Did they answer the question that was asked?",
                    "Structured, direct answers. Adjusts the detail when asked to.",
                    2
                ),
            ]
        ),
        new(
            "Hiring manager interview",
            "Impact, ownership and how they work",
            45,
            "Go deep on one or two pieces of recent work. Ask for specific situations and push for what the candidate did, what happened and what they would change.",
            [
                C(
                    "Results",
                    "Impact",
                    "Tell me about the piece of work in the last two years you are proudest of.",
                    "How did you measure whether it worked?",
                    "Names a concrete outcome with evidence, and explains their own part in it.",
                    4
                ),
                C(
                    "Ownership",
                    "Ownership",
                    "Tell me about something you were responsible for that did not go to plan.",
                    "What did you change afterwards?",
                    "Takes responsibility without blaming others, and describes a specific change in how they work.",
                    4
                ),
                C(
                    "Ownership",
                    "Prioritization",
                    "Tell me about a time you had more to do than time to do it. How did you decide?",
                    "What did you say no to, and how did you tell people?",
                    "Uses clear reasons such as impact, urgency or cost, and explains the trade-offs early.",
                    3
                ),
                C(
                    "Growth",
                    "Working with a manager",
                    "How do you like to get feedback? Tell me about feedback that changed how you work.",
                    "What would your last manager say you should work on?",
                    "Gives a real example of feedback, acted on it, and knows their own growth areas.",
                    2
                ),
            ]
        ),
        new(
            "Skills interview",
            "Role knowledge, problem solving and quality",
            60,
            "Work through one realistic problem from this role rather than trivia or brainteasers. Let the candidate ask questions first. How they reason matters as much as the answer.",
            [
                C(
                    "Technical",
                    "Role-related knowledge",
                    "Explain how you would approach a core task in this role, from start to finish.",
                    "What would you do differently with half the time?",
                    "Accurate, current knowledge of the tools and methods the role uses, with sensible defaults.",
                    4
                ),
                C(
                    "Technical",
                    "Problem solving",
                    "Present the problem. Ask the candidate to talk through how they would solve it.",
                    "What are the other options, and why did you pick this one?",
                    "Makes sure they understand the problem, breaks it down, weighs options and checks their answer.",
                    5
                ),
                C(
                    "Technical",
                    "Quality and judgement",
                    "How would you know your solution is good enough to ship?",
                    "What could go wrong, and how would you catch it?",
                    "Thinks about edge cases, testing and risks without being asked, and knows when to stop.",
                    3
                ),
                C(
                    "Communication",
                    "Explaining their thinking",
                    "Rate across the session: could you follow their reasoning as they worked?",
                    "Ask them to explain one decision to someone outside their field.",
                    "Thinks out loud in a clear order and adjusts the explanation to the listener.",
                    2
                ),
            ]
        ),
        new(
            "Behavioral interview",
            "Collaboration, unclear goals and leadership",
            45,
            "Ask about real past situations, not made-up ones. Use the STAR prompts (situation, task, action, result) to get details, and spend most of the time on what the candidate did.",
            [
                C(
                    "Teamwork",
                    "Collaboration",
                    "Tell me about a time you disagreed with a colleague about how to do something.",
                    "How did it end, and how do you work with them now?",
                    "Listens to the other view, argues with evidence, and reaches an outcome both can commit to.",
                    4
                ),
                C(
                    "Ownership",
                    "Dealing with unclear goals",
                    "Tell me about a time you had to make progress with unclear goals or missing information.",
                    "What did you do first?",
                    "Makes reasonable assumptions, says what they are, moves forward and adjusts as they learn.",
                    3
                ),
                C(
                    "Leadership",
                    "Leading without authority",
                    "Tell me about a time you noticed a problem nobody owned and did something about it.",
                    "How did you get others on board?",
                    "Steps in when needed, brings others along, and hands back once the problem is solved.",
                    3
                ),
                C(
                    "Growth",
                    "Learning from mistakes",
                    "Tell me about a mistake you made at work. What happened next?",
                    "How do you make sure it does not happen again?",
                    "Owns the mistake plainly, fixed the damage, and changed a habit or process.",
                    3
                ),
            ]
        ),
        new(
            "Work sample review",
            "A take-home task or portfolio walkthrough",
            60,
            "The candidate presents a take-home task or past work for about 20 minutes, then you ask questions. Judge the work against the brief they were given, not against how you would have done it.",
            [
                C(
                    "Work sample",
                    "Quality of the work",
                    "Review the work against the brief before the session. Ask them to show the part they are proudest of.",
                    "What would you improve with another day?",
                    "Meets the brief, is accurate and well finished, and the candidate can point at real decisions.",
                    5
                ),
                C(
                    "Work sample",
                    "Approach and decisions",
                    "Walk me through how you approached this and the key decisions you made.",
                    "What did you consider and reject?",
                    "Explains a deliberate process and the trade-offs behind each important choice.",
                    4
                ),
                C(
                    "Growth",
                    "Handling feedback",
                    "Give one piece of honest feedback on the work and see how they respond.",
                    "How would you change it based on that?",
                    "Engages with the feedback, asks questions, and either adapts or explains their view calmly.",
                    3
                ),
            ]
        ),
        new(
            "Values interview",
            "How they work and what they add to the team",
            45,
            "Assess the behaviors behind your company values, not whether the candidate is like the team. Replace the competencies below with your own values, each written as something you can observe.",
            [
                C(
                    "Values",
                    "Integrity",
                    "Tell me about a time doing the right thing was not the easy option.",
                    "What did it cost you?",
                    "Acted on principle when it cost them something, and was open with the people affected.",
                    3
                ),
                C(
                    "Values",
                    "Customer focus",
                    "Tell me about a time you changed your plans because of what a customer or user needed.",
                    "How did you find out what they needed?",
                    "Looks for the real need, not just the request, and measures the result for the customer.",
                    3
                ),
                C(
                    "Values",
                    "What they add to the team",
                    "What is something you would bring to this team that it does not have today?",
                    "Give me an example of when that made a difference.",
                    "Names a specific skill or point of view, backed by an example, that makes the team stronger.",
                    2
                ),
            ]
        ),
    ];

    /// <summary>Adds the starter library once. Archived rows still count, so it never comes back after someone removes it.</summary>
    public static async Task EnsureAsync(AtsDbContext db, CancellationToken ct = default)
    {
        // Kits from before versions are version 1, last changed when they were made.
        await db
            .InterviewKits.Where(x => x.Version == 0 || x.UpdatedAt < x.CreatedAt)
            .ExecuteUpdateAsync(
                set =>
                    set.SetProperty(x => x.Version, x => x.Version == 0 ? 1 : x.Version)
                        .SetProperty(
                            x => x.UpdatedAt,
                            x => x.UpdatedAt < x.CreatedAt ? x.CreatedAt : x.UpdatedAt
                        ),
                ct
            );
        if (await db.KitTemplates.AnyAsync(ct) || await db.QuestionBankItems.AnyAsync(ct))
            return;
        foreach (var kit in Kits)
        {
            db.KitTemplates.Add(
                new KitTemplate
                {
                    Name = kit.Name,
                    Summary = kit.Summary,
                    DurationMinutes = kit.Minutes,
                    Instructions = $"{kit.Instructions}\n\n{Fairness}",
                    CompetenciesJson = JsonSerializer.Serialize(
                        kit.Competencies.Select(x => x.Item),
                        JsonSerializerOptions.Web
                    ),
                }
            );
            foreach (var (tag, item) in kit.Competencies)
                db.QuestionBankItems.Add(
                    new QuestionBankItem
                    {
                        Name = item.Name,
                        Question = item.Question,
                        FollowUps = item.FollowUps,
                        GoodLooksLike = item.Description,
                        Weight = item.Weight,
                        Tags = [tag],
                    }
                );
        }
        await db.SaveChangesAsync(ct);
    }
}
