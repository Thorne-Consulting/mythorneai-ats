using Azure.Identity;
using Microsoft.Graph;
using Microsoft.Graph.Models;

namespace MyThorneAI.Ats.Api.Integrations;

public sealed class Microsoft365Integration : IWorkplaceIntegration
{
    private readonly Microsoft365Options _options;
    private readonly GraphServiceClient _graph;

    public Microsoft365Integration(IntegrationOptions options)
    {
        _options = options.Microsoft365;
        var credential = new ClientSecretCredential(
            _options.TenantId,
            _options.ClientId,
            _options.ClientSecret
        );
        _graph = new GraphServiceClient(credential, ["https://graph.microsoft.com/.default"]);
    }

    public string ProviderName => "Microsoft365";
    public bool IsEnabled => true;

    public async Task<CalendarDeliveryResult> CreateCalendarEventAsync(
        OutboundCalendarEvent calendarEvent,
        CancellationToken cancellationToken
    )
    {
        var createMeeting =
            _options.CreateOnlineMeetings
            && string.IsNullOrWhiteSpace(calendarEvent.ExistingMeetingLink);
        var graphEvent = new Event
        {
            Subject = calendarEvent.Title,
            Body = new ItemBody
            {
                ContentType = BodyType.Text,
                Content = calendarEvent.Description,
            },
            Start = ToGraphDateTime(calendarEvent.StartsAt),
            End = ToGraphDateTime(calendarEvent.EndsAt),
            Attendees = calendarEvent
                .AttendeeEmails.Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(email => new Attendee
                {
                    EmailAddress = new EmailAddress { Address = email },
                    Type = AttendeeType.Required,
                })
                .ToList(),
            IsOnlineMeeting = createMeeting,
            OnlineMeetingProvider = createMeeting
                ? OnlineMeetingProviderType.TeamsForBusiness
                : null,
            TransactionId = calendarEvent.InterviewId.ToString("N"),
        };

        if (!string.IsNullOrWhiteSpace(calendarEvent.ExistingMeetingLink))
            graphEvent.Location = new Location
            {
                DisplayName = calendarEvent.ExistingMeetingLink,
                LocationUri = calendarEvent.ExistingMeetingLink,
            };

        var created = string.IsNullOrWhiteSpace(calendarEvent.ExternalEventId)
            ? await _graph
                .Users[_options.SenderUserId]
                .Events.PostAsync(graphEvent, cancellationToken: cancellationToken)
            : await _graph
                .Users[_options.SenderUserId]
                .Events[calendarEvent.ExternalEventId]
                .PatchAsync(graphEvent, cancellationToken: cancellationToken);
        if (string.IsNullOrWhiteSpace(created?.Id))
            throw new InvalidOperationException(
                "Microsoft Graph did not return an event identifier."
            );

        return new CalendarDeliveryResult(
            created.Id,
            calendarEvent.ExistingMeetingLink ?? created.OnlineMeeting?.JoinUrl
        );
    }

    public async Task CancelCalendarEventAsync(
        string externalEventId,
        CancellationToken cancellationToken
    ) =>
        await _graph
            .Users[_options.SenderUserId]
            .Events[externalEventId]
            .DeleteAsync(cancellationToken: cancellationToken);

    private static DateTimeTimeZone ToGraphDateTime(DateTimeOffset value) =>
        new() { DateTime = value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss"), TimeZone = "UTC" };
}
