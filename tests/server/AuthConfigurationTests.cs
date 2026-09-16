using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using MyThorneAI.Ats.Api.Auth;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class AuthConfigurationTests
{
    [Fact]
    public void Production_requires_complete_oidc_configuration()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Mode"] = "Oidc",
            ["Auth:Authority"] = "",
            ["Auth:ClientId"] = "",
            ["Auth:ClientSecret"] = ""
        }).Build();

        var exception = Should.Throw<InvalidOperationException>(() =>
            new ServiceCollection().AddAtsAuthentication(configuration, new TestEnvironment(Environments.Production)));
        exception.Message.ShouldContain("OIDC configuration is incomplete");
    }

    [Theory]
    [InlineData("http://identity.example.com")]
    [InlineData("not-a-url")]
    public void Production_requires_an_https_oidc_authority(string authority)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Mode"] = "Oidc",
            ["Auth:Authority"] = authority,
            ["Auth:ClientId"] = "ats",
            ["Auth:ClientSecret"] = "secret"
        }).Build();

        var exception = Should.Throw<InvalidOperationException>(() =>
            new ServiceCollection().AddAtsAuthentication(configuration, new TestEnvironment(Environments.Production)));
        exception.Message.ShouldContain("absolute HTTPS URL");
    }

    [Fact]
    public void Development_authentication_is_rejected_in_production()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Auth:Mode"] = "Development"
        }).Build();

        var exception = Should.Throw<InvalidOperationException>(() =>
            new ServiceCollection().AddAtsAuthentication(configuration, new TestEnvironment(Environments.Production)));
        exception.Message.ShouldContain("cannot be enabled");
    }

    private sealed class TestEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "tests";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
