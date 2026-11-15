namespace MyThorneAI.Ats.Api.Integrations;

public interface IWorkplaceIntegration
{
    string ProviderName { get; }
    bool IsEnabled { get; }
    Task<CalendarDeliveryResult> CreateCalendarEventAsync(
        OutboundCalendarEvent calendarEvent,
        CancellationToken cancellationToken
    );
    Task CancelCalendarEventAsync(string externalEventId, CancellationToken cancellationToken);
}

public sealed record OutboundCalendarEvent(
    Guid InterviewId,
    string? ExternalEventId,
    string Title,
    string Description,
    DateTimeOffset StartsAt,
    DateTimeOffset EndsAt,
    string TimeZone,
    string? ExistingMeetingLink,
    IReadOnlyCollection<string> AttendeeEmails,
    string? OrganizerEmail = null,
    string? MeetingType = null,
    string? Location = null
)
{
    /// <summary>
    /// Whether this calendar ("Google" or "Microsoft") should make the video room: only when there is
    /// no link yet and the meeting type asks for that provider's room (any room on older rows).
    /// </summary>
    public bool CreatesMeetingOn(string provider) =>
        string.IsNullOrWhiteSpace(ExistingMeetingLink)
        && MeetingType switch
        {
            null => true,
            Domain.MeetingTypes.GoogleMeet => provider == "Google",
            Domain.MeetingTypes.Teams => provider == "Microsoft",
            _ => false,
        };

    /// <summary>What the invite shows as the place: the link, else the address or phone number.</summary>
    public string? Place => ExistingMeetingLink ?? Location;
}

/// <summary>The event as the calendar holds it. OrganizerEmail is set for personal calendars.</summary>
public sealed record CalendarDeliveryResult(
    string ExternalId,
    string? MeetingLink,
    string? OrganizerEmail = null
);

public sealed class DisabledWorkplaceIntegration : IWorkplaceIntegration
{
    public string ProviderName => "None";
    public bool IsEnabled => false;

    public Task<CalendarDeliveryResult> CreateCalendarEventAsync(
        OutboundCalendarEvent calendarEvent,
        CancellationToken cancellationToken
    ) => throw new InvalidOperationException("No workplace integration is configured.");

    public Task CancelCalendarEventAsync(
        string externalEventId,
        CancellationToken cancellationToken
    ) => throw new InvalidOperationException("No workplace integration is configured.");
}
