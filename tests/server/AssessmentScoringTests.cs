using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class AssessmentScoringTests
{
    private static List<AssessmentOption> Options(params string[] correct) =>
        new[] { "a", "b", "c" }
            .Select(id => new AssessmentOption
            {
                Id = id,
                Text = id,
                Correct = correct.Contains(id),
            })
            .ToList();

    private static readonly AssessmentQuestion Single = new()
    {
        Id = "s",
        Type = QuestionTypes.Single,
        Prompt = "Q",
        Points = 4,
        Options = Options("b"),
    };
    private static readonly AssessmentQuestion Multi = new()
    {
        Id = "m",
        Type = QuestionTypes.Multi,
        Prompt = "Q",
        Points = 4,
        Options = Options("a", "c"),
    };
    private static readonly AssessmentQuestion Long = new()
    {
        Id = "l",
        Type = QuestionTypes.Long,
        Prompt = "Q",
        Points = 10,
    };

    [Fact]
    public void Choice_questions_score_the_exact_set_of_correct_answers()
    {
        AssessmentScoring.AutoPoints(Single, ["b"]).ShouldBe(4);
        AssessmentScoring.AutoPoints(Single, ["a"]).ShouldBe(0);
        AssessmentScoring.AutoPoints(Multi, ["c", "a"]).ShouldBe(4);
        AssessmentScoring.AutoPoints(Multi, ["a"]).ShouldBe(0, "a partial set scores nothing");
        AssessmentScoring
            .AutoPoints(Multi, ["a", "b", "c"])
            .ShouldBe(0, "an extra pick scores nothing");
        AssessmentScoring.AutoPoints(Single, null).ShouldBe(0);
        AssessmentScoring.AutoPoints(Single, ["not-an-option"]).ShouldBe(0);
    }

    [Fact]
    public void Partial_credit_gives_correct_picks_minus_wrong_picks_never_below_zero()
    {
        var partial = new AssessmentQuestion
        {
            Id = "p",
            Type = QuestionTypes.Multi,
            Points = 4,
            PartialCredit = true,
            Options = Options("a", "c"),
        };
        AssessmentScoring.AutoPoints(partial, ["a"]).ShouldBe(2);
        AssessmentScoring.AutoPoints(partial, ["a", "c"]).ShouldBe(4);
        AssessmentScoring.AutoPoints(partial, ["a", "b"]).ShouldBe(0);
        AssessmentScoring.AutoPoints(partial, ["b"]).ShouldBe(0);
    }

    [Fact]
    public void Totals_wait_for_reviewer_scores_and_cap_them_at_the_question_points()
    {
        var content = new AssessmentContent
        {
            Sections =
            [
                new()
                {
                    Id = "x",
                    Title = "One",
                    Questions = [Single, Multi, Long],
                },
            ],
        };
        var answers = new List<AssessmentAnswer>
        {
            new() { QuestionId = "s", ChoiceIds = ["b"] },
            new() { QuestionId = "m", ChoiceIds = ["a"] },
            new() { QuestionId = "l", Text = "My answer" },
        };
        AssessmentScoring.ScoreOnSubmit(content, answers);
        AssessmentScoring
            .Total(content, answers)
            .ShouldBe(new AssessmentScoring.Totals(4, 18, 1, null));
        answers[2].ReviewerPoints = 7;
        AssessmentScoring
            .Total(content, answers)
            .ShouldBe(new AssessmentScoring.Totals(11, 18, 0, 61));
        answers[2].ReviewerPoints = 99;
        AssessmentScoring.Total(content, answers).Earned.ShouldBe(14);
    }

    [Fact]
    public void Blank_answers_need_no_reviewer()
    {
        var code = new AssessmentQuestion
        {
            Id = "c",
            Type = QuestionTypes.Code,
            Points = 5,
            Language = "Python",
            StarterCode = "def f():\n  pass",
        };
        var content = new AssessmentContent
        {
            Sections =
            [
                new()
                {
                    Id = "x",
                    Title = "One",
                    Questions = [Long, code],
                },
            ],
        };
        var answers = new List<AssessmentAnswer>
        {
            new() { QuestionId = "c", Text = "def f():\n  pass\n" },
        };
        AssessmentScoring.ScoreOnSubmit(content, answers);
        AssessmentScoring
            .Total(content, answers)
            .ShouldBe(new AssessmentScoring.Totals(0, 15, 0, 0));
    }

    [Fact]
    public void Publishing_lists_every_problem_in_plain_words()
    {
        var assessment = new Assessment { Name = " ", CreatedBy = "x@example.test" };
        var content = new AssessmentContent
        {
            Sections =
            [
                new()
                {
                    Id = "x",
                    Title = "One",
                    Questions =
                    [
                        new()
                        {
                            Id = "1",
                            Type = QuestionTypes.Single,
                            Prompt = "Q",
                            Points = 1,
                            Options = Options("a", "b"),
                        },
                        new()
                        {
                            Id = "2",
                            Type = QuestionTypes.Multi,
                            Prompt = "Q",
                            Points = 1,
                            Options = Options(),
                        },
                        new()
                        {
                            Id = "3",
                            Type = QuestionTypes.Code,
                            Prompt = "",
                            Points = 0,
                        },
                    ],
                },
            ],
        };
        var problems = AssessmentScoring.Problems(assessment, content);
        problems.ShouldContain("Give the assessment a name.");
        problems.ShouldContain("Question 1: mark exactly one correct answer.");
        problems.ShouldContain("Question 2: mark at least one correct answer.");
        problems.ShouldContain("Question 3: write the question.");
        problems.ShouldContain("Question 3: give it at least 1 point.");
        problems.ShouldContain("Question 3: pick a language.");
        AssessmentScoring
            .Problems(
                new Assessment { Name = "Ok", CreatedBy = "x@example.test" },
                new AssessmentContent()
            )
            .ShouldBe(["Add at least one question."]);
    }

    [Fact]
    public void Shuffles_are_the_same_for_one_invite_every_time()
    {
        var questions = Enumerable
            .Range(1, 12)
            .Select(i => new AssessmentQuestion
            {
                Id = $"q{i}",
                Prompt = "Q",
                Points = 1,
            })
            .ToList();
        var content = new AssessmentContent
        {
            ShuffleQuestions = true,
            Sections =
            [
                new()
                {
                    Id = "x",
                    Title = "One",
                    Questions = questions,
                },
            ],
        };
        var invite = Guid.NewGuid();
        var first = AssessmentScoring
            .Ordered(content, invite)[0]
            .Questions.Select(x => x.Id)
            .ToList();
        AssessmentScoring.Ordered(content, invite)[0].Questions.Select(x => x.Id).ShouldBe(first);
        first.Order().ShouldBe(questions.Select(x => x.Id).Order());
        // Twelve questions in the written order for five different people would be a broken shuffle.
        Enumerable
            .Range(0, 5)
            .Select(_ =>
                AssessmentScoring
                    .Ordered(content, Guid.NewGuid())[0]
                    .Questions.Select(x => x.Id)
                    .SequenceEqual(questions.Select(x => x.Id))
            )
            .ShouldContain(false);
    }

    [Fact]
    public void Duplicates_get_new_ids_everywhere()
    {
        var content = new AssessmentContent
        {
            Sections =
            [
                new()
                {
                    Id = "x",
                    Title = "One",
                    Questions = [Single],
                },
            ],
        };
        var copy = AssessmentScoring.WithNewIds(content);
        copy.Sections[0].Id.ShouldNotBe("x");
        copy.Sections[0].Questions[0].Id.ShouldNotBe("s");
        copy.Sections[0].Questions[0].Options.Select(x => x.Id).ShouldNotContain("a");
        copy.Sections[0].Questions[0].Options.Count(x => x.Correct).ShouldBe(1);
        Single.Id.ShouldBe("s");
    }
}
