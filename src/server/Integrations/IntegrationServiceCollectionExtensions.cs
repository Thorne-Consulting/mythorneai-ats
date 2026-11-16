using Microsoft.Extensions.Options;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Integrations;

public static class IntegrationServiceCollectionExtensions
{
    public static IServiceCollection AddWorkplaceIntegrations(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<IntegrationOptions>(
            configuration.GetSection(IntegrationOptions.SectionName)
        );
        services.AddSingleton<CalendarOAuthService>();
        services.AddScoped<IUserCalendarService, UserCalendarService>();
        // The interviews area's services ride along with the calendar wiring.
        services.AddScoped<AvailabilityService>();
        services.AddScoped<InterviewMailer>();
        services.AddHostedService<InterviewSweepWorker>();
        services.AddSingleton<Interviews.Recording.MediaTools>();
        services.AddHostedService<Interviews.Recording.RecordingWorker>();
        services.AddSingleton(sp =>
        {
            var options = sp.GetRequiredService<IOptions<IntegrationOptions>>().Value;
            options.Validate();
            return options;
        });
        services.AddSingleton<IWorkplaceIntegration>(sp =>
        {
            var options = sp.GetRequiredService<IntegrationOptions>();
            return options.NormalizedProvider switch
            {
                "Microsoft365" => new Microsoft365Integration(options),
                "GoogleWorkspace" => new GoogleWorkspaceIntegration(options),
                _ => new DisabledWorkplaceIntegration(),
            };
        });
        services.AddHostedService<IntegrationOutboxWorker>();
        return services;
    }
}
