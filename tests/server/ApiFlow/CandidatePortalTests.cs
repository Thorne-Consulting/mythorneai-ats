using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private HttpClient CookieFreeClient() =>
        _factory!.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });

    /// <summary>Applies as a new person and confirms with the emailed code. Returns the application and the verify answer.</summary>
    private async Task<(Guid ApplicationId, HttpResponseMessage Verified)> ApplyAndVerifyAsync(
        HttpClient client,
        string email,
        CancellationToken ct
    )
    {
        var job = (await PublicJobIdsAsync(client, ct))[0];
        var applicationId = await ApplyAsync(
            client,
            job,
            new
            {
                firstName = "Cleo",
                lastName = "Portal",
                email,
            },
            ct
        );
        var code = CodeIn((await LastEmailAsync(applicationId, ct)).Body);
        var verified = await client.PostAsJsonAsync(
            "/public/applications/verify",
            new
            {
                email,
                code,
                applicationId,
            },
            ct
        );
        verified.StatusCode.ShouldBe(HttpStatusCode.OK);
        return (applicationId, verified);
    }

    private static string NewEmail(string prefix) =>
        $"{prefix}.{Guid.NewGuid():N}"[..20] + "@example.test";

    [Fact]
    public async Task The_portal_session_is_an_http_only_cookie_and_signing_out_ends_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using var anonymous = CookieFreeClient();
        // Nobody signed in is not an error: the portal shows its sign-in page.
        (await anonymous.GetAsync("/public/portal", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );

        var (_, verified) = await ApplyAndVerifyAsync(anonymous, NewEmail("cookie"), ct);
        var setCookie = verified
            .Headers.GetValues("Set-Cookie")
            .Single(x => x.StartsWith("candidate.session=", StringComparison.Ordinal));
        setCookie.ShouldContain("httponly", Case.Insensitive);
        setCookie.ShouldContain("samesite=lax", Case.Insensitive);
        setCookie.ShouldContain("path=/", Case.Insensitive);
        var cookie = setCookie.Split(';')[0];

        HttpRequestMessage WithCookie(
            HttpMethod method,
            string url,
            object? body = null,
            bool portalHeader = true
        )
        {
            var request = new HttpRequestMessage(method, url)
            {
                Content = body is null ? null : JsonContent.Create(body),
            };
            request.Headers.Add("Cookie", cookie);
            if (portalHeader)
                request.Headers.Add("X-Candidate-Portal", "1");
            return request;
        }

        // The cookie alone is enough to read the portal...
        (
            await anonymous.SendAsync(
                WithCookie(HttpMethod.Get, "/public/portal", portalHeader: false),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        // ...but a change also needs the portal's own header, which another site's form cannot add.
        var details = new
        {
            firstName = "Cleo",
            lastName = "Portal",
            phone = "+1 312 555 0199",
            location = "Chicago, United States",
            linkedInUrl = "https://www.linkedin.com/in/cleo",
            timeZone = "America/Chicago",
        };
        (
            await anonymous.SendAsync(
                WithCookie(HttpMethod.Put, "/public/portal/profile", details, portalHeader: false),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
        (
            await anonymous.SendAsync(
                WithCookie(HttpMethod.Put, "/public/portal/profile", details),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var refused = await anonymous.SendAsync(
            WithCookie(
                HttpMethod.Put,
                "/public/portal/profile",
                new
                {
                    firstName = "",
                    lastName = "Portal",
                    phone = "12",
                    timeZone = "Mars/Base",
                }
            ),
            ct
        );
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var errors = (await refused.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty(
            "errors"
        );
        errors.TryGetProperty("firstName", out _).ShouldBeTrue();
        errors.TryGetProperty("phone", out _).ShouldBeTrue();
        errors.TryGetProperty("timeZone", out _).ShouldBeTrue();

        var portal = await (
            await anonymous.SendAsync(WithCookie(HttpMethod.Get, "/public/portal"), ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        portal
            .GetProperty("candidate")
            .GetProperty("phone")
            .GetString()
            .ShouldBe("+1 312 555 0199");
        portal
            .GetProperty("candidate")
            .GetProperty("timeZone")
            .GetString()
            .ShouldBe("America/Chicago");

        // Signing out deletes the session on the server, so a copied cookie stops working too.
        var signOut = await anonymous.SendAsync(
            WithCookie(HttpMethod.Post, "/public/portal/sign-out"),
            ct
        );
        signOut.StatusCode.ShouldBe(HttpStatusCode.NoContent);
        signOut
            .Headers.GetValues("Set-Cookie")
            .ShouldContain(x => x.StartsWith("candidate.session=;", StringComparison.Ordinal));
        (
            await anonymous.SendAsync(
                WithCookie(HttpMethod.Get, "/public/portal", portalHeader: false),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task The_careers_site_brand_is_set_by_admins_and_reaches_the_public_pages()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (
            await recruiter.PutAsJsonAsync(
                "/api/careers-site",
                new { brandColor = "#0f766e", requireResume = false },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.Forbidden);

        using var admin = await LoginAsync("admin@example.test", ct);
        var bad = await admin.PutAsJsonAsync(
            "/api/careers-site",
            new
            {
                brandColor = "teal",
                websiteUrl = "acme.example",
                socialUrls = new[] { "not a link" },
                requireResume = false,
            },
            ct
        );
        bad.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var errors = (await bad.Content.ReadFromJsonAsync<JsonElement>(ct)).GetProperty("errors");
        foreach (var field in new[] { "brandColor", "websiteUrl", "socialUrls" })
            errors.TryGetProperty(field, out _).ShouldBeTrue(field);

        (
            await admin.PutAsJsonAsync(
                "/api/careers-site",
                new
                {
                    brandColor = "#0F766E",
                    headline = "Build with us",
                    introMarkdown = "We make **useful** tools.",
                    websiteUrl = "https://acme.example",
                    socialUrls = new[] { "https://www.linkedin.com/company/acme" },
                    requireResume = true,
                },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        static MultipartFormDataContent Image(byte[] bytes, string name)
        {
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
            return new MultipartFormDataContent { { file, "file", name } };
        }
        byte[] png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 0x49, 0x48];
        // A file whose content is not a picture is refused, whatever its name says.
        (
            await admin.PostAsync(
                "/api/careers-site/images/icon",
                Image("%PDF-1.4 nope"u8.ToArray(), "icon.png"),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (
            await admin.PostAsync("/api/careers-site/images/icon", Image(png, "icon.png"), ct)
        ).StatusCode.ShouldBe(HttpStatusCode.OK);

        using var anonymous = _factory!.CreateClient();
        var brand = (
            await anonymous.GetFromJsonAsync<JsonElement>("/public/organization", ct)
        ).GetProperty("brand");
        brand.GetProperty("brandColor").GetString().ShouldBe("#0f766e");
        brand.GetProperty("headline").GetString().ShouldBe("Build with us");
        brand.GetProperty("requireResume").GetBoolean().ShouldBeTrue();
        brand.GetProperty("logoUrl").ValueKind.ShouldBe(JsonValueKind.Null);
        var iconUrl = brand.GetProperty("iconUrl").GetString()!;
        iconUrl.ShouldStartWith("/public/careers/images/icon?v=");
        var icon = await anonymous.GetAsync(iconUrl, ct);
        icon.StatusCode.ShouldBe(HttpStatusCode.OK);
        icon.Content.Headers.ContentType!.MediaType.ShouldBe("image/png");
        icon.Headers.CacheControl!.ToString().ShouldContain("immutable");

        // The brand goes into the email layout too: the icon by its full address, and the colour.
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.Organizations.SingleAsync(ct)).PublicUrl = "https://jobs.example.test";
            await db.SaveChangesAsync(ct);
            var emailBrand = await CareerSites.EmailBrandAsync(db, ct);
            emailBrand!.IconUrl!.ShouldStartWith(
                "https://jobs.example.test/public/careers/images/icon"
            );
            var html = EmailHtml.Wrap("Acme", "Hello https://jobs.example.test", emailBrand);
            html.ShouldContain("color:#0f766e");
            html.ShouldContain(emailBrand.IconUrl!);
        }

        // "Require a resume" is enforced by the server, not only by the form.
        var job = (await PublicJobIdsAsync(anonymous, ct))[0];
        var refused = await anonymous.PostAsJsonAsync(
            $"/public/jobs/{job}/applications",
            new
            {
                firstName = "No",
                lastName = "Resume",
                email = NewEmail("noresume"),
            },
            ct
        );
        refused.StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        (await refused.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("errors")
            .TryGetProperty("resume", out _)
            .ShouldBeTrue();
    }

    [Fact]
    public async Task A_document_request_shows_in_the_portal_and_the_candidate_upload_fulfils_it()
    {
        var ct = TestContext.Current.CancellationToken;
        using (var scope = _factory!.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            (await db.Organizations.SingleAsync(ct)).PublicUrl = "https://jobs.example.test";
            await db.SaveChangesAsync(ct);
        }
        using var anonymous = CookieFreeClient();
        var (applicationId, verified) = await ApplyAndVerifyAsync(anonymous, NewEmail("docs"), ct);
        var token = (await verified.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("token")
            .GetString()!;
        HttpRequestMessage AsCandidate(
            HttpMethod method,
            string url,
            HttpContent? content = null,
            string? session = null
        )
        {
            var request = new HttpRequestMessage(method, url) { Content = content };
            request.Headers.Add("X-Candidate-Session", session ?? token);
            return request;
        }

        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        (
            await recruiter.PostAsJsonAsync(
                $"/api/applications/{applicationId}/document-requests",
                new { label = "", kind = "Portfolio" },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var asked = await recruiter.PostAsJsonAsync(
            $"/api/applications/{applicationId}/document-requests",
            new
            {
                label = "Portfolio",
                kind = "Portfolio",
                note = "Two recent projects.",
            },
            ct
        );
        asked.StatusCode.ShouldBe(HttpStatusCode.OK);
        var requestId = (await asked.Content.ReadFromJsonAsync<JsonElement>(ct))[0]
            .GetProperty("id")
            .GetGuid();

        // The email opens the application's documents, signed in.
        var email = await LastEmailAsync(applicationId, ct);
        email.TemplateKey.ShouldBe(CandidateFacingEndpoints.DocumentRequestKey);
        var link = Regex
            .Match(email.Body, @"/candidate-portal/link#([0-9A-F]{64})")
            .Groups[1]
            .Value;
        var opened = await anonymous.PostAsJsonAsync("/public/magic", new { token = link }, ct);
        opened.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await opened.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("path")
            .GetString()
            .ShouldBe($"/candidate-portal/applications/{applicationId}#documents");

        // It is a to-do in the portal until a file arrives.
        var portal = await (
            await anonymous.SendAsync(AsCandidate(HttpMethod.Get, "/public/portal"), ct)
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        portal
            .GetProperty("applications")[0]
            .GetProperty("documentRequests")[0]
            .GetProperty("label")
            .GetString()
            .ShouldBe("Portfolio");

        static MultipartFormDataContent Upload(
            byte[] bytes,
            string name,
            params (string, string)[] fields
        )
        {
            var form = new MultipartFormDataContent
            {
                { new ByteArrayContent(bytes), "file", name },
            };
            foreach (var (key, value) in fields)
                form.Add(new StringContent(value), key);
            return form;
        }
        var pdf = "%PDF-1.4 portfolio"u8.ToArray();
        var documents = $"/public/portal/applications/{applicationId}/documents";
        // A resume must be a document the team can read.
        (
            await anonymous.SendAsync(
                AsCandidate(
                    HttpMethod.Post,
                    documents,
                    Upload(
                        [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
                        "me.png",
                        ("kind", "Resume")
                    )
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
        var added = await anonymous.SendAsync(
            AsCandidate(
                HttpMethod.Post,
                documents,
                Upload(pdf, "portfolio.pdf", ("requestId", requestId.ToString()))
            ),
            ct
        );
        added.StatusCode.ShouldBe(
            HttpStatusCode.Created,
            await added.Content.ReadAsStringAsync(ct)
        );
        var documentId = (await added.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("id")
            .GetGuid();

        var sent = await (
            await anonymous.SendAsync(
                AsCandidate(HttpMethod.Get, $"/public/portal/applications/{applicationId}/sent"),
                ct
            )
        ).Content.ReadFromJsonAsync<JsonElement>(ct);
        sent.GetProperty("documents")[0].GetProperty("kind").GetString().ShouldBe("Portfolio");
        sent.GetProperty("requests")[0]
            .GetProperty("fulfilledAt")
            .ValueKind.ShouldNotBe(JsonValueKind.Null);
        sent.GetProperty("profile").GetProperty("firstName").GetString().ShouldBe("Cleo");

        var download = await anonymous.SendAsync(
            AsCandidate(HttpMethod.Get, $"/public/portal/documents/{documentId}"),
            ct
        );
        download.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await download.Content.ReadAsByteArrayAsync(ct)).ShouldBe(pdf);

        var list = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/applications/{applicationId}/document-requests",
            ct
        );
        list[0].GetProperty("fileName").GetString().ShouldBe("portfolio.pdf");
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
            // The team hears about it in the conversation, with the file attached.
            var message = await db.ApplicationMessages.SingleAsync(
                x => x.ApplicationId == applicationId && x.FromCandidate,
                ct
            );
            message.Body.ShouldContain("portfolio you asked for");
            (await db.Attachments.SingleAsync(x => x.Id == documentId, ct)).MessageId.ShouldBe(
                message.Id
            );
        }

        // Files sent with a message in the conversation: one message, every file attached to it.
        var chat = Upload(pdf, "notes.pdf", ("kind", "Other"), ("body", "Here are my notes."));
        chat.Add(new ByteArrayContent(pdf), "file", "more.pdf");
        (
            await anonymous.SendAsync(AsCandidate(HttpMethod.Post, documents, chat), ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);
        var thread = (
            await (
                await anonymous.SendAsync(AsCandidate(HttpMethod.Get, "/public/portal"), ct)
            ).Content.ReadFromJsonAsync<JsonElement>(ct)
        )
            .GetProperty("applications")[0]
            .GetProperty("thread");
        var last = thread[thread.GetArrayLength() - 1];
        last.GetProperty("body").GetString().ShouldBe("Here are my notes.");
        last.GetProperty("files").GetArrayLength().ShouldBe(2);

        // Someone else's session cannot open the file.
        var (_, other) = await ApplyAndVerifyAsync(anonymous, NewEmail("other"), ct);
        var otherToken = (await other.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("token")
            .GetString();
        (
            await anonymous.SendAsync(
                AsCandidate(
                    HttpMethod.Get,
                    $"/public/portal/documents/{documentId}",
                    session: otherToken
                ),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Reading_a_resume_again_keeps_links_and_title_the_team_entered()
    {
        var ct = TestContext.Current.CancellationToken;
        using var scope = _factory!.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
        var edited = new Candidate
        {
            FirstName = "Ed",
            LastName = "Ited",
            Email = NewEmail("edited"),
            Source = "Test",
            GitHubUrl = "https://github.com/edited",
            PortfolioUrl = "https://edited.example",
            OtherUrls = ["https://blog.edited.example"],
            CurrentTitle = "Staff engineer",
        };
        var empty = new Candidate
        {
            FirstName = "Em",
            LastName = "Pty",
            Email = NewEmail("empty"),
            Source = "Test",
        };
        db.Candidates.AddRange(edited, empty);
        await db.SaveChangesAsync(ct);

        var form = FakeResumeChat.Fill(
            "Ann Example\nSenior Platform Engineer, Example Systems, 2018 - Present"
        );
        form = form with
        {
            Basics = form.Basics with
            {
                Links =
                [
                    new ResumeLink("github", "github.com/parsed"),
                    new ResumeLink("portfolio", "parsed.example"),
                    new ResumeLink("other", "https://other.example"),
                ],
            },
        };
        var extraction = new ResumeExtraction(form, "hash", "fake", "test", "{}");
        foreach (var id in new[] { edited.Id, empty.Id })
        {
            var candidate = await db.Candidates.WithProfile().SingleAsync(x => x.Id == id, ct);
            await ResumeProfileWriter.ApplyAsync(db, candidate, extraction, "text", ct);
            await db.SaveChangesAsync(ct);
        }

        var kept = await db.Candidates.AsNoTracking().SingleAsync(x => x.Id == edited.Id, ct);
        kept.GitHubUrl.ShouldBe("https://github.com/edited");
        kept.PortfolioUrl.ShouldBe("https://edited.example");
        kept.OtherUrls.ShouldBe(["https://blog.edited.example"]);
        kept.CurrentTitle.ShouldBe("Staff engineer");
        var filled = await db.Candidates.AsNoTracking().SingleAsync(x => x.Id == empty.Id, ct);
        filled.GitHubUrl.ShouldBe("https://github.com/parsed");
        filled.PortfolioUrl.ShouldBe("https://parsed.example");
        filled.OtherUrls.ShouldBe(["https://other.example"]);
        filled.CurrentTitle.ShouldBe("Senior Platform Engineer");
    }
}
