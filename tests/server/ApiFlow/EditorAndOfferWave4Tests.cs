using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Pictures in rich text, the offer reminder, notes on "Other", send later and template history scope.
public sealed partial class ApiFlowTests
{
    private static readonly byte[] PngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private static MultipartFormDataContent ImageUpload(byte[] bytes, string name, string type)
    {
        var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(type);
        content.Add(file, "file", name);
        return content;
    }

    [Fact]
    public async Task Pictures_upload_by_their_bytes_and_are_served_publicly_for_good()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var png = PngHeader.Concat(new byte[64]).ToArray();

        var uploaded = await admin.PostAsync(
            "/api/media/images",
            ImageUpload(png, "team.png", "image/png"),
            ct
        );
        uploaded.StatusCode.ShouldBe(HttpStatusCode.OK);
        var url = (await uploaded.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("url")
            .GetString()!;
        url.ShouldMatch(@"^/public/media/[0-9a-f]{32}\.png$");

        // Anyone can read it (careers site, portal, mail apps), and it never changes.
        using var anonymous = _factory!.CreateClient();
        var served = await anonymous.GetAsync(url, ct);
        served.StatusCode.ShouldBe(HttpStatusCode.OK);
        served.Content.Headers.ContentType!.MediaType.ShouldBe("image/png");
        served.Headers.CacheControl!.MaxAge.ShouldBe(TimeSpan.FromDays(365));
        served.Headers.CacheControl.Public.ShouldBeTrue();
        (await served.Content.ReadAsByteArrayAsync(ct)).ShouldBe(png);

        // The bytes decide, not the name: a GIF named .png is stored as a GIF, a PDF is refused.
        var gif = await admin.PostAsync(
            "/api/media/images",
            ImageUpload("GIF89a......"u8.ToArray(), "photo.png", "image/png"),
            ct
        );
        (await gif.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("url")
            .GetString()
            .ShouldEndWith(".gif");
        (
            await admin.PostAsync(
                "/api/media/images",
                ImageUpload("%PDF-1.7 not a picture"u8.ToArray(), "cv.png", "image/png"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsync(
                "/api/media/images",
                ImageUpload("<svg onload=alert(1)>"u8.ToArray(), "x.svg", "image/svg+xml"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        // Over 5 MB.
        (
            await admin.PostAsync(
                "/api/media/images",
                ImageUpload(
                    PngHeader.Concat(new byte[MediaEndpoints.MaxImageBytes]).ToArray(),
                    "big.png",
                    "image/png"
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // Only media names are served: no other uploaded file, no made-up path.
        (
            await anonymous.GetAsync("/public/media/" + new string('a', 32) + ".png", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (await anonymous.GetAsync("/public/media/resume.pdf", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );

        // Signed out, nobody can upload.
        (
            await anonymous.PostAsync(
                "/api/media/images",
                ImageUpload(png, "team.png", "image/png"),
                ct
            )
        ).StatusCode.ShouldBeOneOf(HttpStatusCode.Unauthorized, HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Templates_and_offer_letters_refuse_a_picture_without_a_description()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var body = "Hi {{firstName}},\n\n![](/public/media/0123456789abcdef0123456789abcdef.png)";
        var template = await admin.PutAsJsonAsync(
            "/api/templates/rejection",
            new { subject = "Your application", body },
            ct
        );
        template.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await template.Content.ReadAsStringAsync(ct)).ShouldContain("Describe every picture");
        (
            await admin.PutAsJsonAsync(
                "/api/templates/rejection",
                new { subject = "Your application", body = body.Replace("![]", "![Our office]") },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await admin.PostAsJsonAsync(
                "/api/offer-letters",
                new { name = "With a picture", body },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Offer_letters_keep_their_versions_and_can_restore_one()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var created = await admin.PostAsJsonAsync(
            "/api/offer-letters",
            new { name = "Contract offer", body = "First wording for {{firstName}}." },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (
            await admin.PutAsJsonAsync(
                $"/api/offer-letters/{id}",
                new { name = "Contract offer", body = "Second wording for {{firstName}}." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        var versions = await admin.GetFromJsonAsync<JsonElement[]>(
            $"/api/offer-letters/{id}/versions",
            ct
        );
        versions!.Select(x => x.GetProperty("version").GetInt32()).ShouldBe([2, 1]);
        versions[1].GetProperty("body").GetString().ShouldBe("First wording for {{firstName}}.");

        (
            await admin.PostAsJsonAsync($"/api/offer-letters/{id}/restore", new { version = 1 }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var letters = await admin.GetFromJsonAsync<JsonElement>("/api/offer-letters", ct);
        var letter = letters
            .GetProperty("letters")
            .EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id);
        letter.GetProperty("body").GetString().ShouldBe("First wording for {{firstName}}.");
        letter.GetProperty("version").GetInt32().ShouldBe(3);
        (await admin.GetFromJsonAsync<JsonElement[]>($"/api/offer-letters/{id}/versions", ct))!
            [0]
            .GetProperty("action")
            .GetString()
            .ShouldBe("Restored");
    }

    [Fact]
    public async Task A_job_s_template_history_is_only_for_people_who_manage_the_job()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var job = await CreateJobAsync(
            admin,
            "Finance",
            "priya.manager@example.test",
            ct,
            recruiter: "recruiter@example.test"
        );
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
        (
            await admin.PutAsJsonAsync(
                "/api/templates/rejection",
                new
                {
                    subject = "About the finance role",
                    body = "Hi {{firstName}}, a private word.",
                    requisitionId = job,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await admin.GetAsync($"/api/templates/rejection/versions?requisitionId={job}", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        // Dana recruits, but not for this confidential job.
        using var dana = await LoginAsync("dana.recruiter@example.test", ct);
        (
            await dana.GetAsync($"/api/templates/rejection/versions?requisitionId={job}", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
        (
            await dana.PostAsJsonAsync(
                "/api/templates/rejection/restore",
                new { version = 1, requisitionId = job },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Candidates_are_reminded_two_days_before_an_offer_closes_once()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, offerId, _) = await SentOfferAsync(admin, ct);
        var (_, freshOfferId, _) = await SentOfferAsync(admin, ct);
        var now = DateTimeOffset.UtcNow;
        await WithDbAsync(async db =>
        {
            // Sent a week ago, closing in 36 hours: due. Sent today with a day left: never reminded.
            var due = await db.Offers.SingleAsync(x => x.Id == offerId, ct);
            due.SentAt = now.AddDays(-7);
            due.ExpiresAt = now.AddHours(36);
            var fresh = await db.Offers.SingleAsync(x => x.Id == freshOfferId, ct);
            fresh.SentAt = now.AddHours(-1);
            fresh.ExpiresAt = now.AddHours(24);
            await db.SaveChangesAsync(ct);
        });

        await WithDbAsync(async db =>
        {
            (await AtsEndpoints.RemindOffersAsync(db, now, ct)).ShouldBe(1);
            // Once per offer.
            (await AtsEndpoints.RemindOffersAsync(db, now.AddHours(1), ct)).ShouldBe(0);
        });

        await WithDbAsync(async db =>
        {
            var application = await db
                .Applications.Include(x => x.Candidate)
                .SingleAsync(x => x.Id == applicationId, ct);
            var email = await db.EmailOutbox.SingleAsync(
                x => x.ApplicationId == applicationId && x.TemplateKey == "offer-reminder",
                ct
            );
            email.Recipient.ShouldBe(application.Candidate!.Email);
            email.Subject.ShouldContain("closes soon");
            email.Body.ShouldContain("is open until");
            (
                await db.Offers.SingleAsync(x => x.Id == offerId, ct)
            ).ReminderSentAt.ShouldNotBeNull();
            (
                await db.Offers.SingleAsync(x => x.Id == freshOfferId, ct)
            ).ReminderSentAt.ShouldBeNull();
            (
                await db.Notifications.AnyAsync(
                    x =>
                        x.Href.Contains(applicationId.ToString())
                        && x.Kind == NotificationKinds.OfferResponse
                        && x.Title.Contains("closes in 2 days"),
                    ct
                )
            ).ShouldBeTrue();
        });
    }

    [Fact]
    public async Task A_reason_that_asks_for_a_note_cannot_close_an_application_without_one()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var reasons = await admin.GetFromJsonAsync<JsonElement[]>("/api/rejection-reasons", ct);
        reasons!
            .Single(x => x.GetProperty("label").GetString() == "Other")
            .GetProperty("needsNote")
            .GetBoolean()
            .ShouldBeTrue();

        var (applicationId, offerId, _) = await ApprovedOfferAsync(admin, ct);
        var detail = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var stageId = detail.GetProperty("application").GetProperty("stageId").GetGuid();
        var refused = await admin.PatchAsJsonAsync(
            $"/api/applications/{applicationId}/stage",
            new
            {
                stageId,
                status = "Rejected",
                dispositionReason = "Other",
                sendEmail = false,
            },
            ct
        );
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await refused.Content.ReadAsStringAsync(ct)).ShouldContain("dispositionNote");
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new
                {
                    stageId,
                    status = "Rejected",
                    dispositionReason = "Other",
                    dispositionNote = "Moving abroad before the start date.",
                    sendEmail = false,
                },
                ct
            )
        ).IsSuccessStatusCode.ShouldBeTrue();
        (await admin.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct))
            .GetProperty("application")
            .GetProperty("dispositionNote")
            .GetString()
            .ShouldBe("Moving abroad before the start date.");
        // Reopening clears both.
        (
            await admin.PostAsync($"/api/applications/{applicationId}/reopen", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await WithDbAsync(async db =>
            (
                await db.Applications.SingleAsync(x => x.Id == applicationId, ct)
            ).DispositionNote.ShouldBeNull()
        );

        // An admin can make any reason ask for a note, or stop asking.
        var skills = reasons!.Single(x => x.GetProperty("label").GetString() == "Skills mismatch");
        (
            await admin.PutAsJsonAsync(
                $"/api/rejection-reasons/{skills.GetProperty("id").GetGuid()}",
                new { label = "Skills mismatch", needsNote = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new
                {
                    stageId,
                    status = "Rejected",
                    dispositionReason = "Skills mismatch",
                    sendEmail = false,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // The Decision panel's "Why" is the note, and its reject closes out what is open.
        Guid interviewId = default;
        await WithDbAsync(async db =>
        {
            var interview = new Interview
            {
                ApplicationId = applicationId,
                Title = "Panel interview",
                TimeZone = "UTC",
                StartsAt = DateTimeOffset.UtcNow.AddDays(2),
                EndsAt = DateTimeOffset.UtcNow.AddDays(2).AddHours(1),
                InterviewerEmails = ["interviewer@example.test"],
            };
            db.Interviews.Add(interview);
            await db.SaveChangesAsync(ct);
            interviewId = interview.Id;
        });
        (
            await admin.PostAsJsonAsync(
                $"/api/applications/{applicationId}/decision",
                new
                {
                    decision = "Reject",
                    rationale = "Wants a fully remote role.",
                    reason = "Other",
                    cancelInterviews = true,
                    withdrawOffer = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await WithDbAsync(async db =>
        {
            var application = await db.Applications.SingleAsync(x => x.Id == applicationId, ct);
            application.Status.ShouldBe(ApplicationStatus.Rejected);
            application.DispositionNote.ShouldBe("Wants a fully remote role.");
            (await db.Interviews.SingleAsync(x => x.Id == interviewId, ct)).Status.ShouldBe(
                InterviewStatus.Cancelled
            );
            (await db.Offers.SingleAsync(x => x.Id == offerId, ct)).Status.ShouldBe(
                OfferStatus.Withdrawn
            );
        });
    }

    [Fact]
    public async Task Automatic_emails_can_be_queued_for_later_and_return_their_id()
    {
        var ct = TestContext.Current.CancellationToken;
        var later = DateTimeOffset.UtcNow.AddDays(2);
        await WithDbAsync(async db =>
        {
            var id = await EmailTemplates.QueueAsync(
                db,
                "rejection",
                null,
                "later@example.test",
                new Dictionary<string, string> { ["firstName"] = "Lee", ["jobTitle"] = "Chef" },
                null,
                ct,
                sendAt: later
            );
            id.ShouldNotBeNull();
            await db.SaveChangesAsync(ct);
            var queued = await db.EmailOutbox.SingleAsync(x => x.Id == id, ct);
            queued.NextAttemptAt.ShouldBe(later, TimeSpan.FromSeconds(1));
            queued.Body.ShouldContain("Hi Lee");

            var now = await EmailTemplates.QueueAsync(
                db,
                "rejection",
                null,
                "now@example.test",
                new Dictionary<string, string> { ["firstName"] = "Ana", ["jobTitle"] = "Chef" },
                null,
                ct
            );
            await db.SaveChangesAsync(ct);
            (await db.EmailOutbox.SingleAsync(x => x.Id == now, ct)).NextAttemptAt.ShouldBeLessThan(
                DateTimeOffset.UtcNow.AddMinutes(1)
            );
        });
    }
}
