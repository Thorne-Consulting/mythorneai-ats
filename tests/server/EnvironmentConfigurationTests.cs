using Microsoft.Extensions.Configuration;
using MyThorneAI.Ats.Api.Infrastructure;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class EnvironmentConfigurationTests
{
    [Fact]
    public void Plain_names_from_the_environment_become_settings()
    {
        Environment.SetEnvironmentVariable("POSTGRES_PASSWORD", "env-test-pw");
        Environment.SetEnvironmentVariable("S3_SECRET_KEY", "env-test-s3");
        Environment.SetEnvironmentVariable("SEED_SETS", "baseline");
        try
        {
            var configuration = new ConfigurationManager();
            LocalDotEnvConfiguration.AddFromEnvironment(configuration);

            Assert.Equal("env-test-s3", configuration["FileStorage:S3:SecretKey"]);
            Assert.Equal("baseline", configuration["Seed:Sets"]);
            Assert.Equal(
                "Host=database;Port=5432;Database=internal_ats;Username=ats;Password=env-test-pw",
                configuration.GetConnectionString("AtsDatabase")
            );
        }
        finally
        {
            Environment.SetEnvironmentVariable("POSTGRES_PASSWORD", null);
            Environment.SetEnvironmentVariable("S3_SECRET_KEY", null);
            Environment.SetEnvironmentVariable("SEED_SETS", null);
        }
    }
}
