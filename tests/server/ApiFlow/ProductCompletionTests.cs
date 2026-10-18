using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private async Task<Guid> JordanApplicationAsync(HttpClient client, CancellationToken ct)
    {
        var candidates = await client.GetFromJsonAsync<JsonElement>("/api/candidates?search=Jordan%20Lee", ct);
        var id = candidates.GetProperty("items").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Jordan Lee").GetProperty("id").GetGuid();
        var candidate = await client.GetFromJsonAsync<JsonElement>($"/api/candidates/{id}", ct);
        return candidate.GetProperty("applications")[0].GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task Acceptance_needs_approval_then_marks_the_candidate_hired_and_can_be_reversed()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);

        var detail = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct);
        var hiredStage = detail.GetProperty("application").GetProperty("stages").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Hired").GetProperty("id").GetGuid();
        // Hiring can't skip the approved acceptance.
        (await recruiter.PatchAsJsonAsync($"/api/applications/{applicationId}/stage", new { stageId = hiredStage, status = "Active", dispositionReason = (string?)null }, ct))
            .StatusCode.ShouldBe(HttpStatusCode.Conflict);

        (await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/offer", new { note = "Strong panel, start in November" }, ct)).StatusCode.ShouldBe(HttpStatusCode.Created);
        var offerView = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct);
        var offerId = offerView.GetProperty("offer").GetProperty("id").GetGuid();
        (await recruiter.PostAsJsonAsync($"/api/offers/{offerId}/submit", new { approvers = Array.Empty<string>() }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.PostAsync($"/api/offers/{offerId}/send", null, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        using var manager = await LoginAsync("manager@example.test", ct);
        var mine = await manager.GetFromJsonAsync<JsonElement>("/api/approvals/mine", ct);
        var approval = mine.EnumerateArray().Single(x => x.GetProperty("type").GetString() == "Offer");
        var approvalId = approval.GetProperty("id").GetGuid();
        // A rejection must say why.
        (await manager.PostAsJsonAsync($"/api/approvals/{approvalId}/decide", new { decision = "Rejected", comment = "" }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await manager.PostAsJsonAsync($"/api/approvals/{approvalId}/decide", new { decision = "Approved", comment = "Go ahead" }, ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        // Only the named approver can decide, and only once.
        (await manager.PostAsJsonAsync($"/api/approvals/{approvalId}/decide", new { decision = "Approved" }, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        // Admin is a second default approver, so the offer isn't approved until they sign off too.
        (await recruiter.PostAsync($"/api/offers/{offerId}/send", null, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        using var admin = await LoginAsync("admin@example.test", ct);
        var adminApproval = (await admin.GetFromJsonAsync<JsonElement>("/api/approvals/mine", ct)).EnumerateArray().Single(x => x.GetProperty("type").GetString() == "Offer").GetProperty("id").GetGuid();
        (await admin.PostAsJsonAsync($"/api/approvals/{adminApproval}/decide", new { decision = "Approved" }, ct)).StatusCode.ShouldBe(HttpStatusCode.OK);

        (await recruiter.PostAsync($"/api/offers/{offerId}/send", null, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var after = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct);
        after.GetProperty("application").GetProperty("status").GetString().ShouldBe("Hired");
        after.GetProperty("emails").EnumerateArray().ShouldContain(x => x.GetProperty("templateKey").GetString() == "acceptance");

        (await recruiter.PostAsync($"/api/offers/{offerId}/reverse", null, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var reversed = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct);
        reversed.GetProperty("application").GetProperty("status").GetString().ShouldBe("Active");

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        (await db.StageTransitions.CountAsync(x => x.ApplicationId == applicationId && x.ToStatus == ApplicationStatus.Hired, ct)).ShouldBe(1);
    }

    [Fact]
    public async Task A_rejected_approval_returns_the_offer_to_draft_with_the_reason()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/offer", new { note = "" }, ct);
        var offerId = (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct)).GetProperty("offer").GetProperty("id").GetGuid();
        await recruiter.PostAsJsonAsync($"/api/offers/{offerId}/submit", new { approvers = new[] { "manager@example.test" } }, ct);

        using var manager = await LoginAsync("manager@example.test", ct);
        var approvalId = (await manager.GetFromJsonAsync<JsonElement>("/api/approvals/mine", ct)).EnumerateArray().Single().GetProperty("id").GetGuid();
        (await manager.PostAsJsonAsync($"/api/approvals/{approvalId}/decide", new { decision = "Rejected", comment = "Compensation isn't agreed" }, ct)).StatusCode.ShouldBe(HttpStatusCode.OK);

        var view = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct);
        view.GetProperty("offer").GetProperty("status").GetString().ShouldBe("Draft");
        view.GetProperty("approvals")[0].GetProperty("comment").GetString().ShouldBe("Compensation isn't agreed");
    }

    [Fact]
    public async Task Opening_a_job_needs_approval_when_the_organization_requires_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var organization = await admin.GetFromJsonAsync<JsonElement>("/api/organization", ct);
        (await admin.PutAsJsonAsync("/api/organization", new { name = organization.GetProperty("name").GetString(), timeZone = "UTC", allowedEmailDomains = Array.Empty<string>(), requireRequisitionApproval = true }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var created = await admin.PostAsJsonAsync("/api/requisitions", new { title = "Support lead", department = "Support", location = "Remote", employmentType = "Full time", workMode = "Remote", openings = 1, ownerEmail = "manager@example.test", recruiterEmail = "recruiter@example.test", description = "x", targetStartDate = (string?)null }, ct);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetGuid();

        (await admin.PatchAsJsonAsync($"/api/requisitions/{id}/status", new { status = "Open" }, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await admin.PostAsJsonAsync($"/api/requisitions/{id}/submit-for-approval", new { approvers = new[] { "manager@example.test" }, sequential = false }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct)).GetProperty("status").GetString().ShouldBe("PendingApproval");

        using var manager = await LoginAsync("manager@example.test", ct);
        var approval = (await manager.GetFromJsonAsync<JsonElement>("/api/approvals/mine", ct)).EnumerateArray().Single(x => x.GetProperty("type").GetString() == "Requisition");
        (await manager.PostAsJsonAsync($"/api/approvals/{approval.GetProperty("id").GetGuid()}/decide", new { decision = "Approved" }, ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct)).GetProperty("status").GetString().ShouldBe("Open");
    }

    [Fact]
    public async Task Email_templates_validate_variables_and_fall_back_to_defaults()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        (await admin.PutAsJsonAsync("/api/email-templates/acceptance", new { subject = "Welcome {{secret}}", body = "Hi", requisitionId = (Guid?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync("/api/email-templates/acceptance", new { subject = "Welcome aboard, {{firstName}}", body = "Hi {{firstName}}, see you at {{company}}.", requisitionId = (Guid?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var list = await admin.GetFromJsonAsync<JsonElement>("/api/email-templates", ct);
        var acceptance = list.EnumerateArray().Single(x => x.GetProperty("key").GetString() == "acceptance");
        acceptance.GetProperty("source").GetString().ShouldBe("organization");
        acceptance.GetProperty("version").GetInt32().ShouldBe(1);
        (await admin.DeleteAsync("/api/email-templates/acceptance", ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement>("/api/email-templates", ct)).EnumerateArray().Single(x => x.GetProperty("key").GetString() == "acceptance").GetProperty("source").GetString().ShouldBe("default");
    }

    [Fact]
    public async Task Every_report_loads_and_exports_and_is_limited_by_permission()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var catalog = await recruiter.GetFromJsonAsync<JsonElement>("/api/reports", ct);
        catalog.GetArrayLength().ShouldBe(7);
        foreach (var report in catalog.EnumerateArray())
        {
            var key = report.GetProperty("key").GetString();
            var body = await recruiter.GetFromJsonAsync<JsonElement>($"/api/reports/{key}", ct);
            body.GetProperty("stats").GetArrayLength().ShouldBeGreaterThan(0, key);
            body.GetProperty("charts").GetArrayLength().ShouldBeGreaterThan(0, key);
            var csv = await recruiter.GetAsync($"/api/reports/{key}?format=csv", ct);
            csv.StatusCode.ShouldBe(HttpStatusCode.OK, key);
            csv.Content.Headers.ContentType!.MediaType.ShouldBe("text/csv");
        }
        var funnel = await recruiter.GetFromJsonAsync<JsonElement>("/api/reports/funnel", ct);
        funnel.GetProperty("rows")[0][1].GetInt32().ShouldBeGreaterThan(0);
        (await recruiter.GetFromJsonAsync<JsonElement>("/api/reports/hires", ct)).GetProperty("rows").GetArrayLength().ShouldBeGreaterThan(0);

        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.GetAsync("/api/reports/funnel", ct)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Admins_can_change_what_each_role_may_do()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (await recruiter.GetAsync("/api/reports/funnel", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var admin = await LoginAsync("admin@example.test", ct);
        (await admin.PutAsJsonAsync("/api/admin/role-permissions", new { permissions = new Dictionary<string, string[]> { ["Recruiter"] = new[] { "import" } } }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await recruiter.GetAsync("/api/reports/funnel", ct)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await recruiter.GetFromJsonAsync<JsonElement>("/api/auth/me", ct)).GetProperty("permissions").EnumerateArray().Select(x => x.GetString()).ShouldBe(["import"]);
    }

    [Fact]
    public async Task Candidate_import_previews_creates_and_skips_duplicates()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var csv = "firstName,lastName,email,location,tags\nNora,Quill,nora.quill@example.com,Austin TX,\"go;sql\"\nJordan,Lee,jordan.lee@example.com,,\nBroken,,not-an-email,,\nNora,Again,nora.quill@example.com,,\n";
        async Task<JsonElement> Post(bool dryRun)
        {
            using var form = new MultipartFormDataContent { { new ByteArrayContent(Encoding.UTF8.GetBytes(csv)), "file", "people.csv" } };
            var response = await recruiter.PostAsync($"/api/candidates/import?dryRun={dryRun.ToString().ToLowerInvariant()}", form, ct);
            response.StatusCode.ShouldBe(HttpStatusCode.OK);
            return await response.Content.ReadFromJsonAsync<JsonElement>(ct);
        }
        var preview = await Post(true);
        preview.GetProperty("wouldCreate").GetInt32().ShouldBe(1);
        preview.GetProperty("duplicates").GetInt32().ShouldBe(2);
        preview.GetProperty("invalid").GetInt32().ShouldBe(1);
        preview.GetProperty("created").GetInt32().ShouldBe(0);
        (await Post(false)).GetProperty("created").GetInt32().ShouldBe(1);
        (await Post(false)).GetProperty("created").GetInt32().ShouldBe(0);
    }

    [Fact]
    public async Task Confidential_jobs_are_hidden_from_recruiters_who_are_not_involved()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var created = await admin.PostAsJsonAsync("/api/requisitions", new { title = "Chief of staff", department = "Executive", location = "Remote", employmentType = "Full time", workMode = "Remote", openings = 1, ownerEmail = "manager@example.test", recruiterEmail = "recruiter@example.test", description = "x", targetStartDate = (string?)null }, ct);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetGuid();
        (await admin.PutAsJsonAsync($"/api/requisitions/{id}/settings", new { isConfidential = true, viewerEmails = Array.Empty<string>(), allowCandidateReschedule = true, allowCandidateWithdraw = true }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var other = await LoginAsync("dana.recruiter@example.test", ct);
        (await other.GetAsync($"/api/requisitions/{id}", ct)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await other.GetFromJsonAsync<JsonElement>("/api/requisitions", ct)).EnumerateArray().ShouldNotContain(x => x.GetProperty("id").GetGuid() == id);
        using var assigned = await LoginAsync("recruiter@example.test", ct);
        (await assigned.GetAsync($"/api/requisitions/{id}", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Candidates_can_message_the_team_and_withdraw_from_the_portal()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jobs = await recruiter.GetFromJsonAsync<JsonElement>("/api/requisitions?status=Open", ct);
        var jobId = jobs[0].GetProperty("id").GetGuid();

        using var anonymous = _factory!.CreateClient();
        var email = $"portal.{Guid.NewGuid():N}"[..20] + "@example.test";
        (await anonymous.PostAsJsonAsync($"/public/jobs/{jobId}/applications", new { firstName = "Pat", lastName = "Portal", email }, ct)).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        string code;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var body = await db.EmailOutbox.Where(x => x.Recipient == email).Select(x => x.Body).FirstAsync(ct);
            code = Regex.Match(body, @"\d{6}").Value;
        }
        var verified = await anonymous.PostAsJsonAsync("/public/applications/verify", new { email, code }, ct);
        verified.StatusCode.ShouldBe(HttpStatusCode.OK);
        var payload = await verified.Content.ReadFromJsonAsync<JsonElement>(ct);
        var token = payload.GetProperty("token").GetString()!;
        var applicationId = payload.GetProperty("applicationId").GetGuid();

        HttpRequestMessage Candidate(HttpMethod method, string url, object? body = null)
        {
            var request = new HttpRequestMessage(method, url) { Content = body is null ? null : JsonContent.Create(body) };
            request.Headers.Add("X-Candidate-Session", token);
            return request;
        }
        (await anonymous.SendAsync(Candidate(HttpMethod.Post, $"/public/portal/applications/{applicationId}/messages", new { body = "" }), ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await anonymous.SendAsync(Candidate(HttpMethod.Post, $"/public/portal/applications/{applicationId}/messages", new { body = "Could we talk on Thursday?" }), ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var detail = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct);
        detail.GetProperty("messages")[0].GetProperty("body").GetString().ShouldBe("Could we talk on Thursday?");
        (await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/messages", new { body = "Thursday works." }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var portalResponse = await anonymous.SendAsync(Candidate(HttpMethod.Get, "/public/portal"), ct);
        portalResponse.StatusCode.ShouldBe(HttpStatusCode.OK, await portalResponse.Content.ReadAsStringAsync(ct));
        var portal = await portalResponse.Content.ReadFromJsonAsync<JsonElement>(ct);
        var thread = portal.GetProperty("applications")[0].GetProperty("thread");
        thread.GetArrayLength().ShouldBe(2);
        thread[1].GetProperty("fromCandidate").GetBoolean().ShouldBeFalse();

        (await anonymous.SendAsync(Candidate(HttpMethod.Post, $"/public/portal/applications/{applicationId}/withdraw", new { reason = "Took another role" }), ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var after = await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct);
        after.GetProperty("application").GetProperty("status").GetString().ShouldBe("Withdrawn");
        after.GetProperty("application").GetProperty("dispositionReason").GetString().ShouldContain("Took another role");
    }

    [Fact]
    public async Task Webhooks_are_delivered_with_a_valid_signature()
    {
        var ct = TestContext.Current.CancellationToken;
        using var listener = new HttpListener();
        var port = new Random().Next(20000, 40000);
        listener.Prefixes.Add($"http://localhost:{port}/hook/");
        listener.Start();
        var received = Task.Run(async () =>
        {
            while (true)
            {
                var context = await listener.GetContextAsync();
                using var reader = new StreamReader(context.Request.InputStream);
                var body = await reader.ReadToEndAsync();
                context.Response.StatusCode = 200;
                context.Response.Close();
                if (context.Request.Headers["X-ATS-Event"] == "application.stage_changed")
                    return (body, context.Request.Headers["X-ATS-Signature"]!);
            }
        }, ct);

        using var admin = await LoginAsync("admin@example.test", ct);
        var created = await admin.PostAsJsonAsync("/api/admin/webhooks", new { url = $"http://localhost:{port}/hook/", events = new[] { "application.stage_changed" } }, ct);
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var secret = (await created.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("secret").GetString()!;
        // Plain http to a remote host is refused.
        (await admin.PostAsJsonAsync("/api/admin/webhooks", new { url = "http://example.com/hook", events = Array.Empty<string>() }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)).GetProperty("application");
        var stages = detail.GetProperty("stages").EnumerateArray().ToList();
        var next = stages.First(x => x.GetProperty("id").GetGuid() != detail.GetProperty("stageId").GetGuid() && !x.GetProperty("isTerminal").GetBoolean());
        (await recruiter.PatchAsJsonAsync($"/api/applications/{applicationId}/stage", new { stageId = next.GetProperty("id").GetGuid(), status = "Active", dispositionReason = (string?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var (payload, signature) = await received.WaitAsync(TimeSpan.FromSeconds(30), ct);
        var expected = "sha256=" + Convert.ToHexString(System.Security.Cryptography.HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
        signature.ShouldBe(expected);
        JsonDocument.Parse(payload).RootElement.GetProperty("data").GetProperty("applicationId").GetGuid().ShouldBe(applicationId);
    }

    [Fact]
    public void Quiet_hours_wrap_past_midnight_and_follow_the_organization_time_zone()
    {
        var org = new Organization { Name = "x", OwnerEmail = "x@example.test", TimeZone = "America/Chicago", QuietHoursStart = 20, QuietHoursEnd = 8 };
        // 03:00 UTC in winter is 21:00 the evening before in Chicago.
        EmailOutboxWorker.InQuietHours(org, new DateTimeOffset(2026, 1, 15, 3, 0, 0, TimeSpan.Zero)).ShouldBeTrue();
        EmailOutboxWorker.InQuietHours(org, new DateTimeOffset(2026, 1, 15, 18, 0, 0, TimeSpan.Zero)).ShouldBeFalse();
        org.QuietHoursEnd = 20;
        EmailOutboxWorker.InQuietHours(org, new DateTimeOffset(2026, 1, 15, 3, 0, 0, TimeSpan.Zero)).ShouldBeFalse();
    }

    [Fact]
    public void Resend_webhook_signatures_and_csv_cells_are_checked()
    {
        var secretBytes = Encoding.UTF8.GetBytes("a-test-signing-secret");
        var secret = "whsec_" + Convert.ToBase64String(secretBytes);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var signature = "v1," + Convert.ToBase64String(System.Security.Cryptography.HMACSHA256.HashData(secretBytes, Encoding.UTF8.GetBytes($"msg_1.{timestamp}.{{}}")));
        PublicEndpoints.VerifySvix(secret, "msg_1", timestamp, signature, "{}").ShouldBeTrue();
        PublicEndpoints.VerifySvix(secret, "msg_1", timestamp, signature, "{\"tampered\":1}").ShouldBeFalse();
        PublicEndpoints.VerifySvix(secret, "msg_1", "1", signature, "{}").ShouldBeFalse();
        Csv.Escape("=SUM(A1)").ShouldBe("'=SUM(A1)");
        Csv.Escape("Lee, Jordan").ShouldBe("\"Lee, Jordan\"");
        Csv.Parse("a,\"b,c\",d\n\"x \"\"y\"\"\",2,3\n")[1][0].ShouldBe("x \"y\"");
    }

    [Fact]
    public async Task Nobody_can_approve_their_own_request_and_default_approvers_stay()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        await recruiter.PostAsJsonAsync($"/api/applications/{applicationId}/offer", new { note = "" }, ct);
        var offerId = (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct)).GetProperty("offer").GetProperty("id").GetGuid();

        // An interviewer isn't someone who can approve.
        (await recruiter.PostAsJsonAsync($"/api/offers/{offerId}/submit", new { approvers = new[] { "interviewer@example.test" } }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Naming yourself changes nothing: you're dropped and a non-admin can't remove the default approvers.
        (await recruiter.PostAsJsonAsync($"/api/offers/{offerId}/submit", new { approvers = new[] { "recruiter@example.test" } }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var approvers = (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct)).GetProperty("approvals").EnumerateArray().Select(x => x.GetProperty("approverEmail").GetString()).ToArray();
        approvers.ShouldBe(["manager@example.test", "admin@example.test"], ignoreOrder: true);
    }

    [Fact]
    public async Task A_job_cannot_reach_open_without_approval_by_another_route()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var organization = await admin.GetFromJsonAsync<JsonElement>("/api/organization", ct);
        await admin.PutAsJsonAsync("/api/organization", new { name = organization.GetProperty("name").GetString(), timeZone = "UTC", allowedEmailDomains = Array.Empty<string>(), requireRequisitionApproval = true }, ct);
        var created = await admin.PostAsJsonAsync("/api/requisitions", new { title = "Detour", department = "Ops", location = "Remote", employmentType = "Full time", workMode = "Remote", openings = 1, ownerEmail = "manager@example.test", recruiterEmail = "recruiter@example.test", description = "x", targetStartDate = (string?)null }, ct);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetGuid();
        // Draft -> On hold -> Open is the detour.
        (await admin.PatchAsJsonAsync($"/api/requisitions/{id}/status", new { status = "OnHold" }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.PatchAsJsonAsync($"/api/requisitions/{id}/status", new { status = "Open" }, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Editing_email_templates_needs_the_templates_permission_even_for_one_job()
    {
        var ct = TestContext.Current.CancellationToken;
        using var manager = await LoginAsync("manager@example.test", ct);
        var jobs = await manager.GetFromJsonAsync<JsonElement>("/api/requisitions", ct);
        var jobId = jobs[0].GetProperty("id").GetGuid();
        (await manager.PutAsJsonAsync("/api/email-templates/acceptance", new { subject = "Hello {{firstName}}", body = "Hi {{firstName}}", requisitionId = jobId }, ct)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (await manager.DeleteAsync($"/api/email-templates/acceptance?requisitionId={jobId}", ct)).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
    }

    [Theory]
    [InlineData("127.0.0.1", false)]
    [InlineData("10.1.2.3", false)]
    [InlineData("172.20.0.5", false)]
    [InlineData("192.168.1.9", false)]
    [InlineData("169.254.169.254", false)]
    [InlineData("100.64.0.1", false)]
    [InlineData("0.0.0.0", false)]
    [InlineData("::1", false)]
    [InlineData("fd00::1", false)]
    [InlineData("::ffff:10.0.0.1", false)]
    [InlineData("8.8.8.8", true)]
    [InlineData("2606:4700:4700::1111", true)]
    public void Webhook_connections_only_go_to_public_addresses(string address, bool expected) =>
        SsrfGuard.IsPublic(System.Net.IPAddress.Parse(address)).ShouldBe(expected);

    [Fact]
    public async Task Named_viewers_can_read_a_confidential_job_but_not_change_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var created = await admin.PostAsJsonAsync("/api/requisitions", new { title = "Viewer test", department = "Ops", location = "Remote", employmentType = "Full time", workMode = "Remote", openings = 1, ownerEmail = "manager@example.test", recruiterEmail = "recruiter@example.test", description = "x", targetStartDate = (string?)null }, ct);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("id").GetGuid();
        (await admin.PutAsJsonAsync($"/api/requisitions/{id}/settings", new { isConfidential = true, viewerEmails = new[] { "priya.manager@example.test" }, allowCandidateReschedule = true, allowCandidateWithdraw = true }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var viewer = await LoginAsync("priya.manager@example.test", ct);
        (await viewer.GetAsync($"/api/requisitions/{id}", ct)).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await viewer.PutAsJsonAsync($"/api/requisitions/{id}/settings", new { isConfidential = false, viewerEmails = Array.Empty<string>(), allowCandidateReschedule = true, allowCandidateWithdraw = true }, ct)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await viewer.PatchAsJsonAsync($"/api/requisitions/{id}/status", new { status = "Cancelled" }, ct)).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Hired_cannot_be_set_by_hand_on_a_stage_move()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var applicationId = await JordanApplicationAsync(recruiter, ct);
        var detail = (await recruiter.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)).GetProperty("application");
        var stageId = detail.GetProperty("stageId").GetGuid();
        (await recruiter.PatchAsJsonAsync($"/api/applications/{applicationId}/stage", new { stageId, status = "Hired", dispositionReason = (string?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await recruiter.PatchAsJsonAsync("/api/applications/bulk-stage", new { applicationIds = new[] { applicationId }, stageId, status = "Hired", dispositionReason = (string?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Moving into the Hired stage is refused even with acceptance approval switched off.
        using var admin = await LoginAsync("admin@example.test", ct);
        var organization = await admin.GetFromJsonAsync<JsonElement>("/api/organization", ct);
        (await admin.PutAsJsonAsync("/api/organization", new { name = organization.GetProperty("name").GetString(), timeZone = "UTC", allowedEmailDomains = Array.Empty<string>(), requireOfferApproval = false }, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var hiredStage = detail.GetProperty("stages").EnumerateArray().Single(x => x.GetProperty("name").GetString() == "Hired").GetProperty("id").GetGuid();
        (await recruiter.PatchAsJsonAsync($"/api/applications/{applicationId}/stage", new { stageId = hiredStage, status = "Active", dispositionReason = (string?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await recruiter.PatchAsJsonAsync("/api/applications/bulk-stage", new { applicationIds = new[] { applicationId }, stageId = hiredStage, status = "Active", dispositionReason = (string?)null }, ct)).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }
}
