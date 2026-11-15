using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class EmailInboundTests
{
    [Fact]
    public void Reads_the_sender_name_and_address()
    {
        EmailInbound
            .ParseAddress("\"Karen Dela Cruz\" <Karen@Example.com>")
            .ShouldBe(("karen@example.com", "Karen Dela Cruz"));
        EmailInbound
            .ParseAddress("karen@example.com")
            .ShouldBe(("karen@example.com", (string?)null));
    }

    [Fact]
    public void Keeps_only_the_new_part_of_a_reply()
    {
        const string gmail =
            "Thursday works for me.\n\nThanks,\nKaren\n\nOn Wed, Nov 11, 2026 at 4:12 PM Avery <hiring@acme.com> wrote:\n> Could we talk this week?\n> Avery";
        EmailInbound.VisibleText(gmail).ShouldStartWith("Thursday works for me.");
        EmailInbound.VisibleText(gmail).ShouldNotContain("wrote:");
        EmailInbound.VisibleText(gmail).ShouldNotContain("Could we talk");
    }

    [Fact]
    public void Turns_html_only_mail_into_text_without_styles_or_quotes()
    {
        const string html =
            "<html><head><style>p{color:red}</style></head><body><p>Yes, I&#39;m free.</p><div>Karen</div>"
            + "<blockquote>Old message</blockquote></body></html>";
        var text = EmailInbound.PlainText(null, html);
        text.ShouldContain("Yes, I'm free.");
        text.ShouldNotContain("color:red");
        EmailInbound.VisibleText(text).ShouldNotContain("Old message");
    }

    [Fact]
    public void Puts_a_person_name_on_the_from_line()
    {
        ResendEmailSender
            .WithName("hiring@acme.com", "Avery at Acme")
            .ShouldBe("\"Avery at Acme\" <hiring@acme.com>");
        ResendEmailSender
            .WithName("Acme <hiring@acme.com>", "Avery at Acme")
            .ShouldBe("\"Avery at Acme\" <hiring@acme.com>");
        ResendEmailSender.WithName("hiring@acme.com", null).ShouldBe("hiring@acme.com");
    }
}
