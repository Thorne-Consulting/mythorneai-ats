using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Integrations;

public sealed record BusyWindow(DateTimeOffset StartsAt, DateTimeOffset EndsAt)
{
    public bool Overlaps(DateTimeOffset start, DateTimeOffset end) =>
        StartsAt < end && EndsAt > start;
}

public sealed record ExternalCalendarEvent(
    DateTimeOffset? StartsAt,
    DateTimeOffset? EndsAt,
    string? MeetingLink,
    bool Cancelled,
    IReadOnlyDictionary<string, string>? Responses = null
);

public enum ExternalLookupState
{
    Found,
    NotFound,

    /// <summary>The organizer has no calendar connection, so nothing can be known about the event.</summary>
    NoConnection,
}

public sealed record ExternalCalendarLookup(
    ExternalLookupState State,
    ExternalCalendarEvent? Event = null
);

public enum ExternalChange
{
    None,
    Disconnected,
    Cancelled,
    Moved,
}

/// <summary>What each invited person answered, in one vocabulary: accepted, declined, tentative or needsAction.</summary>
public static class CalendarResponses
{
    public static IReadOnlyDictionary<string, string> Google(JsonElement root) =>
        root.TryGetProperty("attendees", out var attendees)
        && attendees.ValueKind == JsonValueKind.Array
            ? attendees
                .EnumerateArray()
                .Where(x =>
                    x.TryGetProperty("email", out _) && x.TryGetProperty("responseStatus", out _)
                )
                .GroupBy(x => x.GetProperty("email").GetString()!.ToLowerInvariant())
                .ToDictionary(
                    x => x.Key,
                    x => x.First().GetProperty("responseStatus").GetString() ?? "needsAction"
                )
            : new Dictionary<string, string>();

    public static IReadOnlyDictionary<string, string> Microsoft(JsonElement root) =>
        root.TryGetProperty("attendees", out var attendees)
        && attendees.ValueKind == JsonValueKind.Array
            ? attendees
                .EnumerateArray()
                .Where(x =>
                    x.TryGetProperty("emailAddress", out var address)
                    && address.TryGetProperty("address", out _)
                    && x.TryGetProperty("status", out var status)
                    && status.TryGetProperty("response", out _)
                )
                .GroupBy(x =>
                    x.GetProperty("emailAddress")
                        .GetProperty("address")
                        .GetString()!
                        .ToLowerInvariant()
                )
                .ToDictionary(
                    x => x.Key,
                    x =>
                        x.First().GetProperty("status").GetProperty("response").GetString() switch
                        {
                            "accepted" or "organizer" => "accepted",
                            "declined" => "declined",
                            "tentativelyAccepted" => "tentative",
                            _ => "needsAction",
                        }
                )
            : new Dictionary<string, string>();
}

public static class CalendarSync
{
    /// <summary>
    /// What a read-back of the organizer's calendar means for the interview. A missing connection is
    /// never a cancellation: we simply cannot see the event any more.
    /// </summary>
    public static ExternalChange Classify(
        ExternalCalendarLookup lookup,
        DateTimeOffset startsAt,
        DateTimeOffset endsAt
    ) =>
        lookup.State switch
        {
            ExternalLookupState.NoConnection => ExternalChange.Disconnected,
            ExternalLookupState.NotFound => ExternalChange.Cancelled,
            _ when lookup.Event is null => ExternalChange.None,
            _ when lookup.Event.Cancelled => ExternalChange.Cancelled,
            _ when lookup.Event.StartsAt is { } start
                    && lookup.Event.EndsAt is { } end
                    && (start != startsAt || end != endsAt) => ExternalChange.Moved,
            _ => ExternalChange.None,
        };
}

/// <summary>The organizer's calendar connection is gone, so the event cannot be reached.</summary>
public sealed class CalendarDisconnectedException(string message)
    : InvalidOperationException(message);

public interface IUserCalendarService
{
    /// <summary>Busy times from the person's connected calendar, or null when they have not connected one.</summary>
    Task<IReadOnlyList<BusyWindow>?> ReadBusyAsync(
        string email,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken
    );

    /// <summary>
    /// Creates the event on the organizer's calendar, or updates the existing one in place. The
    /// organizer stays the same person while they stay connected.
    /// </summary>
    Task<CalendarDeliveryResult> UpsertEventAsync(
        OutboundCalendarEvent calendarEvent,
        IReadOnlyCollection<string> interviewerEmails,
        CancellationToken cancellationToken
    );

    Task CancelEventAsync(
        string externalEventId,
        string organizerEmail,
        CancellationToken cancellationToken
    );

    Task<ExternalCalendarLookup> GetEventAsync(
        string externalEventId,
        string organizerEmail,
        CancellationToken cancellationToken
    );
}

public sealed class UserCalendarService(
    AtsDbContext db,
    IHttpClientFactory clients,
    IDataProtectionProvider protection,
    IOptions<IntegrationOptions> options,
    ILogger<UserCalendarService> logger
) : IUserCalendarService
{
    private readonly CalendarOAuthOptions oauth = options.Value.CalendarOAuth;
    private readonly IDataProtector tokenProtector = protection.CreateProtector(
        "Internal.Ats.CalendarConnection.Token"
    );

    public async Task<IReadOnlyList<BusyWindow>?> ReadBusyAsync(
        string email,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken
    )
    {
        var connection = await db.CalendarConnections.SingleOrDefaultAsync(
            x => x.UserEmail == email,
            cancellationToken
        );
        return connection is null
            ? null
            : await ReadBusyWindowsAsync(connection, from, to, cancellationToken);
    }

    public async Task<CalendarDeliveryResult> UpsertEventAsync(
        OutboundCalendarEvent calendarEvent,
        IReadOnlyCollection<string> interviewerEmails,
        CancellationToken cancellationToken
    )
    {
        var connections = await LoadConnectionsAsync(
            interviewerEmails.Append(calendarEvent.OrganizerEmail ?? "").ToArray(),
            cancellationToken
        );
        // Keep the organizer who already holds the event; otherwise the first connected interviewer.
        var keep =
            calendarEvent.ExternalEventId is not null
            && calendarEvent.OrganizerEmail is not null
            && connections.ContainsKey(calendarEvent.OrganizerEmail);
        // A new event goes to someone whose calendar can make the chosen video room, when anyone can.
        var wanted = calendarEvent.MeetingType switch
        {
            MeetingTypes.GoogleMeet => "Google",
            MeetingTypes.Teams => "Microsoft",
            _ => null,
        };
        var organizer = keep
            ? calendarEvent.OrganizerEmail!
            : interviewerEmails.FirstOrDefault(email =>
                connections.TryGetValue(email, out var c)
                && (wanted is null || (IsGoogle(c) ? "Google" : "Microsoft") == wanted)
            )
                ?? interviewerEmails.FirstOrDefault(connections.ContainsKey)
                ?? throw new CalendarDisconnectedException(
                    "No interviewer on this interview has a connected calendar."
                );
        var connection = connections[organizer];
        var google = IsGoogle(connection);
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        var createMeeting = calendarEvent.CreatesMeetingOn(google ? "Google" : "Microsoft");
        var eventPath = keep ? $"/{Uri.EscapeDataString(calendarEvent.ExternalEventId!)}" : "";
        using var request = new HttpRequestMessage(
            keep ? HttpMethod.Patch : HttpMethod.Post,
            google
                ? $"https://www.googleapis.com/calendar/v3/calendars/primary/events{eventPath}?sendUpdates=all&conferenceDataVersion=1"
                : $"https://graph.microsoft.com/v1.0/me/events{eventPath}"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var payload = google
            ? GoogleEvent(calendarEvent, createMeeting)
            : MicrosoftEvent(calendarEvent, createMeeting);
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json"
        );
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var json = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken
        );
        var root = json.RootElement;
        var eventId = root.GetProperty("id").GetString();
        if (string.IsNullOrWhiteSpace(eventId))
            throw new InvalidOperationException("Calendar provider did not return an event id.");
        var meetingLink = google
            ? root.TryGetProperty("hangoutLink", out var hangout)
                ? hangout.GetString()
                : null
            : root.TryGetProperty("onlineMeeting", out var meeting)
            && meeting.ValueKind == JsonValueKind.Object
            && meeting.TryGetProperty("joinUrl", out var joinUrl)
                ? joinUrl.GetString()
                : null;
        return new(eventId, calendarEvent.ExistingMeetingLink ?? meetingLink, organizer);
    }

    public async Task CancelEventAsync(
        string externalEventId,
        string organizerEmail,
        CancellationToken cancellationToken
    )
    {
        var connection =
            await db.CalendarConnections.SingleOrDefaultAsync(
                x => x.UserEmail == organizerEmail,
                cancellationToken
            )
            ?? throw new CalendarDisconnectedException(
                $"{organizerEmail} disconnected their calendar, so the invite could not be removed."
            );
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Delete,
            IsGoogle(connection)
                ? $"https://www.googleapis.com/calendar/v3/calendars/primary/events/{Uri.EscapeDataString(externalEventId)}?sendUpdates=all"
                : $"https://graph.microsoft.com/v1.0/me/events/{Uri.EscapeDataString(externalEventId)}"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        if (
            !response.IsSuccessStatusCode
            && response.StatusCode
                is not (System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.Gone)
        )
            response.EnsureSuccessStatusCode();
    }

    public async Task<ExternalCalendarLookup> GetEventAsync(
        string externalEventId,
        string organizerEmail,
        CancellationToken cancellationToken
    )
    {
        var connection = await db.CalendarConnections.SingleOrDefaultAsync(
            x => x.UserEmail == organizerEmail,
            cancellationToken
        );
        if (connection is null)
            return new(ExternalLookupState.NoConnection);
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        var google = IsGoogle(connection);
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            google
                ? $"https://www.googleapis.com/calendar/v3/calendars/primary/events/{Uri.EscapeDataString(externalEventId)}"
                : $"https://graph.microsoft.com/v1.0/me/events/{Uri.EscapeDataString(externalEventId)}"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        if (
            response.StatusCode
            is System.Net.HttpStatusCode.NotFound
                or System.Net.HttpStatusCode.Gone
        )
            return new(ExternalLookupState.NotFound);
        response.EnsureSuccessStatusCode();
        using var json = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken
        );
        var root = json.RootElement;
        if (google)
            return new(
                ExternalLookupState.Found,
                new(
                    ReadDate(root, "start", "dateTime"),
                    ReadDate(root, "end", "dateTime"),
                    root.TryGetProperty("hangoutLink", out var hangout)
                        ? hangout.GetString()
                        : null,
                    root.TryGetProperty("status", out var status)
                        && status.GetString() == "cancelled",
                    CalendarResponses.Google(root)
                )
            );
        return new(
            ExternalLookupState.Found,
            new(
                ReadGraphDate(root, "start"),
                ReadGraphDate(root, "end"),
                root.TryGetProperty("onlineMeeting", out var meeting)
                && meeting.ValueKind == JsonValueKind.Object
                && meeting.TryGetProperty("joinUrl", out var joinUrl)
                    ? joinUrl.GetString()
                    : null,
                root.TryGetProperty("isCancelled", out var cancelledValue)
                    && cancelledValue.GetBoolean(),
                CalendarResponses.Microsoft(root)
            )
        );
    }

    private static bool IsGoogle(CalendarConnection connection) =>
        connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase);

    private async Task<Dictionary<string, CalendarConnection>> LoadConnectionsAsync(
        IReadOnlyCollection<string> emails,
        CancellationToken cancellationToken
    ) =>
        await db
            .CalendarConnections.Where(x => emails.Contains(x.UserEmail))
            .ToDictionaryAsync(
                x => x.UserEmail,
                StringComparer.OrdinalIgnoreCase,
                cancellationToken
            );

    private async Task<IReadOnlyList<BusyWindow>> ReadBusyWindowsAsync(
        CalendarConnection connection,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken
    )
    {
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? "https://www.googleapis.com/calendar/v3/freeBusy"
                : "https://graph.microsoft.com/v1.0/me/calendar/getSchedule"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var payload = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? (object)
                new
                {
                    timeMin = from,
                    timeMax = to,
                    items = new[] { new { id = connection.CalendarId } },
                }
            : new
            {
                schedules = new[] { connection.ProviderAccountEmail ?? connection.UserEmail },
                startTime = new { dateTime = from.UtcDateTime.ToString("O"), timeZone = "UTC" },
                endTime = new { dateTime = to.UtcDateTime.ToString("O"), timeZone = "UTC" },
                availabilityViewInterval = 15,
            };
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json"
        );
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();
        using var json = await JsonDocument.ParseAsync(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken
        );
        return connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? ParseGoogleBusy(json.RootElement)
            : ParseMicrosoftBusy(json.RootElement);
    }

    private async Task<string> GetAccessTokenAsync(
        CalendarConnection connection,
        CancellationToken cancellationToken
    )
    {
        var accessToken = tokenProtector.Unprotect(connection.AccessToken);
        if (connection.AccessTokenExpiresAt > DateTimeOffset.UtcNow.AddMinutes(1))
            return accessToken;
        if (string.IsNullOrWhiteSpace(connection.RefreshToken))
            throw new InvalidOperationException(
                $"{connection.UserEmail} must reconnect their calendar."
            );

        var refreshToken = tokenProtector.Unprotect(connection.RefreshToken);
        var form = new Dictionary<string, string>
        {
            ["client_id"] = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? oauth.GoogleClientId
                : oauth.MicrosoftClientId,
            ["client_secret"] = connection.Provider.Equals(
                "Google",
                StringComparison.OrdinalIgnoreCase
            )
                ? oauth.GoogleClientSecret
                : oauth.MicrosoftClientSecret,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
        };
        var endpoint = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? "https://oauth2.googleapis.com/token"
            : $"https://login.microsoftonline.com/{Uri.EscapeDataString(oauth.MicrosoftTenantId)}/oauth2/v2.0/token";
        using var response = await clients
            .CreateClient()
            .PostAsync(endpoint, new FormUrlEncodedContent(form), cancellationToken);
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<RefreshResponse>(cancellationToken);
        if (token?.AccessToken is null)
            throw new InvalidOperationException(
                "Calendar provider did not return a refreshed token."
            );
        connection.AccessToken = tokenProtector.Protect(token.AccessToken);
        connection.AccessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(token.ExpiresIn);
        connection.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Refreshed calendar token for {UserEmail}.", connection.UserEmail);
        return token.AccessToken;
    }

    private static IReadOnlyList<BusyWindow> ParseGoogleBusy(JsonElement root) =>
        root.GetProperty("calendars")
            .EnumerateObject()
            .SelectMany(calendar =>
                calendar
                    .Value.GetProperty("busy")
                    .EnumerateArray()
                    .Select(item => new BusyWindow(
                        item.GetProperty("start").GetDateTimeOffset(),
                        item.GetProperty("end").GetDateTimeOffset()
                    ))
            )
            .ToArray();

    private static IReadOnlyList<BusyWindow> ParseMicrosoftBusy(JsonElement root) =>
        root.GetProperty("value")
            .EnumerateArray()
            .SelectMany(schedule =>
                schedule
                    .GetProperty("scheduleItems")
                    .EnumerateArray()
                    .Select(item => new BusyWindow(
                        ReadGraphDate(item, "start") ?? default,
                        ReadGraphDate(item, "end") ?? default
                    ))
            )
            .ToArray();

    // Graph returns {"dateTime":"2026-11-14T15:00:00.0000000","timeZone":"UTC"} unless asked otherwise.
    private static DateTimeOffset? ReadGraphDate(JsonElement root, string parent) =>
        root.TryGetProperty(parent, out var value)
        && value.TryGetProperty("dateTime", out var date)
        && DateTime.TryParse(date.GetString(), out var parsed)
            ? TimeZoneInfo.ConvertTimeToUtc(
                DateTime.SpecifyKind(parsed, DateTimeKind.Unspecified),
                TimeZoneInfoOrUtc(value)
            )
            : null;

    private static TimeZoneInfo TimeZoneInfoOrUtc(JsonElement value) =>
        value.TryGetProperty("timeZone", out var zone)
        && TimeZoneInfo.TryFindSystemTimeZoneById(zone.GetString() ?? "", out var found)
            ? found
            : TimeZoneInfo.Utc;

    private static DateTimeOffset? ReadDate(JsonElement root, string parent, string property) =>
        root.TryGetProperty(parent, out var value)
        && value.TryGetProperty(property, out var date)
        && DateTimeOffset.TryParse(date.GetString(), out var parsed)
            ? parsed
            : null;

    private static Dictionary<string, object?> GoogleEvent(
        OutboundCalendarEvent calendarEvent,
        bool createMeeting
    )
    {
        var payload = new Dictionary<string, object?>
        {
            ["summary"] = calendarEvent.Title,
            ["description"] = calendarEvent.Description,
            ["start"] = new
            {
                dateTime = calendarEvent.StartsAt,
                timeZone = calendarEvent.TimeZone,
            },
            ["end"] = new { dateTime = calendarEvent.EndsAt, timeZone = calendarEvent.TimeZone },
            ["attendees"] = calendarEvent
                .AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(email => new { email }),
            ["location"] = calendarEvent.Place,
        };
        // The same request id makes Google create one Meet room even if the call is retried.
        if (createMeeting)
            payload["conferenceData"] = new
            {
                createRequest = new
                {
                    requestId = calendarEvent.InterviewId.ToString("N"),
                    conferenceSolutionKey = new { type = "hangoutsMeet" },
                },
            };
        return payload;
    }

    private static Dictionary<string, object?> MicrosoftEvent(
        OutboundCalendarEvent calendarEvent,
        bool createMeeting
    )
    {
        var payload = new Dictionary<string, object?>
        {
            ["subject"] = calendarEvent.Title,
            ["body"] = new { contentType = "text", content = calendarEvent.Description },
            ["start"] = new
            {
                dateTime = calendarEvent.StartsAt.UtcDateTime.ToString("O"),
                timeZone = "UTC",
            },
            ["end"] = new
            {
                dateTime = calendarEvent.EndsAt.UtcDateTime.ToString("O"),
                timeZone = "UTC",
            },
            ["attendees"] = calendarEvent
                .AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(email => new { emailAddress = new { address = email }, type = "required" }),
        };
        if (createMeeting)
        {
            payload["isOnlineMeeting"] = true;
            payload["onlineMeetingProvider"] = "teamsForBusiness";
        }
        else if (calendarEvent.Place is not null)
            payload["location"] = new
            {
                displayName = calendarEvent.Place,
                locationUri = calendarEvent.ExistingMeetingLink,
            };
        return payload;
    }

    private sealed record RefreshResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn = 3600
    );
}
