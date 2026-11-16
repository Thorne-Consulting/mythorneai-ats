using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
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
    // A draft job made by `client`, with job approval switched on and a web address for links.
    private async Task<Guid> DraftJobNeedingApprovalAsync(
        HttpClient client,
        string title,
        CancellationToken ct
    )
    {
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var organization = await db.Organizations.SingleAsync(ct);
            organization.RequireRequisitionApproval = true;
            organization.PublicUrl = "https://ats.example.test";
            await db.SaveChangesAsync(ct);
        }
        var created = await client.PostAsJsonAsync(
            "/api/requisitions",
            new
            {
                title,
                department = "Operations",
                location = "Remote",
                employmentType = "Full time",
                workMode = "Remote",
                openings = 1,
                ownerEmail = "manager@example.test",
                recruiterEmail = "recruiter@example.test",
                description = "Runs the day to day.",
                targetStartDate = (string?)null,
            },
            ct
        );
        created.StatusCode.ShouldBe(
            HttpStatusCode.Created,
            await created.Content.ReadAsStringAsync(ct)
        );
        return (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
    }

    private async Task<Approval[]> ApprovalRowsAsync(Guid subjectId, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        return await db
            .Approvals.AsNoTracking()
            .Where(x => x.SubjectId == subjectId)
            .OrderBy(x => x.Round)
            .ThenBy(x => x.Sequence)
            .ToArrayAsync(ct);
    }

    // The one-click links in the newest approval email to this person.
    private async Task<(string Approve, string Reject)> ApprovalLinksAsync(
        string approver,
        CancellationToken ct
    )
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var body = await db
            .EmailOutbox.AsNoTracking()
            .Where(x => x.Recipient == approver && x.TemplateKey == "approval-request")
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => x.Body)
            .FirstAsync(ct);
        var tokens = Regex
            .Matches(body, @"/approve/([A-Za-z0-9_-]+)")
            .Select(m => m.Groups[1].Value)
            .ToArray();
        tokens.Length.ShouldBe(2, body);
        return (tokens[0], tokens[1]);
    }

    [Fact]
    public async Task Resubmitting_after_a_rejection_keeps_the_earlier_round()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var manager = await LoginAsync("manager@example.test", ct);
        var id = await DraftJobNeedingApprovalAsync(admin, "Rounds lead", ct);

        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "manager@example.test" }, note = "Backfill for Sam" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var waiting = (
            await manager.GetFromJsonAsync<JsonElement>("/api/approvals?scope=waiting", ct)
        )
            .EnumerateArray()
            .Single(x => x.GetProperty("subjectId").GetGuid() == id);
        waiting.GetProperty("note").GetString().ShouldBe("Backfill for Sam");
        waiting.GetProperty("subject").GetProperty("department").GetString().ShouldBe("Operations");
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{waiting.GetProperty("id").GetGuid()}/decide",
                new { decision = "Rejected", comment = "Not this quarter" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "manager@example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var view = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/requisitions/{id}/approval",
            ct
        );
        view.GetProperty("approvals").GetArrayLength().ShouldBe(1);
        view.GetProperty("approvals")[0].GetProperty("decision").GetString().ShouldBe("Pending");
        var earlier = view.GetProperty("previousRounds").EnumerateArray().Single();
        earlier.GetProperty("outcome").GetString().ShouldBe("Rejected");
        earlier
            .GetProperty("approvals")[0]
            .GetProperty("comment")
            .GetString()
            .ShouldBe("Not this quarter");

        // Nothing was deleted: two rounds of one row each.
        (await ApprovalRowsAsync(id, ct))
            .Select(x => x.Round)
            .Distinct()
            .Count()
            .ShouldBe(2);
        var requested = (
            await admin.GetFromJsonAsync<JsonElement>("/api/approvals?scope=requested", ct)
        )
            .EnumerateArray()
            .Single(x => x.GetProperty("subjectId").GetGuid() == id);
        requested.GetProperty("status").GetString().ShouldBe("Pending");
        requested.GetProperty("previousRounds").GetArrayLength().ShouldBe(1);
        (await manager.GetFromJsonAsync<JsonElement>("/api/approvals?scope=done", ct))
            .EnumerateArray()
            .ShouldContain(x =>
                x.GetProperty("subjectId").GetGuid() == id
                && x.GetProperty("decision").GetString() == "Rejected"
            );

        // Withdrawing returns the job to draft and stops the round, still without deleting it.
        (
            await admin.PostAsJsonAsync(
                "/api/approvals/withdraw",
                new { subjectType = "Requisition", subjectId = id },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct))
            .GetProperty("status")
            .GetString()
            .ShouldBe("Draft");
        (await ApprovalRowsAsync(id, ct)).Last().Decision.ShouldBe(ApprovalDecision.Cancelled);
    }

    [Fact]
    public async Task Email_links_decide_once_and_refuse_tampering()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var anonymous = _factory!.CreateClient();
        var id = await DraftJobNeedingApprovalAsync(admin, "Link lead", ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "manager@example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var (approve, reject) = await ApprovalLinksAsync("manager@example.test", ct);

        // Opening a link only shows the request.
        var shown = await anonymous.GetFromJsonAsync<JsonElement>(
            $"/public/approvals/{approve}",
            ct
        );
        shown.GetProperty("state").GetString().ShouldBe("ready");
        shown.GetProperty("decision").GetString().ShouldBe("Approved");
        shown.GetProperty("item").GetProperty("title").GetString().ShouldBe("Open Link lead");
        (await ApprovalRowsAsync(id, ct)).Single().Decision.ShouldBe(ApprovalDecision.Pending);

        // A changed token is refused; a reject link needs a reason.
        (
            await anonymous.GetFromJsonAsync<JsonElement>(
                $"/public/approvals/{approve[..^4]}AAAA",
                ct
            )
        )
            .GetProperty("state")
            .GetString()
            .ShouldBe("expired");
        (
            await anonymous.PostAsJsonAsync($"/public/approvals/{reject}", new { comment = "" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        (
            await anonymous.PostAsJsonAsync(
                $"/public/approvals/{approve}",
                new { comment = "Go" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct))
            .GetProperty("status")
            .GetString()
            .ShouldBe("Open");
        // Single use: the same link, or the other one, changes nothing now.
        (
            await anonymous.PostAsJsonAsync(
                $"/public/approvals/{approve}",
                new { comment = "Again" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await anonymous.PostAsJsonAsync(
                $"/public/approvals/{reject}",
                new { comment = "Changed my mind" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await anonymous.GetFromJsonAsync<JsonElement>($"/public/approvals/{approve}", ct))
            .GetProperty("state")
            .GetString()
            .ShouldBe("done");
        var row = (await ApprovalRowsAsync(id, ct)).Single();
        row.Decision.ShouldBe(ApprovalDecision.Approved);
        row.Comment.ShouldBe("Go");
    }

    [Fact]
    public async Task A_requester_cannot_weaken_the_chain_or_swap_a_required_approver()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var manager = await LoginAsync("manager@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/approval-policies/Requisition",
                new
                {
                    required = true,
                    mode = "Sequential",
                    approvers = new[] { "manager@example.test", "admin@example.test" },
                    reminderDays = 2,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var id = await DraftJobNeedingApprovalAsync(recruiter, "Chain lead", ct);

        // Asking for less than the organization's rule is refused for everyone but an admin.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { mode = "AnyOne" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { sequential = false },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "dana.recruiter@example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var rows = await ApprovalRowsAsync(id, ct);
        rows.Select(x => x.ApproverEmail)
            .ShouldBe([
                "dana.recruiter@example.test",
                "manager@example.test",
                "admin@example.test",
            ]);
        rows.Select(x => x.FromPolicy).ShouldBe([false, true, true]);
        rows.Select(x => x.Sequence).ShouldBe([0, 1, 2]);

        // The requester can't hand a required step to someone friendlier; an added one they can.
        var required = rows.Single(x => x.ApproverEmail == "manager@example.test").Id;
        (
            await recruiter.PostAsJsonAsync(
                $"/api/approvals/{required}/reassign",
                new { approverEmail = "priya.manager@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        var added = rows.Single(x => x.ApproverEmail == "dana.recruiter@example.test").Id;
        (
            await recruiter.PostAsJsonAsync(
                $"/api/approvals/{added}/reassign",
                new { approverEmail = "priya.manager@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        // The approver themselves, or an admin, can.
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{required}/reassign",
                new { approverEmail = "dana.recruiter@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var byApprover = (await ApprovalRowsAsync(id, ct)).Single(x => x.Id == required);
        byApprover.ReassignedBy.ShouldBe("manager@example.test");
        (
            await admin.PostAsJsonAsync(
                $"/api/approvals/{required}/reassign",
                new { approverEmail = "manager@example.test" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var handed = (await ApprovalRowsAsync(id, ct)).Single(x => x.Id == required);
        handed.ApproverEmail.ShouldBe("manager@example.test");
        handed.ReassignedFromEmail.ShouldBe("dana.recruiter@example.test");
        handed.ReassignedBy.ShouldBe("admin@example.test");
        handed.FromPolicy.ShouldBeTrue();
    }

    [Fact]
    public async Task With_any_one_only_a_required_approver_settles_the_round()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/approval-policies/Requisition",
                new
                {
                    required = true,
                    mode = "AnyOne",
                    approvers = new[] { "hiring-manager" },
                    reminderDays = 0,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var policies = await admin.GetFromJsonAsync<JsonElement>("/api/approval-policies", ct);
        policies
            .EnumerateArray()
            .Single(x => x.GetProperty("subjectType").GetString() == "Requisition")
            .GetProperty("approvers")[0]
            .GetString()
            .ShouldBe("hiring-manager");

        var id = await DraftJobNeedingApprovalAsync(recruiter, "Any one lead", ct);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "dana.recruiter@example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var rows = await ApprovalRowsAsync(id, ct);
        // "hiring-manager" became this job's hiring manager.
        rows.Single(x => x.FromPolicy).ApproverEmail.ShouldBe("manager@example.test");

        using var dana = await LoginAsync("dana.recruiter@example.test", ct);
        var added = rows.Single(x => !x.FromPolicy).Id;
        (
            await dana.PostAsJsonAsync(
                $"/api/approvals/{added}/decide",
                new { decision = "Approved" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct))
            .GetProperty("status")
            .GetString()
            .ShouldBe("PendingApproval");

        using var manager = await LoginAsync("manager@example.test", ct);
        (
            await manager.PostAsJsonAsync(
                $"/api/approvals/{rows.Single(x => x.FromPolicy).Id}/decide",
                new { decision = "Approved" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{id}", ct))
            .GetProperty("status")
            .GetString()
            .ShouldBe("Open");
    }

    [Fact]
    public async Task Approval_reminders_go_out_after_the_set_days_up_to_the_limit()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                "/api/approval-policies/Requisition",
                new
                {
                    required = true,
                    mode = "Parallel",
                    approvers = Array.Empty<string>(),
                    reminderDays = 1,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var id = await DraftJobNeedingApprovalAsync(admin, "Reminder lead", ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{id}/submit-for-approval",
                new { approvers = new[] { "priya.manager@example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var organization = await db.Organizations.AsNoTracking().SingleAsync(ct);
        int Sent() =>
            db.EmailOutbox.Count(x =>
                x.Recipient == "priya.manager@example.test" && x.TemplateKey == "approval-request"
            );
        var before = Sent();
        await AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct);
        Sent().ShouldBe(before); // Not a day yet.

        await db
            .Approvals.Where(x => x.SubjectId == id)
            .ExecuteUpdateAsync(
                s => s.SetProperty(x => x.CreatedAt, DateTimeOffset.UtcNow.AddDays(-2)),
                ct
            );
        db.ChangeTracker.Clear();
        await AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct);
        Sent().ShouldBe(before + 1);
        // Reminded just now, so the next sweep waits another day.
        await AtsEndpoints.SendApprovalRemindersAsync(db, organization, ct);
        Sent().ShouldBe(before + 1);
    }
}
