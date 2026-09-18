namespace MyThorneAI.Ats.Api.Integrations;

public sealed class IntegrationOptions
{
    public const string SectionName = "Integrations";
    public string Provider { get; set; } = "None";
    public Microsoft365Options Microsoft365 { get; set; } = new();
    public GoogleWorkspaceOptions GoogleWorkspace { get; set; } = new();

    public string NormalizedProvider =>
        (Provider ?? "").Trim().ToLowerInvariant() switch
        {
            "microsoft365" or "microsoft" => "Microsoft365",
            "googleworkspace" or "google" => "GoogleWorkspace",
            "none" or "" => "None",
            _ => throw new InvalidOperationException(
                "Integrations:Provider must be None, Microsoft365, or GoogleWorkspace."
            ),
        };

    public void Validate()
    {
        switch (NormalizedProvider)
        {
            case "Microsoft365":
                Require(Microsoft365.TenantId, "Integrations:Microsoft365:TenantId");
                Require(Microsoft365.ClientId, "Integrations:Microsoft365:ClientId");
                Require(Microsoft365.ClientSecret, "Integrations:Microsoft365:ClientSecret");
                Require(Microsoft365.SenderUserId, "Integrations:Microsoft365:SenderUserId");
                break;
            case "GoogleWorkspace":
                Require(
                    GoogleWorkspace.ImpersonatedUser,
                    "Integrations:GoogleWorkspace:ImpersonatedUser"
                );
                if (
                    string.IsNullOrWhiteSpace(GoogleWorkspace.ServiceAccountJsonPath)
                    && string.IsNullOrWhiteSpace(GoogleWorkspace.ServiceAccountJsonBase64)
                )
                    throw new InvalidOperationException(
                        "Configure either Integrations:GoogleWorkspace:ServiceAccountJsonPath or ServiceAccountJsonBase64."
                    );
                if (
                    !string.IsNullOrWhiteSpace(GoogleWorkspace.ServiceAccountJsonPath)
                    && !File.Exists(GoogleWorkspace.ServiceAccountJsonPath)
                )
                    throw new InvalidOperationException(
                        "The configured Google Workspace service-account file does not exist."
                    );
                if (!string.IsNullOrWhiteSpace(GoogleWorkspace.ServiceAccountJsonBase64))
                {
                    try
                    {
                        Convert.FromBase64String(GoogleWorkspace.ServiceAccountJsonBase64);
                    }
                    catch (FormatException exception)
                    {
                        throw new InvalidOperationException(
                            "Integrations:GoogleWorkspace:ServiceAccountJsonBase64 is not valid base64.",
                            exception
                        );
                    }
                }
                break;
        }
    }

    private static void Require(string? value, string key)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new InvalidOperationException(
                $"{key} is required for the selected integration provider."
            );
    }
}

public sealed class Microsoft365Options
{
    public string TenantId { get; set; } = "";
    public string ClientId { get; set; } = "";
    public string ClientSecret { get; set; } = "";
    public string SenderUserId { get; set; } = "";
    public bool CreateOnlineMeetings { get; set; } = true;
}

public sealed class GoogleWorkspaceOptions
{
    public string ImpersonatedUser { get; set; } = "";
    public string CalendarId { get; set; } = "primary";
    public string ServiceAccountJsonPath { get; set; } = "";
    public string ServiceAccountJsonBase64 { get; set; } = "";
    public bool CreateOnlineMeetings { get; set; } = true;
}
