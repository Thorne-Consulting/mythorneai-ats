using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class StageRulesTests
{
    private static PipelineStage Stage(
        string name,
        StageType type,
        int order,
        bool terminal = false
    ) =>
        new()
        {
            Name = name,
            Type = type,
            SortOrder = order,
            IsTerminal = terminal,
        };

    [Theory]
    [InlineData("New", false, 0, StageType.Applied)]
    [InlineData("Sourced", false, 3, StageType.Applied)]
    [InlineData("Review", false, 1, StageType.Screen)]
    [InlineData("Phone screen", false, 2, StageType.Screen)]
    [InlineData("Interview", false, 2, StageType.Interview)]
    [InlineData("Booked", false, 3, StageType.Interview)]
    [InlineData("Panel", false, 4, StageType.Interview)]
    [InlineData("Offer handoff", false, 4, StageType.Offer)]
    [InlineData("Hired", true, 5, StageType.Hired)]
    [InlineData("Reference checks", false, 4, StageType.Other)]
    public void Guesses_a_type_from_an_old_stage_name(
        string name,
        bool terminal,
        int order,
        StageType expected
    ) => StageRules.Guess(name, terminal, order).ShouldBe(expected);

    [Fact]
    public void Colour_comes_from_the_type_unless_a_known_tone_is_stored()
    {
        StageRules.Tone(StageType.Interview).ShouldBe("blue");
        StageRules.Tone(StageType.Screen).ShouldBe("violet");
        StageRules.Tone(StageType.Offer, "red").ShouldBe("red");
        // The old stored colours ("indigo", "grape") are not tones, so the type decides.
        StageRules.Tone(StageType.Offer, "indigo").ShouldBe("amber");
    }

    [Fact]
    public void Candidates_never_see_the_internal_name()
    {
        StageRules.CandidateLabel(Stage("Offer handoff", StageType.Offer, 4)).ShouldBe("Offer");
        var labelled = Stage("Panel 2", StageType.Interview, 3);
        labelled.CandidateLabel = "Final interviews";
        StageRules.CandidateLabel(labelled).ShouldBe("Final interviews");
    }

    [Fact]
    public void Finds_the_hired_stage_and_the_next_interview_stage_by_type()
    {
        var stages = StageRules.FromTemplate(Guid.NewGuid(), StageRules.DefaultTemplate());
        stages
            .Select(x => x.Name)
            .ShouldBe(["New", "Review", "Interview", "Interview scheduled", "Offer", "Hired"]);
        StageRules.Hired(stages)!.Name.ShouldBe("Hired");
        StageRules.Hired(stages)!.IsTerminal.ShouldBeTrue();
        StageRules.FirstInterview(stages)!.Name.ShouldBe("Interview");
        StageRules.NextInterview(stages, stages[1].Id)!.Name.ShouldBe("Interview");
        StageRules.NextInterview(stages, stages[2].Id)!.Name.ShouldBe("Interview scheduled");
        StageRules.NextInterview(stages, stages[3].Id).ShouldBeNull();
        StageRules.NextInterview(stages, stages[4].Id).ShouldBeNull();
    }

    [Fact]
    public void Reach_counts_how_far_each_person_got_including_people_who_left()
    {
        Guid[] stages = [Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid()];
        Guid a = Guid.NewGuid(),
            b = Guid.NewGuid(),
            c = Guid.NewGuid();
        // a reached the last stage, b was rejected in the second, c is still new.
        var reached = AtsEndpoints.ReachedPerStage(
            stages,
            [
                (a, stages[0]),
                (a, stages[1]),
                (a, stages[2]),
                (b, stages[1]),
                (c, stages[0]),
                (a, Guid.NewGuid()),
            ]
        );
        reached.ShouldBe([3, 2, 1]);
    }
}
