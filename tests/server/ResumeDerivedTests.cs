using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// The computed columns are what the list filters on, so each rule gets one check.
public sealed class ResumeDerivedTests
{
    private static readonly DateOnly Today = new(2026, 10, 18);

    private static WorkExperience Role(int? startYear, int? startMonth, int? endYear, int? endMonth, bool current = false,
        EmploymentType type = EmploymentType.FullTime, Seniority seniority = Seniority.Unknown, int? managed = null) =>
        new()
        {
            CompanyNameRaw = "x", Title = "y", StartYear = startYear, StartMonth = startMonth,
            EndYear = endYear, EndMonth = endMonth, IsCurrent = current, EmploymentType = type,
            Seniority = seniority, ManagedPeople = managed,
        };

    [Fact]
    public void Overlapping_roles_are_not_double_counted()
    {
        var roles = new[] { Role(2020, 1, 2023, 1), Role(2022, 1, 2024, 1) };
        ResumeDerived.YearsCovered(roles, Today).ShouldBe(4.0m);
    }

    [Fact]
    public void A_current_role_runs_to_today_and_a_gap_is_skipped()
    {
        var roles = new[] { Role(2025, 10, null, null, current: true), Role(2018, 1, 2019, 1) };
        ResumeDerived.YearsCovered(roles, Today).ShouldBe(2.0m);
    }

    [Fact]
    public void Missing_months_fall_in_the_middle_of_the_year()
    {
        ResumeDerived.Months(2020, null, 2021, null, Today).ShouldBe(12);
        ResumeDerived.Months(2020, 1, 2020, 7, Today).ShouldBe(6);
        ResumeDerived.Months(null, null, 2020, 1, Today).ShouldBeNull();
    }

    [Fact]
    public void Internships_do_not_count_as_experience_but_managers_count_as_management()
    {
        ResumeDerived.CountsAsExperience(Role(2020, 1, 2021, 1, type: EmploymentType.Internship)).ShouldBeFalse();
        ResumeDerived.CountsAsManagement(Role(2020, 1, 2021, 1, managed: 4)).ShouldBeTrue();
        ResumeDerived.CountsAsManagement(Role(2020, 1, 2021, 1, seniority: Seniority.Director)).ShouldBeTrue();
        ResumeDerived.CountsAsManagement(Role(2020, 1, 2021, 1, seniority: Seniority.Senior)).ShouldBeFalse();
    }

    [Fact]
    public void Highest_degree_and_current_role_follow_rank_and_order()
    {
        ResumeDerived.HighestDegree([
            new Education { SchoolNameRaw = "a", DegreeLevel = DegreeLevel.Bachelor },
            new Education { SchoolNameRaw = "b", DegreeLevel = DegreeLevel.Master },
        ]).ShouldBe(DegreeLevel.Master);
        ResumeDerived.HighestDegree([]).ShouldBe(DegreeLevel.Unknown);

        var past = Role(2018, 1, 2020, 1);
        past.SortOrder = 0;
        var current = Role(2021, 1, null, null, current: true);
        current.SortOrder = 1;
        ResumeDerived.CurrentRole([past, current]).ShouldBe(current);
        ResumeDerived.CurrentRole([past]).ShouldBe(past);
    }

    [Theory]
    [InlineData("React.js", false, "reactjs")]
    [InlineData("  Node JS ", false, "nodejs")]
    [InlineData("Google, Inc.", true, "google")]
    [InlineData("Northstar Software LLC", true, "northstarsoftware")]
    [InlineData("Café Co", true, "cafe")]
    public void Names_normalise_to_letters_and_digits(string input, bool company, string expected) =>
        ResumeDerived.NormalizeName(input, company).ShouldBe(expected);

    [Theory]
    [InlineData("University of Washington", "washington")]
    [InlineData("The University of Alabama", "alabama")]
    [InlineData("Massachusetts Institute of Technology (MIT)", "massachusettsinstituteoftechnologymit")]
    public void School_names_drop_the_university_of_prefix(string input, string expected) =>
        ResumeDerived.NormalizeSchool(input).ShouldBe(expected);

    [Theory]
    [InlineData("Senior", Seniority.Senior)]
    [InlineData("full time", Seniority.Unknown)]
    [InlineData(null, Seniority.Unknown)]
    public void Off_list_enum_answers_become_unknown(string? input, Seniority expected) =>
        ResumeDerived.ParseEnum<Seniority>(input).ShouldBe(expected);
}
