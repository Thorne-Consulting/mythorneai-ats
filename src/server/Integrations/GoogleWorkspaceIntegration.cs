using System.Net;
using System.Text;
using Google;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Calendar.v3;
using Google.Apis.Calendar.v3.Data;
using Google.Apis.Services;

namespace MyThorneAI.Ats.Api.Integrations;

public sealed class GoogleWorkspaceIntegration : IWorkplaceIntegration
{
    private readonly GoogleWorkspaceOptions _options;
    private readonly CalendarService _calendar;

    public GoogleWorkspaceIntegration(IntegrationOptions options)
    {
        _options = options.GoogleWorkspace;
        var credentialJson = LoadCredentialJson(_options);
        var credential = CredentialFactory
            .FromJson<ServiceAccountCredential>(credentialJson)
            .ToGoogleCredential()
            .CreateScoped(CalendarService.Scope.CalendarEvents)
            .CreateWithUser(_options.ImpersonatedUser);
        var initializer = new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "Applicant Tracking System",
        };
        _calendar = new CalendarService(initializer);
    }

    public string ProviderName => "GoogleWorkspace";
    public bool IsEnabled => true;

    public async Task<CalendarDeliveryResult> CreateCalendarEventAsync(
        OutboundCalendarEvent calendarEvent,
        CancellationToken cancellationToken
    )
    {
        var eventId = $"ats{calendarEvent.InterviewId:N}";
        var createMeeting =
            _options.CreateOnlineMeetings
            && string.IsNullOrWhiteSpace(calendarEvent.ExistingMeetingLink);
        var calendarItem = new Event
        {
            Id = eventId,
            Summary = calendarEvent.Title,
            Description = calendarEvent.Description,
            Location = calendarEvent.ExistingMeetingLink,
            Start = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.StartsAt,
                TimeZone = calendarEvent.TimeZone,
            },
            End = new EventDateTime
            {
                DateTimeDateTimeOffset = calendarEvent.EndsAt,
                TimeZone = calendarEvent.TimeZone,
            },
            Attendees = calendarEvent
                .AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(email => new EventAttendee { Email = email })
                .ToList(),
            ConferenceData = createMeeting
                ? new ConferenceData
                {
                    CreateRequest = new CreateConferenceRequest
                    {
                        RequestId = calendarEvent.InterviewId.ToString("N"),
                        ConferenceSolutionKey = new ConferenceSolutionKey { Type = "hangoutsMeet" },
                    },
                }
                : null,
        };

        Event created;
        if (!string.IsNullOrWhiteSpace(calendarEvent.ExternalEventId))
        {
            var request = _calendar.Events.Update(
                calendarItem,
                _options.CalendarId,
                calendarEvent.ExternalEventId
            );
            request.SendUpdates = EventsResource.UpdateRequest.SendUpdatesEnum.All;
            request.ConferenceDataVersion = createMeeting ? 1 : 0;
            created = await request.ExecuteAsync(cancellationToken);
        }
        else
        {
            try
            {
                var request = _calendar.Events.Insert(calendarItem, _options.CalendarId);
                request.SendUpdates = EventsResource.InsertRequest.SendUpdatesEnum.All;
                request.ConferenceDataVersion = createMeeting ? 1 : 0;
                created = await request.ExecuteAsync(cancellationToken);
            }
            catch (GoogleApiException exception)
                when (exception.HttpStatusCode == HttpStatusCode.Conflict)
            {
                var request = _calendar.Events.Update(calendarItem, _options.CalendarId, eventId);
                request.SendUpdates = EventsResource.UpdateRequest.SendUpdatesEnum.All;
                request.ConferenceDataVersion = createMeeting ? 1 : 0;
                created = await request.ExecuteAsync(cancellationToken);
            }
        }

        if (string.IsNullOrWhiteSpace(created.Id))
            throw new InvalidOperationException(
                "Google Calendar did not return an event identifier."
            );
        return new CalendarDeliveryResult(
            created.Id,
            calendarEvent.ExistingMeetingLink ?? created.HangoutLink
        );
    }

    public async Task CancelCalendarEventAsync(
        string externalEventId,
        CancellationToken cancellationToken
    )
    {
        var request = _calendar.Events.Delete(_options.CalendarId, externalEventId);
        request.SendUpdates = EventsResource.DeleteRequest.SendUpdatesEnum.All;
        await request.ExecuteAsync(cancellationToken);
    }

    private static string LoadCredentialJson(GoogleWorkspaceOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.ServiceAccountJsonBase64))
            return Encoding.UTF8.GetString(
                Convert.FromBase64String(options.ServiceAccountJsonBase64)
            );
        return File.ReadAllText(options.ServiceAccountJsonPath);
    }
}
