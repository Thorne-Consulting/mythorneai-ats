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

// Cross-area cleanup: picture descriptions on every save, the bulk reject note, the picture sweep,
// the letter version an offer started from, and who may manage assessment invites.
public sealed partial class ApiFlowTests
{
    private const string PictureWithoutAlt =
        "Hello\n\n![](/public/media/0123456789abcdef0123456789abcdef.png)";

    [Fact]
    public async Task Postings_kits_the_careers_intro_and_assessments_refuse_a_picture_without_a_description()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        async Task Refused(HttpResponseMessage response, string text = "Describe every picture")
        {
            response.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
            (await response.Content.ReadAsStringAsync(ct)).ShouldContain(text);
        }

        // The job's posting.
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var job = await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}", ct);
        string Text(string name) => job.GetProperty(name).GetString() ?? "";
        await Refused(
            await admin.PutAsJsonAsync(
                $"/api/requisitions/{jobId}",
                new
                {
                    title = Text("title"),
                    department = Text("department"),
                    location = Text("location"),
                    employmentType = Text("employmentType"),
                    workMode = Text("workMode"),
                    openings = job.GetProperty("openings").GetInt32(),
                    ownerEmail = Text("ownerEmail"),
                    recruiterEmail = Text("recruiterEmail"),
                    description = PictureWithoutAlt,
                },
                ct
            )
        );

        // Posting templates, interview kits (and so kit templates), the careers intro.
        await Refused(
            await admin.PostAsJsonAsync(
                "/api/posting-templates",
                new
                {
                    name = "With a picture",
                    descriptionMarkdown = "What you will do.",
                    benefitsMarkdown = PictureWithoutAlt,
                },
                ct
            )
        );
        await Refused(
            await admin.PostAsJsonAsync(
                $"/api/requisitions/{jobId}/interview-kits",
                new
                {
                    name = "Kit with a picture",
                    instructions = PictureWithoutAlt,
                    durationMinutes = 45,
                    criteria = new[] { Competency(null, "Craft", "Show us your best work.") },
                },
                ct
            )
        );
        await Refused(
            await admin.PutAsJsonAsync(
                "/api/careers-site",
                new { introMarkdown = PictureWithoutAlt, requireResume = false },
                ct
            )
        );

        // An assessment saves as a draft but does not publish until the picture is described.
        var created = await admin.PostAsJsonAsync(
            "/api/assessments",
            new
            {
                name = "Picture quiz",
                kind = "Native",
                expiryDays = 7,
                remindAfterDays = 3,
                content = JsonSerializer.Deserialize<JsonElement>(
                    JsonSerializer
                        .Serialize(AssessmentContent(), JsonSerializerOptions.Web)
                        .Replace(
                            "Work on your own.",
                            "Work on your own. ![](/public/media/0123456789abcdef0123456789abcdef.png)"
                        )
                ),
            },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var assessmentId = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        await Refused(
            await admin.PostAsync($"/api/assessments/{assessmentId}/publish", null, ct),
            "Instructions: describe every picture."
        );
    }

    [Fact]
    public async Task Bulk_reject_needs_the_note_its_reason_asks_for()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var jobId = (await OpenJobWithCandidatesAsync(admin, ct)).GetProperty("id").GetGuid();
        var card = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/requisitions/{jobId}/board", ct)
        )
            .GetProperty("stages")
            .EnumerateArray()
            .SelectMany(x => x.GetProperty("applications").EnumerateArray())
            .First();
        var applicationId = card.GetProperty("id").GetGuid();
        object Reject(string? note) =>
            new
            {
                ids = new[] { card.GetProperty("candidateId").GetGuid() },
                action = "reject",
                requisitionId = jobId,
                reason = "Other",
                dispositionNote = note,
            };

        var refused = await admin.PostAsJsonAsync("/api/candidates/bulk", Reject("  "), ct);
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await refused.Content.ReadAsStringAsync(ct)).ShouldContain("dispositionNote");
        await WithDbAsync(async db =>
            (await db.Applications.SingleAsync(x => x.Id == applicationId, ct)).Status.ShouldBe(
                ApplicationStatus.Active
            )
        );

        (
            await admin.PostAsJsonAsync("/api/candidates/bulk", Reject("Hired internally."), ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        await WithDbAsync(async db =>
        {
            var application = await db.Applications.SingleAsync(x => x.Id == applicationId, ct);
            application.Status.ShouldBe(ApplicationStatus.Rejected);
            application.DispositionReason.ShouldBe("Other");
            application.DispositionNote.ShouldBe("Hired internally.");
        });
    }

    [Fact]
    public async Task Unused_pictures_a_week_old_are_swept_and_a_dry_run_deletes_nothing()
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var files = scope.ServiceProvider.GetRequiredService<LocalFileStore>();
        string Picture(int daysOld)
        {
            var id = Guid.NewGuid().ToString("N");
            var path = files.FullPath($"media-{id}.png");
            File.WriteAllBytes(path, PngHeader);
            File.SetLastWriteTimeUtc(path, DateTime.UtcNow.AddDays(-daysOld));
            return id;
        }
        var (inPosting, inEmail, unused, fresh) = (
            Picture(30),
            Picture(30),
            Picture(30),
            Picture(2)
        );
        // A candidate's file is never a picture to sweep, whatever its age.
        var resume = files.FullPath($"{Guid.NewGuid():N}.pdf");
        File.WriteAllBytes(resume, "%PDF-1.4"u8.ToArray());
        File.SetLastWriteTimeUtc(resume, DateTime.UtcNow.AddDays(-30));

        // In a posting, and in an email already sent: mail apps still show it.
        var job = await db.Requisitions.FirstAsync(ct);
        job.Description += $"\n\n![Our office](/public/media/{inPosting}.png?size=800x600)";
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                Recipient = "someone@example.test",
                Subject = "Welcome",
                Body = $"![The team](https://ats.example.test/public/media/{inEmail}.png)",
                Status = EmailOutboxStatus.Succeeded,
            }
        );
        await db.SaveChangesAsync(ct);

        var dry = await MediaEndpoints.SweepAsync(db, files, DateTimeOffset.UtcNow, true, ct);
        dry.ShouldBe([$"media-{unused}.png"]);
        File.Exists(files.FullPath($"media-{unused}.png")).ShouldBeTrue();

        (await MediaEndpoints.SweepAsync(db, files, DateTimeOffset.UtcNow, false, ct)).ShouldBe(
            dry
        );
        File.Exists(files.FullPath($"media-{unused}.png")).ShouldBeFalse();
        foreach (var kept in new[] { inPosting, inEmail, fresh })
            File.Exists(files.FullPath($"media-{kept}.png")).ShouldBeTrue();
        File.Exists(resume).ShouldBeTrue();
    }

    [Fact]
    public async Task An_offer_keeps_the_letter_version_it_started_from()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, offerId, _) = await ApprovedOfferAsync(admin, ct);
        async Task<JsonElement> Offer() =>
            (
                await admin.GetFromJsonAsync<JsonElement>(
                    $"/api/applications/{applicationId}/offer",
                    ct
                )
            ).GetProperty("offer");
        var offer = await Offer();
        var letterId = offer.GetProperty("letterTemplateId").GetGuid();
        var name = offer.GetProperty("letterTemplateName").GetString()!;
        name.ShouldNotBeNullOrWhiteSpace();
        var started = offer.GetProperty("letterTemplateVersion").GetInt32();

        // The letter changes in Settings: this offer still says which wording it started from.
        (
            await admin.PutAsJsonAsync(
                $"/api/offer-letters/{letterId}",
                new { name, body = "New wording for {{firstName}}." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Offer()).GetProperty("letterTemplateVersion").GetInt32().ShouldBe(started);
        // Edits for this offer keep it too.
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new { templateId = letterId, markdown = "Dear {{firstName}}, welcome." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Offer()).GetProperty("letterTemplateVersion").GetInt32().ShouldBe(started);

        // Picking the letter again starts from its wording today.
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new { templateId = letterId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await Offer()).GetProperty("letterTemplateVersion").GetInt32().ShouldBe(started + 1);
    }

    [Fact]
    public async Task A_job_viewer_reads_assessment_invites_without_managing_them()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var assessmentId = await PublishedAssessmentAsync(recruiter, ct);
        var (applicationId, _, _) = await PortalCandidateAsync(recruiter, ct);
        var inviteId = await SendAssessmentAsync(recruiter, applicationId, assessmentId, ct);
        (
            await recruiter.GetFromJsonAsync<JsonElement[]>(
                $"/api/assessments/{assessmentId}/invites",
                ct
            )
        )!
            .Single()
            .GetProperty("canManage")
            .GetBoolean()
            .ShouldBeTrue();

        // Priya is on the job's team as a viewer only.
        await WithDbAsync(async db =>
        {
            var job = await db
                .Applications.Where(x => x.Id == applicationId)
                .Select(x => x.Requisition!)
                .SingleAsync(ct);
            var priya = await db.Users.SingleAsync(
                x => x.Email == "priya.manager@example.test",
                ct
            );
            db.RequisitionMembers.RemoveRange(job.Members.Where(m => m.UserId == priya.Id));
            db.RequisitionMembers.Add(
                new RequisitionMember
                {
                    RequisitionId = job.Id,
                    UserId = priya.Id,
                    Role = RequisitionRole.Viewer,
                }
            );
            if (job.OwnerEmail == "priya.manager@example.test")
                job.OwnerEmail = "admin@example.test";
            if (job.RecruiterEmail == "priya.manager@example.test")
                job.RecruiterEmail = "recruiter@example.test";
            await db.SaveChangesAsync(ct);
        });
        using var viewer = await LoginAsync("priya.manager@example.test", ct);
        var rows = await viewer.GetFromJsonAsync<JsonElement[]>(
            $"/api/assessments/{assessmentId}/invites",
            ct
        );
        rows!.Single().GetProperty("canManage").GetBoolean().ShouldBeFalse();
        var card = await viewer.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/assessments",
            ct
        );
        card.GetProperty("canManage").GetBoolean().ShouldBeFalse();
        card.GetProperty("invites")[0].GetProperty("canManage").GetBoolean().ShouldBeFalse();
        // And the server refuses what the screen hides.
        (
            await viewer.PostAsync($"/api/assessment-invites/{inviteId}/remind", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);

        // Blind review: someone who does not manage the job never receives who the person is.
        await WithDbAsync(async db =>
        {
            var assessment = await db.Assessments.SingleAsync(x => x.Id == assessmentId, ct);
            assessment.BlindReview = true;
            await db.SaveChangesAsync(ct);
        });
        var blind = (
            await viewer.GetFromJsonAsync<JsonElement[]>(
                $"/api/assessments/{assessmentId}/invites",
                ct
            )
        )!.Single();
        blind.GetProperty("candidate").GetString()!.ShouldStartWith("Candidate ");
        blind.GetProperty("email").GetString().ShouldBe("");
        blind.GetProperty("applicationId").GetGuid().ShouldBe(Guid.Empty);
        blind.GetProperty("candidateId").GetGuid().ShouldBe(Guid.Empty);
        // The recruiter who manages the job already sees the person in the pipeline.
        var named = (
            await recruiter.GetFromJsonAsync<JsonElement[]>(
                $"/api/assessments/{assessmentId}/invites",
                ct
            )
        )!.Single();
        named.GetProperty("email").GetString().ShouldNotBeNullOrEmpty();
        named.GetProperty("applicationId").GetGuid().ShouldBe(applicationId);
    }
}
