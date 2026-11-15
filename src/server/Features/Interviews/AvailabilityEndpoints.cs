using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Interviews;

namespace MyThorneAI.Ats.Api.Api;

public static partial class AtsEndpoints
{
    private static void MapAvailability(RouteGroupBuilder api)
    {
        // My time zone, weekly hours, buffer and limits: what the scheduler respects for me.
        api.MapGet(
                "/me/availability",
                async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
                {
                    var email = principal.Email();
                    var user = await db
                        .Users.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.Email == email, ct);
                    if (user is null)
                        return Results.NotFound();
                    var organizationTimeZone = await db
                        .Organizations.Select(x => x.TimeZone)
                        .SingleOrDefaultAsync(ct);
                    var connection = await db
                        .CalendarConnections.AsNoTracking()
                        .Where(x => x.UserEmail == email)
                        .Select(x => new
                        {
                            x.Provider,
                            x.ProviderAccountEmail,
                            x.UpdatedAt,
                        })
                        .SingleOrDefaultAsync(ct);
                    var hours = AvailabilityService.ParseHours(user.WorkingHoursJson);
                    return Results.Ok(
                        new
                        {
                            user.TimeZone,
                            OrganizationTimeZone = organizationTimeZone,
                            UsesDefaultHours = user.WorkingHoursJson is null,
                            Hours = Enum.GetValues<DayOfWeek>()
                                .ToDictionary(
                                    day => ((int)day).ToString(),
                                    day =>
                                        hours[day]
                                            .Select(r => new[] { Clock(r.Start), Clock(r.End) })
                                ),
                            user.BufferMinutes,
                            user.MaxInterviewsPerDay,
                            user.MaxInterviewsPerWeek,
                            Calendar = connection is null
                                ? null
                                : new
                                {
                                    connection.Provider,
                                    AccountEmail = connection.ProviderAccountEmail,
                                    ConnectedAt = connection.UpdatedAt,
                                },
                        }
                    );
                }
            )
            .RequireAuthorization();

        api.MapPut(
                "/me/availability",
                async (
                    UpdateAvailabilityRequest request,
                    ClaimsPrincipal principal,
                    AtsDbContext db,
                    CancellationToken ct
                ) =>
                {
                    var errors = new Dictionary<string, string[]>();
                    var zone = Clean(request.TimeZone);
                    if (zone is not null && !TimeZoneInfo.TryFindSystemTimeZoneById(zone, out _))
                        errors["timeZone"] = ["Choose a time zone from the list."];
                    if (request.BufferMinutes is < 0 or > 120)
                        errors["bufferMinutes"] = ["A buffer is between 0 and 120 minutes."];
                    if (request.MaxInterviewsPerDay is < 1 or > 20)
                        errors["maxInterviewsPerDay"] =
                        [
                            "Choose between 1 and 20 a day, or no limit.",
                        ];
                    if (request.MaxInterviewsPerWeek is < 1 or > 60)
                        errors["maxInterviewsPerWeek"] =
                        [
                            "Choose between 1 and 60 a week, or no limit.",
                        ];
                    var hours = new Dictionary<DayOfWeek, IReadOnlyList<WorkingRange>>();
                    if (request.Hours is not null)
                        foreach (var day in Enum.GetValues<DayOfWeek>())
                        {
                            var ranges = new List<WorkingRange>();
                            foreach (
                                var pair in request.Hours.GetValueOrDefault(((int)day).ToString())
                                    ?? []
                            )
                            {
                                try
                                {
                                    if (pair.Length != 2)
                                        throw new FormatException();
                                    var range = new WorkingRange(
                                        AvailabilityService.ParseTime(pair[0]),
                                        AvailabilityService.ParseTime(pair[1])
                                    );
                                    if (range.End <= range.Start)
                                        throw new FormatException();
                                    ranges.Add(range);
                                }
                                catch (FormatException)
                                {
                                    errors[$"hours.{(int)day}"] =
                                    [
                                        "Each range needs a start time before its end time.",
                                    ];
                                }
                            }
                            ranges.Sort((a, b) => a.Start.CompareTo(b.Start));
                            if (ranges.Zip(ranges.Skip(1)).Any(x => x.Second.Start < x.First.End))
                                errors[$"hours.{(int)day}"] =
                                [
                                    "The time ranges on this day overlap.",
                                ];
                            hours[day] = ranges;
                        }
                    if (errors.Count > 0)
                        return Results.ValidationProblem(errors);

                    var email = principal.Email();
                    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email, ct);
                    if (user is null)
                        return Results.NotFound();
                    user.TimeZone = zone;
                    user.WorkingHoursJson = request.Hours is null
                        ? null
                        : AvailabilityService.HoursJson(hours);
                    user.BufferMinutes = request.BufferMinutes;
                    user.MaxInterviewsPerDay = request.MaxInterviewsPerDay;
                    user.MaxInterviewsPerWeek = request.MaxInterviewsPerWeek;
                    user.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "User", user.Id, "AvailabilityUpdated");
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
            )
            .RequireAuthorization();

        // The hiring team, for picking interviewers by name: role, zone, calendar and this week's load.
        api.MapGet(
                "/people",
                async (string? query, AtsDbContext db, CancellationToken ct) =>
                {
                    var now = DateTimeOffset.UtcNow;
                    var weekStart = now.AddDays(-(((int)now.DayOfWeek + 6) % 7)).Date;
                    var weekEnd = weekStart.AddDays(7);
                    var start = new DateTimeOffset(weekStart, TimeSpan.Zero);
                    var end = new DateTimeOffset(weekEnd, TimeSpan.Zero);
                    var text = Clean(query)?.ToLowerInvariant();
                    var people = await db
                        .Users.AsNoTracking()
                        .Where(x => x.IsActive)
                        .Where(x =>
                            text == null
                            || x.Email.Contains(text)
                            || x.DisplayName.ToLower().Contains(text)
                        )
                        .OrderBy(x => x.DisplayName)
                        .Take(200)
                        .Select(x => new
                        {
                            x.Id,
                            Name = x.DisplayName,
                            x.Email,
                            Role = x.Role.ToString(),
                            x.TimeZone,
                            x.MaxInterviewsPerWeek,
                        })
                        .ToListAsync(ct);
                    var emails = people.Select(x => x.Email).ToArray();
                    var connected = await db
                        .CalendarConnections.Where(x => emails.Contains(x.UserEmail))
                        .Select(x => x.UserEmail)
                        .ToListAsync(ct);
                    var load = await db
                        .Interviews.Where(x =>
                            x.Status == InterviewStatus.Scheduled
                            && x.StartsAt >= start
                            && x.StartsAt < end
                        )
                        .Select(x => x.InterviewerEmails)
                        .ToListAsync(ct);
                    return Results.Ok(
                        people.Select(x => new
                        {
                            x.Id,
                            x.Name,
                            x.Email,
                            x.Role,
                            x.TimeZone,
                            CalendarConnected = connected.Contains(x.Email),
                            InterviewsThisWeek = load.Count(emails => emails.Contains(x.Email)),
                            x.MaxInterviewsPerWeek,
                        })
                    );
                }
            )
            .RequireAuthorization(AtsPolicies.ManageHiring);
    }

    private static string Clock(TimeSpan time) => $"{(int)time.TotalHours:00}:{time.Minutes:00}";
}
