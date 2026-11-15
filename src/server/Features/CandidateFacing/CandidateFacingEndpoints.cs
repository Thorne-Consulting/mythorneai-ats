using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record CareerSiteRequest(
    string? BrandColor,
    string? Headline,
    string? IntroMarkdown,
    string? WebsiteUrl,
    string[]? SocialUrls,
    bool RequireResume
);

public sealed record DocumentRequestBody(string? Label, string? Kind, string? Note);

/// <summary>The team's side of the candidate-facing area: careers site settings and document requests.</summary>
public static partial class CandidateFacingEndpoints
{
    public const string DocumentRequestKey = "document-request";
    private const long MaxImageBytes = 2 * 1024 * 1024;

    public static RouteGroupBuilder MapCandidateFacingStaff(this RouteGroupBuilder api)
    {
        var site = api.MapGroup("/careers-site").RequireAuthorization(AtsPolicies.Admin);

        site.MapGet("", async (AtsDbContext db, CancellationToken ct) => await ShapeAsync(db, ct));

        site.MapPut(
            "",
            async (
                CareerSiteRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var errors = Check(request, out var clean);
                if (errors.Count > 0)
                    return Results.ValidationProblem(errors);
                var row = await GetOrCreateAsync(db, ct);
                if (row is null)
                    return NoOrganization();
                row.BrandColor = clean.BrandColor;
                row.Headline = clean.Headline;
                row.IntroMarkdown = clean.IntroMarkdown;
                row.WebsiteUrl = clean.WebsiteUrl;
                row.SocialUrls = clean.SocialUrls ?? [];
                row.RequireResume = clean.RequireResume;
                row.UpdatedAt = DateTimeOffset.UtcNow;
                Audit.Add(db, principal, "CareerSite", row.Id, "Updated");
                await db.SaveChangesAsync(ct);
                return await ShapeAsync(db, ct);
            }
        );

        // Logo, logo for dark backgrounds, or the square icon. PNG or JPEG up to 2 MB.
        site.MapPost(
            "/images/{slot}",
            async (
                string slot,
                IFormFile file,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                if (!CareerSites.Slots.Contains(slot))
                    return Results.NotFound();
                if (!LocalFileStore.IsImage(file.FileName) || file.Length > MaxImageBytes)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["file"] = ["Choose a PNG or JPEG image of 2 MB or less."],
                        }
                    );
                var row = await GetOrCreateAsync(db, ct);
                if (row is null)
                    return NoOrganization();
                (string StoredName, string ContentType) stored;
                try
                {
                    stored = await files.SaveValidatedAsync(file, ct, allowImages: true);
                }
                catch (InvalidDataException exception)
                {
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["file"] = [exception.Message] }
                    );
                }
                var old = CareerSites.FileFor(row, slot);
                CareerSites.SetFile(row, slot, stored.StoredName);
                row.UpdatedAt = DateTimeOffset.UtcNow;
                Audit.Add(db, principal, "CareerSite", row.Id, "ImageUploaded", new { slot });
                await db.SaveChangesAsync(ct);
                if (old is not null)
                    files.Delete(old);
                return await ShapeAsync(db, ct);
            }
        );

        site.MapDelete(
            "/images/{slot}",
            async (
                string slot,
                ClaimsPrincipal principal,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                if (!CareerSites.Slots.Contains(slot))
                    return Results.NotFound();
                var row = await db.CareerSites.OrderBy(x => x.UpdatedAt).FirstOrDefaultAsync(ct);
                if (row is not null && CareerSites.FileFor(row, slot) is { } old)
                {
                    CareerSites.SetFile(row, slot, null);
                    row.UpdatedAt = DateTimeOffset.UtcNow;
                    Audit.Add(db, principal, "CareerSite", row.Id, "ImageRemoved", new { slot });
                    await db.SaveChangesAsync(ct);
                    files.Delete(old);
                }
                return await ShapeAsync(db, ct);
            }
        );

        // The job as applicants will see it, for the posting preview, whatever its status.
        api.MapGet(
            "/requisitions/{id:guid}/posting-preview",
            async (Guid id, ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var job = await db
                    .Requisitions.AsNoTracking()
                    .Include(x => x.Questions)
                    .SingleOrDefaultAsync(x => x.Id == id, ct);
                if (job is null || !AtsEndpoints.CanManage(job, principal))
                    return Results.NotFound();
                // The public job shape (typed questions, pay, place) plus status and whether it is listed.
                return Results.Ok(PublicEndpoints.PublicJobView(job, preview: true));
            }
        );

        MapDocumentRequests(api);
        return api;
    }

    private static async Task<IResult> ShapeAsync(AtsDbContext db, CancellationToken ct)
    {
        var organization = await db
            .Organizations.AsNoTracking()
            .Select(x => new { x.Name, x.PublicUrl })
            .SingleOrDefaultAsync(ct);
        return Results.Ok(
            new
            {
                company = organization?.Name,
                publicUrl = organization?.PublicUrl,
                brand = CareerSites.Public(await CareerSites.FindAsync(db, ct)),
            }
        );
    }

    private static async Task<CareerSite?> GetOrCreateAsync(AtsDbContext db, CancellationToken ct)
    {
        var row = await db.CareerSites.OrderBy(x => x.UpdatedAt).FirstOrDefaultAsync(ct);
        if (row is not null)
            return row;
        var organizationId = await db
            .Organizations.OrderBy(x => x.CreatedAt)
            .Select(x => (Guid?)x.Id)
            .FirstOrDefaultAsync(ct);
        if (organizationId is null)
            return null;
        row = new CareerSite { OrganizationId = organizationId.Value };
        db.CareerSites.Add(row);
        return row;
    }

    private static IResult NoOrganization() =>
        Results.Json(
            new { message = "Finish setting up the workspace first." },
            statusCode: StatusCodes.Status409Conflict
        );

    internal static Dictionary<string, string[]> Check(
        CareerSiteRequest request,
        out CareerSiteRequest clean
    )
    {
        var errors = new Dictionary<string, string[]>();
        static string? Trim(string? value) =>
            string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        static bool IsWebAddress(string value) =>
            value.Length <= 300
            && Uri.TryCreate(value, UriKind.Absolute, out var uri)
            && uri.Scheme is "https" or "http";

        var color = Trim(request.BrandColor)?.ToLowerInvariant();
        if (color is not null && !Regex.IsMatch(color, "^#[0-9a-f]{6}$"))
            errors["brandColor"] = ["Enter a colour like #2468ff."];
        var headline = Trim(request.Headline);
        if (headline?.Length > 120)
            errors["headline"] = ["Keep the headline under 120 characters."];
        var intro = Trim(request.IntroMarkdown);
        if (intro?.Length > 4000)
            errors["introMarkdown"] = ["Keep the introduction under 4,000 characters."];
        else if (MediaEndpoints.HasImageWithoutAlt(intro))
            errors["introMarkdown"] = [MediaEndpoints.AltRequired];
        var website = Trim(request.WebsiteUrl);
        if (website is not null && !IsWebAddress(website))
            errors["websiteUrl"] = ["Paste the full address, starting with https://"];
        var social = (request.SocialUrls ?? [])
            .Select(Trim)
            .OfType<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (social.Length > 6)
            errors["socialUrls"] = ["Add up to 6 links."];
        else if (social.FirstOrDefault(x => !IsWebAddress(x)) is { } bad)
            errors["socialUrls"] = [$"Paste the full address, starting with https:// ({bad})."];
        clean = new CareerSiteRequest(
            color,
            headline,
            intro,
            website,
            social,
            request.RequireResume
        );
        return errors;
    }
}
