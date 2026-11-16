using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private static async Task<JsonElement> SourceAsync(
        HttpClient client,
        string name,
        CancellationToken ct
    ) =>
        (await client.GetFromJsonAsync<JsonElement>("/api/sources", ct))
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == name);

    private async Task<Candidate> CandidateByEmailAsync(string email, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        return await db.Candidates.AsNoTracking().SingleAsync(x => x.Email == email, ct);
    }

    private static object NewCandidate(string email, string source, Guid? referrerId = null) =>
        new
        {
            firstName = "Sam",
            lastName = "Source",
            email,
            phone = (string?)null,
            location = (string?)null,
            currentTitle = (string?)null,
            linkedInUrl = (string?)null,
            source,
            tags = Array.Empty<string>(),
            referrerId,
        };

    [Fact]
    public async Task Sources_are_managed_and_careers_link_codes_map_to_them()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);

        // The starting list, with the codes the careers site understands.
        var linkedIn = await SourceAsync(admin, "LinkedIn", ct);
        linkedIn.GetProperty("category").GetString().ShouldBe("JobBoard");
        linkedIn
            .GetProperty("codes")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldContain("linkedin");

        var created = await admin.PostAsJsonAsync(
            "/api/sources",
            new
            {
                name = "Hacker News",
                category = "JobBoard",
                codes = new[] { "HN" },
            },
            ct
        );
        created.StatusCode.ShouldBe(
            HttpStatusCode.Created,
            await created.Content.ReadAsStringAsync(ct)
        );
        var hnId = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        // Names and codes are unique, ignoring case.
        (
            await admin.PostAsJsonAsync("/api/sources", new { name = "hacker news" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsJsonAsync(
                "/api/sources",
                new { name = "Other board", codes = new[] { "hn" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // ?src= and utm_source pick the source by its code.
        using var anonymous = _factory!.CreateClient();
        var jobs = await PublicJobIdsAsync(anonymous, ct);
        var fromSrc = $"src.{Guid.NewGuid():N}"[..14] + "@example.test";
        var fromUtm = $"utm.{Guid.NewGuid():N}"[..14] + "@example.test";
        var first = await ApplyAsync(
            anonymous,
            jobs[0],
            new
            {
                firstName = "Ada",
                lastName = "Link",
                email = fromSrc,
                source = "hn",
            },
            ct
        );
        await ApplyAsync(
            anonymous,
            jobs[0],
            new
            {
                firstName = "Bo",
                lastName = "Utm",
                email = fromUtm,
                utmSource = "HN",
            },
            ct
        );
        (await CandidateByEmailAsync(fromSrc, ct)).Source.ShouldBe("Hacker News");
        (await CandidateByEmailAsync(fromUtm, ct)).Source.ShouldBe("Hacker News");

        // A rename rewrites people and applications.
        (
            await admin.PutAsJsonAsync(
                $"/api/sources/{hnId}",
                new
                {
                    name = "HN jobs",
                    category = "JobBoard",
                    codes = new[] { "hn" },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await CandidateByEmailAsync(fromSrc, ct)).Source.ShouldBe("HN jobs");
        (await SourceAsync(admin, "HN jobs", ct)).GetProperty("candidates").GetInt32().ShouldBe(2);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.Applications.SingleAsync(x => x.Id == first, ct)).Source.ShouldBe("HN jobs");
        }

        // Merging moves everyone and the codes, then the source is gone.
        var merged = await admin.PostAsJsonAsync(
            $"/api/sources/{hnId}/merge",
            new { intoId = linkedIn.GetProperty("id").GetGuid() },
            ct
        );
        merged.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await CandidateByEmailAsync(fromUtm, ct)).Source.ShouldBe("LinkedIn");
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/sources", ct);
        list.EnumerateArray().ShouldNotContain(x => x.GetProperty("name").GetString() == "HN jobs");
        (await SourceAsync(admin, "LinkedIn", ct))
            .GetProperty("codes")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldContain("hn");
        // A source people have cannot be deleted; an unused one can.
        (
            await admin.DeleteAsync($"/api/sources/{linkedIn.GetProperty("id").GetGuid()}", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await admin.DeleteAsync(
                $"/api/sources/{(await SourceAsync(admin, "Event", ct)).GetProperty("id").GetGuid()}",
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // Referred by: a teammate, kept only on referral sources.
        var recruiterId = await UserIdAsync(admin, "recruiter@example.test", ct);
        (
            await admin.PostAsJsonAsync(
                "/api/candidates",
                NewCandidate("referred@example.test", "referral", recruiterId),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var referred = await CandidateByEmailAsync("referred@example.test", ct);
        referred.Source.ShouldBe("Referral");
        referred.ReferrerId.ShouldBe(recruiterId);
        var record = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{referred.Id}",
            ct
        );
        record.GetProperty("referrer").GetProperty("name").GetString().ShouldNotBeNullOrEmpty();
        (
            await admin.PostAsJsonAsync(
                "/api/candidates",
                NewCandidate("sourced@example.test", "Sourced", recruiterId),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        (await CandidateByEmailAsync("sourced@example.test", ct)).ReferrerId.ShouldBeNull();

        // A name the list lacks joins it, filed by its words (Other when none fit).
        (
            await admin.PostAsJsonAsync(
                "/api/candidates",
                NewCandidate("meetup@example.test", "Design meetup"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        (await SourceAsync(admin, "Design meetup", ct))
            .GetProperty("category")
            .GetString()
            .ShouldBe("Event");
        (
            await admin.PostAsJsonAsync(
                "/api/candidates",
                NewCandidate("hallway@example.test", "Hallway chat"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        (await SourceAsync(admin, "Hallway chat", ct))
            .GetProperty("category")
            .GetString()
            .ShouldBe("Other");
    }

    [Fact]
    public async Task Candidate_list_filters_by_stage_type_and_by_application_answers()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var saved = await admin.PutAsJsonAsync(
            $"/api/requisitions/{jobId}/questions",
            new
            {
                questions = new object[]
                {
                    new
                    {
                        type = "YesNo",
                        label = "Can you work in the US?",
                        required = true,
                        knockoutAnswers = new[] { "No" },
                    },
                    new
                    {
                        type = "MultipleChoice",
                        label = "Which shifts?",
                        options = new[] { "Mornings", "Evenings", "Nights" },
                    },
                },
            },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.OK);
        var questions = (await saved.Content.ReadFromJsonAsync<JsonElement>(ct))
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();
        using var anonymous = _factory!.CreateClient();
        async Task<Guid> Apply(string email, string work, string[] shifts)
        {
            await ApplyAsync(
                anonymous,
                jobId,
                new
                {
                    firstName = "Answer",
                    lastName = "Filter",
                    email,
                    answers = new object[]
                    {
                        new { questionId = questions[0], values = new[] { work } },
                        new { questionId = questions[1], values = shifts },
                    },
                },
                ct
            );
            return (await CandidateByEmailAsync(email, ct)).Id;
        }
        var flaggedId = await Apply("no.us@example.test", "No", ["Nights"]);
        var clearId = await Apply("yes.us@example.test", "Yes", ["Mornings", "Evenings"]);

        async Task<Guid[]> Ids(string query) =>
            (
                await admin.GetFromJsonAsync<JsonElement>(
                    $"/api/candidates?requisitionId={jobId}&pageSize=100&{query}",
                    ct
                )
            )
                .GetProperty("items")
                .EnumerateArray()
                .Select(x => x.GetProperty("id").GetGuid())
                .ToArray();

        var said = await Ids($"questionId={questions[0]}&answer=No");
        said.ShouldContain(flaggedId);
        said.ShouldNotContain(clearId);
        var shifts = await Ids($"questionId={questions[1]}&answer=Evenings&answer=Nights");
        shifts.ShouldContain(flaggedId);
        shifts.ShouldContain(clearId);
        var flagged = await Ids("flagged=true");
        flagged.ShouldContain(flaggedId);
        flagged.ShouldNotContain(clearId);
        (await Ids($"questionId={questions[1]}&flagged=true")).ShouldBeEmpty();

        // New applications sit in the first stage, whose type is Applied.
        var applied = await Ids("stageType=Applied&openJobs=true");
        applied.ShouldContain(flaggedId);
        applied.ShouldContain(clearId);
        (await Ids("stageType=Offer")).ShouldNotContain(flaggedId);
        // Without a job, the stage type still narrows to people with an application of that type.
        var everywhere = await admin.GetFromJsonAsync<JsonElement>(
            "/api/candidates?stageType=Applied&status=Active&pageSize=100",
            ct
        );
        everywhere
            .GetProperty("items")
            .EnumerateArray()
            .ShouldAllBe(x =>
                x.GetProperty("applications")
                    .EnumerateArray()
                    .Any(a => a.GetProperty("stageType").GetString() == "Applied")
            );
    }

    [Fact]
    public async Task A_stage_links_an_assessment_and_the_board_shows_the_score()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var assessmentId = await PublishedAssessmentAsync(admin, ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var board = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{jobId}/board",
            ct
        );
        var stages = board.GetProperty("stages").EnumerateArray().ToList();
        var withPeople = stages.First(x =>
            !x.GetProperty("isTerminal").GetBoolean()
            && x.GetProperty("applications").GetArrayLength() > 0
        );
        var applicationId = withPeople.GetProperty("applications")[0].GetProperty("id").GetGuid();
        object[] Input(Guid? linked) =>
            [
                .. stages.Select(x => new
                {
                    id = x.GetProperty("id").GetGuid(),
                    name = x.GetProperty("name").GetString(),
                    type = x.GetProperty("type").GetString(),
                    candidateLabel = x.GetProperty("candidateLabel").GetString(),
                    emailOnEntry = "Off",
                    targetDays = (int?)null,
                    assessmentId = x.GetProperty("id").GetGuid()
                    == withPeople.GetProperty("id").GetGuid()
                        ? linked
                        : null,
                }),
            ];

        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}/stages",
                new { stages = Input(Guid.NewGuid()) },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var saved = await admin.PutAsJsonAsync(
            $"/api/requisitions/{jobId}/stages",
            new { stages = Input(assessmentId) },
            ct
        );
        saved.StatusCode.ShouldBe(
            HttpStatusCode.NoContent,
            await saved.Content.ReadAsStringAsync(ct)
        );

        // A submitted result shows on the card.
        var inviteId = await SendAssessmentAsync(admin, applicationId, assessmentId, ct);
        await UpdateInviteAsync(
            inviteId,
            invite =>
            {
                invite.Status = AssessmentInviteStatus.Submitted;
                invite.SubmittedAt = DateTimeOffset.UtcNow;
                invite.Percent = 82;
                invite.Decision = AssessmentDecision.Passed;
            },
            ct
        );
        board = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct);
        var stage = board
            .GetProperty("stages")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == withPeople.GetProperty("id").GetGuid());
        stage.GetProperty("assessmentId").GetGuid().ShouldBe(assessmentId);
        stage.GetProperty("assessmentName").GetString().ShouldBe("Support writing");
        var card = stage
            .GetProperty("applications")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == applicationId);
        card.GetProperty("assessment").GetProperty("percent").GetInt32().ShouldBe(82);
        card.GetProperty("assessment").GetProperty("decision").GetString().ShouldBe("Passed");

        // Pipelines carry the link too, and new jobs copy it.
        var pipeline = await admin.PostAsJsonAsync(
            "/api/admin/pipeline-templates",
            new
            {
                name = "With a test",
                isDefault = false,
                stages = new object[]
                {
                    new
                    {
                        name = "New",
                        type = "Applied",
                        candidateLabel = "Applied",
                    },
                    new
                    {
                        name = "Skills test",
                        type = "Screen",
                        candidateLabel = "Skills test",
                        assessmentId,
                    },
                },
            },
            ct
        );
        pipeline.StatusCode.ShouldBe(
            HttpStatusCode.OK,
            await pipeline.Content.ReadAsStringAsync(ct)
        );
        var templateId = (await pipeline.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        var job = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                title = "Tested role",
                department = "Support",
                location = "Remote",
                employmentType = "Full time",
                workMode = "Remote",
                openings = 1,
                ownerEmail = "manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Helps people.",
                targetStartDate = (string?)null,
                pipelineTemplateId = templateId,
            },
            ct
        );
        job.StatusCode.ShouldBe(HttpStatusCode.Created);
        var newId = (await job.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{newId}", ct))
            .GetProperty("stages")
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Skills test")
            .GetProperty("assessmentId")
            .GetGuid()
            .ShouldBe(assessmentId);
    }

    [Fact]
    public async Task Wizard_drafts_belong_to_one_person_and_go_when_the_job_is_created()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var manager = await LoginAsync("manager@example.test", ct);
        var draftId = Guid.NewGuid();
        var data = new { form = new { title = "Night nurse", department = "Care" }, step = 2 };

        var saved = await recruiter.PutAsJsonAsync(
            $"/api/requisitions/drafts/{draftId}",
            new
            {
                title = "Night nurse",
                step = 2,
                data,
            },
            ct
        );
        saved.StatusCode.ShouldBe(HttpStatusCode.OK, await saved.Content.ReadAsStringAsync(ct));
        // Saving again updates the same draft.
        (
            await recruiter.PutAsJsonAsync(
                $"/api/requisitions/drafts/{draftId}",
                new
                {
                    title = "Night nurse (ICU)",
                    step = 3,
                    data,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var mine = await recruiter.GetFromJsonAsync<JsonElement>("/api/requisitions/drafts", ct);
        var row = mine.EnumerateArray().Single(x => x.GetProperty("id").GetGuid() == draftId);
        row.GetProperty("title").GetString().ShouldBe("Night nurse (ICU)");
        row.GetProperty("step").GetInt32().ShouldBe(3);
        var opened = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/drafts/{draftId}",
            ct
        );
        opened
            .GetProperty("data")
            .GetProperty("form")
            .GetProperty("department")
            .GetString()
            .ShouldBe("Care");

        // Someone else cannot see, change or remove it.
        (await manager.GetAsync($"/api/requisitions/drafts/{draftId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );
        (
            await manager.PutAsJsonAsync(
                $"/api/requisitions/drafts/{draftId}",
                new
                {
                    title = "Taken",
                    step = 0,
                    data,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await manager.GetFromJsonAsync<JsonElement>("/api/requisitions/drafts", ct))
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("id").GetGuid() == draftId);

        // Creating the job from the draft removes it.
        var created = await recruiter.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                title = "Night nurse (ICU)",
                department = "Care",
                location = "Chicago",
                employmentType = "Full time",
                workMode = "On-site",
                openings = 1,
                ownerEmail = "manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Looks after people overnight.",
                targetStartDate = (string?)null,
                draftId,
            },
            ct
        );
        created.StatusCode.ShouldBe(
            HttpStatusCode.Created,
            await created.Content.ReadAsStringAsync(ct)
        );
        (await recruiter.GetFromJsonAsync<JsonElement>("/api/requisitions/drafts", ct))
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("id").GetGuid() == draftId);
    }

    [Fact]
    public async Task Team_approval_chains_win_over_the_organization_chain_and_stuck_steps_escalate()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/approval-policies/Requisition",
                new
                {
                    required = true,
                    mode = "Sequential",
                    approvers = new[] { "manager@example.test" },
                    reminderDays = 2,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var team = await admin.PutAsJsonAsync(
            "/api/approval-policies/Requisition",
            new
            {
                required = true,
                mode = "Parallel",
                approvers = new[] { "recruiter@example.test" },
                reminderDays = 1,
                departments = new[] { "Operations" },
            },
            ct
        );
        team.StatusCode.ShouldBe(HttpStatusCode.OK, await team.Content.ReadAsStringAsync(ct));
        var teamId = (await team.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        // A team has one chain per kind.
        (
            await admin.PutAsJsonAsync(
                "/api/approval-policies/Requisition",
                new
                {
                    required = true,
                    mode = "Parallel",
                    approvers = new[] { "manager@example.test" },
                    reminderDays = 1,
                    departments = new[] { "operations", "Finance" },
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var listed = await admin.GetFromJsonAsync<JsonElement>("/api/approval-policies", ct);
        listed
            .EnumerateArray()
            .ShouldContain(x =>
                x.GetProperty("subjectType").GetString() == "Requisition"
                && x.GetProperty("departments").GetArrayLength() == 1
            );

        // Operations uses its own chain; another team uses the organization's.
        var operations = await DraftJobNeedingApprovalAsync(admin, "Ops lead", ct);
        string[] Defaults(JsonElement view) =>
            [.. view.GetProperty("defaultApprovers").EnumerateArray().Select(x => x.GetString()!)];
        Defaults(
                await admin.GetFromJsonAsync<JsonElement>(
                    $"/api/requisitions/{operations}/approval",
                    ct
                )
            )
            .ShouldBe(["recruiter@example.test"]);
        var engineering = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                title = "Platform engineer",
                department = "Engineering",
                location = "Remote",
                employmentType = "Full time",
                workMode = "Remote",
                openings = 1,
                ownerEmail = "manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Builds things.",
                targetStartDate = (string?)null,
            },
            ct
        );
        var engineeringId = (await engineering.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        Defaults(
                await admin.GetFromJsonAsync<JsonElement>(
                    $"/api/requisitions/{engineeringId}/approval",
                    ct
                )
            )
            .ShouldBe(["manager@example.test"]);

        // The team's approver ignores every reminder: the requester and the admins hear about it once.
        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{operations}/submit-for-approval",
                new { approvers = Array.Empty<string>() },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var organization = await db.Organizations.SingleAsync(ct);
            organization.MaxReminders = 1;
            var step = await db.Approvals.SingleAsync(x => x.SubjectId == operations, ct);
            step.ApproverEmail.ShouldBe("recruiter@example.test");
            step.RemindersSent = 1;
            step.LastRemindedAt = DateTimeOffset.UtcNow.AddDays(-2);
            await db.SaveChangesAsync(ct);

            await AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct);
            await AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct);
            (
                await db.Approvals.AsNoTracking().SingleAsync(x => x.Id == step.Id, ct)
            ).EscalatedAt.ShouldNotBeNull();
            var told = await db
                .Notifications.AsNoTracking()
                .Where(x =>
                    x.Kind == NotificationKinds.ApprovalStuck
                    && x.Title.StartsWith("Approval is stuck")
                )
                .ToListAsync(ct);
            // The requester is an admin here, so each admin is told once.
            told.Count.ShouldBe(
                await db.Users.CountAsync(x => x.Role == UserRole.Admin && x.IsActive, ct)
            );
        }

        // Removing the team chain sends Operations back to the organization's chain.
        (await admin.DeleteAsync($"/api/approval-policies/{teamId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        var again = await DraftJobNeedingApprovalAsync(admin, "Ops lead two", ct);
        Defaults(
                await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{again}/approval", ct)
            )
            .ShouldBe(["manager@example.test"]);
    }

    [Fact]
    public async Task Bulk_reject_reads_the_reason_groups_and_can_send_the_email_later()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var board = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{jobId}/board",
            ct
        );
        var cards = board
            .GetProperty("stages")
            .EnumerateArray()
            .SelectMany(x => x.GetProperty("applications").EnumerateArray())
            .Take(2)
            .ToArray();
        cards.Length.ShouldBe(2);
        Guid Person(int i) => cards[i].GetProperty("candidateId").GetGuid();
        var (firstApp, secondApp) = (
            cards[0].GetProperty("id").GetGuid(),
            cards[1].GetProperty("id").GetGuid()
        );

        // A "they decided" reason closes as Withdrawn and sends nothing, whatever the request says.
        (
            await admin.PostAsJsonAsync(
                "/api/candidates/bulk",
                new
                {
                    ids = new[] { Person(0) },
                    action = "reject",
                    requisitionId = jobId,
                    reason = "Accepted another offer",
                    sendEmail = true,
                    cancelInterviews = true,
                    withdrawOffer = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var later = DateTimeOffset.UtcNow.AddDays(1);
        (
            await admin.PostAsJsonAsync(
                "/api/candidates/bulk",
                new
                {
                    ids = new[] { Person(1) },
                    action = "reject",
                    requisitionId = jobId,
                    reason = "Skills mismatch",
                    sendEmail = true,
                    sendAt = later,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var first = await db.Applications.AsNoTracking().SingleAsync(x => x.Id == firstApp, ct);
        first.Status.ShouldBe(ApplicationStatus.Withdrawn);
        first.DispositionReason.ShouldBe("Accepted another offer");
        (
            await db.EmailOutbox.AnyAsync(
                x => x.ApplicationId == firstApp && x.TemplateKey == "rejection",
                ct
            )
        ).ShouldBeFalse();
        (
            await db.Applications.AsNoTracking().SingleAsync(x => x.Id == secondApp, ct)
        ).Status.ShouldBe(ApplicationStatus.Rejected);
        var email = await db
            .EmailOutbox.AsNoTracking()
            .SingleAsync(x => x.ApplicationId == secondApp && x.TemplateKey == "rejection", ct);
        email.NextAttemptAt.ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddHours(20));
    }
}
