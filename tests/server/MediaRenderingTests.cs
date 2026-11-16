using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

// Pictures: what the first bytes say a file is, and how a picture reaches an email.
public sealed class MediaRenderingTests
{
    [Theory]
    [InlineData(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 }, ".png")]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0 }, ".jpg")]
    [InlineData(new byte[] { 0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0 }, ".gif")]
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50 }, ".webp")]
    public void Pictures_are_known_by_their_first_bytes(byte[] head, string extension) =>
        MediaEndpoints.ImageType(head)!.Value.Extension.ShouldBe(extension);

    [Theory]
    [InlineData("%PDF-1.7")]
    [InlineData("<svg xmlns=")]
    [InlineData("RIFF....WAVE")]
    [InlineData("GIF")]
    public void Anything_else_is_not_a_picture(string text) =>
        MediaEndpoints.ImageType(System.Text.Encoding.ASCII.GetBytes(text)).ShouldBeNull();

    [Fact]
    public void A_picture_needs_a_description()
    {
        MediaEndpoints.HasImageWithoutAlt("Hi\n\n![](/public/media/a.png)").ShouldBeTrue();
        MediaEndpoints.HasImageWithoutAlt("![  ](/public/media/a.png)").ShouldBeTrue();
        MediaEndpoints.HasImageWithoutAlt("![Our office](/public/media/a.png)").ShouldBeFalse();
        MediaEndpoints.HasImageWithoutAlt("[a link](https://acme.test)").ShouldBeFalse();
    }

    [Fact]
    public void Emails_load_our_pictures_from_the_public_address_at_the_column_width()
    {
        var html = EmailHtml.Body(
            "![Team lunch](/public/media/0123456789abcdef0123456789abcdef.png?size=1200x800)\n\n![Hotlinked](http://elsewhere.test/a.png)",
            root: "https://jobs.acme.test/"
        );
        html.ShouldContain(
            "src=\"https://jobs.acme.test/public/media/0123456789abcdef0123456789abcdef.png?size=1200x800\""
        );
        html.ShouldContain("alt=\"Team lunch\"");
        // 1200x800 scaled to the 512px column keeps its shape.
        html.ShouldContain("width=\"512\"");
        html.ShouldContain("height=\"341\"");
        html.ShouldContain("max-width:100%");
        // Pictures from anywhere else over plain http are dropped.
        html.ShouldNotContain("elsewhere.test");

        // In the app's own preview there is no root, so the address stays relative.
        EmailHtml
            .Body("![Logo](/public/media/0123456789abcdef0123456789abcdef.jpg)")
            .ShouldContain("src=\"/public/media/0123456789abcdef0123456789abcdef.jpg\"");

        EmailHtml
            .PlainText(
                "Look: ![Team lunch](/public/media/a.png?size=1x1) and [site](https://acme.test)"
            )
            .ShouldBe("Look: Team lunch and site (https://acme.test)");
    }

    [Fact]
    public void Code_blocks_reach_emails_as_preformatted_text() =>
        EmailHtml
            .Body("```python\nprint(\"hi\")\n```")
            .ShouldContain("<pre style=\"margin:0 0 16px");
}
