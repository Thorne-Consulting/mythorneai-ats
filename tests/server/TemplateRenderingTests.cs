using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class TemplateRenderingTests
{
    private static readonly Dictionary<string, string> Karen = new()
    {
        ["firstName"] = "Karen",
        ["jobTitle"] = "Software Engineer",
        ["company"] = "Acme",
        ["portalLink"] = "https://ats.acme.test/candidate-portal",
        ["stage"] = "",
    };

    [Fact]
    public void Fills_detail_chips_and_shows_mentions_as_plain_names()
    {
        var (subject, body) = EmailTemplates.Render(
            "Your {{jobTitle}} application",
            "Hi {{firstName}},\n\n[Avery Stone](mention:avery%40acme.test) will call you about {{jobTitle}} at {{company}}.",
            Karen
        );
        subject.ShouldBe("Your Software Engineer application");
        body.ShouldBe("Hi Karen,\n\nAvery Stone will call you about Software Engineer at Acme.");
    }

    [Fact]
    public void Reads_the_old_snake_case_style_as_camel_case()
    {
        EmailTemplates
            .Camel("Hi {{first_name}}, about {{ job_title }}")
            .ShouldBe("Hi {{firstName}}, about {{jobTitle}}");
        EmailTemplates.Render("", "Hi {{first_name}}", Karen).Body.ShouldBe("Hi Karen");
    }

    [Fact]
    public void Lists_details_with_no_value_and_details_a_template_may_not_use()
    {
        EmailTemplates
            .Missing("Hi {{firstName}}, you are in {{stage}} for {{secret}}", Karen)
            .ShouldBe(["stage", "secret"]);
        EmailTemplates
            .Unknown("{{firstName}} {{company}} {{salary}}", ["firstName"])
            .ShouldBe(["salary"]);
        EmailTemplates.DetailLabel("firstName").ShouldBe("First name");
    }

    [Fact]
    public void A_missing_portal_link_does_not_leave_a_dangling_colon()
    {
        var values = new Dictionary<string, string>(Karen) { ["portalLink"] = "" };
        EmailTemplates
            .Render("", "Follow your application here: {{portalLink}}", values)
            .Body.ShouldBe("Follow your application here.");
    }

    [Fact]
    public void Turns_markdown_into_safe_email_html()
    {
        var html = EmailHtml.Body(
            "**Hello** [Avery](mention:avery@acme.test)\n\n- one\n- two\n\n[site](https://acme.test) [bad](javascript:alert(1)) <script>x</script> <u>under</u>"
        );
        html.ShouldContain("<strong>Hello</strong> Avery");
        html.ShouldContain("<li style=");
        html.ShouldContain("href=\"https://acme.test\"");
        html.ShouldNotContain("javascript:");
        html.ShouldNotContain("<script>");
        html.ShouldContain("<ins>under</ins>");
        EmailHtml
            .PlainText("See [the portal](https://acme.test/p) and [Avery](mention:a@b.c)")
            .ShouldBe("See the portal (https://acme.test/p) and Avery");
    }

    [Fact]
    public void Every_automatic_email_uses_only_details_it_declares()
    {
        foreach (var (key, template) in EmailTemplates.Defaults)
        {
            EmailTemplates
                .Unknown(template.Subject + template.Body, template.Variables)
                .ShouldBeEmpty(key);
            template.Variables.ShouldAllBe(v => EmailTemplates.Details.Any(d => d.Key == v), key);
            template.SentWhen.ShouldNotBeNullOrWhiteSpace(key);
        }
    }

    [Fact]
    public void Bulk_email_skips_people_who_cannot_be_emailed()
    {
        Candidate Person(Action<Candidate>? change = null)
        {
            var candidate = new Candidate
            {
                FirstName = "Mia",
                LastName = "Lee",
                Email = "mia@example.test",
                Source = "Test",
            };
            change?.Invoke(candidate);
            return candidate;
        }
        BulkEmail.SkipReason(Person(), null).ShouldBeNull();
        BulkEmail
            .SkipReason(Person(c => c.DoNotContact = true), null)
            .ShouldBe("Asked not to be contacted");
        BulkEmail
            .SkipReason(Person(c => c.EmailBounced = true), null)
            .ShouldBe("Emails to this address bounce");
        BulkEmail.SkipReason(Person(c => c.Email = " "), null).ShouldBe("No email address");
        BulkEmail
            .SkipReason(
                Person(),
                new Application { Source = "Test", Status = ApplicationStatus.PendingVerification }
            )
            .ShouldBe("Hasn't confirmed their email yet");
        // Do not contact wins over everything else.
        BulkEmail
            .SkipReason(
                Person(c =>
                {
                    c.DoNotContact = true;
                    c.EmailBounced = true;
                }),
                null
            )
            .ShouldBe("Asked not to be contacted");
    }
}
