using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    // Apply to an open job as a new candidate and confirm the email; returns the portal session.
    private async Task<(Guid ApplicationId, string Token, string Email)> PortalCandidateAsync(
        HttpClient staff,
        CancellationToken ct
    )
    {
        var jobs = await staff.GetFromJsonAsync<JsonElement>("/api/requisitions?status=Open", ct);
        var jobId = jobs[0].GetProperty("id").GetGuid();
        using var anonymous = _factory!.CreateClient();
        var email = $"msg.{Guid.NewGuid():N}"[..16] + "@example.test";
        (
            await anonymous.PostAsJsonAsync(
                $"/public/jobs/{jobId}/applications",
                new
                {
                    firstName = "Mia",
                    lastName = "Message",
                    email,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Accepted);
        string code;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            code = Regex
                .Match(
                    await db
                        .EmailOutbox.Where(x => x.Recipient == email)
                        .Select(x => x.Body)
                        .FirstAsync(ct),
                    @"\d{6}"
                )
                .Value;
        }
        var verified = await (
            await anonymous.PostAsJsonAsync("/public/applications/verify", new { email, code }, ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        return (
            verified.GetProperty("applicationId").GetGuid(),
            verified.GetProperty("token").GetString()!,
            email
        );
    }

    private async Task CandidateWritesAsync(
        Guid applicationId,
        string token,
        string body,
        CancellationToken ct
    )
    {
        using var anonymous = _factory!.CreateClient();
        var request = new HttpRequestMessage(
            HttpMethod.Post,
            $"/public/portal/applications/{applicationId}/messages"
        )
        {
            Content = JsonContent.Create(new { body }),
        };
        request.Headers.Add("X-Candidate-Session", token);
        (await anonymous.SendAsync(request, ct)).StatusCode.ShouldBe(HttpStatusCode.NoContent);
    }

    private static async Task<JsonElement?> InboxRowAsync(
        HttpClient client,
        string folder,
        Guid applicationId,
        CancellationToken ct,
        string? q = null
    )
    {
        var page = await client.GetFromJsonAsync<JsonElement>(
            $"/api/inbox?folder={folder}&limit=100{(q is null ? "" : $"&q={Uri.EscapeDataString(q)}")}",
            ct
        );
        foreach (var row in page.GetProperty("items").EnumerateArray())
            if (row.GetProperty("applicationId").GetGuid() == applicationId)
                return row;
        return null;
    }

    [Fact]
    public async Task Inbox_keeps_unread_and_stars_per_person_and_done_for_the_team()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        using var admin = await LoginAsync("admin@example.test", ct);
        var (applicationId, token, _) = await PortalCandidateAsync(recruiter, ct);
        await CandidateWritesAsync(applicationId, token, "Is the role still open?", ct);

        (await InboxRowAsync(recruiter, "inbox", applicationId, ct))!
            .Value.GetProperty("unread")
            .GetBoolean()
            .ShouldBeTrue();
        (await InboxRowAsync(admin, "unread", applicationId, ct)).ShouldNotBeNull();

        // The recruiter reads it; the admin still has it unread.
        (
            await recruiter.PostAsync($"/api/applications/{applicationId}/messages/read", null, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await InboxRowAsync(recruiter, "unread", applicationId, ct)).ShouldBeNull();
        (await InboxRowAsync(admin, "unread", applicationId, ct)).ShouldNotBeNull();

        // A star is personal.
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { starred = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await InboxRowAsync(recruiter, "starred", applicationId, ct)).ShouldNotBeNull();
        (await InboxRowAsync(admin, "starred", applicationId, ct)).ShouldBeNull();

        // Done is shared, and the candidate writing again reopens it.
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/applications/{applicationId}/thread",
                new { done = true },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        (await InboxRowAsync(admin, "inbox", applicationId, ct)).ShouldBeNull();
        (await InboxRowAsync(admin, "done", applicationId, ct)).ShouldNotBeNull();
        await CandidateWritesAsync(applicationId, token, "Following up.", ct);
        (await InboxRowAsync(recruiter, "inbox", applicationId, ct))!
            .Value.GetProperty("unread")
            .GetBoolean()
            .ShouldBeTrue();

        // Replying moves it to "Awaiting reply" and the thread shows the message with its email status.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Yes, it is." },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        (await InboxRowAsync(recruiter, "awaiting-reply", applicationId, ct)).ShouldNotBeNull();
        var thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages?limit=2",
            ct
        );
        thread.GetProperty("hasMore").GetBoolean().ShouldBeTrue();
        var last = thread.GetProperty("messages")[1];
        last.GetProperty("body").GetString().ShouldBe("Yes, it is.");
        last.GetProperty("delivery").GetString().ShouldBe("sending");
        thread.GetProperty("thread").GetProperty("starred").GetBoolean().ShouldBeTrue();

        // Interviewers have no inbox.
        using var interviewer = await LoginAsync("interviewer@example.test", ct);
        (await interviewer.GetAsync("/api/inbox", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
    }

    [Fact]
    public async Task Email_replies_land_in_the_thread_and_unknown_mail_waits_unmatched()
    {
        var ct = TestContext.Current.CancellationToken;
        var configuration = (IConfigurationRoot)
            _factory!.Services.GetRequiredService<IConfiguration>();
        configuration["Resend:InboundDomain"] = "reply.example.test";
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (applicationId, token, candidateEmail) = await PortalCandidateAsync(recruiter, ct);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "Could you send your portfolio?" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        string replyTo,
            subject;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var copy = await db.EmailOutbox.SingleAsync(
                x =>
                    x.ApplicationId == applicationId
                    && x.TemplateKey == EmailThreads.MessageTemplateKey,
                ct
            );
            replyTo = copy.ReplyTo!;
            subject = copy.Subject;
            copy.ThreadReference.ShouldNotBeNull();
        }
        replyTo.ShouldMatch(@"^reply\+[a-z0-9]{20}@reply\.example\.test$");
        subject.ShouldStartWith("Your ");

        using var anonymous = _factory.CreateClient();
        async Task<JsonElement> Inbound(object email) =>
            await (
                await anonymous.PostAsJsonAsync("/public/webhooks/resend/test-inbound", email, ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct);

        // The candidate replies from Gmail: the quoted history is cut off.
        var reply = await Inbound(
            new
            {
                from = $"Mia Message <{candidateEmail.ToUpperInvariant()}>",
                to = replyTo,
                subject = $"Re: {subject}",
                text = "Sure, here it is.\n\nOn Fri, Nov 13, 2026 at 9:00 AM Hiring <hiring@example.test> wrote:\n> Could you send your portfolio?",
            }
        );
        reply.GetProperty("outcome").GetString().ShouldBe("Posted");
        var thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        var received = thread.GetProperty("messages").EnumerateArray().Last();
        received.GetProperty("body").GetString().ShouldBe("Sure, here it is.");
        received.GetProperty("channel").GetString().ShouldBe("Email");
        received.GetProperty("fromCandidate").GetBoolean().ShouldBeTrue();
        received.GetProperty("fromAddress").ValueKind.ShouldBe(JsonValueKind.Null);
        received.GetProperty("originalBody").GetString()!.ShouldContain("wrote:");

        // The recruiter's alert has their own reply address; replying to it posts as them and emails the candidate.
        string staffReplyTo,
            staffEmail;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            var alert = await db
                .EmailOutbox.Where(x =>
                    x.ApplicationId == applicationId
                    && x.TemplateKey == EmailThreads.AlertTemplateKey
                )
                .OrderByDescending(x => x.CreatedAt)
                .FirstAsync(ct);
            (staffReplyTo, staffEmail) = (alert.ReplyTo!, alert.Recipient);
        }
        staffReplyTo.ShouldNotBe(replyTo);
        // Someone else using the team member's reply address is not trusted.
        (
            await Inbound(
                new
                {
                    from = "stranger@example.test",
                    to = staffReplyTo,
                    text = "Hello",
                }
            )
        )
            .GetProperty("outcome")
            .GetString()
            .ShouldBe("Unmatched");
        (
            await Inbound(
                new
                {
                    from = staffEmail,
                    to = staffReplyTo,
                    text = "Thanks, got it.",
                }
            )
        ).GetProperty("outcome").GetString().ShouldBe("Posted");
        thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        var staffReply = thread.GetProperty("messages").EnumerateArray().Last();
        staffReply.GetProperty("fromCandidate").GetBoolean().ShouldBeFalse();
        staffReply.GetProperty("authorEmail").GetString().ShouldBe(staffEmail);
        staffReply.GetProperty("delivery").GetString().ShouldBe("sending");

        // Another address on the candidate's thread posts, labelled; mail with no clue goes to Unmatched.
        (
            await Inbound(
                new
                {
                    from = "assistant@example.test",
                    to = replyTo,
                    text = "Mia asked me to add her references.",
                }
            )
        )
            .GetProperty("outcome")
            .GetString()
            .ShouldBe("Posted");
        thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        thread
            .GetProperty("messages")
            .EnumerateArray()
            .Last()
            .GetProperty("fromAddress")
            .GetString()
            .ShouldBe("assistant@example.test");
        (
            await Inbound(
                new
                {
                    from = "nobody@example.test",
                    to = "hello@reply.example.test",
                    text = "Who do I talk to?",
                }
            )
        ).GetProperty("outcome").GetString().ShouldBe("Unmatched");
        var unmatched = await recruiter.GetFromJsonAsync<JsonElement>("/api/inbox/unmatched", ct);
        var waiting = unmatched
            .EnumerateArray()
            .Single(x => x.GetProperty("fromAddress").GetString() == "nobody@example.test");

        // A recruiter files it under the right conversation.
        (
            await recruiter.PostAsJsonAsync(
                $"/api/inbox/unmatched/{waiting.GetProperty("id").GetGuid()}/attach",
                new { applicationId },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        thread
            .GetProperty("messages")
            .EnumerateArray()
            .Last()
            .GetProperty("body")
            .GetString()
            .ShouldBe("Who do I talk to?");
        configuration["Resend:InboundDomain"] = null;
    }

    [Fact]
    public async Task Message_files_upload_send_and_reach_the_candidate_email()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var (applicationId, _, _) = await PortalCandidateAsync(recruiter, ct);
        using var content = new MultipartFormDataContent();
        var pdf = new ByteArrayContent("%PDF-1.4\n%test\n"u8.ToArray());
        pdf.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(
            "application/pdf"
        );
        content.Add(pdf, "file", "brief.pdf");
        var uploaded = await recruiter.PostAsync(
            $"/api/applications/{applicationId}/messages/attachments",
            content,
            ct
        );
        uploaded.StatusCode.ShouldBe(
            HttpStatusCode.OK,
            await uploaded.Content.ReadAsStringAsync(ct)
        );
        var fileId = (await uploaded.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/messages",
                new { body = "", attachmentIds = new[] { fileId } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        var thread = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/messages",
            ct
        );
        thread
            .GetProperty("messages")
            .EnumerateArray()
            .Last()
            .GetProperty("attachments")[0]
            .GetProperty("name")
            .GetString()
            .ShouldBe("brief.pdf");
        (await InboxRowAsync(recruiter, "inbox", applicationId, ct))!
            .Value.GetProperty("hasFiles")
            .GetBoolean()
            .ShouldBeTrue();
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        (
            await db.EmailOutbox.SingleAsync(
                x =>
                    x.ApplicationId == applicationId
                    && x.TemplateKey == EmailThreads.MessageTemplateKey,
                ct
            )
        ).AttachmentIds.ShouldBe([fileId]);
        // A sent file can't be removed through the composer's delete.
        (
            await recruiter.DeleteAsync($"/api/messages/attachments/{fileId}", ct)
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Template_previews_fill_every_detail_they_can_use()
    {
        var ct = TestContext.Current.CancellationToken;
        using var admin = await LoginAsync("admin@example.test", ct);
        var library = await admin.GetFromJsonAsync<JsonElement>("/api/templates", ct);
        foreach (var listed in library.GetProperty("automatic").EnumerateArray())
        {
            var key = listed.GetProperty("key").GetString();
            var template = await admin.GetFromJsonAsync<JsonElement>($"/api/templates/{key}", ct);
            var preview = await (
                await admin.PostAsJsonAsync(
                    "/api/templates/preview",
                    new
                    {
                        subject = template.GetProperty("subject").GetString(),
                        body = template.GetProperty("body").GetString(),
                    },
                    ct
                )
            ).Content.ReadFromJsonAsync<JsonElement>(ct);
            preview.GetProperty("html").GetString()!.ShouldNotContain("{{", customMessage: key);
            preview.GetProperty("subject").GetString()!.ShouldNotContain("{{", customMessage: key);
        }
    }
}
