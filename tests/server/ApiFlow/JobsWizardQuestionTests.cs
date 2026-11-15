using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private static async Task<Guid> UserIdAsync(
        HttpClient client,
        string email,
        CancellationToken ct
    ) =>
        (await client.GetFromJsonAsync<JsonElement>("/api/requisitions/people", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("email").GetString() == email)
            .GetProperty("id")
            .GetGuid();

    [Fact]
    public async Task The_wizard_creates_a_job_with_people_place_pay_and_template_questions()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var template = await admin.PostAsJsonAsync(
            "/api/posting-templates",
            new
            {
                name = "Support standard",
                headerMarkdown = "We help people.",
                descriptionMarkdown = "You will answer questions.",
                benefitsMarkdown = "- Paid leave",
                questions = new object[]
                {
                    new
                    {
                        type = "YesNo",
                        label = "Can you work weekends?",
                        required = true,
                        knockoutAnswers = new[] { "No" },
                    },
                },
            },
            ct
        );
        template.StatusCode.ShouldBe(
            HttpStatusCode.OK,
            await template.Content.ReadAsStringAsync(ct)
        );
        var templateId = (await template.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        var manager = await UserIdAsync(admin, "priya.manager@example.test", ct);
        var recruiter = await UserIdAsync(admin, "dana.recruiter@example.test", ct);
        var created = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                title = "Support specialist",
                department = "Support",
                location = "Chicago, Illinois",
                employmentType = "Full time",
                workMode = "Hybrid",
                openings = 2,
                description = "We help people.\n\nYou will answer questions.\n\n- Paid leave",
                targetStartDate = (string?)null,
                postingTemplateId = templateId,
                members = new[]
                {
                    new { userId = manager, role = "HiringManager" },
                    new { userId = recruiter, role = "Recruiter" },
                },
                place = new
                {
                    city = "Chicago",
                    region = "Illinois",
                    country = "us",
                },
                salary = new
                {
                    min = 50000m,
                    max = 65000m,
                    currency = "usd",
                    period = "Year",
                    show = true,
                },
            },
            ct
        );
        created.StatusCode.ShouldBe(
            HttpStatusCode.Created,
            await created.Content.ReadAsStringAsync(ct)
        );
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        var job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct);
        job.GetProperty("ownerEmail").GetString().ShouldBe("priya.manager@example.test");
        job.GetProperty("recruiterEmail").GetString().ShouldBe("dana.recruiter@example.test");
        job.GetProperty("members")
            .EnumerateArray()
            .Select(x => x.GetProperty("role").GetString())
            .ShouldBe(["HiringManager", "Recruiter"], ignoreOrder: true);
        job.GetProperty("locationCountry").GetString().ShouldBe("US");
        job.GetProperty("salaryCurrency").GetString().ShouldBe("USD");
        job.GetProperty("showSalary").GetBoolean().ShouldBeTrue();
        // What was previewed is what is saved: the template is not wrapped around it again.
        job.GetProperty("description")
            .GetString()
            .ShouldBe("We help people.\n\nYou will answer questions.\n\n- Paid leave");
        var questions = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{id}/questions",
            ct
        );
        questions.GetArrayLength().ShouldBe(1);
        questions[0]
            .GetProperty("options")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe(["Yes", "No"]);

        // A hiring team needs a hiring manager, and the pay range must make sense.
        (
            await admin.PostAsJsonAsync(
                "/api/requisitions",
                new
                {
                    title = "X",
                    department = "X",
                    location = "X",
                    employmentType = "Full time",
                    workMode = "Remote",
                    openings = 1,
                    description = "",
                    members = new[] { new { userId = recruiter, role = "Recruiter" } },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsJsonAsync(
                "/api/requisitions",
                new
                {
                    title = "X",
                    department = "X",
                    location = "X",
                    employmentType = "Full time",
                    workMode = "Remote",
                    openings = 1,
                    description = "",
                    members = new[] { new { userId = manager, role = "HiringManager" } },
                    salary = new
                    {
                        min = 9m,
                        max = 1m,
                        currency = "USD",
                        period = "Year",
                        show = false,
                    },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Open, the careers page shows the pay and the question, never the knockout answer.
        (
            await admin.PatchAsJsonAsync(
                $"/api/requisitions/{id}/status",
                new { status = "Open" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var anonymous = _factory!.CreateClient();
        var posting = await anonymous.GetFromJsonAsync<JsonElement>($"/public/jobs/{id}", ct);
        posting
            .GetProperty("salary")
            .GetProperty("text")
            .GetString()
            .ShouldBe("USD 50,000 – 65,000 a year");
        posting.GetProperty("place").GetProperty("city").GetString().ShouldBe("Chicago");
        posting
            .GetProperty("questions")[0]
            .TryGetProperty("knockoutAnswers", out _)
            .ShouldBeFalse();

        // Saving the template again makes a new version and retires the old one.
        (
            await admin.PutAsJsonAsync(
                $"/api/posting-templates/{templateId}",
                new
                {
                    name = "Support standard",
                    headerMarkdown = "We help people.",
                    descriptionMarkdown = "New starter.",
                    benefitsMarkdown = "",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var list = (await admin.GetFromJsonAsync<JsonElement>("/api/posting-templates", ct))
            .EnumerateArray()
            .Where(x => x.GetProperty("name").GetString() == "Support standard")
            .ToArray();
        list.Length.ShouldBe(1);
        list[0].GetProperty("version").GetInt32().ShouldBe(2);
        list[0].GetProperty("usedBy").GetInt32().ShouldBe(1);
    }

    [Fact]
    public async Task Typed_answers_are_checked_kept_and_knockouts_flag_for_review()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var listed = await OpenJobWithCandidatesAsync(admin, ct);
        var jobId = listed.GetProperty("id").GetGuid();
        var saved = await admin.PutAsJsonAsync(
            $"/api/requisitions/{jobId}/questions",
            new
            {
                questions = new object[]
                {
                    new
                    {
                        type = "YesNo",
                        label = "Are you allowed to work in the US?",
                        required = true,
                        knockoutAnswers = new[] { "No" },
                    },
                    new
                    {
                        type = "MultipleChoice",
                        label = "Which shifts?",
                        options = new[] { "Mornings", "Evenings", "Nights" },
                    },
                    new
                    {
                        type = "Number",
                        label = "Years of experience",
                        required = true,
                    },
                    new { type = "Url", label = "Portfolio" },
                    new
                    {
                        type = "SingleChoice",
                        label = "Only one",
                        options = new[] { "A" },
                    },
                },
            },
            ct
        );
        // A choice question needs two choices.
        saved.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        saved = await admin.PutAsJsonAsync(
            $"/api/requisitions/{jobId}/questions",
            new
            {
                questions = new object[]
                {
                    new
                    {
                        type = "YesNo",
                        label = "Are you allowed to work in the US?",
                        required = true,
                        knockoutAnswers = new[] { "No" },
                    },
                    new
                    {
                        type = "MultipleChoice",
                        label = "Which shifts?",
                        options = new[] { "Mornings", "Evenings", "Nights" },
                    },
                    new
                    {
                        type = "Number",
                        label = "Years of experience",
                        required = true,
                    },
                    new { type = "Url", label = "Portfolio" },
                },
            },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.OK, await saved.Content.ReadAsStringAsync(ct));
        var ids = (await saved.Content.ReadFromJsonAsync<JsonElement>(ct))
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();

        using var anonymous = _factory!.CreateClient();
        object Body(params object[] answers) =>
            new
            {
                firstName = "Kai",
                lastName = "Lane",
                email = "kai.lane@example.org",
                phone = (string?)null,
                location = (string?)null,
                linkedInUrl = (string?)null,
                answers,
            };
        var missing = await anonymous.PostAsJsonAsync(
            $"/public/jobs/{jobId}/applications",
            Body(new { questionId = ids[0], values = new[] { "Yes" } }),
            ct
        );
        missing.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await missing.Content.ReadAsStringAsync(ct)).ShouldContain($"answers.{ids[2]}");
        var wrong = await anonymous.PostAsJsonAsync(
            $"/public/jobs/{jobId}/applications",
            Body(
                new { questionId = ids[0], values = new[] { "Maybe" } },
                new { questionId = ids[2], values = new[] { "ten" } },
                new { questionId = ids[3], values = new[] { "javascript:alert(1)" } }
            ),
            ct
        );
        var problems = await wrong.Content.ReadAsStringAsync(ct);
        wrong.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        problems.ShouldContain($"answers.{ids[0]}");
        problems.ShouldContain($"answers.{ids[2]}");
        problems.ShouldContain($"answers.{ids[3]}");

        var applicationId = await ApplyAsync(
            anonymous,
            jobId,
            Body(
                new { questionId = ids[0], values = new[] { "no" } },
                new { questionId = ids[1], values = new[] { "evenings", "Nights" } },
                new { questionId = ids[2], values = new[] { "4.5" } },
                new { questionId = ids[3], values = new[] { "https://kai.example.org" } }
            ),
            ct
        );
        var record = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var answers = record.GetProperty("answers").EnumerateArray().ToArray();
        answers
            .Select(x => x.GetProperty("question").GetString())
            .ShouldBe([
                "Are you allowed to work in the US?",
                "Which shifts?",
                "Years of experience",
                "Portfolio",
            ]);
        answers[0].GetProperty("answer").GetString().ShouldBe("No");
        answers[0].GetProperty("flagged").GetBoolean().ShouldBeTrue();
        answers[1].GetProperty("answer").GetString().ShouldBe("Evenings, Nights");
        answers[1].GetProperty("flagged").GetBoolean().ShouldBeFalse();

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var application = await db
            .Applications.AsNoTracking()
            .SingleAsync(x => x.Id == applicationId, ct);
        // Still readable by screens that show the older Markdown copy; never rejected automatically.
        application.ApplicationAnswersMarkdown.ShouldContain("### Which shifts?");
        application.Status.ShouldBe(ApplicationStatus.Active);
        (
            await db.ApplicationAnswers.CountAsync(
                x => x.ApplicationId == applicationId && x.Flagged,
                ct
            )
        ).ShouldBe(1);
    }

    [Fact]
    public void Markdown_questions_become_typed_questions_once()
    {
        ApplicationQuestions
            .ParseMarkdown("Intro text\n\n- Why this job? (required)\n- Notice period *\n")
            .Select(x => (x.Label, x.Required, x.Type))
            .ShouldBe([
                ("Why this job?", true, QuestionType.LongText),
                ("Notice period", true, QuestionType.LongText),
            ]);
        // The old template starter line was never a question.
        ApplicationQuestions
            .ParseMarkdown("Add any default questions for applicants.")
            .ShouldBeEmpty();
    }
}
