using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using MyThorneAI.Ats.Api.Interviews;
using MyThorneAI.Ats.Api.Interviews.Recording;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

/// <summary>The availability engine, the calendar read-back rule and the calendar file. No database.</summary>
public sealed class InterviewSchedulingTests
{
    private static readonly TimeSpan HalfHour = TimeSpan.FromMinutes(30);

    private static PersonSchedule Person(
        string zone,
        IReadOnlyList<BusyWindow>? busy = null,
        int bufferMinutes = 0,
        int? maxPerDay = null,
        IReadOnlyList<DateTimeOffset>? booked = null
    ) =>
        new(
            $"{zone}@example.test",
            TimeText.Zone(zone),
            AvailabilityService.DefaultHours,
            TimeSpan.FromMinutes(bufferMinutes),
            maxPerDay,
            null,
            busy ?? [],
            booked ?? []
        );

    private static DateTimeOffset Utc(int month, int day, int hour, int minute = 0) =>
        new(2026, month, day, hour, minute, 0, TimeSpan.Zero);

    [Fact]
    public void Slots_stay_inside_working_hours_in_each_persons_zone()
    {
        // Friday 30 October 2026: New York is UTC-4, London UTC+0. 9 to 5 overlaps 13:00 to 17:00 UTC.
        var (slots, _) = AvailabilityService.FindSlots(
            [Person("America/New_York"), Person("Europe/London")],
            Utc(10, 30, 0),
            Utc(10, 31, 0),
            TimeSpan.FromHours(1),
            HalfHour,
            Utc(10, 1, 0),
            100
        );
        slots.First().StartsAt.ShouldBe(Utc(10, 30, 13));
        slots.Last().EndsAt.ShouldBe(Utc(10, 30, 17));
        slots.Count.ShouldBe(7);
    }

    [Fact]
    public void Working_hours_follow_daylight_saving_changes()
    {
        // New York leaves daylight time on Sunday 1 November 2026: 9 AM is 13:00 UTC on Friday and
        // 14:00 UTC on Monday.
        var (slots, _) = AvailabilityService.FindSlots(
            [Person("America/New_York")],
            Utc(10, 30, 0),
            Utc(11, 3, 0),
            HalfHour,
            HalfHour,
            Utc(10, 1, 0),
            500
        );
        slots.First().StartsAt.ShouldBe(Utc(10, 30, 13));
        slots.First(x => x.StartsAt.Day == 2).StartsAt.ShouldBe(Utc(11, 2, 14));
        slots.ShouldNotContain(x => x.StartsAt.Day == 31 || x.StartsAt.Day == 1, "weekend");
    }

    [Fact]
    public void Buffers_keep_space_around_busy_times()
    {
        var busy = new BusyWindow(Utc(10, 30, 15), Utc(10, 30, 16));
        var (slots, _) = AvailabilityService.FindSlots(
            [Person("UTC", [busy], bufferMinutes: 15)],
            Utc(10, 30, 13),
            Utc(10, 30, 17),
            HalfHour,
            TimeSpan.FromMinutes(15),
            Utc(10, 1, 0),
            100
        );
        slots.ShouldContain(x => x.StartsAt == Utc(10, 30, 14, 15));
        slots.ShouldNotContain(x => x.StartsAt == Utc(10, 30, 14, 30));
        slots.ShouldNotContain(x => x.StartsAt == Utc(10, 30, 16));
        slots.ShouldContain(x => x.StartsAt == Utc(10, 30, 16, 15));
    }

    [Fact]
    public void Daily_limit_and_minimum_notice_are_respected()
    {
        var (full, _) = AvailabilityService.FindSlots(
            [Person("UTC", maxPerDay: 1, booked: [Utc(10, 30, 9)])],
            Utc(10, 30, 0),
            Utc(11, 3, 0),
            HalfHour,
            HalfHour,
            Utc(10, 1, 0),
            500
        );
        full.ShouldNotContain(x => x.StartsAt.Day == 30, "Friday already has its one interview");
        full.ShouldContain(x => x.StartsAt.Day == 2);

        var (later, _) = AvailabilityService.FindSlots(
            [Person("UTC")],
            Utc(10, 30, 0),
            Utc(10, 31, 0),
            HalfHour,
            HalfHour,
            Utc(10, 30, 15, 10),
            100
        );
        later.First().StartsAt.ShouldBe(Utc(10, 30, 15, 30));
    }

    [Fact]
    public void Results_are_capped_and_say_so()
    {
        var (slots, capped) = AvailabilityService.FindSlots(
            [Person("UTC")],
            Utc(10, 26, 0),
            Utc(11, 9, 0),
            HalfHour,
            HalfHour,
            Utc(10, 1, 0),
            20
        );
        slots.Count.ShouldBe(20);
        capped.ShouldBeTrue();
    }

    [Fact]
    public void Saved_hours_round_trip_and_bad_json_falls_back_to_the_default_week()
    {
        var hours = AvailabilityService.ParseHours(
            """{"1":[["08:00","12:00"],["13:00","24:00"]]}"""
        );
        hours[DayOfWeek.Monday].Count.ShouldBe(2);
        hours[DayOfWeek.Monday][1].End.ShouldBe(TimeSpan.FromHours(24));
        hours[DayOfWeek.Tuesday].ShouldBeEmpty();
        AvailabilityService
            .ParseHours(AvailabilityService.HoursJson(hours))[DayOfWeek.Monday][0]
            .Start.ShouldBe(TimeSpan.FromHours(8));
        AvailabilityService.ParseHours("not json").ShouldBe(AvailabilityService.DefaultHours);
        Should.Throw<FormatException>(() => AvailabilityService.ParseTime("25:00"));
    }

    [Fact]
    public void A_missing_calendar_connection_is_never_a_cancellation()
    {
        var start = Utc(11, 20, 15);
        var end = start.AddHours(1);
        CalendarSync
            .Classify(new ExternalCalendarLookup(ExternalLookupState.NoConnection), start, end)
            .ShouldBe(ExternalChange.Disconnected);
        CalendarSync
            .Classify(new ExternalCalendarLookup(ExternalLookupState.NotFound), start, end)
            .ShouldBe(ExternalChange.Cancelled);
        CalendarSync
            .Classify(
                new ExternalCalendarLookup(
                    ExternalLookupState.Found,
                    new(start, end, null, Cancelled: true)
                ),
                start,
                end
            )
            .ShouldBe(ExternalChange.Cancelled);
        CalendarSync
            .Classify(
                new ExternalCalendarLookup(
                    ExternalLookupState.Found,
                    new(start.AddHours(1), end.AddHours(1), null, false)
                ),
                start,
                end
            )
            .ShouldBe(ExternalChange.Moved);
        CalendarSync
            .Classify(
                new ExternalCalendarLookup(ExternalLookupState.Found, new(start, end, null, false)),
                start,
                end
            )
            .ShouldBe(ExternalChange.None);
    }

    [Fact]
    public void The_calendar_file_keeps_one_identity_and_counts_changes()
    {
        var interview = new Interview
        {
            Title = "Technical interview",
            TimeZone = "America/Chicago",
            StartsAt = Utc(11, 20, 15),
            EndsAt = Utc(11, 20, 16),
            MeetingLink = "https://meet.example.com/abc",
            IcsSequence = 3,
        };
        var file = InterviewMailer.CalendarFile(
            interview,
            "Technical interview with Acme",
            "Join: link",
            cancelled: false
        );
        file.ShouldContain($"UID:interview-{interview.Id:N}@mythorneai");
        file.ShouldContain("SEQUENCE:3");
        file.ShouldContain("DTSTART:20261120T150000Z");
        file.ShouldContain("STATUS:CONFIRMED");

        var cancelled = InterviewMailer.CalendarFile(
            interview,
            "Technical interview with Acme",
            "",
            cancelled: true
        );
        cancelled.ShouldContain("STATUS:CANCELLED");
        cancelled.ShouldContain($"UID:interview-{interview.Id:N}@mythorneai");
    }

    [Fact]
    public void A_loop_chains_rounds_back_to_back_with_the_break()
    {
        AvailableSlot At(int hour, int minute, int length) =>
            new(Utc(11, 19, hour, minute), Utc(11, 19, hour, minute).AddMinutes(length));
        IReadOnlyList<AvailableSlot> first = [At(14, 0, 45), At(15, 0, 45)];
        // The second round is open at 15:00 (after 14:00 + 45 + 15) but not at 16:00.
        IReadOnlyList<AvailableSlot> second = [At(15, 0, 60), At(17, 0, 60)];
        var loops = SchedulingPlanner.Sequences([first, second], TimeSpan.FromMinutes(15));
        loops.Count.ShouldBe(1);
        loops[0][0].StartsAt.ShouldBe(Utc(11, 19, 14));
        loops[0][1].StartsAt.ShouldBe(Utc(11, 19, 15));
    }

    [Fact]
    public void Suggestions_put_the_least_busy_day_first_and_spread_over_days()
    {
        // Busy on Thursday 19 November (two interviews), free on Friday.
        var busy = Person("UTC", booked: [Utc(11, 19, 9), Utc(11, 19, 10)]);
        IReadOnlyList<IReadOnlyList<AvailableSlot>> options =
        [
            .. new[] { 13, 14, 15 }.Select(hour =>
                (IReadOnlyList<AvailableSlot>)
                    [new(Utc(11, 19, hour), Utc(11, 19, hour).AddHours(1))]
            ),
            .. new[] { 13, 14, 15 }.Select(hour =>
                (IReadOnlyList<AvailableSlot>)
                    [new(Utc(11, 20, hour), Utc(11, 20, hour).AddHours(1))]
            ),
        ];
        var ranked = SchedulingPlanner.Rank(
            options,
            [
                [busy],
            ],
            TimeZoneInfo.Utc,
            take: 4,
            perDay: 2
        );
        ranked.Count.ShouldBe(4);
        ranked[0].Sessions[0].StartsAt.ShouldBe(Utc(11, 20, 13));
        ranked[0].Load.ShouldBeLessThan(ranked[^1].Load);
        ranked.Count(x => x.Sessions[0].StartsAt.Day == 20).ShouldBe(2);
    }

    [Fact]
    public void Working_windows_are_the_persons_hours_in_their_zone()
    {
        var windows = AvailabilityService.WorkingWindows(
            Person("America/New_York"),
            Utc(11, 20, 0),
            Utc(11, 21, 0)
        );
        // Friday 20 November 2026, 9 to 5 Eastern Standard Time is 14:00 to 22:00 UTC.
        windows.ShouldContain(new BusyWindow(Utc(11, 20, 14), Utc(11, 20, 22)));
    }

    [Fact]
    public void Transcription_sends_small_files_splits_big_ones_and_says_when_it_cannot()
    {
        RecordingPipeline.Plan(10L * 1024 * 1024, ffmpeg: false).ShouldBe(TranscriptionPlan.Whole);
        RecordingPipeline.Plan(200L * 1024 * 1024, ffmpeg: true).ShouldBe(TranscriptionPlan.Split);
        RecordingPipeline
            .Plan(200L * 1024 * 1024, ffmpeg: false)
            .ShouldBe(TranscriptionPlan.TooLong);
        RecordingPipeline.Stamp(754).ShouldBe("12:34");
        RecordingPipeline.Stamp(3723).ShouldBe("1:02:03");
        var vtt = RecordingPipeline.Vtt([new TranscriptSegment(1.5, 4, "A", "Hello --> there")]);
        vtt.ShouldStartWith("WEBVTT");
        vtt.ShouldContain("00:00:01.500 --> 00:00:04.000");
        vtt.ShouldContain("<v Speaker A>Hello -> there");
    }

    [Fact]
    public void Pools_suggest_free_people_and_take_turns_fairly()
    {
        var now = Utc(11, 2, 12);
        var members = new List<PoolMember>
        {
            new("a@example.test", 0, null, 0, 10),
            new("b@example.test", 0, null, 3, 10),
            new("c@example.test", 0, null, 0, 0),
            new("d@example.test", 0, null, 0, 10),
        };
        // Nobody has had a turn: free people first, lightest week first, then by email.
        InterviewerPools.Rank(members).Select(x => x.Email[0]).ShouldBe(['a', 'd', 'b', 'c']);

        // Six bookings of one person each: everyone free gets two turns, in a fixed order.
        var turns = new List<char>();
        for (var i = 0; i < 6; i++)
        {
            var next = InterviewerPools.Rank(members)[0];
            turns.Add(next.Email[0]);
            members[members.IndexOf(next)] = next with
            {
                Recent = next.Recent + 1,
                LastAt = now.AddHours(i),
            };
        }
        turns.ShouldBe(['a', 'd', 'b', 'a', 'd', 'b']);
        turns.ShouldNotContain('c', "c has no open times in the range");

        // Same number of turns: whoever waited longest since their last one goes first.
        InterviewerPools
            .Rank([
                new("x@example.test", 1, now, 0, 5),
                new("y@example.test", 1, now.AddDays(-9), 4, 5),
            ])[0]
            .Email.ShouldBe("y@example.test");
    }

    [Fact]
    public void Transcript_files_read_vtt_srt_and_plain_text_with_speakers()
    {
        var vtt = TranscriptFiles.Parse(
            "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\n<v Jordan Lee>Tell me about\n\n2\n00:00:03.600 --> 00:00:05.000\n<v Jordan Lee>a migration.\n\n00:00:06.000 --> 00:00:09.000\nSam Ortiz: We moved Postgres.\n"
        );
        vtt.Count.ShouldBe(2, "one person's cues back to back are joined");
        vtt[0].ShouldBe(new TranscriptSegment(1, 5, "Jordan Lee", "Tell me about a migration."));
        vtt[1].Speaker.ShouldBe("Sam Ortiz");
        vtt[1].Start.ShouldBe(6);

        var srt = TranscriptFiles.Parse(
            "1\r\n00:01:02,500 --> 00:01:04,000\r\nSpeaker 2: Hello there\r\n\r\n2\r\n01:00:00,000 --> 01:00:02,000\r\nNo name here\r\n"
        );
        srt.Count.ShouldBe(2);
        srt[0].ShouldBe(new TranscriptSegment(62.5, 64, "Speaker 2", "Hello there"));
        srt[1].Start.ShouldBe(3600);
        srt[1].Speaker.ShouldBeNull();

        var plain = TranscriptFiles.Parse(
            "[00:10] Alex Kim: Welcome.\nSo the plan: start small.\n1:05 Priya: Sounds good.\n"
        );
        plain
            .Select(x => (x.Start, x.Speaker))
            .ShouldBe([(10d, "Alex Kim"), (10d, null), (65d, "Priya")]);
        plain[1]
            .Text.ShouldBe(
                "So the plan: start small.",
                "a lower-case word before a colon is not a name"
            );
        TranscriptFiles.Parse("   \n").ShouldBeEmpty();
    }

    [Fact]
    public void Long_transcripts_split_into_parts_without_losing_or_cutting_lines()
    {
        var lines = Enumerable
            .Range(0, 3000)
            .Select(i => $"[{i}:00] Speaker A: line {i} {new string('x', 30)}")
            .ToList();
        var parts = InterviewSummaries.Parts(lines, 10_000);
        parts.Count.ShouldBeGreaterThan(9);
        parts.ShouldAllBe(x => x.Length <= 10_000);
        string.Join("\n", parts).ShouldBe(string.Join("\n", lines));
        InterviewSummaries.Parts(["short"], 10_000).ShouldBe(["short"]);

        var names = new Dictionary<string, string> { ["A"] = "Jordan Lee" };
        RecordingPipeline.SpeakerName(names, "A").ShouldBe("Jordan Lee");
        RecordingPipeline.SpeakerName(names, "B").ShouldBe("Speaker B");
        RecordingPipeline.SpeakerName(names, "Sam Ortiz").ShouldBe("Sam Ortiz");
        RecordingPipeline
            .Vtt([new TranscriptSegment(0, 1, "A", "Hi")], names)
            .ShouldContain("<v Jordan Lee>Hi");
    }
}
