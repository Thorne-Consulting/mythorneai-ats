using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    private static async Task<JsonElement> JsonAsync(
        HttpClient client,
        string path,
        CancellationToken ct
    ) => await client.GetFromJsonAsync<JsonElement>(path, ct);

    private static Guid[] Ids(JsonElement page) =>
        page.GetProperty("items")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ToArray();

    [Fact]
    public async Task Candidate_search_matches_every_word_typos_and_phone_digits()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jordan = Ids(await JsonAsync(recruiter, "/api/candidates?search=Jordan%20Lee", ct))
            .Single();

        // A typo in the name still finds the person.
        Ids(await JsonAsync(recruiter, "/api/candidates?search=jordn", ct)).ShouldContain(jordan);
        // Header search splits the words, so a full name works there too.
        var header = await JsonAsync(recruiter, "/api/search?q=jordan%20lee", ct);
        header
            .GetProperty("candidates")
            .EnumerateArray()
            .Select(x => x.GetProperty("id").GetGuid())
            .ShouldContain(jordan);
        header.GetProperty("candidates")[0].TryGetProperty("currentJob", out _).ShouldBeTrue();

        // Phone digits match however the number is written.
        var detail = await JsonAsync(recruiter, $"/api/candidates/{jordan}", ct);
        var phone = detail.GetProperty("phone").GetString()!;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        var formatted = $"({digits[^10..^7]}) {digits[^7..^4]}-{digits[^4..]}";
        Ids(
                await JsonAsync(
                    recruiter,
                    $"/api/candidates?search={Uri.EscapeDataString(formatted)}",
                    ct
                )
            )
            .ShouldContain(jordan);

        // A word only in the resume comes back with a highlighted snippet.
        var resumeHit = await JsonAsync(recruiter, "/api/candidates?search=kubernetes", ct);
        resumeHit
            .GetProperty("items")
            .EnumerateArray()
            .Any(x => x.GetProperty("snippet").GetString()?.Contains("⟦") == true)
            .ShouldBeTrue();
    }

    [Fact]
    public async Task Only_resume_uploads_are_read_into_the_profile()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var jordan = Ids(await JsonAsync(recruiter, "/api/candidates?search=Jordan%20Lee", ct))
            .Single();
        var before = await JsonAsync(recruiter, $"/api/candidates/{jordan}", ct);

        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(CreateDocxResume());
        file.Headers.ContentType = new MediaTypeHeaderValue(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        content.Add(file, "file", "cover-letter.docx");
        content.Add(new StringContent("CoverLetter"), "kind");
        (
            await recruiter.PostAsync($"/api/candidates/{jordan}/attachments", content, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.Created);

        await Task.Delay(TimeSpan.FromSeconds(4), ct);
        var after = await JsonAsync(recruiter, $"/api/candidates/{jordan}", ct);
        var letter = after
            .GetProperty("attachments")
            .EnumerateArray()
            .Single(x => x.GetProperty("originalFileName").GetString() == "cover-letter.docx");
        letter.GetProperty("kind").GetString().ShouldBe("CoverLetter");
        letter.GetProperty("parseStatus").GetString().ShouldBe("NotParsed");
        after
            .GetProperty("resumeParsedAt")
            .GetString()
            .ShouldBe(before.GetProperty("resumeParsedAt").GetString());
        after
            .GetProperty("resumeAttachmentId")
            .GetGuid()
            .ShouldNotBe(letter.GetProperty("id").GetGuid());

        // A legacy Word file cannot be a resume.
        using var legacy = new MultipartFormDataContent();
        legacy.Add(
            new ByteArrayContent([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
            "file",
            "old.doc"
        );
        (
            await recruiter.PostAsync($"/api/candidates/{jordan}/attachments", legacy, ct)
        ).StatusCode.ShouldBe(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Editing_details_tags_and_do_not_contact()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var people = Ids(await JsonAsync(recruiter, "/api/candidates?sort=name&pageSize=10", ct));
        var (first, second) = (people[0], people[1]);
        var detail = await JsonAsync(recruiter, $"/api/candidates/{first}", ct);
        var other = await JsonAsync(recruiter, $"/api/candidates/{second}", ct);
        object Body(string email, bool dnc = false) =>
            new
            {
                firstName = detail.GetProperty("firstName").GetString(),
                lastName = detail.GetProperty("lastName").GetString(),
                email,
                phone = "+1 (555) 010-9999",
                location = "Denver, CO",
                currentTitle = "Staff engineer",
                linkedInUrl = (string?)null,
                gitHubUrl = "https://github.com/someone",
                portfolioUrl = (string?)null,
                source = "Referral",
                tags = (string[]?)null,
                doNotContact = dnc,
                doNotContactReason = dnc ? "Asked us to stop" : null,
            };

        // Another person's email: 409 with who has it.
        var taken = await recruiter.PutAsJsonAsync(
            $"/api/candidates/{first}",
            Body(other.GetProperty("email").GetString()!),
            ct
        );
        taken.StatusCode.ShouldBe(HttpStatusCode.Conflict);
        (await taken.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("candidate")
            .GetProperty("id")
            .GetGuid()
            .ShouldBe(second);

        (
            await recruiter.PutAsJsonAsync(
                $"/api/candidates/{first}",
                Body("new.address@example.com", dnc: true),
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.NoContent);
        var saved = await JsonAsync(recruiter, $"/api/candidates/{first}", ct);
        saved.GetProperty("email").GetString().ShouldBe("new.address@example.com");
        saved.GetProperty("gitHubUrl").GetString().ShouldBe("https://github.com/someone");
        saved.GetProperty("doNotContactReason").GetString().ShouldBe("Asked us to stop");

        // Tags are their own filter, not skills.
        (
            await recruiter.PatchAsJsonAsync(
                $"/api/candidates/{second}/tags",
                new { tags = new[] { "Silver-Medalist" } },
                ct
            )
        ).StatusCode.ShouldBe(HttpStatusCode.OK);
        Ids(await JsonAsync(recruiter, "/api/candidates?tags=silver-medalist", ct))
            .ShouldBe([second]);
        Ids(await JsonAsync(recruiter, "/api/candidates?skills=silver-medalist", ct))
            .ShouldBeEmpty();
        (await JsonAsync(recruiter, "/api/candidates/tags", ct))
            .EnumerateArray()
            .Select(x => x.GetProperty("tag").GetString())
            .ShouldContain("silver-medalist");
    }

    [Fact]
    public async Task Bulk_actions_counts_export_and_delete()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);
        var counts = await JsonAsync(recruiter, "/api/candidates/counts", ct);
        var all = counts.GetProperty("all").GetInt32();
        all.ShouldBeGreaterThan(25);
        (await JsonAsync(recruiter, "/api/candidates?hasApplications=false&pageSize=100", ct))
            .GetProperty("total")
            .GetInt32()
            .ShouldBe(counts.GetProperty("noJob").GetInt32());

        // Export is every matching row, not one page.
        var csv = await recruiter.GetStringAsync("/api/candidates/export", ct);
        csv.Split("\r\n", StringSplitOptions.RemoveEmptyEntries).Length.ShouldBe(all + 1);

        // Tag everyone matching a filter in one request.
        var tagged = await recruiter.PostAsJsonAsync(
            "/api/candidates/bulk",
            new
            {
                filter = "source=Referral",
                action = "addTags",
                tags = new[] { "referral-drive" },
            },
            ct
        );
        tagged.StatusCode.ShouldBe(HttpStatusCode.OK);
        var referrals = (
            await JsonAsync(recruiter, "/api/candidates?source=Referral&pageSize=100", ct)
        )
            .GetProperty("total")
            .GetInt32();
        (await tagged.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("done")
            .GetInt32()
            .ShouldBe(referrals);
        (await JsonAsync(recruiter, "/api/candidates?tags=referral-drive&pageSize=100", ct))
            .GetProperty("total")
            .GetInt32()
            .ShouldBe(referrals);

        // Add people in no job to an open job, at its first stage.
        var prospects = Ids(
            await JsonAsync(recruiter, "/api/candidates?hasApplications=false&pageSize=100", ct)
        );
        prospects.ShouldNotBeEmpty();
        var jobs = await JsonAsync(recruiter, "/api/requisitions?status=Open", ct);
        var jobId = jobs[0].GetProperty("id").GetGuid();
        var added = await recruiter.PostAsJsonAsync(
            "/api/candidates/bulk",
            new
            {
                ids = prospects,
                action = "addToJob",
                requisitionId = jobId,
            },
            ct
        );
        added.StatusCode.ShouldBe(HttpStatusCode.OK);
        (await added.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("done")
            .GetInt32()
            .ShouldBe(prospects.Length);
        prospects
            .Except(
                Ids(
                    await JsonAsync(
                        recruiter,
                        $"/api/candidates?requisitionId={jobId}&pageSize=100",
                        ct
                    )
                )
            )
            .ShouldBeEmpty();

        // "Withdrew" closes as Withdrawn; the rest are rejected with one request.
        (await recruiter.PostAsJsonAsync("/api/candidates/bulk",
            new { ids = prospects[..1], action = "reject", requisitionId = jobId, reason = "Withdrew", status = "Withdrawn", sendEmail = true }, ct))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
        Ids(await JsonAsync(recruiter, $"/api/candidates?requisitionId={jobId}&status=Withdrawn&pageSize=100", ct))
            .ShouldContain(prospects[0]);
        (await recruiter.PostAsJsonAsync("/api/candidates/bulk",
            new { ids = prospects, action = "reject", requisitionId = jobId, reason = "Skills mismatch" }, ct))
            .StatusCode.ShouldBe(HttpStatusCode.OK);
        prospects[1..].Except(Ids(await JsonAsync(recruiter, $"/api/candidates?requisitionId={jobId}&status=Rejected&pageSize=100", ct)))
            .ShouldBeEmpty();

        // Only an admin can delete, and the person and their applications go.
        (await recruiter.DeleteAsync($"/api/candidates/{prospects[0]}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.Forbidden
        );
        using var admin = await LoginAsync("admin@example.test", ct);
        var withInterviews = Ids(await JsonAsync(admin, "/api/candidates?search=Jordan%20Lee", ct))
            .Single();
        (await admin.DeleteAsync($"/api/candidates/{withInterviews}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NoContent
        );
        (await admin.GetAsync($"/api/candidates/{withInterviews}", ct)).StatusCode.ShouldBe(
            HttpStatusCode.NotFound
        );
        (await JsonAsync(admin, "/api/candidates/counts", ct))
            .GetProperty("all")
            .GetInt32()
            .ShouldBe(all - 1);
    }
}

public sealed partial class ApiFlowTests
{
    private static MultipartFormDataContent Sheet(
        byte[] bytes,
        string name,
        params (string Key, string Value)[] fields
    )
    {
        var content = new MultipartFormDataContent
        {
            { new ByteArrayContent(bytes), "file", name },
        };
        foreach (var (key, value) in fields)
            content.Add(new StringContent(value), key);
        return content;
    }

    [Fact]
    public async Task Spreadsheet_import_matches_columns_reads_excel_and_fills_empty_fields()
    {
        var ct = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", ct);

        using var workbook = new ClosedXML.Excel.XLWorkbook();
        var sheet = workbook.AddWorksheet("People");
        string[][] cells =
        [
            ["Given name", "Surname", "E-mail", "Mobile", "Favourite colour"],
            ["Robin", "Okafor", "robin.okafor@example.com", "555 0199", "green"],
            ["", "Nobody", "not-an-email", "", ""],
        ];
        for (var r = 0; r < cells.Length; r++)
        for (var c = 0; c < cells[r].Length; c++)
            sheet.Cell(r + 1, c + 1).Value = cells[r][c];
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        // Headers we know are matched; the dry run adds nothing.
        var dry = await recruiter.PostAsync(
            "/api/candidates/imports?dryRun=true",
            Sheet(stream.ToArray(), "people.xlsx"),
            ct
        );
        dry.StatusCode.ShouldBe(HttpStatusCode.OK);
        var checkedRows = await dry.Content.ReadFromJsonAsync<JsonElement>(ct);
        checkedRows.GetProperty("needsMapping").GetBoolean().ShouldBeFalse();
        var mapping = checkedRows.GetProperty("columns").GetProperty("mapping");
        mapping.GetProperty("0").GetString().ShouldBe("firstName");
        mapping.GetProperty("3").GetString().ShouldBe("phone");
        mapping.TryGetProperty("4", out _).ShouldBeFalse();
        checkedRows.GetProperty("wouldCreate").GetInt32().ShouldBe(1);
        checkedRows.GetProperty("invalid").GetInt32().ShouldBe(1);
        Ids(await JsonAsync(recruiter, "/api/candidates?search=robin.okafor%40example.com", ct))
            .ShouldBeEmpty();

        var done = await recruiter.PostAsync(
            "/api/candidates/imports?dryRun=false",
            Sheet(stream.ToArray(), "people.xlsx", ("tags", "spring-fair")),
            ct
        );
        (await done.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("created")
            .GetInt32()
            .ShouldBe(1);
        var robin = Ids(await JsonAsync(recruiter, "/api/candidates?tags=spring-fair", ct))
            .Single();

        // A CSV with the same person: "fill" only fills what is empty, and a chosen mapping wins.
        var csv =
            "Email,Where,Title\nrobin.okafor@example.com,\"Lagos, NG\",Data engineer\n"u8.ToArray();
        var fill = await recruiter.PostAsync(
            "/api/candidates/imports?dryRun=false",
            Sheet(
                csv,
                "more.csv",
                ("duplicates", "fill"),
                ("mapping", """{"0":"email","1":"location","2":"currentTitle"}""")
            ),
            ct
        );
        // No name columns chosen: the import asks for them instead of guessing.
        (await fill.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("needsMapping")
            .GetBoolean()
            .ShouldBeTrue();

        var csvWithNames =
            "Email,First,Last,Where\nrobin.okafor@example.com,Robin,Okafor,\"Lagos, NG\"\n"u8.ToArray();
        var filled = await recruiter.PostAsync(
            "/api/candidates/imports?dryRun=false",
            Sheet(
                csvWithNames,
                "more.csv",
                ("duplicates", "fill"),
                ("mapping", """{"0":"email","1":"firstName","2":"lastName","3":"location"}""")
            ),
            ct
        );
        (await filled.Content.ReadFromJsonAsync<JsonElement>(ct))
            .GetProperty("updated")
            .GetInt32()
            .ShouldBe(1);
        var person = await JsonAsync(recruiter, $"/api/candidates/{robin}", ct);
        person.GetProperty("location").GetString().ShouldBe("Lagos, NG");
        person.GetProperty("phone").GetString().ShouldBe("555 0199");
    }
}
