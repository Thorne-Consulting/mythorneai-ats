namespace MyThorneAI.Ats.Api.Interviews;

/// <summary>A suggested booking: one session per round, back to back, and how busy the panel already is.</summary>
public sealed record SuggestedTimes(IReadOnlyList<AvailableSlot> Sessions, int Load);

/// <summary>
/// The scheduler's pure part: chains each round's open slots into back-to-back loops, then ranks
/// them so lightly booked people come first and the picks spread over several days.
/// </summary>
public static class SchedulingPlanner
{
    /// <summary>
    /// Every way to run the rounds in order on one day: each round starts when the previous one
    /// ends plus the break, and each start must be open for that round's panel.
    /// </summary>
    public static IReadOnlyList<IReadOnlyList<AvailableSlot>> Sequences(
        IReadOnlyList<IReadOnlyList<AvailableSlot>> perRound,
        TimeSpan breakBetween
    )
    {
        if (perRound.Count == 0)
            return [];
        var starts = perRound.Select(slots => slots.ToDictionary(x => x.StartsAt)).ToArray();
        var result = new List<IReadOnlyList<AvailableSlot>>();
        foreach (var first in perRound[0])
        {
            var chain = new List<AvailableSlot> { first };
            for (var round = 1; round < perRound.Count; round++)
            {
                if (!starts[round].TryGetValue(chain[^1].EndsAt + breakBetween, out var next))
                    break;
                chain.Add(next);
            }
            if (chain.Count == perRound.Count)
                result.Add(chain);
        }
        return result;
    }

    /// <summary>
    /// How many interviews a panel already has: each person's count on that day (in their zone)
    /// weighs four times their count that week.
    /// </summary>
    public static int Load(
        IReadOnlyList<AvailableSlot> sessions,
        IReadOnlyList<IReadOnlyList<PersonSchedule>> panels
    )
    {
        var load = 0;
        for (var i = 0; i < sessions.Count; i++)
            foreach (var person in panels[i])
            {
                var local = TimeZoneInfo.ConvertTime(sessions[i].StartsAt, person.Zone).Date;
                var week = local.AddDays(-(((int)local.DayOfWeek + 6) % 7));
                foreach (var booked in person.Booked)
                {
                    var day = TimeZoneInfo.ConvertTime(booked, person.Zone).Date;
                    if (day == local)
                        load += 4;
                    else if (day >= week && day < week.AddDays(7))
                        load += 1;
                }
            }
        return load;
    }

    /// <summary>
    /// The best few: lowest load first, then soonest, and at most <paramref name="perDay"/> on any
    /// one day in the scheduler's zone, so the list offers real choices.
    /// </summary>
    public static IReadOnlyList<SuggestedTimes> Rank(
        IReadOnlyList<IReadOnlyList<AvailableSlot>> options,
        IReadOnlyList<IReadOnlyList<PersonSchedule>> panels,
        TimeZoneInfo zone,
        int take = 5,
        int perDay = 2
    )
    {
        var picked = new List<SuggestedTimes>();
        var days = new Dictionary<DateTime, int>();
        foreach (
            var option in options
                .Select(sessions => new SuggestedTimes(sessions, Load(sessions, panels)))
                .OrderBy(x => x.Load)
                .ThenBy(x => x.Sessions[0].StartsAt)
        )
        {
            var day = TimeZoneInfo.ConvertTime(option.Sessions[0].StartsAt, zone).Date;
            if (days.GetValueOrDefault(day) >= perDay)
                continue;
            days[day] = days.GetValueOrDefault(day) + 1;
            picked.Add(option);
            if (picked.Count == take)
                break;
        }
        return picked;
    }
}
