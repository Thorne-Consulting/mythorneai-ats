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

// Offer letters, the candidate's answer in the portal, decline reasons, closing out on reject and send later.
public sealed partial class ApiFlowTests
{
    private async Task WithDbAsync(Func<AtsDbContext, Task> work)
    {
        using var scope = _factory!.Services.CreateScope();
        await work(scope.ServiceProvider.GetRequiredService<AtsDbContext>());
    }

    // A new portal candidate with an approved offer ready to send. Approval itself is tested elsewhere.
    private async Task<(Guid ApplicationId, Guid OfferId, string Token)> ApprovedOfferAsync(
        HttpClient admin,
        CancellationToken ct,
        object? terms = null
    )
    {
        var (applicationId, token, _) = await PortalCandidateAsync(admin, ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/applications/{applicationId}/offer",
                terms
                    ?? new
                    {
                        baseSalary = 120000m,
                        startDate = "2027-03-01",
                        expiresOn = DateOnly
                            .FromDateTime(DateTime.UtcNow.AddDays(10))
                            .ToString("yyyy-MM-dd"),
                    },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var offerId = (
            await admin.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        )
            .GetProperty("offer")
            .GetProperty("id")
            .GetGuid();
        await WithDbAsync(async db =>
        {
            var offer = await db.Offers.SingleAsync(x => x.Id == offerId, ct);
            offer.Status = OfferStatus.Approved;
            await db.SaveChangesAsync(ct);
        });
        return (applicationId, offerId, token);
    }

    private async Task<(Guid ApplicationId, Guid OfferId, string Token)> SentOfferAsync(
        HttpClient admin,
        CancellationToken ct
    )
    {
        var sent = await ApprovedOfferAsync(admin, ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/offers/{sent.OfferId}/send",
                new { notifyCandidate = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        return sent;
    }

    [Fact]
    public async Task Sending_freezes_the_letter_filled_from_the_terms()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, offerId, _) = await ApprovedOfferAsync(admin, ct);

        // A new offer starts from the standard letter, chips and all.
        var view = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/offer",
            ct
        );
        view.GetProperty("offer")
            .GetProperty("letterMarkdown")
            .GetString()!
            .ShouldContain("{{terms}}");
        var templateId = view.GetProperty("offer").GetProperty("letterTemplateId").GetGuid();

        // Only known details; the preview fills them from this offer.
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new { markdown = "Dear {{firstName}}, {{nope}}" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new { markdown = "Dear {{firstName}}, your bonus is {{bonus}}." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var preview = await (
            await admin.PostAsJsonAsync($"/api/offers/{offerId}/letter/preview", new { }, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        preview.GetProperty("markdown").GetString()!.ShouldStartWith("Dear Mia,");
        preview
            .GetProperty("missing")
            .EnumerateArray()
            .Single()
            .GetProperty("label")
            .GetString()
            .ShouldBe("Bonus");

        // A letter that needs a detail the offer lacks cannot go out.
        (
            await admin.PostAsJsonAsync(
                $"/api/offers/{offerId}/send",
                new { notifyCandidate = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new
                {
                    markdown = "Dear {{firstName}},\n\nYour salary is {{currency}} {{salary}} per {{payPeriod}}, starting {{startDate}}.",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (
            await admin.PostAsJsonAsync(
                $"/api/offers/{offerId}/send",
                new { notifyCandidate = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);

        var sent = (
            await admin.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        ).GetProperty("offer");
        sent.GetProperty("status").GetString().ShouldBe("Sent");
        sent.GetProperty("letterSent")
            .GetString()
            .ShouldBe("Dear Mia,\n\nYour salary is USD 120,000 per year, starting March 1, 2027.");
        sent.GetProperty("expiresAt")
            .GetDateTimeOffset()
            .ShouldBeGreaterThan(DateTimeOffset.UtcNow.AddDays(9));

        // Frozen: the letter can no longer change, and editing the template does not reach it.
        (
            await admin.PutAsJsonAsync(
                $"/api/offers/{offerId}/letter",
                new { markdown = "Changed" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (
            await admin.PutAsJsonAsync(
                $"/api/offer-letters/{templateId}",
                new
                {
                    name = OfferLetters.StandardName,
                    body = "Hello {{firstName}}, new wording.",
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}/offer", ct))
            .GetProperty("offer")
            .GetProperty("letterSent")
            .GetString()!
            .ShouldStartWith("Dear Mia,\n\nYour salary");
        await WithDbAsync(async db =>
            (
                await db.EmailOutbox.CountAsync(
                    x => x.ApplicationId == applicationId && x.TemplateKey == "acceptance",
                    ct
                )
            ).ShouldBe(1)
        );

        // The last letter stays, so new offers always have one to start from.
        var letters = (
            await admin.GetFromJsonAsync<JsonElement>("/api/offer-letters", ct)
        ).GetProperty("letters");
        if (letters.GetArrayLength() == 1)
            (await admin.DeleteAsync($"/api/offer-letters/{templateId}", ct)).StatusCode.ShouldBe(
                HttpStatusCode.Conflict
            );
    }

    [Fact]
    public async Task Candidates_accept_in_the_portal_by_typing_their_full_name()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, offerId, token) = await SentOfferAsync(admin, ct);
        var path = $"/public/portal/applications/{applicationId}/offer";

        var page = await (
            await AsCandidateAsync(HttpMethod.Get, path, token, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        page.GetProperty("status").GetString().ShouldBe("Sent");
        page.GetProperty("letter").GetString()!.ShouldContain("Mia");
        page.GetProperty("terms")
            .EnumerateArray()
            .ShouldContain(x => x.GetProperty("label").GetString() == "Base salary");
        page.GetProperty("candidateName").GetString().ShouldBe("Mia Message");
        // No session, no offer; an application with no sent offer answers with nothing.
        var (otherApplication, _, otherToken) = await ApprovedOfferAsync(admin, ct);
        (
            await AsCandidateAsync(
                HttpMethod.Get,
                $"/public/portal/applications/{otherApplication}/offer",
                otherToken,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await AsCandidateAsync(HttpMethod.Get, path, otherToken, ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await AsCandidateAsync(HttpMethod.Get, path, null, ct)).StatusCode.ShouldBe(
            HttpStatusCode.Unauthorized
        );

        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{path}/accept",
                token,
                ct,
                new { fullName = "Mia" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{path}/accept",
                token,
                ct,
                new { fullName = "  mia   MESSAGE " }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{path}/accept",
                token,
                ct,
                new { fullName = "Mia Message" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);

        await WithDbAsync(async db =>
        {
            var offer = await db
                .Offers.Include(x => x.Application)
                .SingleAsync(x => x.Id == offerId, ct);
            offer.Status.ShouldBe(OfferStatus.Accepted);
            offer.RespondedName.ShouldBe("mia MESSAGE");
            offer.Application!.Status.ShouldBe(ApplicationStatus.Hired);
            (
                await db.AuditEvents.AnyAsync(
                    x => x.EntityId == applicationId.ToString() && x.Action == "OfferAccepted",
                    ct
                )
            ).ShouldBeTrue();
            (
                await db.Notifications.AnyAsync(
                    x =>
                        x.Href.Contains(applicationId.ToString())
                        && x.Kind == NotificationKinds.OfferResponse,
                    ct
                )
            ).ShouldBeTrue();
        });
        page = await (
            await AsCandidateAsync(HttpMethod.Get, path, token, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        page.GetProperty("status").GetString().ShouldBe("Accepted");
    }

    [Fact]
    public async Task Candidates_decline_with_a_reason_and_closed_offers_cannot_be_answered()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);

        var (applicationId, offerId, token) = await SentOfferAsync(admin, ct);
        var path = $"/public/portal/applications/{applicationId}/offer";
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{path}/decline",
                token,
                ct,
                new { reason = "Because" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{path}/decline",
                token,
                ct,
                new { reason = "AnotherOffer", note = "Closer to home" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var declined = (
            await admin.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId}/offer",
                ct
            )
        ).GetProperty("offer");
        declined.GetProperty("status").GetString().ShouldBe("Declined");
        declined.GetProperty("declineReason").GetString().ShouldBe("AnotherOffer");
        declined.GetProperty("declineReasonLabel").GetString().ShouldBe("Accepted another offer");
        declined.GetProperty("declineNote").GetString().ShouldBe("Closer to home");
        await WithDbAsync(async db =>
            (await db.Applications.SingleAsync(x => x.Id == applicationId, ct)).Status.ShouldBe(
                ApplicationStatus.Active
            )
        );

        // Past its last day: the portal says closed and refuses an answer, then the sweep marks it and tells the team.
        var (lateApplication, lateOffer, lateToken) = await SentOfferAsync(admin, ct);
        await WithDbAsync(async db =>
        {
            var offer = await db.Offers.SingleAsync(x => x.Id == lateOffer, ct);
            offer.ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync(ct);
        });
        var latePath = $"/public/portal/applications/{lateApplication}/offer";
        (
            await (
                await AsCandidateAsync(HttpMethod.Get, latePath, lateToken, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("status")
            .GetString()
            .ShouldBe("Expired");
        (
            await AsCandidateAsync(
                HttpMethod.Post,
                $"{latePath}/accept",
                lateToken,
                ct,
                new { fullName = "Mia Message" }
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
        await WithDbAsync(async db =>
        {
            (
                await AtsEndpoints.ExpireOffersAsync(db, DateTimeOffset.UtcNow, ct)
            ).ShouldBeGreaterThanOrEqualTo(1);
            (await db.Offers.SingleAsync(x => x.Id == lateOffer, ct)).Status.ShouldBe(
                OfferStatus.Expired
            );
            (
                await db.Notifications.AnyAsync(
                    x =>
                        x.Href.Contains(lateApplication.ToString())
                        && x.Kind == NotificationKinds.OfferResponse,
                    ct
                )
            ).ShouldBeTrue();
            (await db.Applications.SingleAsync(x => x.Id == lateApplication, ct)).Status.ShouldBe(
                ApplicationStatus.Active
            );
        });
        // The team can still record a late answer, or start a revision.
        (
            await admin.PostAsJsonAsync($"/api/applications/{lateApplication}/offer", new { }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        // The deadline is the end of the last day in the organization's zone.
        OfferLetters
            .ClosesAt(new DateOnly(2026, 12, 1), TimeText.Zone("America/New_York"))
            .ShouldSatisfyAllConditions(
                closes => closes.ShouldBe(new DateTimeOffset(2026, 12, 2, 5, 0, 0, TimeSpan.Zero)),
                // Postgres keeps only UTC instants.
                closes => closes.Offset.ShouldBe(TimeSpan.Zero)
            );
    }

    [Fact]
    public async Task Free_text_decline_reasons_move_to_Other_with_the_text_as_the_note()
    {
        var ct = TestContext.Current.CancellationToken;
        OfferDeclines.Normalize("Compensation", " too low ").ShouldBe(("Compensation", "too low"));
        OfferDeclines
            .Normalize("Took a job at Globex", null)
            .ShouldBe(("Other", "Took a job at Globex"));
        OfferDeclines.Normalize(null, null).ShouldBe(("Other", null));

        await WithDbAsync(async db =>
        {
            var applicationId = await db
                .Applications.OrderBy(x => x.AppliedAt)
                .Select(x => x.Id)
                .FirstAsync(ct);
            var old = new Offer
            {
                ApplicationId = applicationId,
                CreatedBy = "test@example.test",
                Status = OfferStatus.Declined,
                DeclineReason = "Took a job at Globex",
            };
            var keyed = new Offer
            {
                ApplicationId = applicationId,
                CreatedBy = "test@example.test",
                Status = OfferStatus.Declined,
                DeclineReason = "Compensation",
                DeclineNote = "Asked for more",
            };
            db.Offers.AddRange(old, keyed);
            await db.SaveChangesAsync(ct);

            (await OfferDeclines.BackfillAsync(db, ct)).ShouldBeGreaterThanOrEqualTo(1);
            (await OfferDeclines.BackfillAsync(db, ct)).ShouldBe(0);
            var rows = await db
                .Offers.AsNoTracking()
                .Where(x => x.Id == old.Id || x.Id == keyed.Id)
                .ToListAsync(ct);
            rows.Single(x => x.Id == old.Id).DeclineReason.ShouldBe("Other");
            rows.Single(x => x.Id == old.Id).DeclineNote.ShouldBe("Took a job at Globex");
            rows.Single(x => x.Id == keyed.Id).DeclineReason.ShouldBe("Compensation");
            rows.Single(x => x.Id == keyed.Id).DeclineNote.ShouldBe("Asked for more");
            db.Offers.RemoveRange(old, keyed);
            await db.SaveChangesAsync(ct);
        });

        // The team's free-text reason still works through the same rule.
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId2, offerId, _) = await SentOfferAsync(admin, ct);
        (
            await admin.PostAsJsonAsync(
                $"/api/offers/{offerId}/response",
                new { accepted = false, declineReason = "They stayed put" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var offer = (
            await admin.GetFromJsonAsync<JsonElement>(
                $"/api/applications/{applicationId2}/offer",
                ct
            )
        ).GetProperty("offer");
        offer.GetProperty("declineReason").GetString().ShouldBe("Other");
        offer.GetProperty("declineNote").GetString().ShouldBe("They stayed put");
    }

    [Fact]
    public async Task Rejecting_cancels_upcoming_interviews_withdraws_the_offer_and_can_email_later()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, offerId, _) = await ApprovedOfferAsync(admin, ct);
        Guid upcomingId = default,
            pastId = default;
        await WithDbAsync(async db =>
        {
            var upcoming = new Interview
            {
                ApplicationId = applicationId,
                Title = "Panel interview",
                TimeZone = "UTC",
                StartsAt = DateTimeOffset.UtcNow.AddDays(2),
                EndsAt = DateTimeOffset.UtcNow.AddDays(2).AddHours(1),
                InterviewerEmails = ["interviewer@example.test"],
            };
            var past = new Interview
            {
                ApplicationId = applicationId,
                Title = "Phone screen",
                TimeZone = "UTC",
                StartsAt = DateTimeOffset.UtcNow.AddDays(-2),
                EndsAt = DateTimeOffset.UtcNow.AddDays(-2).AddHours(1),
                InterviewerEmails = ["interviewer@example.test"],
                Status = InterviewStatus.Completed,
            };
            db.Interviews.AddRange(upcoming, past);
            await db.SaveChangesAsync(ct);
            (upcomingId, pastId) = (upcoming.Id, past.Id);
        });
        var detail = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var stageId = detail.GetProperty("application").GetProperty("stageId").GetGuid();
        var sendAt = DateTimeOffset.UtcNow.AddDays(1);

        var response = await admin.PatchAsJsonAsync(
            $"/api/applications/{applicationId}/stage",
            new
            {
                stageId,
                status = "Rejected",
                dispositionReason = "Skills mismatch",
                sendAt,
                cancelInterviews = true,
                withdrawOffer = true,
            },
            ct
        );
        response.StatusCode.ShouldBe(HttpStatusCode.OK);
        var emailId = (await response.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("emailIds")[0]
            .GetGuid();

        await WithDbAsync(async db =>
        {
            (await db.Interviews.SingleAsync(x => x.Id == upcomingId, ct)).Status.ShouldBe(
                InterviewStatus.Cancelled
            );
            (await db.Interviews.SingleAsync(x => x.Id == pastId, ct)).Status.ShouldBe(
                InterviewStatus.Completed
            );
            (await db.Offers.SingleAsync(x => x.Id == offerId, ct)).Status.ShouldBe(
                OfferStatus.Withdrawn
            );
            var rejection = await db.EmailOutbox.SingleAsync(x => x.Id == emailId, ct);
            rejection.TemplateKey.ShouldBe("rejection");
            rejection.NextAttemptAt.ShouldBe(sendAt, TimeSpan.FromSeconds(1));
            // The interviewer hears about the cancellation; the candidate gets the one rejection email.
            (
                await db.EmailOutbox.AnyAsync(
                    x =>
                        x.ApplicationId == applicationId
                        && x.Recipient == "interviewer@example.test",
                    ct
                )
            ).ShouldBeTrue();
        });

        // A scheduled email can be taken back once.
        (
            await admin.PostAsync(
                $"/api/applications/{applicationId}/emails/{emailId}/cancel",
                null,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await admin.PostAsync(
                $"/api/applications/{applicationId}/emails/{emailId}/cancel",
                null,
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Moving_into_an_ask_stage_can_send_its_email_later()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, _, _) = await PortalCandidateAsync(admin, ct);
        var detail = await admin.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}",
            ct
        );
        var current = detail.GetProperty("application").GetProperty("stageId").GetGuid();
        var stages = detail
            .GetProperty("application")
            .GetProperty("stages")
            .EnumerateArray()
            .Where(x =>
                x.GetProperty("type").GetString() is "Screen" or "Interview"
                && x.GetProperty("id").GetGuid() != current
            )
            .Select(x => x.GetProperty("id").GetGuid())
            .Take(2)
            .ToArray();
        await WithDbAsync(async db =>
        {
            await db
                .PipelineStages.Where(x => stages.Contains(x.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.EmailOnEntry, StageEmail.Ask), ct);
        });

        // An "Ask" stage sends nothing unless asked.
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new { stageId = stages[0], status = "Active" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var sendAt = DateTimeOffset.UtcNow.AddDays(2);
        var moved = await admin.PatchAsJsonAsync(
            $"/api/applications/{applicationId}/stage",
            new
            {
                stageId = stages[1],
                status = "Active",
                sendEmail = true,
                sendAt,
            },
            ct
        );
        moved.StatusCode.ShouldBe(HttpStatusCode.OK);
        var emailId = (await moved.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("emailIds")[0]
            .GetGuid();
        await WithDbAsync(async db =>
        {
            (
                await db.EmailOutbox.CountAsync(
                    x => x.ApplicationId == applicationId && x.TemplateKey == "stage-update",
                    ct
                )
            ).ShouldBe(1);
            (await db.EmailOutbox.SingleAsync(x => x.Id == emailId, ct)).NextAttemptAt.ShouldBe(
                sendAt,
                TimeSpan.FromSeconds(1)
            );
        });
        // Too far ahead is refused.
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new
                {
                    stageId = stages[0],
                    status = "Active",
                    sendEmail = true,
                    sendAt = DateTimeOffset.UtcNow.AddDays(90),
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Rejection_reasons_are_managed_in_settings_and_a_rename_carries_over()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var reasons = await recruiter.GetFromJsonAsync<JsonElement>("/api/rejection-reasons", ct);
        reasons
            .EnumerateArray()
            .ShouldContain(x =>
                x.GetProperty("label").GetString() == "Withdrew"
                && x.GetProperty("kind").GetString() == "Withdrawn"
            );
        (
            await recruiter.PostAsJsonAsync(
                "/api/rejection-reasons",
                new { label = "Too slow", kind = "Rejected" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        var created = await admin.PostAsJsonAsync(
            "/api/rejection-reasons",
            new { label = "Failed the take-home", kind = "Rejected" },
            ct
        );
        created.StatusCode.ShouldBe(HttpStatusCode.Created);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();
        (
            await admin.PostAsJsonAsync(
                "/api/rejection-reasons",
                new { label = "failed the TAKE-HOME", kind = "Rejected" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);

        // An application closed with it follows the rename.
        var (applicationId, _, _) = await PortalCandidateAsync(admin, ct);
        var stageId = (
            await admin.GetFromJsonAsync<JsonElement>($"/api/applications/{applicationId}", ct)
        )
            .GetProperty("application")
            .GetProperty("stageId")
            .GetGuid();
        (
            await admin.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/stage",
                new
                {
                    stageId,
                    status = "Rejected",
                    dispositionReason = "Failed the take-home",
                    sendEmail = false,
                },
                ct
            )
        ).IsSuccessStatusCode.ShouldBeTrue();
        (
            await admin.PutAsJsonAsync(
                $"/api/rejection-reasons/{id}",
                new { label = "Take-home below the bar" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        await WithDbAsync(async db =>
        {
            var application = await db.Applications.SingleAsync(x => x.Id == applicationId, ct);
            application.DispositionReason.ShouldBe("Take-home below the bar");
            // No email when told not to send one.
            (
                await db.EmailOutbox.AnyAsync(
                    x => x.ApplicationId == applicationId && x.TemplateKey == "rejection",
                    ct
                )
            ).ShouldBeFalse();
        });

        // Archived reasons leave the dialog but stay in Settings; each group keeps at least one.
        (
            await admin.PostAsync($"/api/rejection-reasons/{id}/archive", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await admin.GetFromJsonAsync<JsonElement>("/api/rejection-reasons", ct))
            .EnumerateArray()
            .ShouldNotContain(x => x.GetProperty("id").GetGuid() == id);
        var all = await admin.GetFromJsonAsync<JsonElement>("/api/rejection-reasons?all=true", ct);
        all.EnumerateArray()
            .Single(x => x.GetProperty("id").GetGuid() == id)
            .GetProperty("archived")
            .GetBoolean()
            .ShouldBeTrue();
        var ids = all.EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .Reverse()
            .ToArray();
        (
            await admin.PutAsJsonAsync("/api/rejection-reasons/order", new { ids }, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (
            await admin.PutAsJsonAsync(
                "/api/rejection-reasons/order",
                new { ids = ids.Skip(1) },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }
}
