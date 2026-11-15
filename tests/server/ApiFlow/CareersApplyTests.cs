using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private async Task<Guid[]> PublicJobIdsAsync(HttpClient client, CancellationToken ct) =>
        (await client.GetFromJsonAsync<JsonElement>("/public/jobs?limit=50", ct))
            .GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();

    private async Task<Guid> ApplyAsync(
        HttpClient client,
        Guid jobId,
        object body,
        CancellationToken ct
    )
    {
        var response = await client.PostAsJsonAsync($"/public/jobs/{jobId}/applications", body, ct);
        response.StatusCode.ShouldBe(
            HttpStatusCode.Accepted,
            await response.Content.ReadAsStringAsync(ct)
        );
        return (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("applicationId")
            .GetGuid();
    }

    private async Task<EmailOutboxItem> LastEmailAsync(Guid applicationId, CancellationToken ct)
    {
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        return await db
            .EmailOutbox.AsNoTracking()
            .Where(x => x.ApplicationId == applicationId)
            .OrderByDescending(x => x.CreatedAt)
            .FirstAsync(ct);
    }

    private static string CodeIn(string body) => Regex.Match(body, @"\b\d{6}\b").Value;

    [Fact]
    public async Task Applying_reaches_the_team_at_once_but_changes_to_a_known_candidate_wait_for_confirmation()
    {
        var ct = TestContext.Current.CancellationToken;
        using var anonymous = _factory!.CreateClient();
        var jobs = await PublicJobIdsAsync(anonymous, ct);
        var email = $"apply.{Guid.NewGuid():N}"[..20] + "@example.test";

        // A new person: the record is created from the form, and the team sees the application now.
        var first = await ApplyAsync(
            anonymous,
            jobs[0],
            new
            {
                firstName = "Ann",
                lastName = "Original",
                email,
                phone = "+1 312 555 0100",
                timeZone = "America/Chicago",
                source = "linkedin",
            },
            ct
        );
        var received = await LastEmailAsync(first, ct);
        received.TemplateKey.ShouldBe(ApplicationIntake.ReceivedKey);
        var firstCode = CodeIn(received.Body);
        firstCode.Length.ShouldBe(6);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (
                await db.Applications.AsNoTracking().SingleAsync(x => x.Id == first, ct)
            ).Status.ShouldBe(ApplicationStatus.Active);
            (await db.StageTransitions.AnyAsync(x => x.ApplicationId == first, ct)).ShouldBeTrue();
        }

        // The same address applies for another job with other details: the record does not change yet.
        var second = await ApplyAsync(
            anonymous,
            jobs[1],
            new
            {
                firstName = "Mallory",
                lastName = "Changed",
                email,
                phone = "+44 20 7946 0958",
                timeZone = "Europe/London",
            },
            ct
        );
        var secondCode = CodeIn((await LastEmailAsync(second, ct)).Body);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var candidate = await db
                .Candidates.AsNoTracking()
                .SingleAsync(x => x.Email == email, ct);
            candidate.FirstName.ShouldBe("Ann");
            candidate.Phone.ShouldBe("+1 312 555 0100");
            candidate.TimeZone.ShouldBe("America/Chicago");
            (
                await db.Applications.AsNoTracking().SingleAsync(x => x.Id == first, ct)
            ).Source.ShouldBe("LinkedIn");
            (
                await db.Applications.AsNoTracking().SingleAsync(x => x.Id == second, ct)
            ).Status.ShouldBe(ApplicationStatus.Active);
            (
                await db
                    .ApplicationSubmissions.AsNoTracking()
                    .SingleAsync(x => x.ApplicationId == second, ct)
            ).HeldProfileJson.ShouldNotBeNull();
        }

        // Codes are per application: the first one still works after the second application.
        (
            await anonymous.PostAsJsonAsync(
                "/public/applications/verify",
                new
                {
                    email,
                    code = secondCode,
                    applicationId = first,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await anonymous.PostAsJsonAsync(
                "/public/applications/verify",
                new
                {
                    email,
                    code = firstCode,
                    applicationId = first,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var confirmed = await anonymous.PostAsJsonAsync(
            "/public/applications/verify",
            new { email, code = secondCode },
            ct
        );
        confirmed.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await confirmed.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("applicationId")
            .GetGuid()
            .ShouldBe(second);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var candidate = await db
                .Candidates.AsNoTracking()
                .SingleAsync(x => x.Email == email, ct);
            candidate.FirstName.ShouldBe("Mallory");
            candidate.Phone.ShouldBe("+44 20 7946 0958");
            candidate.TimeZone.ShouldBe("Europe/London");
            (
                await db
                    .ApplicationSubmissions.AsNoTracking()
                    .SingleAsync(x => x.ApplicationId == second, ct)
            ).ConfirmedAt.ShouldNotBeNull();
        }

        // Applying again for the same job sends a way back in and changes nothing.
        var again = await ApplyAsync(
            anonymous,
            jobs[0],
            new
            {
                firstName = "Someone",
                lastName = "Else",
                email,
            },
            ct
        );
        again.ShouldBe(first);
        (await LastEmailAsync(first, ct)).TemplateKey.ShouldBe(ApplicationIntake.AlreadyAppliedKey);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (
                await db.Candidates.AsNoTracking().SingleAsync(x => x.Email == email, ct)
            ).FirstName.ShouldBe("Mallory");
            (await db.Applications.CountAsync(x => x.Candidate!.Email == email, ct)).ShouldBe(2);
        }
    }

    [Fact]
    public async Task The_email_link_confirms_once_and_then_offers_a_code()
    {
        var ct = TestContext.Current.CancellationToken;
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.Organizations.SingleAsync(ct)).PublicUrl = "https://jobs.example.test";
            await db.SaveChangesAsync(ct);
        }
        using var anonymous = _factory.CreateClient();
        var job = (await PublicJobIdsAsync(anonymous, ct))[0];
        var email = $"link.{Guid.NewGuid():N}"[..20] + "@example.test";
        var applicationId = await ApplyAsync(
            anonymous,
            job,
            new
            {
                firstName = "Lin",
                lastName = "Link",
                email,
            },
            ct
        );
        var body = (await LastEmailAsync(applicationId, ct)).Body;
        var token = Regex
            .Match(body, @"https://jobs\.example\.test/candidate-portal/link#([0-9A-F]{64})")
            .Groups[1]
            .Value;
        token.Length.ShouldBe(64);

        var opened = await anonymous.PostAsJsonAsync(
            "/public/magic",
            new { token, timeZone = "Asia/Tokyo" },
            ct
        );
        opened.StatusCode.ShouldBe(HttpStatusCode.OK);
        var session = await opened.Content.ReadFromJsonAsync<JsonElement>(ct);
        session.GetProperty("applicationId").GetGuid().ShouldBe(applicationId);
        var portal = new HttpRequestMessage(HttpMethod.Get, "/public/portal");
        portal.Headers.Add("X-Candidate-Session", session.GetProperty("token").GetString());
        var payload = await (
            await anonymous.SendAsync(portal, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        var application = payload.GetProperty("applications")[0];
        application.GetProperty("emailConfirmed").GetBoolean().ShouldBeTrue();
        payload.GetProperty("candidate").GetProperty("timeZone").GetString().ShouldBe("Asia/Tokyo");

        var reused = await anonymous.PostAsJsonAsync("/public/magic", new { token }, ct);
        reused.StatusCode.ShouldBe(HttpStatusCode.Gone);
        (await reused.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("email")
            .GetString()
            .ShouldBe(email);
        (
            await anonymous.PostAsJsonAsync("/public/magic", new { token = "nope" }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Unconfirmed_applications_get_one_reminder_and_close_after_30_days()
    {
        var ct = TestContext.Current.CancellationToken;
        using var anonymous = _factory!.CreateClient();
        var job = (await PublicJobIdsAsync(anonymous, ct))[0];
        var email = $"late.{Guid.NewGuid():N}"[..20] + "@example.test";
        var applicationId = await ApplyAsync(
            anonymous,
            job,
            new
            {
                firstName = "Lee",
                lastName = "Late",
                email,
            },
            ct
        );

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var files = scope.ServiceProvider.GetRequiredService<LocalFileStore>();
        var environment = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
        int Reminders() =>
            db.EmailOutbox.Count(x =>
                x.ApplicationId == applicationId && x.TemplateKey == ApplicationIntake.ReminderKey
            );

        await ApplicationIntake.FollowUpAsync(
            db,
            files,
            environment,
            DateTimeOffset.UtcNow.AddHours(2),
            true,
            ct
        );
        Reminders().ShouldBe(0);
        await ApplicationIntake.FollowUpAsync(
            db,
            files,
            environment,
            DateTimeOffset.UtcNow.AddHours(25),
            true,
            ct
        );
        Reminders().ShouldBe(1);
        await ApplicationIntake.FollowUpAsync(
            db,
            files,
            environment,
            DateTimeOffset.UtcNow.AddHours(49),
            true,
            ct
        );
        Reminders().ShouldBe(1);

        await ApplicationIntake.FollowUpAsync(
            db,
            files,
            environment,
            DateTimeOffset.UtcNow.AddDays(31),
            true,
            ct
        );
        db.ChangeTracker.Clear();
        var application = await db
            .Applications.AsNoTracking()
            .SingleAsync(x => x.Id == applicationId, ct);
        application.Status.ShouldBe(ApplicationStatus.Withdrawn);
        application.DispositionReason.ShouldBe(ApplicationIntake.ClosedReason);
    }

    [Fact]
    public async Task Confidential_jobs_are_not_on_the_careers_site()
    {
        var ct = TestContext.Current.CancellationToken;
        using var anonymous = _factory!.CreateClient();
        var job = (await PublicJobIdsAsync(anonymous, ct))[0];
        using var admin = await LoginAsync("admin@example.test", ct);
        (
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{job}/settings",
                new
                {
                    isConfidential = true,
                    viewerEmails = Array.Empty<string>(),
                    allowCandidateReschedule = true,
                    allowCandidateWithdraw = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        (await PublicJobIdsAsync(anonymous, ct)).ShouldNotContain(job);
        (await anonymous.GetAsync($"/public/jobs/{job}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );
        (
            await anonymous.PostAsJsonAsync(
                $"/public/jobs/{job}/applications",
                new
                {
                    firstName = "A",
                    lastName = "B",
                    email = "a.b@example.test",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        var facets = await anonymous.GetFromJsonAsync<JsonElement>("/public/jobs/facets", ct);
        facets
            .GetProperty("total")
            .GetInt32()
            .ShouldBe((await PublicJobIdsAsync(anonymous, ct)).Length);
    }

    [Fact]
    public void Resume_autofill_reads_contact_details_from_the_text()
    {
        var fields = ResumeAutofill.Read(
            "JORDAN LEE\nSenior engineer\nChicago, IL · jordan.lee@example.com · (312) 555-0142\nlinkedin.com/in/jordan-lee\n\nExperience\n2019 - 2023 Acme"
        );
        fields.FirstName.ShouldBe("Jordan");
        fields.LastName.ShouldBe("Lee");
        fields.Email.ShouldBe("jordan.lee@example.com");
        fields.Phone.ShouldBe("(312) 555-0142");
        fields.LinkedInUrl.ShouldBe("https://www.linkedin.com/in/jordan-lee");

        // A zip code next to the number is not part of it; a middle initial is not part of the name.
        var zip = ResumeAutofill.Read("Andrew H. Peters\nSeattle, WA 98195 206-555-0189\n");
        zip.Phone.ShouldBe("206-555-0189");
        zip.LastName.ShouldBe("Peters");
        ResumeAutofill.Read("Ana Lima\n+55 11 91234 5678").Phone.ShouldBe("+55 11 91234 5678");

        var bare = ResumeAutofill.Read("Experience\n2019 - 2023 Built things at Acme for 4 years");
        bare.FirstName.ShouldBeNull();
        bare.Phone.ShouldBeNull();
        bare.Email.ShouldBeNull();
    }
}
