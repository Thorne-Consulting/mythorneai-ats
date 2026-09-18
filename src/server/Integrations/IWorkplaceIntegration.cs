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
    IReadOnlyCollection<string> AttendeeEmails
);

public sealed record CalendarDeliveryResult(string ExternalId, string? MeetingLink);

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
