using MyThorneAI.Ats.Api.Infrastructure;
using Shouldly;
using Xunit;

namespace MyThorneAI.Ats.Api.Tests;

public sealed class TimeTextTests
{
    private static readonly DateTimeOffset Winter = new(2026, 11, 14, 20, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Writes_the_time_in_the_readers_zone_with_the_zone_named()
    {
        var text = TimeText.DateTime(Winter, TimeText.Zone("America/New_York"));
        text.ShouldStartWith("Saturday, November 14, 2026 at 3:00 PM");
        text.ShouldNotContain("Z");
        text.ShouldNotContain("20:00");
    }

    [Fact]
    public void Falls_back_through_person_then_organization_then_utc()
    {
        TimeText.Zone(null, "America/Chicago").Id.ShouldBe("America/Chicago");
        TimeText.Zone("Europe/London", "America/Chicago").Id.ShouldBe("Europe/London");
        TimeText.Zone(null, "Not/AZone").ShouldBe(TimeZoneInfo.Utc);
        TimeText.DateTime(Winter, TimeText.Zone((string?)null)).ShouldEndWith("8:00 PM UTC");
    }

    [Fact]
    public void Ranges_on_one_day_name_the_day_once()
    {
        var text = TimeText.Range(Winter, Winter.AddMinutes(45), TimeText.Zone("America/New_York"));
        text.ShouldStartWith("Saturday, November 14, 2026, 3:00 – 3:45 PM");
    }
}
