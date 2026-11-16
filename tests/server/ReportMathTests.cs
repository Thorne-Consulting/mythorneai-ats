using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class ReportMathTests
{
    private static readonly TimeZoneInfo Chicago = TimeText.Zone("America/Chicago");

    [Fact]
    public void Weekly_emails_go_out_on_the_chosen_day_and_local_hour()
    {
        // Friday November 13, 2026, 4 PM in Chicago (Central Standard Time, UTC-6).
        var friday = new DateTimeOffset(2026, 11, 13, 22, 0, 0, TimeSpan.Zero);
        ReportDigest
            .NextSend(ReportFrequency.Weekly, 1, 1, 8, friday, Chicago)
            .ShouldBe(new DateTimeOffset(2026, 11, 16, 14, 0, 0, TimeSpan.Zero));
        // The database only stores UTC offsets.
        ReportDigest
            .NextSend(ReportFrequency.Weekly, 1, 1, 8, friday, Chicago)
            .Offset.ShouldBe(TimeSpan.Zero);
        // Already past 8 AM on a Monday: next Monday.
        var monday = new DateTimeOffset(2026, 11, 16, 15, 0, 0, TimeSpan.Zero);
        ReportDigest
            .NextSend(ReportFrequency.Weekly, 1, 1, 8, monday, Chicago)
            .ShouldBe(new DateTimeOffset(2026, 11, 23, 14, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void Monthly_emails_and_daylight_saving_gaps()
    {
        var after = new DateTimeOffset(2026, 11, 13, 22, 0, 0, TimeSpan.Zero);
        ReportDigest
            .NextSend(ReportFrequency.Monthly, 0, 1, 9, after, Chicago)
            .ShouldBe(new DateTimeOffset(2026, 12, 1, 15, 0, 0, TimeSpan.Zero));
        // 2 AM on March 8, 2026 does not exist in Chicago: the email goes at 3 AM daylight time (8 AM UTC).
        var march = new DateTimeOffset(2026, 3, 1, 12, 0, 0, TimeSpan.Zero);
        ReportDigest
            .NextSend(ReportFrequency.Weekly, 0, 1, 2, march.AddDays(6), Chicago)
            .ShouldBe(new DateTimeOffset(2026, 3, 8, 8, 0, 0, TimeSpan.Zero));
    }

    [Fact]
    public void Periods_resolve_in_the_organization_zone_and_compare_to_the_same_length_before()
    {
        // 11 PM on November 13 in Chicago is already November 14 in UTC; the period still ends on the 13th.
        var now = new DateTimeOffset(2026, 11, 14, 5, 0, 0, TimeSpan.Zero);
        var period = ReportPeriod.Resolve("30d", null, null, now, Chicago);
        period.From.ShouldBe(new DateOnly(2026, 10, 15));
        period.To.ShouldBe(new DateOnly(2026, 11, 13));
        period.End.ShouldBe(new DateTimeOffset(2026, 11, 14, 0, 0, 0, TimeSpan.FromHours(-6)));
        period.End!.Value.Offset.ShouldBe(TimeSpan.Zero);
        var previous = period.Previous()!;
        previous.From.ShouldBe(new DateOnly(2026, 9, 15));
        previous.To.ShouldBe(new DateOnly(2026, 10, 14));
        previous.Label.ShouldBe("previous 30 days");
        ReportPeriod
            .Resolve("quarter", null, null, now, Chicago)
            .From.ShouldBe(new DateOnly(2026, 10, 1));
        ReportPeriod.Resolve(null, null, null, now, Chicago).IsAllTime.ShouldBeTrue();
        ReportPeriod.Resolve(null, null, null, now, Chicago).Previous().ShouldBeNull();
    }

    [Fact]
    public void Percentiles_sources_and_reasons()
    {
        ReportFormat.Percentile([4, 1, 3, 2], 0.5).ShouldBe(2.5);
        ReportFormat.Percentile([1, 2, 3, 4, 5], 0.75).ShouldBe(4);
        ReportFormat.Percentile([], 0.5).ShouldBeNull();
        ReportFormat.SourceKey(" LinkedIn ").ShouldBe(ReportFormat.SourceKey("linkedin"));
        ReportFormat
            .ReasonOf("Withdrawn by candidate: took another job")
            .ShouldBe("Withdrawn by candidate");
        ReportFormat.ReasonOf("  ").ShouldBe("No reason given");
        var (unit, buckets) = ReportFormat.Buckets(
            new DateOnly(2026, 11, 4),
            new DateOnly(2026, 11, 13)
        );
        unit.ShouldBe("Week of");
        buckets
            .Select(x => x.Start)
            .ShouldBe([new DateOnly(2026, 11, 2), new DateOnly(2026, 11, 9)]);
    }

    [Fact]
    public void Stages_combine_by_type_across_jobs_and_keep_their_names_in_one()
    {
        ReportEngine.StageKey(true, "Onsite", StageType.Interview).ShouldBe("Interview");
        ReportEngine.StageKey(true, "Panel", StageType.Interview).ShouldBe("Interview");
        ReportEngine.StageKey(false, " Onsite ", StageType.Interview).ShouldBe("Onsite");
        // Across jobs the order is the type's, whatever each job's own position.
        ReportEngine
            .StageOrder(true, StageType.Screen, 7)
            .ShouldBeLessThan(ReportEngine.StageOrder(true, StageType.Interview, 1));
        ReportEngine.StageOrder(false, StageType.Screen, 7).ShouldBe(7);
    }

    [Fact]
    public void Offers_count_answers_and_expire_after_their_last_day()
    {
        var sent = new DateTimeOffset(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);
        var today = new DateOnly(2026, 11, 13);
        ReportEngine.OfferFact Offer(
            OfferStatus status,
            DateOnly? expires = null,
            int answeredAfterDays = 0
        ) =>
            new(
                Guid.NewGuid(),
                Guid.NewGuid(),
                sent,
                status,
                answeredAfterDays > 0 ? sent.AddDays(answeredAfterDays) : null,
                expires,
                null,
                false
            );
        var accepted = Offer(OfferStatus.Accepted, answeredAfterDays: 3);
        var declined = Offer(OfferStatus.Declined, answeredAfterDays: 1);
        var expired = Offer(OfferStatus.Sent, new DateOnly(2026, 11, 12));
        var lastDay = Offer(OfferStatus.Sent, today);
        var withdrawn = Offer(OfferStatus.Withdrawn);
        expired.Result(today).ShouldBe(ReportEngine.OfferResult.Expired);
        lastDay.Result(today).ShouldBe(ReportEngine.OfferResult.Waiting);
        accepted.DaysToAnswer.ShouldBe(3);
        expired.DaysToAnswer.ShouldBeNull();
        // Only answers count: waiting, expired and withdrawn offers stay out of the rate.
        ReportEngine
            .AcceptanceRate([accepted, declined, expired, lastDay, withdrawn])
            .ShouldBe(50);
        ReportEngine.AcceptanceRate([expired, withdrawn]).ShouldBeNull();
    }

    [Fact]
    public void Email_changes_say_which_way_and_against_what()
    {
        var now = new ReportStat("Applications", "57", Number: 57);
        ReportDigest
            .Change(now, new ReportStat("Applications", "50", Number: 50), "previous 30 days")
            .ShouldBe(" (up 14% from 50 in the previous 30 days)");
        ReportDigest
            .Change(now, new ReportStat("Applications", "0", Number: 0), "previous 30 days")
            .ShouldBe(" (up from 0 in the previous 30 days)");
        ReportDigest.Change(now, null, "previous 30 days").ShouldBe("");
        ReportDigest
            .Change(
                new ReportStat("Acceptance rate", "60%", Number: 60),
                new ReportStat("Acceptance rate", "50%", Number: 50),
                "previous 30 days"
            )
            .ShouldBe(" (up 10 points from 50% in the previous 30 days)");
    }
}
