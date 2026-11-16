using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Options;

namespace MyThorneAI.Ats.Api.Integrations;

public sealed record CalendarOAuthToken(
    string AccessToken,
    string? RefreshToken,
    int ExpiresInSeconds,
    string? AccountEmail = null
);

public sealed record CalendarOAuthState(string Provider, string UserEmail);

public sealed class CalendarOAuthService(
    IHttpClientFactory clients,
    IOptions<IntegrationOptions> options,
    IDataProtectionProvider protection
)
{
    private readonly CalendarOAuthOptions _options = options.Value.CalendarOAuth;
    private readonly ITimeLimitedDataProtector _stateProtector = protection
        .CreateProtector("Internal.Ats.CalendarOAuth.State")
        .ToTimeLimitedDataProtector();

    /// <summary>
    /// Tells Google to forget the grant, so a deleted connection cannot be used again. Microsoft has
    /// no per-app revoke for a person's grant; deleting our copy of the tokens is all there is.
    /// Best effort: a failure here never keeps a connection someone asked to remove.
    /// </summary>
    public async Task<bool> RevokeAsync(Domain.CalendarConnection connection, CancellationToken ct)
    {
        if (!connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase))
            return false;
        try
        {
            var tokens = protection.CreateProtector("Internal.Ats.CalendarConnection.Token");
            var token = tokens.Unprotect(connection.RefreshToken ?? connection.AccessToken);
            using var response = await clients
                .CreateClient()
                .PostAsync(
                    "https://oauth2.googleapis.com/revoke",
                    new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = token }),
                    ct
                );
            return response.IsSuccessStatusCode;
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            return false;
        }
    }

    public string CreateState(CalendarOAuthState state) =>
        _stateProtector.Protect(JsonSerializer.Serialize(state), TimeSpan.FromMinutes(10));

    public CalendarOAuthState ReadState(string value) =>
        JsonSerializer.Deserialize<CalendarOAuthState>(_stateProtector.Unprotect(value))
        ?? throw new InvalidOperationException("Calendar OAuth state is invalid.");

    public string AuthorizationUrl(string provider, string state)
    {
        var normalized = NormalizeProvider(provider);
        var parameters =
            normalized == "Google"
                ? new Dictionary<string, string?>
                {
                    ["client_id"] = Require(
                        _options.GoogleClientId,
                        "CalendarOAuth:GoogleClientId"
                    ),
                    ["redirect_uri"] = Require(_options.RedirectUri, "CalendarOAuth:RedirectUri"),
                    ["response_type"] = "code",
                    ["scope"] =
                        "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly",
                    ["access_type"] = "offline",
                    ["prompt"] = "consent",
                    ["state"] = state,
                }
                : new Dictionary<string, string?>
                {
                    ["client_id"] = Require(
                        _options.MicrosoftClientId,
                        "CalendarOAuth:MicrosoftClientId"
                    ),
                    ["redirect_uri"] = Require(_options.RedirectUri, "CalendarOAuth:RedirectUri"),
                    ["response_type"] = "code",
                    ["response_mode"] = "query",
                    ["scope"] = "openid email offline_access User.Read Calendars.ReadWrite",
                    ["state"] = state,
                };
        var endpoint =
            normalized == "Google"
                ? "https://accounts.google.com/o/oauth2/v2/auth"
                : $"https://login.microsoftonline.com/{Uri.EscapeDataString(_options.MicrosoftTenantId)}/oauth2/v2.0/authorize";
        return QueryHelpers.AddQueryString(endpoint, parameters);
    }

    public async Task<CalendarOAuthToken> ExchangeCodeAsync(
        string provider,
        string code,
        CancellationToken ct
    )
    {
        var normalized = NormalizeProvider(provider);
        var form =
            normalized == "Google"
                ? new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = Require(
                        _options.GoogleClientId,
                        "CalendarOAuth:GoogleClientId"
                    ),
                    ["client_secret"] = Require(
                        _options.GoogleClientSecret,
                        "CalendarOAuth:GoogleClientSecret"
                    ),
                    ["redirect_uri"] = Require(_options.RedirectUri, "CalendarOAuth:RedirectUri"),
                    ["grant_type"] = "authorization_code",
                }
                : new Dictionary<string, string>
                {
                    ["code"] = code,
                    ["client_id"] = Require(
                        _options.MicrosoftClientId,
                        "CalendarOAuth:MicrosoftClientId"
                    ),
                    ["client_secret"] = Require(
                        _options.MicrosoftClientSecret,
                        "CalendarOAuth:MicrosoftClientSecret"
                    ),
                    ["redirect_uri"] = Require(_options.RedirectUri, "CalendarOAuth:RedirectUri"),
                    ["grant_type"] = "authorization_code",
                    ["scope"] = "openid email offline_access User.Read Calendars.ReadWrite",
                };
        var endpoint =
            normalized == "Google"
                ? "https://oauth2.googleapis.com/token"
                : $"https://login.microsoftonline.com/{Uri.EscapeDataString(_options.MicrosoftTenantId)}/oauth2/v2.0/token";
        using var response = await clients
            .CreateClient()
            .PostAsync(endpoint, new FormUrlEncodedContent(form), ct);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStreamAsync(ct));
        var root = json.RootElement;
        return new CalendarOAuthToken(
            root.GetProperty("access_token").GetString()!,
            root.TryGetProperty("refresh_token", out var refresh) ? refresh.GetString() : null,
            root.TryGetProperty("expires_in", out var expires) ? expires.GetInt32() : 3600,
            root.TryGetProperty("id_token", out var idToken)
                ? AccountEmail(idToken.GetString())
                : null
        );
    }

    /// <summary>
    /// The connected account's email from the ID token. It came straight from the provider's token
    /// endpoint over TLS, so reading its claims without checking the signature is allowed (OpenID
    /// Connect Core 3.1.3.7).
    /// </summary>
    public static string? AccountEmail(string? idToken)
    {
        var parts = idToken?.Split('.');
        if (parts is not { Length: 3 })
            return null;
        try
        {
            using var claims = JsonDocument.Parse(WebEncoders.Base64UrlDecode(parts[1]));
            foreach (var name in new[] { "email", "preferred_username", "upn" })
                if (
                    claims.RootElement.TryGetProperty(name, out var value)
                    && value.GetString() is { } email
                    && email.Contains('@')
                )
                    return email.ToLowerInvariant();
        }
        catch (Exception exception) when (exception is FormatException or JsonException) { }
        return null;
    }

    private static string NormalizeProvider(string provider) =>
        provider.Trim().ToLowerInvariant() switch
        {
            "google" or "googleworkspace" => "Google",
            "microsoft" or "microsoft365" => "Microsoft",
            _ => throw new InvalidOperationException(
                "Calendar provider must be Google or Microsoft."
            ),
        };

    private static string Require(string value, string key) =>
        string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"{key} is not configured.")
            : value;
}
