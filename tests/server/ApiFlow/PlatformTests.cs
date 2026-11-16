using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Members, invitations, access requests, activity history and webhooks (the platform area).
public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Members_cannot_lock_the_workspace_out_and_bulk_changes_are_all_or_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var users = await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct);
        Guid Id(string email) =>
            users!
                .Single(x => x.GetProperty("email").GetString() == email)
                .GetProperty("id")
                .GetGuid();
        var owner = Id("admin@example.test");
        users!
            .Single(x => x.GetProperty("id").GetGuid() == owner)
            .GetProperty("isOwner")
            .GetBoolean()
            .ShouldBeTrue();

        // Your own role and access are not yours to change.
        var self = await admin.PatchAsJsonAsync(
            "/api/admin/users",
            new { ids = new[] { owner }, role = "Recruiter" },
            ct
        );
        self.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await self.Content.ReadAsStringAsync(ct)).ShouldContain("your own role");

        // A second admin still can't remove the owner.
        (
            await admin.PostAsJsonAsync(
                "/api/admin/users",
                new
                {
                    email = "second.admin@example.test",
                    displayName = "Second Admin",
                    role = "Admin",
                    department = (string?)null,
                    isActive = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        using var second = await LoginAsync("second.admin@example.test", ct);
        var removeOwner = await second.PatchAsJsonAsync(
            "/api/admin/users",
            new { ids = new[] { owner }, isActive = false },
            ct
        );
        removeOwner.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await removeOwner.Content.ReadAsStringAsync(ct)).ShouldContain("owner");

        // A refused bulk change changes nobody: the recruiter keeps their role.
        var mixed = await second.PatchAsJsonAsync(
            "/api/admin/users",
            new { ids = new[] { Id("recruiter@example.test"), owner }, role = "Interviewer" },
            ct
        );
        mixed.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct))!
            .Single(x => x.GetProperty("email").GetString() == "recruiter@example.test")
            .GetProperty("role")
            .GetString()
            .ShouldBe("Recruiter");

        var bulk = await second.PatchAsJsonAsync(
            "/api/admin/users",
            new
            {
                ids = new[] { Id("recruiter@example.test"), Id("interviewer@example.test") },
                role = "HiringManager",
            },
            ct
        );
        bulk.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var after = await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct);
        after!
            .Where(x =>
                x.GetProperty("email").GetString()
                    is "recruiter@example.test"
                        or "interviewer@example.test"
            )
            .ShouldAllBe(x => x.GetProperty("role").GetString() == "HiringManager");
        // Signing in is recorded on the member.
        after!
            .Single(x => x.GetProperty("id").GetGuid() == owner)
            .GetProperty("lastSignInAt")
            .ValueKind.ShouldBe(JsonValueKind.String);

        // Only the owner hands over ownership, and only to an active admin.
        var secondId = after!
            .Single(x => x.GetProperty("email").GetString() == "second.admin@example.test")
            .GetProperty("id")
            .GetGuid();
        (
            await second.PostAsJsonAsync(
                "/api/organization/transfer-ownership",
                new { userId = secondId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);
        (
            await admin.PostAsJsonAsync(
                "/api/organization/transfer-ownership",
                new { userId = Id("dana.recruiter@example.test") },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await admin.PostAsJsonAsync(
                "/api/organization/transfer-ownership",
                new { userId = secondId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct))!
            .Single(x => x.GetProperty("id").GetGuid() == secondId)
            .GetProperty("isOwner")
            .GetBoolean()
            .ShouldBeTrue();

        // The activity history names the change and keeps the before and after.
        var history = await admin.GetFromJsonAsync<JsonElement>(
            "/api/admin/audit?action=RoleChanged&limit=5",
            ct
        );
        var row = history.GetProperty("items").EnumerateArray().First();
        row.GetProperty("actorName").GetString().ShouldBe("Second Admin");
        var changes = JsonDocument
            .Parse(row.GetProperty("changes").GetString()!)
            .RootElement.GetProperty("Role");
        changes.GetProperty("to").GetString().ShouldBe("Hiring manager");
    }

    [Fact]
    public async Task Invitations_and_access_requests_become_members()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);

        var invite = await admin.PostAsJsonAsync(
            "/api/admin/invitations",
            new
            {
                emails = new[]
                {
                    "New.Person@example.test",
                    "recruiter@example.test",
                    "not-an-email",
                },
                role = "Interviewer",
                note = "Welcome",
            },
            ct
        );
        invite.StatusCode.ShouldBe(HttpStatusCode.OK);
        var result = await invite.Content.ReadFromJsonAsync<JsonElement>(ct);
        result.GetProperty("created").GetArrayLength().ShouldBe(1);
        result.GetProperty("skipped").GetArrayLength().ShouldBe(2);
        var invitedId = result.GetProperty("created")[0].GetProperty("id").GetGuid();
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (
                await db.EmailOutbox.CountAsync(x => x.Recipient == "new.person@example.test", ct)
            ).ShouldBe(1);
        }
        (
            await admin.PostAsync($"/api/admin/invitations/{invitedId}/resend", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.DeleteAsync($"/api/admin/invitations/{invitedId}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        // Someone who has signed in is not an invitation: they are deactivated instead.
        var users = await admin.GetFromJsonAsync<JsonElement[]>("/api/admin/users", ct);
        users!.ShouldNotContain(x =>
            x.GetProperty("email").GetString() == "new.person@example.test"
        );
        var owner = users!
            .Single(x => x.GetProperty("email").GetString() == "admin@example.test")
            .GetProperty("id")
            .GetGuid();
        (await admin.DeleteAsync($"/api/admin/invitations/{owner}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );

        // Only company domains can ask; anyone else is told to use their work email.
        (
            await admin.PutAsJsonAsync(
                "/api/organization",
                new { allowedEmailDomains = new[] { "example.test" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            (
                await AuthExtensions.FindOrProvisionAtsUserAsync(
                    db,
                    configuration,
                    "someone@elsewhere.com",
                    null
                )
            ).Error.ShouldBe("domain");
            var first = await AuthExtensions.FindOrProvisionAtsUserAsync(
                db,
                configuration,
                "Stranger@example.test",
                "Sam Stranger"
            );
            first.Error.ShouldBe("pending");
            var again = await AuthExtensions.FindOrProvisionAtsUserAsync(
                db,
                configuration,
                "stranger@example.test",
                "Sam Stranger"
            );
            again.RequestId.ShouldBe(first.RequestId);
            (
                await AuthExtensions.FindOrProvisionAtsUserAsync(
                    db,
                    configuration,
                    "former.recruiter@example.test",
                    null
                )
            ).Error.ShouldBe("deactivated");
            await AuthExtensions.FindOrProvisionAtsUserAsync(
                db,
                configuration,
                "declined@example.test",
                "Dee Clined"
            );
        }

        var requests = await admin.GetFromJsonAsync<JsonElement[]>(
            "/api/admin/access-requests",
            ct
        );
        requests!.Length.ShouldBe(2);
        Guid RequestId(string email) =>
            requests
                .Single(x => x.GetProperty("email").GetString() == email)
                .GetProperty("id")
                .GetGuid();
        (
            await admin.PostAsJsonAsync(
                $"/api/admin/access-requests/{RequestId("stranger@example.test")}/approve",
                new { role = "Interviewer" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await admin.PostAsync(
                $"/api/admin/access-requests/{RequestId("declined@example.test")}/decline",
                null,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var configuration = scope.ServiceProvider.GetRequiredService<IConfiguration>();
            (
                await AuthExtensions.FindOrProvisionAtsUserAsync(
                    db,
                    configuration,
                    "stranger@example.test",
                    null
                )
            ).User.ShouldNotBeNull();
            // A declined person waits a week before asking again.
            (
                await AuthExtensions.FindOrProvisionAtsUserAsync(
                    db,
                    configuration,
                    "declined@example.test",
                    null
                )
            ).Error.ShouldBe("declined");
            (
                await db.AuditEvents.CountAsync(
                    x => x.Action == "AccessApproved" || x.Action == "AccessDeclined",
                    ct
                )
            ).ShouldBe(2);
        }

        // The organization (Slack channel, approvers, domains) is for admins only.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.GetAsync("/api/organization", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task Activity_history_pages_filters_and_exports()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        // A partial update changes one field, and the history shows its before and after.
        (
            await admin.PutAsJsonAsync("/api/organization", new { name = "Renamed Co" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var org = await admin.GetFromJsonAsync<JsonElement>("/api/organization", ct);
        org.GetProperty("name").GetString().ShouldBe("Renamed Co");
        org.GetProperty("authMode").GetString().ShouldBe("Development");

        var updated = await admin.GetFromJsonAsync<JsonElement>(
            "/api/admin/audit?type=Organization&limit=1",
            ct
        );
        var row = updated.GetProperty("items")[0];
        row.GetProperty("label").GetString().ShouldBe("workspace settings");
        row.GetProperty("changes").GetString()!.ShouldContain("Renamed Co");

        var first = await admin.GetFromJsonAsync<JsonElement>("/api/admin/audit?limit=2", ct);
        var cursor = first.GetProperty("nextCursor").GetString();
        cursor.ShouldNotBeNull();
        var next = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/admin/audit?limit=2&cursor={Uri.EscapeDataString(cursor)}",
            ct
        );
        var seen = first
            .GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetInt64())
            .ToHashSet();
        next.GetProperty("items")
            .EnumerateArray()
            .ShouldAllBe(x => !seen.Contains(x.GetProperty("id").GetInt64()));

        var export = await admin.GetAsync("/api/admin/audit/export?actor=admin@example.test", ct);
        export.StatusCode.ShouldBe(HttpStatusCode.OK);
        export.Content.Headers.ContentType!.MediaType.ShouldBe("text/csv");
        var csv = await export.Content.ReadAsStringAsync(ct);
        csv.ShouldContain("When (UTC),Person,Email,Action");
        csv.ShouldContain("Signed in");
    }

    [Fact]
    public async Task Webhooks_mask_secrets_rotate_and_sign_the_standard_way()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var created = await admin.PostAsJsonAsync(
            "/api/admin/webhooks",
            new
            {
                url = "http://localhost:9/hook",
                events = new[] { "candidate.created", "made.up" },
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var body = await created.Content.ReadFromJsonAsync<JsonElement>(ct);
        var id = body.GetProperty("id").GetGuid();
        var secret = body.GetProperty("secret").GetString()!;
        secret.ShouldStartWith("whsec_");

        var list = await admin.GetFromJsonAsync<JsonElement>("/api/admin/webhooks", ct);
        var listed = list.GetProperty("endpoints")[0];
        listed.GetProperty("secret").GetString().ShouldNotBe(secret);
        listed
            .GetProperty("events")
            .EnumerateArray()
            .Select(x => x.GetString())
            .ShouldBe(["candidate.created"]);
        list.GetProperty("events").GetArrayLength().ShouldBeGreaterThan(10);
        (
            await (
                await admin.PostAsync($"/api/admin/webhooks/{id}/secret", null, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("secret")
            .GetString()
            .ShouldBe(secret);

        // Adding a candidate queues the event, without the candidate endpoint knowing about webhooks.
        (
            await admin.PostAsJsonAsync(
                "/api/candidates",
                new
                {
                    firstName = "Hook",
                    lastName = "Test",
                    email = "hook.test@example.com",
                    phone = (string?)null,
                    location = (string?)null,
                    currentTitle = (string?)null,
                    linkedInUrl = (string?)null,
                    source = "Test",
                    tags = Array.Empty<string>(),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        var rotated = await (
            await admin.PostAsync($"/api/admin/webhooks/{id}/rotate", null, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var newSecret = rotated.GetProperty("secret").GetString()!;
        newSecret.ShouldNotBe(secret);

        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var delivery = await db
            .WebhookDeliveries.Include(x => x.Endpoint)
            .SingleAsync(x => x.EndpointId == id && x.EventType == "candidate.created", ct);
        JsonDocument
            .Parse(delivery.Payload)
            .RootElement.GetProperty("data")
            .GetProperty("candidate")
            .GetProperty("email")
            .GetString()
            .ShouldBe("hook.test@example.com");

        // During a rotation both secrets sign, as space-separated v1 signatures.
        var now = DateTimeOffset.UtcNow;
        var headers = WebhookWorker.Headers(delivery, now).ToDictionary(x => x.Key, x => x.Value);
        var signedContent =
            $"{headers["webhook-id"]}.{headers["webhook-timestamp"]}.{delivery.Payload}";
        string Expected(string key) =>
            "v1,"
            + Convert.ToBase64String(
                HMACSHA256.HashData(
                    Convert.FromBase64String(key["whsec_".Length..]),
                    Encoding.UTF8.GetBytes(signedContent)
                )
            );
        headers["webhook-signature"].Split(' ').ShouldBe([Expected(newSecret), Expected(secret)]);
        headers["webhook-timestamp"].ShouldBe(now.ToUnixTimeSeconds().ToString());

        // Three days of nothing but failures pauses the endpoint and tells the admins.
        var endpoint = delivery.Endpoint!;
        await WebhookWorker.PauseIfFailingTooLongAsync(db, endpoint, now, ct);
        endpoint.IsActive.ShouldBeTrue();
        await WebhookWorker.PauseIfFailingTooLongAsync(
            db,
            endpoint,
            now.AddDays(3).AddMinutes(1),
            ct
        );
        endpoint.IsActive.ShouldBeFalse();
        endpoint.DisabledReason.ShouldNotBeNull();
        db.ChangeTracker.Entries<Notification>()
            .ShouldContain(x =>
                x.Entity.Title == "A webhook was paused"
                && x.Entity.UserEmail == "admin@example.test"
            );
    }

    [Fact]
    public void Sign_in_method_switches_are_enforced()
    {
        var organization = new Organization
        {
            Name = "x",
            OwnerEmail = "x@example.test",
            AllowGoogleLogin = false,
        };
        AuthExtensions.MethodAllowed(organization, "GoogleOAuth").ShouldBeFalse();
        AuthExtensions.MethodAllowed(organization, "MicrosoftOAuth").ShouldBeTrue();
        // An emailed code and single sign-on always work, so nobody is locked out.
        AuthExtensions.MethodAllowed(organization, "MagicAuth").ShouldBeTrue();
        AuthExtensions.MethodAllowed(organization, "SSO").ShouldBeTrue();
        AuthExtensions.MethodAllowed(null, "GoogleOAuth").ShouldBeTrue();
    }
}
