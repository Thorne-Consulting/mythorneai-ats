using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed partial class ApiFlowTests
{
    [Fact]
    public async Task Talent_search_respects_candidate_scope_and_skill_filters()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var interviewer = await LoginAsync("interviewer@example.test", cancellationToken);
        var scoped = await interviewer.GetFromJsonAsync<JsonElement>(
            "/api/talent/search?skills=react&skillMode=all&page=1&pageSize=25",
            cancellationToken
        );

        scoped.GetProperty("total").GetInt32().ShouldBe(1);
        scoped.GetProperty("items")[0].GetProperty("name").GetString().ShouldBe("Jordan Lee");
        scoped.GetProperty("items")[0].GetProperty("email").GetString().ShouldBe("Restricted");

        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var anySkill = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/talent/search?skills=react,postgresql&skillMode=any&page=1&pageSize=25",
            cancellationToken
        );
        anySkill.GetProperty("total").GetInt32().ShouldBeGreaterThan(1);
    }

    [Fact]
    public async Task Recruiter_can_import_a_docx_resume_and_find_its_parsed_content()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(CreateDocxResume());
        file.Headers.ContentType = new MediaTypeHeaderValue(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        content.Add(file, "file", "taylor-morgan.docx");

        var response = await recruiter.PostAsync("/api/resumes/import", content, cancellationToken);
        response.StatusCode.ShouldBe(HttpStatusCode.Created);
        var imported = await response.Content.ReadFromJsonAsync<JsonElement>(
            cancellationToken: cancellationToken
        );
        var candidateId = imported.GetProperty("candidateId").GetGuid();

        var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
            $"/api/candidates/{candidateId}",
            cancellationToken
        );
        candidate.GetProperty("resumeSkills").EnumerateArray()
            .Select(value => value.GetString())
            .ShouldContain("kubernetes");
        candidate.GetProperty("attachments")[0].GetProperty("parseStatus").GetString()
            .ShouldBe("Parsed");

        var search = await recruiter.GetFromJsonAsync<JsonElement>(
            "/api/talent/search?q=kubernetes&page=1&pageSize=25",
            cancellationToken
        );
        search.GetProperty("items").EnumerateArray()
            .Select(value => value.GetProperty("candidateId").GetGuid())
            .ShouldContain(candidateId);
    }

    [Fact]
    public async Task Development_seed_resumes_are_stored_parsed_and_searchable()
    {
        var cancellationToken = TestContext.Current.CancellationToken;
        using var recruiter = await LoginAsync("recruiter@example.test", cancellationToken);
        var expected = new[]
        {
            new { Query = "maya", File = "maya-fernandez-resume.pdf", Skill = "react" },
            new { Query = "elliot", File = "elliot-shaw-resume.docx", Skill = "kubernetes" },
            new { Query = "ada", File = "ada-whitfield-resume.pdf", Skill = "figma" },
        };

        foreach (var resume in expected)
        {
            var search = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/talent/search?q={resume.Query}&page=1&pageSize=25",
                cancellationToken
            );
            search.GetProperty("total").GetInt32().ShouldBe(1);
            var candidateId = search.GetProperty("items")[0].GetProperty("candidateId").GetGuid();
            var candidate = await recruiter.GetFromJsonAsync<JsonElement>(
                $"/api/candidates/{candidateId}",
                cancellationToken
            );

            candidate.GetProperty("resumeParsedAt").ValueKind.ShouldNotBe(JsonValueKind.Null);
            candidate.GetProperty("resumeSkills").EnumerateArray()
                .Select(value => value.GetString())
                .ShouldContain(resume.Skill);
            var attachment = candidate.GetProperty("attachments")[0];
            attachment.GetProperty("originalFileName").GetString().ShouldBe(resume.File);
            attachment.GetProperty("parseStatus").GetString().ShouldBe("Parsed");
            attachment.GetProperty("parseError").ValueKind.ShouldBe(JsonValueKind.Null);
        }
    }

    private static byte[] CreateDocxResume()
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(
                archive,
                "[Content_Types].xml",
                "<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"xml\" ContentType=\"application/xml\"/></Types>"
            );
            WriteEntry(
                archive,
                "word/document.xml",
                "<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>"
                    + Paragraph("Taylor Morgan")
                    + Paragraph("Platform Engineer")
                    + Paragraph("taylor.morgan.resume@example.com")
                    + Paragraph("Chicago, IL")
                    + Paragraph("Summary")
                    + Paragraph("Platform engineer with Kubernetes, Terraform, AWS, PostgreSQL, and Go experience.")
                    + Paragraph("Experience")
                    + Paragraph("Senior Platform Engineer, Example Systems, 2018 - 2026")
                    + Paragraph("Education")
                    + Paragraph("Bachelor of Science, Example University")
                    + "</w:body></w:document>"
            );
        }
        return output.ToArray();
    }

    private static string Paragraph(string value) =>
        $"<w:p><w:r><w:t>{value}</w:t></w:r></w:p>";

    private static void WriteEntry(ZipArchive archive, string name, string value)
    {
        var entry = archive.CreateEntry(name);
        using var writer = new StreamWriter(entry.Open(), Encoding.UTF8);
        writer.Write(value);
    }
}
