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

public sealed record CalendarSlot(DateTimeOffset StartsAt, DateTimeOffset EndsAt);

public sealed record CalendarAvailability(
    IReadOnlyList<CalendarSlot> Slots,
    IReadOnlyList<string> MissingConnections
);

public interface IUserCalendarService
{
    Task<CalendarAvailability> FindCommonAvailabilityAsync(
        IReadOnlyCollection<string> interviewerEmails,
        DateTimeOffset from,
        DateTimeOffset to,
        TimeSpan duration,
        TimeSpan slotInterval,
        CancellationToken cancellationToken
    );

    Task<CalendarDeliveryResult> CreateEventAsync(
        OutboundCalendarEvent calendarEvent,
        IReadOnlyCollection<string> interviewerEmails,
        CancellationToken cancellationToken
    );

    Task CancelEventAsync(
        string externalEventId,
        string interviewerEmail,
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

    public async Task<CalendarAvailability> FindCommonAvailabilityAsync(
        IReadOnlyCollection<string> interviewerEmails,
        DateTimeOffset from,
        DateTimeOffset to,
        TimeSpan duration,
        TimeSpan slotInterval,
        CancellationToken cancellationToken
    )
    {
        if (interviewerEmails.Count == 0 || to <= from || duration <= TimeSpan.Zero)
            return new([], []);

        var connections = await LoadConnectionsAsync(interviewerEmails, cancellationToken);
        var missing = interviewerEmails
            .Where(email => !connections.ContainsKey(email))
            .Order(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (missing.Length > 0)
            return new([], missing);

        var busy = new List<BusyWindow>();
        foreach (var email in interviewerEmails)
        {
            var connection = connections[email];
            busy.AddRange(
                await ReadBusyWindowsAsync(connection, from, to, cancellationToken)
            );
        }

        var slots = new List<CalendarSlot>();
        for (var start = from; start.Add(duration) <= to; start = start.Add(slotInterval))
        {
            var end = start.Add(duration);
            if (busy.All(window => !window.Overlaps(start, end)))
                slots.Add(new(start, end));
        }

        return new(slots, []);
    }

    public async Task<CalendarDeliveryResult> CreateEventAsync(
        OutboundCalendarEvent calendarEvent,
        IReadOnlyCollection<string> interviewerEmails,
        CancellationToken cancellationToken
    )
    {
        var connections = await LoadConnectionsAsync(interviewerEmails, cancellationToken);
        var organizer = interviewerEmails.FirstOrDefault(email => connections.ContainsKey(email));
        if (organizer is null)
            throw new InvalidOperationException("Every interviewer must connect a calendar first.");

        var connection = connections[organizer];
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all"
                : "https://graph.microsoft.com/v1.0/me/events"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        var payload = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? GoogleEvent(calendarEvent)
            : MicrosoftEvent(calendarEvent);
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
        var meetingLink = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? root.TryGetProperty("hangoutLink", out var hangout) ? hangout.GetString() : null
            : root.TryGetProperty("onlineMeeting", out var meeting)
                && meeting.TryGetProperty("joinUrl", out var joinUrl)
                ? joinUrl.GetString()
                : null;
        return new(eventId, meetingLink ?? calendarEvent.ExistingMeetingLink);
    }

    public async Task CancelEventAsync(
        string externalEventId,
        string interviewerEmail,
        CancellationToken cancellationToken
    )
    {
        var connection = await db.CalendarConnections.SingleOrDefaultAsync(
            x => x.UserEmail == interviewerEmail,
            cancellationToken
        );
        if (connection is null)
            return;
        var accessToken = await GetAccessTokenAsync(connection, cancellationToken);
        using var request = new HttpRequestMessage(
            HttpMethod.Delete,
            connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? $"https://www.googleapis.com/calendar/v3/calendars/primary/events/{Uri.EscapeDataString(externalEventId)}"
                : $"https://graph.microsoft.com/v1.0/me/events/{Uri.EscapeDataString(externalEventId)}"
        );
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await clients.CreateClient().SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode && response.StatusCode != System.Net.HttpStatusCode.NotFound)
            response.EnsureSuccessStatusCode();
    }

    private async Task<Dictionary<string, CalendarConnection>> LoadConnectionsAsync(
        IReadOnlyCollection<string> emails,
        CancellationToken cancellationToken
    ) => await db.CalendarConnections
        .Where(x => emails.Contains(x.UserEmail))
        .ToDictionaryAsync(x => x.UserEmail, StringComparer.OrdinalIgnoreCase, cancellationToken);

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
            ? (object)new
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
            throw new InvalidOperationException($"{connection.UserEmail} must reconnect their calendar.");

        var refreshToken = tokenProtector.Unprotect(connection.RefreshToken);
        var form = new Dictionary<string, string>
        {
            ["client_id"] = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? oauth.GoogleClientId
                : oauth.MicrosoftClientId,
            ["client_secret"] = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
                ? oauth.GoogleClientSecret
                : oauth.MicrosoftClientSecret,
            ["refresh_token"] = refreshToken,
            ["grant_type"] = "refresh_token",
        };
        var endpoint = connection.Provider.Equals("Google", StringComparison.OrdinalIgnoreCase)
            ? "https://oauth2.googleapis.com/token"
            : $"https://login.microsoftonline.com/{Uri.EscapeDataString(oauth.MicrosoftTenantId)}/oauth2/v2.0/token";
        using var response = await clients.CreateClient().PostAsync(
            endpoint,
            new FormUrlEncodedContent(form),
            cancellationToken
        );
        response.EnsureSuccessStatusCode();
        var token = await response.Content.ReadFromJsonAsync<RefreshResponse>(cancellationToken);
        if (token?.AccessToken is null)
            throw new InvalidOperationException("Calendar provider did not return a refreshed token.");
        connection.AccessToken = tokenProtector.Protect(token.AccessToken);
        connection.AccessTokenExpiresAt = DateTimeOffset.UtcNow.AddSeconds(token.ExpiresIn);
        connection.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        logger.LogInformation("Refreshed calendar token for {UserEmail}.", connection.UserEmail);
        return token.AccessToken;
    }

    private static IReadOnlyList<BusyWindow> ParseGoogleBusy(JsonElement root) =>
        root.GetProperty("calendars").EnumerateObject().SelectMany(calendar =>
            calendar.Value.GetProperty("busy").EnumerateArray().Select(item =>
                new BusyWindow(item.GetProperty("start").GetDateTimeOffset(), item.GetProperty("end").GetDateTimeOffset())
            )).ToArray();

    private static IReadOnlyList<BusyWindow> ParseMicrosoftBusy(JsonElement root) =>
        root.GetProperty("value").EnumerateArray().SelectMany(schedule =>
            schedule.GetProperty("scheduleItems").EnumerateArray().Select(item =>
                new BusyWindow(item.GetProperty("start").GetProperty("dateTime").GetDateTimeOffset(), item.GetProperty("end").GetProperty("dateTime").GetDateTimeOffset())
            )).ToArray();

    private static object GoogleEvent(OutboundCalendarEvent calendarEvent) => new
    {
        summary = calendarEvent.Title,
        description = calendarEvent.Description,
        start = new { dateTime = calendarEvent.StartsAt, timeZone = calendarEvent.TimeZone },
        end = new { dateTime = calendarEvent.EndsAt, timeZone = calendarEvent.TimeZone },
        attendees = calendarEvent.AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase).Select(email => new { email }),
        location = calendarEvent.ExistingMeetingLink,
    };

    private static object MicrosoftEvent(OutboundCalendarEvent calendarEvent) => new
    {
        subject = calendarEvent.Title,
        body = new { contentType = "text", content = calendarEvent.Description },
        start = new { dateTime = calendarEvent.StartsAt.UtcDateTime.ToString("O"), timeZone = "UTC" },
        end = new { dateTime = calendarEvent.EndsAt.UtcDateTime.ToString("O"), timeZone = "UTC" },
        attendees = calendarEvent.AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase).Select(email => new
        {
            emailAddress = new { address = email },
            type = "required",
        }),
        isOnlineMeeting = string.IsNullOrWhiteSpace(calendarEvent.ExistingMeetingLink),
        onlineMeetingProvider = "teamsForBusiness",
    };

    private sealed record BusyWindow(DateTimeOffset StartsAt, DateTimeOffset EndsAt)
    {
        public bool Overlaps(DateTimeOffset start, DateTimeOffset end) =>
            StartsAt < end && EndsAt > start;
    }

    private sealed record RefreshResponse(
        [property: JsonPropertyName("access_token")] string AccessToken,
        [property: JsonPropertyName("expires_in")] int ExpiresIn = 3600
    );
}
