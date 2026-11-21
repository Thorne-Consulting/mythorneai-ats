using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    /// <summary>Two people with a marker last name, so every query below can be scoped to just them with search=.</summary>
    [Fact]
    public async Task Candidate_list_filters_by_place_resume_facts_exclusions_and_application_dates()
    {
        var ct = TestContext.Current.CancellationToken;
        var marker = "Depthtest" + Guid.NewGuid().ToString("N")[..6];
        Guid lisbonId,
            austinId;
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var react = new Skill
            {
                Name = "React",
                NormalizedName = "react-" + marker.ToLowerInvariant(),
                Aliases = ["reactjs-" + marker.ToLowerInvariant()],
            };
            var lisbon = new Candidate
            {
                FirstName = "Lisbon",
                LastName = marker,
                Email = $"lisbon.{marker}@example.test",
                Source = "Career site",
                City = "Lisbon",
                Region = "Lisboa",
                Country = "Portugal",
                OpenToRemote = true,
                WillingToRelocate = true,
                Tags = ["silver"],
                YearsManagement = 5,
                ResumeSkills = ["go"],
                Certifications = [new() { Name = "AWS Solutions Architect", Issuer = "Amazon" }],
                Languages =
                [
                    new() { Language = "Portuguese", Proficiency = LanguageProficiency.Native },
                    new() { Language = "English", Proficiency = LanguageProficiency.Conversational },
                ],
                Educations =
                [
                    new() { SchoolNameRaw = "Universidade", FieldNormalized = FieldOfStudy.ComputerScience },
                ],
                WorkExperiences = [new() { CompanyNameRaw = "Acme", Title = "Engineer", EmploymentType = EmploymentType.Contract }],
                Skills = [new() { Skill = react, YearsUsed = 4 }],
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-40),
            };
            var austin = new Candidate
            {
                FirstName = "Austin",
                LastName = marker,
                Email = $"austin.{marker}@example.test",
                Source = "Career site",
                City = "Austin",
                Country = "United States",
                Tags = ["gold"],
                ResumeSkills = ["go", "rust"],
                Languages = [new() { Language = "English", Proficiency = LanguageProficiency.Native }],
                Educations = [new() { SchoolNameRaw = "UT", FieldNormalized = FieldOfStudy.Business }],
                WorkExperiences = [new() { CompanyNameRaw = "Initech", Title = "Analyst", EmploymentType = EmploymentType.FullTime }],
            };
            db.Candidates.AddRange(lisbon, austin);
            await db.SaveChangesAsync(ct);
            lisbonId = lisbon.Id;
            austinId = austin.Id;
        }

        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        async Task<string[]> Find(string filters)
        {
            var result = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/candidates?search={marker}&pageSize=100&{filters}",
                ct
            );
            return result
                .GetProperty("items")
                .EnumerateArray()
                .Select(x => x.GetProperty("name").GetString()!.Split(' ')[0])
                .Order()
                .ToArray();
        }

        (await Find("")).ShouldBe(["Austin", "Lisbon"]);
        // Where they live, down to the part.
        (await Find("city=lisb")).ShouldBe(["Lisbon"]);
        (await Find("region=Lisboa")).ShouldBe(["Lisbon"]);
        (await Find("country=portugal")).ShouldBe(["Lisbon"]);
        (await Find("openToRemote=true")).ShouldBe(["Lisbon"]);
        (await Find("willingToRelocate=true")).ShouldBe(["Lisbon"]);
        // What the resume says.
        (await Find("certification=amazon")).ShouldBe(["Lisbon"]);
        (await Find("language=portuguese")).ShouldBe(["Lisbon"]);
        // "Fluent" means Fluent or Native: Lisbon's English is only Conversational, Austin's is Native.
        (await Find("language=english&languageLevel=Fluent")).ShouldBe(["Austin"]);
        (await Find("field=ComputerScience")).ShouldBe(["Lisbon"]);
        (await Find("employmentType=Contract")).ShouldBe(["Lisbon"]);
        (await Find("minManagementYears=3")).ShouldBe(["Lisbon"]);
        // A skill matches by an alias, and can need years of use.
        (await Find($"skills=reactjs-{marker.ToLowerInvariant()}")).ShouldBe(["Lisbon"]);
        (await Find($"skills=react-{marker.ToLowerInvariant()}&minSkillYears=3")).ShouldBe(["Lisbon"]);
        (await Find($"skills=react-{marker.ToLowerInvariant()}&minSkillYears=6")).ShouldBeEmpty();
        // Leaving things out.
        (await Find("skills=go&excludeSkills=rust")).ShouldBe(["Lisbon"]);
        (await Find("excludeTags=silver")).ShouldBe(["Austin"]);
        // When they were added.
        (await Find($"addedTo={DateTimeOffset.UtcNow.AddDays(-30):yyyy-MM-dd}")).ShouldBe(["Lisbon"]);
        (await Find($"addedFrom={DateTimeOffset.UtcNow.AddDays(-30):yyyy-MM-dd}")).ShouldBe(["Austin"]);

        // Application facts: one old, quiet application for Lisbon on a job with a fit check.
        Guid jobId;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var stage = await db
                .PipelineStages.Where(x => x.Type == StageType.Applied && x.Requisition!.Status == RequisitionStatus.Open)
                .Select(x => new { x.Id, x.RequisitionId })
                .FirstAsync(ct);
            jobId = stage.RequisitionId;
            var old = DateTimeOffset.UtcNow.AddDays(-20);
            db.Applications.Add(
                new Application
                {
                    CandidateId = lisbonId,
                    RequisitionId = stage.RequisitionId,
                    PipelineStageId = stage.Id,
                    Source = "Indeed",
                    AssigneeEmail = "recruiter@example.test",
                    AppliedAt = old,
                    LastActivityAt = old,
                }
            );
            db.JobFits.Add(
                new JobFit { RequisitionId = stage.RequisitionId, CandidateId = lisbonId, ResultJson = "{}", Score = 82, InputHash = "x" }
            );
            await db.SaveChangesAsync(ct);
        }
        (await Find($"appliedFrom={DateTimeOffset.UtcNow.AddDays(-30):yyyy-MM-dd}&appliedTo={DateTimeOffset.UtcNow.AddDays(-10):yyyy-MM-dd}")).ShouldBe(["Lisbon"]);
        (await Find($"activityFrom={DateTimeOffset.UtcNow.AddDays(-5):yyyy-MM-dd}")).ShouldBeEmpty();
        (await Find("idleDays=14")).ShouldBe(["Lisbon"]);
        (await Find("idleDays=30")).ShouldBeEmpty();
        (await Find("applicationSource=Indeed")).ShouldBe(["Lisbon"]);
        (await Find("assignee=Recruiter@Example.Test")).ShouldBe(["Lisbon"]);
        (await Find("minFit=80")).ShouldBe(["Lisbon"]);
        (await Find("minFit=90")).ShouldBeEmpty();
        (await Find("unread=true")).ShouldBeEmpty();
        (await Find("feedbackOwed=true")).ShouldBeEmpty();

        // Sorting by the AI fit puts the checked person first; everyone else follows.
        var byFit = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates?search={marker}&sort=fit&requisitionId={jobId}",
            ct
        );
        byFit.GetProperty("total").GetInt32().ShouldBe(1);
        var byFitAll = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates?search={marker}&sort=fit",
            ct
        );
        byFitAll.GetProperty("items")[0].GetProperty("name").GetString().ShouldStartWith("Lisbon");
        var byApplied = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates?search={marker}&sort=applied",
            ct
        );
        byApplied.GetProperty("items")[0].GetProperty("id").GetGuid().ShouldBe(lisbonId);
        austinId.ShouldNotBe(Guid.Empty);
    }

    [Fact]
    public async Task Rank_can_hide_low_scores_and_sort_by_experience()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        async Task<JsonElement> Rank(object body)
        {
            var response = await recruiter.PostAsJsonAsync("/api/talent/rank", body, ct);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
        }

        var all = await Rank(new { query = "react postgresql", pageSize = 100 });
        all.GetProperty("total").GetInt32().ShouldBeGreaterThan(1);

        // A cutoff above every score leaves nobody; one at the best score keeps at least that person.
        var best = all.GetProperty("items")[0].GetProperty("score").GetInt32();
        (await Rank(new { query = "react postgresql", minScore = 101 })).GetProperty("total").GetInt32().ShouldBe(0);
        var cut = await Rank(new { query = "react postgresql", minScore = best, pageSize = 100 });
        cut.GetProperty("items").EnumerateArray().All(x => x.GetProperty("score").GetInt32() >= best).ShouldBeTrue();

        // Most experience first; people with no years read go last.
        var byYears = await Rank(new { query = "react postgresql", sort = "experience", pageSize = 100 });
        var years = byYears.GetProperty("items").EnumerateArray()
            .Select(x => x.GetProperty("experienceYears").ValueKind == JsonValueKind.Null ? -1m : x.GetProperty("experienceYears").GetDecimal())
            .ToList();
        years.ShouldBe(years.OrderByDescending(x => x).ToList());
    }
}
