using Microsoft.Extensions.Configuration;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class LocalDotEnvConfiguration
{
    public static void Add(ConfigurationManager configuration, string contentRootPath)
    {
        var path = Path.GetFullPath(Path.Combine(contentRootPath, "..", "..", ".env"));
        if (!File.Exists(path))
            return;

        var values = File.ReadLines(path)
            .Select(line => line.Trim())
            .Where(line => line.Length > 0 && !line.StartsWith('#'))
            .Select(line => line.Split('=', 2))
            .Where(parts => parts.Length == 2)
            .ToDictionary(
                parts => parts[0].Trim(),
                parts => parts[1].Trim().Trim('"'),
                StringComparer.OrdinalIgnoreCase
            );
        var settings = new Dictionary<string, string?>
        {
            ["Auth:Mode"] = Get(values, "AUTH_MODE"),
            ["Auth:Authority"] = Get(values, "AUTH_AUTHORITY"),
            ["Auth:ClientId"] = Get(values, "AUTH_CLIENT_ID"),
            ["Auth:ClientSecret"] = Get(values, "AUTH_CLIENT_SECRET"),
            ["Auth:AllowedEmailDomains"] = Get(values, "AUTH_ALLOWED_EMAIL_DOMAINS"),
            ["Auth:WorkOS:ApiKey"] = Get(values, "WORKOS_API_KEY"),
            ["Auth:WorkOS:ClientId"] = Get(values, "WORKOS_CLIENT_ID"),
            ["Auth:WorkOS:RedirectUri"] = Get(values, "WORKOS_REDIRECT_URI"),
            ["Bootstrap:AdminEmail"] = Get(values, "BOOTSTRAP_ADMIN_EMAIL"),
            ["Bootstrap:AdminName"] = Get(values, "BOOTSTRAP_ADMIN_NAME"),
            ["Integrations:Provider"] = Get(values, "INTEGRATIONS_PROVIDER"),
            ["Integrations:Microsoft365:TenantId"] = Get(values, "MICROSOFT365_TENANT_ID"),
            ["Integrations:Microsoft365:ClientId"] = Get(values, "MICROSOFT365_CLIENT_ID"),
            ["Integrations:Microsoft365:ClientSecret"] = Get(values, "MICROSOFT365_CLIENT_SECRET"),
            ["Integrations:Microsoft365:SenderUserId"] = Get(values, "MICROSOFT365_SENDER_USER_ID"),
            ["Integrations:Microsoft365:CreateOnlineMeetings"] = Get(values, "MICROSOFT365_CREATE_ONLINE_MEETINGS"),
            ["Integrations:GoogleWorkspace:ImpersonatedUser"] = Get(values, "GOOGLE_WORKSPACE_IMPERSONATED_USER"),
            ["Integrations:GoogleWorkspace:CalendarId"] = Get(values, "GOOGLE_WORKSPACE_CALENDAR_ID"),
            ["Integrations:GoogleWorkspace:ServiceAccountJsonPath"] = Get(values, "GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_PATH"),
            ["Integrations:GoogleWorkspace:ServiceAccountJsonBase64"] = Get(values, "GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64"),
            ["Integrations:GoogleWorkspace:CreateOnlineMeetings"] = Get(values, "GOOGLE_WORKSPACE_CREATE_ONLINE_MEETINGS"),
            ["Integrations:CalendarOAuth:GoogleClientId"] = Get(values, "CALENDAR_OAUTH_GOOGLE_CLIENT_ID"),
            ["Integrations:CalendarOAuth:GoogleClientSecret"] = Get(values, "CALENDAR_OAUTH_GOOGLE_CLIENT_SECRET"),
            ["Integrations:CalendarOAuth:MicrosoftClientId"] = Get(values, "CALENDAR_OAUTH_MICROSOFT_CLIENT_ID"),
            ["Integrations:CalendarOAuth:MicrosoftClientSecret"] = Get(values, "CALENDAR_OAUTH_MICROSOFT_CLIENT_SECRET"),
            ["Integrations:CalendarOAuth:MicrosoftTenantId"] = Get(values, "CALENDAR_OAUTH_MICROSOFT_TENANT_ID"),
            ["Integrations:CalendarOAuth:RedirectUri"] = Get(values, "CALENDAR_OAUTH_REDIRECT_URI"),
            ["Resend:ApiKey"] = Get(values, "RESEND_API_KEY"),
            ["Resend:From"] = Get(values, "RESEND_FROM"),
            ["OpenAI:ApiKey"] = Get(values, "OPENAI_API_KEY"),
            ["OpenAI:Model"] = Get(values, "OPENAI_MODEL"),
        };
        settings["ConnectionStrings:AtsDatabase"] =
            $"Host=localhost;Port={Get(values, "POSTGRES_HOST_PORT") ?? "55433"};Database={Get(values, "POSTGRES_DB") ?? "internal_ats"};Username={Get(values, "POSTGRES_USER") ?? "ats"};Password={Get(values, "POSTGRES_PASSWORD") ?? "ats-local-only"}";
        configuration.AddInMemoryCollection(settings.Where(pair => pair.Value is not null));
    }

    private static string? Get(IReadOnlyDictionary<string, string> values, string key) =>
        values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value : null;
}
