using MyThorneAI.Ats.Api.Integrations;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class IntegrationOptionsTests
{
    [Fact]
    public void Microsoft_365_requires_all_application_credentials()
    {
        var options = new IntegrationOptions { Provider = "Microsoft365" };
        var exception = Should.Throw<InvalidOperationException>(options.Validate);
        exception.Message.ShouldContain("TenantId");
    }

    [Fact]
    public void Complete_Microsoft_365_configuration_is_valid()
    {
        var options = new IntegrationOptions
        {
            Provider = "Microsoft365",
            Microsoft365 = new Microsoft365Options
            {
                TenantId = "tenant",
                ClientId = "client",
                ClientSecret = "secret",
                SenderUserId = "recruiting@example.com",
            },
        };
        Should.NotThrow(options.Validate);
        options.NormalizedProvider.ShouldBe("Microsoft365");
    }

    [Fact]
    public void Google_Workspace_requires_domain_delegation_credentials()
    {
        var options = new IntegrationOptions
        {
            Provider = "GoogleWorkspace",
            GoogleWorkspace = new GoogleWorkspaceOptions
            {
                ImpersonatedUser = "recruiting@example.com",
            },
        };
        var exception = Should.Throw<InvalidOperationException>(options.Validate);
        exception.Message.ShouldContain("ServiceAccountJsonPath");
    }

    [Fact]
    public void Google_Workspace_rejects_invalid_base64_credentials()
    {
        var options = new IntegrationOptions
        {
            Provider = "GoogleWorkspace",
            GoogleWorkspace = new GoogleWorkspaceOptions
            {
                ImpersonatedUser = "recruiting@example.com",
                ServiceAccountJsonBase64 = "not-base64",
            },
        };

        var exception = Should.Throw<InvalidOperationException>(options.Validate);
        exception.Message.ShouldContain("not valid base64");
    }
}
