using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

/// <summary>The employer's brand for the careers site, the portal and emails (<see cref="CareerSite"/>).</summary>
public static class CareerSites
{
    public const string Logo = "logo";
    public const string LogoDark = "logo-dark";
    public const string Icon = "icon";
    public static readonly string[] Slots = [Logo, LogoDark, Icon];

    public static string? FileFor(CareerSite site, string slot) =>
        slot switch
        {
            Logo => site.LogoFile,
            LogoDark => site.LogoDarkFile,
            Icon => site.IconFile,
            _ => null,
        };

    public static void SetFile(CareerSite site, string slot, string? file)
    {
        switch (slot)
        {
            case Logo:
                site.LogoFile = file;
                break;
            case LogoDark:
                site.LogoDarkFile = file;
                break;
            case Icon:
                site.IconFile = file;
                break;
        }
    }

    /// <summary>Site-relative address of an image; the version changes on every save so caches refresh.</summary>
    public static string? ImageUrl(CareerSite? site, string slot) =>
        site is not null && FileFor(site, slot) is not null
            ? $"/public/careers/images/{slot}?v={site.UpdatedAt.ToUnixTimeSeconds()}"
            : null;

    public static async Task<CareerSite?> FindAsync(AtsDbContext db, CancellationToken ct) =>
        await db.CareerSites.AsNoTracking().OrderBy(x => x.UpdatedAt).FirstOrDefaultAsync(ct);

    /// <summary>The fields any visitor may read.</summary>
    public static object Public(CareerSite? site) =>
        new
        {
            brandColor = site?.BrandColor,
            headline = site?.Headline,
            introMarkdown = site?.IntroMarkdown,
            websiteUrl = site?.WebsiteUrl,
            socialUrls = site?.SocialUrls ?? [],
            requireResume = site?.RequireResume ?? false,
            logoUrl = ImageUrl(site, Logo),
            logoDarkUrl = ImageUrl(site, LogoDark),
            iconUrl = ImageUrl(site, Icon),
        };

    /// <summary>What the email layout shows: the square icon (absolute, so mail apps can load it) and the colour.</summary>
    public static async Task<EmailBrand?> EmailBrandAsync(AtsDbContext db, CancellationToken ct)
    {
        var site = await FindAsync(db, ct);
        if (site is null)
            return null;
        var root = (
            await db.Organizations.Select(x => x.PublicUrl).SingleOrDefaultAsync(ct)
        )?.TrimEnd('/');
        var icon = ImageUrl(site, Icon);
        return new EmailBrand(
            string.IsNullOrWhiteSpace(root) || icon is null ? null : root + icon,
            site.BrandColor
        );
    }
}

public static partial class PublicEndpoints
{
    private static void MapPublicCareerSite(RouteGroupBuilder api)
    {
        // The public face of the organization: its name, where the site lives (for links and
        // search engines) and its brand.
        api.MapGet(
                "/organization",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var organization = await db
                        .Organizations.AsNoTracking()
                        .Select(x => new { x.Name, x.PublicUrl })
                        .SingleOrDefaultAsync(ct);
                    return Results.Ok(
                        new
                        {
                            name = organization?.Name,
                            publicUrl = organization?.PublicUrl,
                            brand = CareerSites.Public(await CareerSites.FindAsync(db, ct)),
                        }
                    );
                }
            )
            .RequireRateLimiting(PublicReadPolicy);

        api.MapGet(
                "/careers/images/{slot}",
                async (
                    string slot,
                    string? v,
                    HttpContext http,
                    AtsDbContext db,
                    LocalFileStore files,
                    CancellationToken ct
                ) =>
                {
                    var site = await CareerSites.FindAsync(db, ct);
                    if (site is null || CareerSites.FileFor(site, slot) is not { } file)
                        return Results.NotFound();
                    // A versioned address never changes, so browsers and mail apps can keep it.
                    http.Response.Headers.CacheControl = v is null
                        ? "public, max-age=300"
                        : "public, max-age=31536000, immutable";
                    return Results.File(
                        await files.OpenReadAsync(file, ct),
                        file.EndsWith(".png", StringComparison.OrdinalIgnoreCase)
                            ? "image/png"
                            : "image/jpeg"
                    );
                }
            )
            .RequireRateLimiting(PublicReadPolicy);
    }
}
