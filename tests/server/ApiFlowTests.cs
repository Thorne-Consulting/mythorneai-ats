using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Shouldly;
using Testcontainers.PostgreSql;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class ApiFlowTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _database = new PostgreSqlBuilder("postgres:18-alpine")
        .WithDatabase("ats_tests")
        .WithUsername("ats")
        .WithPassword("ats-tests-only")
        .Build();

    private WebApplicationFactory<Program>? _factory;

    public async ValueTask InitializeAsync()
    {
        await _database.StartAsync();
        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration(
                (_, configuration) =>
                {
                    configuration.AddInMemoryCollection(
                        new Dictionary<string, string?>
                        {
                            ["ConnectionStrings:AtsDatabase"] = _database.GetConnectionString(),
                            ["Auth:Mode"] = "Development",
                            ["FileStorage:RootPath"] = Path.Combine(
                                Path.GetTempPath(),
                                $"ats-tests-{Guid.NewGuid():N}"
                            ),
                        }
                    );
                }
            );
        });
    }

    public async ValueTask DisposeAsync()
    {
        if (_factory is not null)
            await _factory.DisposeAsync();
        await _database.DisposeAsync();
    }

    [Fact]
    public async Task Authenticated_hiring_flow_and_role_scope_work()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        var anonymous = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions { AllowAutoRedirect = false }
        );
        (await anonymous.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );

        var admin = _factory.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await admin.PostAsJsonAsync(
                "/api/auth/dev-login",
                new { email = "admin@example.test" },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await AddAntiforgeryTokenAsync(admin, cancellationToken);

        var candidateResponse = await admin.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Taylor",
                lastName = "Nguyen",
                email = "taylor.nguyen@example.com",
                phone = "+1 312 555 0100",
                location = "Chicago, IL",
                currentTitle = "Engineer",
                linkedInUrl = (string?)null,
                source = "Test",
                tags = new[] { "integration-test" },
            },
            cancellationToken
        );
        candidateResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var candidate = await candidateResponse.Content.ReadFromJsonAsync<JsonElement>(
            cancellationToken
        );
        var candidateId = candidate.GetProperty("id").GetGuid();

        var resume = new MultipartFormDataContent();
        resume.Add(new ByteArrayContent("%PDF-1.4\n%%EOF"u8.ToArray()), "file", "resume.pdf");
        var uploadResponse = await admin.PostAsync(
            $"/api/candidates/{candidateId}/attachments",
            resume,
            cancellationToken
        );
        uploadResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var attachmentId = (
            await uploadResponse.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)
        )
            .GetProperty("id")
            .GetGuid();
        var previewResponse = await admin.GetAsync(
            $"/api/attachments/{attachmentId}?inline=true",
            cancellationToken
        );
        previewResponse.StatusCode.ShouldBe(HttpStatusCode.OK);
        previewResponse.Content.Headers.ContentType!.MediaType.ShouldBe("application/pdf");
        previewResponse.Content.Headers.ContentDisposition.ShouldBeNull();
        previewResponse.Headers.GetValues("X-Frame-Options").Single().ShouldBe("SAMEORIGIN");

        var adminCandidates = await admin.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        adminCandidates.GetArrayLength().ShouldBe(3);

        var duplicateResponse = await admin.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Taylor",
                lastName = "Nguyen",
                email = "taylor.nguyen@example.com",
                phone = (string?)null,
                location = (string?)null,
                currentTitle = (string?)null,
                linkedInUrl = (string?)null,
                source = "Test",
                tags = Array.Empty<string>(),
            },
            cancellationToken
        );
        duplicateResponse.StatusCode.ShouldBe(HttpStatusCode.Conflict);

        var interviewer = _factory.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await interviewer.PostAsJsonAsync(
                "/api/auth/dev-login",
                new { email = "interviewer@example.test" },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        candidates.GetArrayLength().ShouldBe(1);
        candidates[0].GetProperty("name").GetString().ShouldBe("Jordan Lee");
        (await interviewer.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );

        var integrationStatus = await admin.GetFromJsonAsync<JsonElement>(
            "/api/admin/integrations",
            cancellationToken
        );
        integrationStatus.GetProperty("provider").GetString().ShouldBe("None");
        integrationStatus.GetProperty("enabled").GetBoolean().ShouldBeFalse();
        (
            await admin.PostAsync("/api/admin/integrations/retry-failed", null, cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        (await admin.PostAsync("/api/auth/logout", null, cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await admin.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );
    }

    [Theory]
    [InlineData("recruiter@example.test")]
    [InlineData("manager@example.test")]
    [InlineData("interviewer@example.test")]
    public async Task Non_administrators_cannot_access_administration(string email)
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var client = await LoginAsync(email, cancellationToken);
        (await client.GetAsync("/api/admin/users", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await client.GetAsync("/api/admin/audit", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        (await client.GetAsync("/api/admin/integrations", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task Candidate_contact_and_scope_follow_the_signed_in_role()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var assignedCandidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        assignedCandidates.GetArrayLength().ShouldBe(1);
        var candidateId = assignedCandidates[0].GetProperty("id").GetGuid();

        var restricted = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        restricted.GetProperty("email").GetString().ShouldBe("Restricted");
        restricted.GetProperty("phone").ValueKind.ShouldBe(JsonValueKind.Null);

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var visible = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        visible.GetProperty("email").GetString().ShouldBe("jordan.lee@example.com");
        visible.GetProperty("phone").GetString().ShouldBe("+1 312 555 0142");
    }

    [Fact]
    public async Task Mutations_require_an_antiforgery_token()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync(
            "recruiter@example.test",
            cancellationToken,
            addAntiforgeryToken: false
        );
        var response = await recruiter.PostAsJsonAsync(
            "/api/candidates",
            new
            {
                firstName = "Casey",
                lastName = "NoToken",
                email = "casey.no-token@example.com",
                phone = (string?)null,
                location = (string?)null,
                currentTitle = (string?)null,
                linkedInUrl = (string?)null,
                source = "Test",
                tags = Array.Empty<string>(),
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Role_and_account_changes_apply_to_an_existing_session()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        const string email = "temporary.interviewer@example.test";
        using var admin = await LoginAsync("admin@example.test", cancellationToken);

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Interviewer",
                    role = "Interviewer",
                    department = "Engineering",
                    isActive = true,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var temporaryUser = await LoginAsync(email, cancellationToken);
        var initial = await temporaryUser.GetFromJsonAsync<JsonElement>(
            "/api/auth/me",
            cancellationToken
        );
        initial.GetProperty("role").GetString().ShouldBe("Interviewer");

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Recruiter",
                    role = "Recruiter",
                    department = "Sales",
                    isActive = true,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        var updated = await temporaryUser.GetFromJsonAsync<JsonElement>(
            "/api/auth/me",
            cancellationToken
        );
        updated.GetProperty("role").GetString().ShouldBe("Recruiter");
        updated.GetProperty("displayName").GetString().ShouldBe("Temporary Recruiter");

        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email,
                    displayName = "Temporary Recruiter",
                    role = "Recruiter",
                    department = "Sales",
                    isActive = false,
                },
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await temporaryUser.GetAsync("/api/dashboard", cancellationToken)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );
    }

    [Fact]
    public async Task Hiring_managers_are_scoped_to_their_requisitions()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", cancellationToken);
        var response = await admin.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                code = $"OPS-{Guid.NewGuid():N}"[..12],
                title = "Operations analyst",
                department = "Operations",
                location = "Chicago, IL",
                employmentType = "Full time",
                workMode = "Hybrid",
                openings = 1,
                ownerEmail = "another.manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Authorization boundary test",
                targetStartDate = (string?)null,
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var requisitionId = created.GetProperty("id").GetGuid();

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        (
            await manager.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        (
            await recruiter.GetAsync($"/api/requisitions/{requisitionId}", cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Only_an_assigned_interviewer_can_submit_a_locked_scorecard()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var candidates = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates[0].GetProperty("id").GetGuid();
        var candidate = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var application = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var interviewId = application
            .GetProperty("application")
            .GetProperty("interviews")[0]
            .GetProperty("id")
            .GetGuid();

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var managerAttempt = await manager.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 5,
                evidence = "Manager is not assigned to this interview.",
                strengths = "None assessed.",
                concerns = "Not assigned.",
            },
            cancellationToken
        );
        managerAttempt.StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var firstSubmission = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Clear technical reasoning with relevant examples.",
                strengths = "Clear reasoning.",
                concerns = "None observed.",
            },
            cancellationToken
        );
        firstSubmission.StatusCode.ShouldBe(HttpStatusCode.Created);

        var secondSubmission = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "No",
                rating = 1,
                evidence = "Attempt to replace locked feedback.",
                strengths = "Already recorded.",
                concerns = "Duplicate submission.",
            },
            cancellationToken
        );
        secondSubmission.StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Applicant_queue_filters_and_bulk_rejection_work()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var application = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var currentStageId = application
            .GetProperty("application")
            .GetProperty("stageId")
            .GetGuid();

        var filtered = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/applications?search=Jordan&tag=react&page=1&pageSize=10",
            cancellationToken
        );
        filtered.GetProperty("total").GetInt32().ShouldBe(1);
        filtered.GetProperty("items")[0].GetProperty("id").GetGuid().ShouldBe(applicationId);

        var response = await recruiter.PatchAsJsonAsync(
            "/api/applications/bulk-stage",
            new
            {
                applicationIds = new[] { applicationId },
                stageId = currentStageId,
                status = "Rejected",
                dispositionReason = "Does not meet the required experience",
            },
            cancellationToken
        );
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var result = await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        result.GetProperty("updated").GetInt32().ShouldBe(1);

        var rejected = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/applications?status=Rejected&page=1&pageSize=10",
            cancellationToken
        );
        rejected
            .GetProperty("items")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("id").GetGuid() == applicationId);
    }

    [Fact]
    public async Task Interview_recordings_require_consent_and_are_private_application_records()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var startsAt = DateTimeOffset.UtcNow.AddDays(2);
        var scheduled = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Recorded interview",
                interviewKitId = (Guid?)null,
                startsAt,
                endsAt = startsAt.AddMinutes(45),
                timeZone = "America/Chicago",
                meetingLink = (string?)null,
                interviewerEmails = new[] { "interviewer@example.test" },
            },
            cancellationToken
        );
        scheduled.StatusCode.ShouldBe(HttpStatusCode.Created);
        var interviewId = (
            await scheduled.Content.ReadFromJsonAsync<JsonElement>(cancellationToken)
        )
            .GetProperty("id")
            .GetGuid();

        using (var withoutConsent = RecordingUpload())
        {
            var response = await recruiter.PostAsync(
                $"/api/interviews/{interviewId}/recordings?consentConfirmed=false",
                withoutConsent,
                cancellationToken
            );
            response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        }

        Guid recordingId;
        using (var withConsent = RecordingUpload())
        {
            var response = await recruiter.PostAsync(
                $"/api/interviews/{interviewId}/recordings?consentConfirmed=true",
                withConsent,
                cancellationToken
            );
            response.StatusCode.ShouldBe(HttpStatusCode.Created);
            recordingId = (await response.Content.ReadFromJsonAsync<JsonElement>(cancellationToken))
                .GetProperty("id")
                .GetGuid();
        }

        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var download = await interviewer.GetAsync(
            $"/api/interview-recordings/{recordingId}",
            cancellationToken
        );
        download.StatusCode.ShouldBe(HttpStatusCode.OK);
        download.Content.Headers.ContentType!.MediaType.ShouldBe("video/webm");

        (
            await recruiter.DeleteAsync(
                $"/api/interview-recordings/{recordingId}",
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await interviewer.GetAsync(
                $"/api/interview-recordings/{recordingId}",
                cancellationToken
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Interview_kits_require_complete_structured_scorecards()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var requisitions = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/requisitions?status=Open",
            cancellationToken
        );
        var requisitionId = requisitions[0].GetProperty("id").GetGuid();

        var kitResponse = await recruiter.PostAsJsonAsync(
            $"/api/requisitions/{requisitionId}/interview-kits",
            new
            {
                name = "Structured technical interview",
                instructions = "Ask the same core questions for every candidate.",
                durationMinutes = 60,
                criteria = new[]
                {
                    new
                    {
                        name = "Technical judgment",
                        question = "How did you choose the approach?",
                        description = "Explains tradeoffs.",
                        weight = 3,
                    },
                    new
                    {
                        name = "Collaboration",
                        question = "How did you resolve a disagreement?",
                        description = "Works across teams.",
                        weight = 2,
                    },
                },
            },
            cancellationToken
        );
        kitResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var kit = await kitResponse.Content.ReadFromJsonAsync<JsonElement>(cancellationToken);
        var kitId = kit.GetProperty("id").GetGuid();

        var candidates = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/candidates",
            cancellationToken
        );
        var candidateId = candidates
            .EnumerateArray()
            .Single(x => x.GetProperty("name").GetString() == "Jordan Lee")
            .GetProperty("id")
            .GetGuid();
        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        var applicationId = candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
        var startsAt = DateTimeOffset.UtcNow.AddDays(3);
        var interviewResponse = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/interviews",
            new
            {
                title = "Structured technical interview",
                interviewKitId = kitId,
                startsAt,
                endsAt = startsAt.AddHours(1),
                timeZone = "America/Chicago",
                meetingLink = (string?)null,
                interviewerEmails = new[] { "interviewer@example.test", "manager@example.test" },
            },
            cancellationToken
        );
        interviewResponse.StatusCode.ShouldBe(HttpStatusCode.Created);
        var interview = await interviewResponse.Content.ReadFromJsonAsync<JsonElement>(
            cancellationToken
        );
        var interviewId = interview.GetProperty("id").GetGuid();

        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var application = await interviewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var interviewDetail = application
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        interviewDetail
            .GetProperty("interviewKitName")
            .GetString()
            .ShouldBe("Structured technical interview");
        var criteria = interviewDetail.GetProperty("criteria").EnumerateArray().ToArray();
        criteria.Length.ShouldBe(2);

        var incomplete = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Strong overall evidence.",
                strengths = "Relevant examples.",
                concerns = "None observed.",
                criteria = Array.Empty<object>(),
            },
            cancellationToken
        );
        incomplete.StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        var complete = await interviewer.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "Yes",
                rating = 4,
                evidence = "Strong overall evidence.",
                strengths = "Relevant examples.",
                concerns = "None observed.",
                criteria = criteria.Select(x => new
                {
                    criterionId = x.GetProperty("id").GetGuid(),
                    rating = 4,
                    evidence = $"Evidence for {x.GetProperty("name").GetString()}",
                }),
            },
            cancellationToken
        );
        complete.StatusCode.ShouldBe(HttpStatusCode.Created);

        using var manager = await LoginAsync("manager@example.test", cancellationToken);
        var blindView = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var blindInterview = blindView
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId);
        blindInterview.GetProperty("submittedScorecards").GetInt32().ShouldBe(1);
        blindInterview.GetProperty("scorecards").GetArrayLength().ShouldBe(0);

        var managerSubmission = await manager.PostAsJsonAsync(
            $"/api/interviews/{interviewId}/scorecards",
            new
            {
                recommendation = "StrongYes",
                rating = 5,
                evidence = "Independent manager assessment.",
                strengths = "Strong judgment.",
                concerns = "None observed.",
                criteria = criteria.Select(x => new
                {
                    criterionId = x.GetProperty("id").GetGuid(),
                    rating = 5,
                    evidence = $"Manager evidence for {x.GetProperty("name").GetString()}",
                }),
            },
            cancellationToken
        );
        managerSubmission.StatusCode.ShouldBe(HttpStatusCode.Created);

        var updated = await manager.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            cancellationToken
        );
        var visibleScorecards = updated
            .GetProperty("application")
            .GetProperty("interviews")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == interviewId)
            .GetProperty("scorecards");
        visibleScorecards.GetArrayLength().ShouldBe(2);
        visibleScorecards[0].GetProperty("criteria").GetArrayLength().ShouldBe(2);
    }

    private async Task<HttpClient> LoginAsync(
        string email,
        CancellationToken cancellationToken,
        bool addAntiforgeryToken = true
    )
    {
        var client = _factory!.CreateClient(
            new WebApplicationFactoryClientOptions
            {
                AllowAutoRedirect = false,
                HandleCookies = true,
            }
        );
        (
            await client.PostAsJsonAsync("/api/auth/dev-login", new { email }, cancellationToken)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        if (addAntiforgeryToken)
            await AddAntiforgeryTokenAsync(client, cancellationToken);
        return client;
    }

    private static MultipartFormDataContent RecordingUpload()
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(
            new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x86, 0x81, 0x01 }
        );
        file.Headers.ContentType = new MediaTypeHeaderValue("video/webm");
        content.Add(file, "file", "interview.webm");
        return content;
    }

    private static async Task AddAntiforgeryTokenAsync(
        HttpClient client,
        CancellationToken cancellationToken
    )
    {
        var payload = await client.GetFromJsonAsync<JsonElement>(
            "/api/auth/csrf",
            cancellationToken
        );
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", payload.GetProperty("token").GetString());
    }
}
