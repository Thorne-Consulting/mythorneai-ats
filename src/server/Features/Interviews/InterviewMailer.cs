using System.Text;
using Ical.Net;
using Ical.Net.CalendarComponents;
using Ical.Net.DataTypes;
using Ical.Net.Serialization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Interviews;

public enum InterviewChange
{
    Scheduled,
    Booked,
    Rescheduled,
    Cancelled,
    CandidateCancelled,
    NoShow,
    CalendarMoved,
    CalendarCancelled,
}

public sealed record InterviewMail(
    InterviewChange Change,
    DateTimeOffset? PreviousStart = null,
    DateTimeOffset? PreviousEnd = null,
    string? Reason = null,
    string? MessageToCandidate = null,
    string? ChangedBy = null,
    bool NotifyCandidate = true,
    bool NotifyInterviewers = true,
    IReadOnlyCollection<string>? OnlyInterviewers = null
);

/// <summary>
/// Every email about one interview: each person reads the time in their own zone, with the zone
/// named. Interviewers get a link to the interview page. When no calendar invite goes out, each
/// email links to a calendar file (.ics) for the reader.
/// </summary>
public sealed class InterviewMailer(
    AtsDbContext db,
    IDataProtectionProvider protection,
    IConfiguration configuration
)
{
    /// <summary>The address calendar invites come from: the sending address, when one is set.</summary>
    private string? Organizer =>
        configuration["Resend:From"] is { } from
        && System.Text.RegularExpressions.Regex.Match(from, @"[^\s<>]+@[^\s<>]+")
            is { Success: true } match
            ? match.Value
            : null;

    private readonly IDataProtector files = protection.CreateProtector("Interviews.CalendarFile");
    private readonly IDataProtector links = protection.CreateProtector("Interviews.SchedulingLink");

    /// <summary>The key in a self-scheduling link. It names one request; the row says whether it still works.</summary>
    public string LinkToken(Guid requestId) => links.Protect(requestId.ToString("N"));

    public Guid? ReadLinkToken(string token)
    {
        try
        {
            return Guid.TryParseExact(links.Unprotect(token), "N", out var id) ? id : null;
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return null;
        }
    }

    /// <summary>The candidate's booking page for a request: absolute when the site address is saved.</summary>
    public async Task<string> BookingUrlAsync(Guid requestId, CancellationToken ct)
    {
        var site = await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct);
        var path = $"/book/{LinkToken(requestId)}";
        return string.IsNullOrWhiteSpace(site) ? path : $"{site.TrimEnd('/')}{path}";
    }

    /// <summary>A link-safe token for one interview's calendar file, worded for the candidate or the team.</summary>
    public string FileToken(Guid interviewId, bool forCandidate) =>
        files.Protect($"{interviewId:N}:{(forCandidate ? "c" : "t")}");

    public (Guid InterviewId, bool ForCandidate)? ReadFileToken(string token)
    {
        try
        {
            var parts = files.Unprotect(token).Split(':');
            return parts.Length == 2 && Guid.TryParse(parts[0], out var id)
                ? (id, parts[1] == "c")
                : null;
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            return null;
        }
    }

    /// <summary>Queue the emails. The interview must carry Application.Candidate and Application.Requisition.</summary>
    public async Task QueueAsync(Interview interview, InterviewMail mail, CancellationToken ct)
    {
        var application = interview.Application!;
        var candidate = application.Candidate!;
        var job = application.Requisition!.Title;
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new
            {
                x.Name,
                x.TimeZone,
                x.PublicUrl,
            })
            .SingleOrDefaultAsync(ct);
        var company = organization?.Name ?? "The hiring team";
        var site = string.IsNullOrWhiteSpace(organization?.PublicUrl)
            ? null
            : organization.PublicUrl.TrimEnd('/');
        var users = await db
            .Users.AsNoTracking()
            .Where(x => interview.InterviewerEmails.Contains(x.Email))
            .ToDictionaryAsync(x => x.Email, StringComparer.OrdinalIgnoreCase, ct);
        var names = string.Join(
            ", ",
            interview.InterviewerEmails.Select(email =>
                users.TryGetValue(email, out var user) ? user.DisplayName : email
            )
        );
        var candidateName = $"{candidate.FirstName} {candidate.LastName}";
        var where = Where(interview);
        // "Technical interview", "Phone screen interview": never "Technical interview interview".
        var round = interview.Title.EndsWith("interview", StringComparison.OrdinalIgnoreCase)
            ? interview.Title
            : $"{interview.Title} interview";
        // A real invite already goes out through the calendar; a second file would add a duplicate.
        var withFile = site is not null && interview.CalendarStatus == "NotConfigured";

        string When(TimeZoneInfo zone) =>
            TimeText.Range(interview.StartsAt, interview.EndsAt, zone);
        string? Was(TimeZoneInfo zone) =>
            mail.PreviousStart is { } start && mail.PreviousEnd is { } end
                ? TimeText.Range(start, end, zone)
                : null;
        string? File(bool forCandidate) =>
            withFile
                ? $"{site}/public/interviews/{FileToken(interview.Id, forCandidate)}/invite.ics"
                : null;

        // The candidate's email and each interviewer's come from templates, so the wording can be
        // changed in the template library. Every time reads in the reader's own zone.
        if (mail.NotifyCandidate && CandidateKey(mail.Change) is { } key)
        {
            var zone = TimeText.Zone(candidate.TimeZone, organization?.TimeZone);
            // One click signs them in on the application's interviews.
            var portal = await Api.CandidateLinks.CreateAsync(
                db,
                candidate.Id,
                application.Id,
                Api.CandidateLinks.ApplicationPath(application.Id, "interviews"),
                ct
            );
            var rendered = await EmailTemplates.RenderAsync(
                db,
                key,
                application.RequisitionId,
                new Dictionary<string, string>
                {
                    ["firstName"] = candidate.FirstName,
                    ["lastName"] = candidate.LastName,
                    ["candidateName"] = candidateName,
                    ["jobTitle"] = job,
                    ["interviewTitle"] = round,
                    ["interviewTime"] = When(zone),
                    ["interviewDetails"] = CandidateDetails(mail.Change, zone),
                    ["message"] = mail.MessageToCandidate?.Trim() ?? "",
                    ["portalLink"] = portal ?? "",
                },
                ct
            );
            Add(candidate.Email, rendered, true);
        }

        if (mail.NotifyInterviewers && TeamTitle(mail.Change) is { } title)
            foreach (
                var email in interview.InterviewerEmails.Where(email =>
                    mail.OnlyInterviewers is null
                    || mail.OnlyInterviewers.Contains(email, StringComparer.OrdinalIgnoreCase)
                )
            )
            {
                users.TryGetValue(email, out var user);
                var zone = TimeText.Zone(user?.TimeZone, organization?.TimeZone);
                var rendered = await EmailTemplates.RenderAsync(
                    db,
                    "interview-team-update",
                    application.RequisitionId,
                    new Dictionary<string, string>
                    {
                        ["title"] = title,
                        ["candidateName"] = candidateName,
                        ["jobTitle"] = job,
                        ["interviewTitle"] = round,
                        ["interviewTime"] = When(zone),
                        ["interviewDetails"] = TeamDetails(mail.Change, zone),
                        ["link"] = site is null ? "" : $"{site}/interviews/{interview.Id}",
                    },
                    ct
                );
                Add(email, rendered, false);
            }

        static string? CandidateKey(InterviewChange change) =>
            change switch
            {
                InterviewChange.Scheduled or InterviewChange.Booked => "interview-booked",
                InterviewChange.Rescheduled or InterviewChange.CalendarMoved =>
                    "interview-rescheduled",
                InterviewChange.Cancelled
                or InterviewChange.CandidateCancelled
                or InterviewChange.CalendarCancelled => "interview-cancelled",
                InterviewChange.NoShow => "interview-no-show",
                _ => null,
            };

        static string? TeamTitle(InterviewChange change) =>
            change switch
            {
                InterviewChange.Scheduled => "Interview",
                InterviewChange.Booked => "Booked",
                InterviewChange.Rescheduled or InterviewChange.CalendarMoved => "New time",
                InterviewChange.Cancelled
                or InterviewChange.CandidateCancelled
                or InterviewChange.CalendarCancelled => "Cancelled",
                _ => null,
            };

        // {{interviewDetails}}: when, who, how to join and the calendar file, one per line.
        string CandidateDetails(InterviewChange change, TimeZoneInfo zone) =>
            change switch
            {
                InterviewChange.Rescheduled or InterviewChange.CalendarMoved => Lines(
                    $"New time: {When(zone)}",
                    Was(zone) is { } was ? $"Old time: {was}" : null,
                    $"With: {names}",
                    where,
                    File(true) is { } file ? $"Add the new time to your calendar: {file}" : null
                ),
                InterviewChange.Cancelled
                or InterviewChange.CandidateCancelled
                or InterviewChange.CalendarCancelled => Lines(
                    $"When: {When(zone)}",
                    File(true) is { } file ? $"Remove it from your calendar: {file}" : null
                ),
                InterviewChange.NoShow => Lines($"When: {When(zone)}", $"With: {names}"),
                _ => Lines(
                    $"When: {When(zone)}",
                    $"With: {names}",
                    where,
                    File(true) is { } file ? $"Add it to your calendar: {file}" : null
                ),
            };

        string TeamDetails(InterviewChange change, TimeZoneInfo zone) =>
            change switch
            {
                InterviewChange.Scheduled => Lines(
                    $"You are interviewing {candidateName} for {job}.",
                    null,
                    $"What: {interview.Title}",
                    $"When: {When(zone)}",
                    $"With: {names}",
                    where,
                    File(false) is { } file ? $"Add it to your calendar: {file}" : null,
                    null,
                    "Write your scorecard soon after the interview, while it is fresh."
                ),
                InterviewChange.Booked => Lines(
                    $"{candidateName} picked a time for the {round} for {job}.",
                    null,
                    $"When: {When(zone)}",
                    $"With: {names}",
                    where,
                    File(false) is { } file ? $"Add it to your calendar: {file}" : null
                ),
                InterviewChange.Rescheduled or InterviewChange.CalendarMoved => Lines(
                    $"The {round} with {candidateName} has a new time.",
                    null,
                    $"New time: {When(zone)}",
                    Was(zone) is { } was ? $"Old time: {was}" : null,
                    mail.ChangedBy is null ? null : $"Moved by: {mail.ChangedBy}",
                    string.IsNullOrWhiteSpace(mail.Reason) ? null : $"Reason: {mail.Reason}",
                    File(false) is { } file ? $"Add the new time to your calendar: {file}" : null
                ),
                _ => Lines(
                    $"The {round} with {candidateName} on {When(zone)} is cancelled.",
                    null,
                    mail.ChangedBy is null ? null : $"Cancelled by: {mail.ChangedBy}",
                    string.IsNullOrWhiteSpace(mail.Reason) ? null : $"Reason: {mail.Reason}",
                    File(false) is { } file ? $"Remove it from your calendar: {file}" : null
                ),
            };

        void Add(string recipient, EmailTemplates.Rendered email, bool forCandidate)
        {
            var item = new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = recipient,
                Subject = email.Subject,
                Body = email.Body,
                TemplateKey = email.Key,
                TemplateVersion = email.Version,
            };
            // With no calendar invite going out, the email carries the calendar file itself.
            var cancel =
                mail.Change
                is InterviewChange.Cancelled
                    or InterviewChange.CandidateCancelled
                    or InterviewChange.CalendarCancelled;
            if (
                interview.CalendarStatus == "NotConfigured"
                && mail.Change is not InterviewChange.NoShow
            )
            {
                var (summary, description) = FileText(
                    interview,
                    company,
                    job,
                    candidateName,
                    forCandidate
                );
                var method =
                    Organizer is null ? "PUBLISH"
                    : cancel ? "CANCEL"
                    : "REQUEST";
                item.InlineFileName = "invite.ics";
                item.InlineFileContentType = $"text/calendar; method={method}";
                item.InlineFileText = CalendarFile(
                    interview,
                    summary,
                    description,
                    cancel,
                    method,
                    Organizer,
                    recipient
                );
            }
            db.EmailOutbox.Add(item);
        }
    }

    /// <summary>What the calendar entry says, worded for the candidate or for the team.</summary>
    public static (string Summary, string Description) FileText(
        Interview interview,
        string company,
        string job,
        string candidateName,
        bool forCandidate
    ) =>
        (
            forCandidate
                ? $"{interview.Title} interview with {company}"
                : $"{interview.Title}: {candidateName} ({job})",
            string.Join(
                "\n",
                new[]
                {
                    forCandidate
                        ? $"Your {interview.Title} interview for {job}."
                        : $"Interview with {candidateName} for {job}.",
                    Where(interview),
                }.Where(x => x is not null)
            )
        );

    /// <summary>One line on how to join: the video link, the phone number or the address.</summary>
    public static string? Where(Interview interview) =>
        Where(interview.MeetingType, interview.MeetingLink, interview.Location);

    public static string? Where(string? type, string? link, string? location) =>
        type switch
        {
            MeetingTypes.Phone => location is null
                ? "How: a phone call. We will call you."
                : $"How: a phone call on {location}",
            MeetingTypes.InPerson => location is null ? "Where: in person" : $"Where: {location}",
            MeetingTypes.GoogleMeet or MeetingTypes.Teams when link is null =>
                $"How: a {(type == MeetingTypes.Teams ? "Microsoft Teams" : "Google Meet")} video call. The link comes with the calendar invite.",
            _ => link is null ? null : $"Join: {link}",
        };

    /// <summary>
    /// Several sessions on one day (a panel loop): the candidate gets one itinerary, each interviewer
    /// the email for their own session. Every session must carry Application.Candidate and Requisition.
    /// </summary>
    public async Task QueueLoopAsync(
        IReadOnlyList<Interview> sessions,
        string? messageToCandidate,
        bool notifyCandidate,
        bool notifyInterviewers,
        CancellationToken ct
    )
    {
        if (notifyInterviewers)
            foreach (var session in sessions)
                await QueueAsync(
                    session,
                    new InterviewMail(InterviewChange.Scheduled, NotifyCandidate: false),
                    ct
                );
        if (!notifyCandidate || sessions.Count == 0)
            return;
        var application = sessions[0].Application!;
        var candidate = application.Candidate!;
        var job = application.Requisition!.Title;
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new
            {
                x.Name,
                x.TimeZone,
                x.PublicUrl,
            })
            .SingleOrDefaultAsync(ct);
        var site = string.IsNullOrWhiteSpace(organization?.PublicUrl)
            ? null
            : organization.PublicUrl.TrimEnd('/');
        var emails = sessions.SelectMany(x => x.InterviewerEmails).Distinct().ToArray();
        var names = await db
            .Users.AsNoTracking()
            .Where(x => emails.Contains(x.Email))
            .ToDictionaryAsync(
                x => x.Email,
                x => x.DisplayName,
                StringComparer.OrdinalIgnoreCase,
                ct
            );
        var zone = TimeText.Zone(candidate.TimeZone, organization?.TimeZone);
        var ordered = sessions.OrderBy(x => x.StartsAt).ToArray();
        var lines = new List<string?>
        {
            $"{ordered.Length} interviews, back to back: {TimeText.Range(ordered[0].StartsAt, ordered[^1].EndsAt, zone)}.",
            null,
        };
        foreach (var session in ordered)
        {
            lines.Add(
                $"{TimeText.Range(session.StartsAt, session.EndsAt, zone)}: {session.Title}, with {string.Join(", ", session.InterviewerEmails.Select(x => names.GetValueOrDefault(x) ?? x))}"
            );
            if (site is not null && session.CalendarStatus == "NotConfigured")
                lines.Add(
                    $"Add it to your calendar: {site}/public/interviews/{FileToken(session.Id, true)}/invite.ics"
                );
        }
        lines.Add(null);
        lines.Add(Where(ordered[0]) ?? "");
        var portal = await Api.CandidateLinks.CreateAsync(
            db,
            candidate.Id,
            application.Id,
            Api.CandidateLinks.ApplicationPath(application.Id, "interviews"),
            ct
        );
        // The same "Interview booked" template as a single interview; the day is its "interview".
        var rendered = await EmailTemplates.RenderAsync(
            db,
            "interview-booked",
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["lastName"] = candidate.LastName,
                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                ["jobTitle"] = job,
                ["interviewTitle"] = "interview day",
                ["interviewTime"] = TimeText.Range(ordered[0].StartsAt, ordered[^1].EndsAt, zone),
                ["interviewDetails"] = Lines(lines.ToArray()),
                ["message"] = messageToCandidate?.Trim() ?? "",
                ["portalLink"] = portal ?? "",
            },
            ct
        );
        var itinerary = new EmailOutboxItem
        {
            ApplicationId = application.Id,
            Recipient = candidate.Email,
            Subject = rendered.Subject,
            Body = rendered.Body,
            TemplateKey = rendered.Key,
            TemplateVersion = rendered.Version,
        };
        if (ordered.All(x => x.CalendarStatus == "NotConfigured"))
        {
            var company = organization?.Name ?? "the hiring team";
            var name = $"{candidate.FirstName} {candidate.LastName}";
            var method = Organizer is null ? "PUBLISH" : "REQUEST";
            itinerary.InlineFileName = "invite.ics";
            itinerary.InlineFileContentType = $"text/calendar; method={method}";
            itinerary.InlineFileText = CalendarFile(
                ordered
                    .Select(x =>
                    {
                        var (summary, description) = FileText(x, company, job, name, true);
                        return (x, summary, description);
                    })
                    .ToList(),
                false,
                method,
                Organizer,
                candidate.Email
            );
        }
        db.EmailOutbox.Add(itinerary);
    }

    /// <summary>The self-scheduling link email, or its reminder. The application must carry Candidate and Requisition.</summary>
    public async Task QueueLinkAsync(
        SchedulingRequest request,
        Application application,
        bool reminder,
        CancellationToken ct
    )
    {
        var candidate = application.Candidate!;
        var job = application.Requisition!.Title;
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.TimeZone })
            .SingleOrDefaultAsync(ct);
        var zone = TimeText.Zone(candidate.TimeZone, organization?.TimeZone);
        var url = await BookingUrlAsync(request.Id, ct);
        var round = request.Title.EndsWith("interview", StringComparison.OrdinalIgnoreCase)
            ? request.Title
            : $"{request.Title} interview";
        var choice =
            request.OfferedStarts.Length > 0
                ? $"Choose one of the {request.OfferedStarts.Length} times we offer."
                : "Choose any time that suits you from the open times.";
        var rendered = await EmailTemplates.RenderAsync(
            db,
            "interview-choose-time",
            application.RequisitionId,
            new Dictionary<string, string>
            {
                ["firstName"] = candidate.FirstName,
                ["lastName"] = candidate.LastName,
                ["candidateName"] = $"{candidate.FirstName} {candidate.LastName}",
                ["jobTitle"] = job,
                ["interviewTitle"] = round,
                ["bookingLink"] = url,
                ["interviewTime"] = "",
                ["interviewDetails"] = Lines(
                    reminder
                        ? "You have not picked a time yet."
                        : $"It takes {request.DurationMinutes} minutes.",
                    choice,
                    $"This link works until {TimeText.DateTime(request.ExpiresAt, zone)}."
                ),
                ["message"] = request.MessageToCandidate?.Trim() ?? "",
            },
            ct
        );
        db.EmailOutbox.Add(
            new EmailOutboxItem
            {
                ApplicationId = application.Id,
                Recipient = candidate.Email,
                Subject = reminder ? $"Reminder: {rendered.Subject}" : rendered.Subject,
                Body = rendered.Body,
                TemplateKey = rendered.Key,
                TemplateVersion = rendered.Version,
            }
        );
    }

    /// <summary>Joins lines, dropping missing ones; a null entry is a paragraph break.</summary>
    private static string Lines(params string?[] lines)
    {
        var text = new StringBuilder();
        foreach (var line in lines)
        {
            if (line is null)
                text.Append('\n');
            else if (line.Length > 0)
                text.Append(line).Append('\n');
        }
        return System
            .Text.RegularExpressions.Regex.Replace(text.ToString(), @"\n{3,}", "\n\n")
            .Trim();
    }

    /// <summary>
    /// An iCalendar file for one interview. The same UID every time and a rising SEQUENCE, so a
    /// calendar app updates (or removes) the entry it already has instead of adding another.
    /// </summary>
    public static string CalendarFile(
        Interview interview,
        string summary,
        string description,
        bool cancelled,
        string method = "PUBLISH",
        string? organizer = null,
        string? attendee = null
    ) => CalendarFile([(interview, summary, description)], cancelled, method, organizer, attendee);

    /// <summary>Several interviews in one file (a loop's sessions), each its own entry.</summary>
    public static string CalendarFile(
        IReadOnlyList<(Interview Interview, string Summary, string Description)> entries,
        bool cancelled,
        string method = "PUBLISH",
        string? organizer = null,
        string? attendee = null
    )
    {
        var calendar = new Calendar { Method = method };
        calendar.AddProperty("X-WR-CALNAME", "Interviews");
        foreach (var (interview, summary, description) in entries)
        {
            var item = new CalendarEvent
            {
                Uid = $"interview-{interview.Id:N}@mythorneai",
                Sequence = interview.IcsSequence,
                Summary = summary,
                Description = description,
                Location = interview.MeetingLink ?? interview.Location,
                DtStart = new CalDateTime(interview.StartsAt.UtcDateTime, "UTC"),
                DtEnd = new CalDateTime(interview.EndsAt.UtcDateTime, "UTC"),
                DtStamp = new CalDateTime(DateTime.UtcNow, "UTC"),
                Status = cancelled ? EventStatus.Cancelled : EventStatus.Confirmed,
            };
            if (Uri.TryCreate(interview.MeetingLink, UriKind.Absolute, out var url))
                item.Url = url;
            // An invite (REQUEST or CANCEL) names who sends it and who it is for, so mail apps offer
            // "add" and "remove" instead of a plain file.
            if (method != "PUBLISH" && organizer is not null)
            {
                item.Organizer = new Organizer($"mailto:{organizer}");
                if (attendee is not null)
                    item.Attendees.Add(new Attendee($"mailto:{attendee}") { Rsvp = false });
            }
            calendar.Events.Add(item);
        }
        return new CalendarSerializer().SerializeToString(calendar) ?? "";
    }
}
