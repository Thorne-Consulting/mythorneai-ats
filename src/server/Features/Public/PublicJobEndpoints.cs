using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Contracts;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    /// <summary>Jobs anyone may see: open and not confidential.</summary>
    internal static IQueryable<Requisition> ListedJobs(AtsDbContext db) =>
        db.Requisitions.Where(x => x.Status == RequisitionStatus.Open && !x.IsConfidential);

    private const string RemoteLocation = "Remote";

    private static void MapPublicJobs(RouteGroupBuilder api)
    {
        // The public job feed. Filters match whole values; several values of one filter mean "any of".
        // "Remote" as a location means jobs whose work mode is remote.
        api.MapGet(
                "/jobs",
                async (
                    AtsDbContext db,
                    string? query,
                    string[]? department,
                    string[]? location,
                    string[]? mode,
                    int? offset,
                    int? limit,
                    CancellationToken ct
                ) =>
                {
                    var jobs = ListedJobs(db).AsNoTracking();
                    if (!string.IsNullOrWhiteSpace(query))
                    {
                        var term = $"%{query.Trim()}%";
                        jobs = jobs.Where(x =>
                            EF.Functions.ILike(x.Title, term)
                            || EF.Functions.ILike(x.Department, term)
                            || EF.Functions.ILike(x.Location, term)
                            || EF.Functions.ILike(x.Description, term)
                        );
                    }
                    var departments = Lowered(department);
                    if (departments.Length > 0)
                        jobs = jobs.Where(x => departments.Contains(x.Department.Trim().ToLower()));
                    var locations = Lowered(location);
                    if (locations.Length > 0)
                    {
                        var remote = locations.Contains(RemoteLocation.ToLower());
                        jobs = jobs.Where(x =>
                            locations.Contains(x.Location.Trim().ToLower())
                            || (remote && x.WorkMode.ToLower() == "remote")
                        );
                    }
                    var modes = Lowered(mode);
                    if (modes.Length > 0)
                        jobs = jobs.Where(x => modes.Contains(x.WorkMode.Trim().ToLower()));

                    var total = await jobs.CountAsync(ct);
                    var pageOffset = Math.Max(0, offset ?? 0);
                    var pageSize = Math.Clamp(limit ?? 25, 1, 200);
                    var items = await jobs.OrderByDescending(x => x.OpenedAt ?? x.CreatedAt)
                        .ThenBy(x => x.Title)
                        .Skip(pageOffset)
                        .Take(pageSize)
                        .Select(x => new
                        {
                            x.Id,
                            x.Code,
                            x.Title,
                            x.Department,
                            x.Location,
                            x.EmploymentType,
                            x.WorkMode,
                            x.Openings,
                            PostedAt = x.OpenedAt ?? x.CreatedAt,
                            x.UpdatedAt,
                        })
                        .ToListAsync(ct);

                    return Results.Ok(
                        new
                        {
                            items,
                            total,
                            offset = pageOffset,
                            limit = pageSize,
                        }
                    );
                }
            )
            .RequireRateLimiting(PublicReadPolicy);

        // Every department, location and work mode with open jobs, with how many, for the filters.
        api.MapGet(
                "/jobs/facets",
                async (AtsDbContext db, CancellationToken ct) =>
                {
                    var rows = await ListedJobs(db)
                        .AsNoTracking()
                        .Select(x => new
                        {
                            x.Department,
                            x.Location,
                            x.WorkMode,
                        })
                        .ToListAsync(ct);
                    static object[] Count(IEnumerable<string> values) =>
                        values
                            .Select(v => v.Trim())
                            .Where(v => v.Length > 0)
                            .GroupBy(v => v, StringComparer.OrdinalIgnoreCase)
                            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                            .Select(g => (object)new { value = g.First(), count = g.Count() })
                            .ToArray();
                    static bool Remote(string mode) =>
                        mode.Trim().Equals("remote", StringComparison.OrdinalIgnoreCase);
                    var remote = rows.Count(x => Remote(x.WorkMode));
                    // A remote job's "Remote, US" location is the same choice as "Remote", so it is not listed twice.
                    var locations = Count(
                        rows.Where(x =>
                                !(
                                    Remote(x.WorkMode)
                                    && x.Location.Trim()
                                        .StartsWith(
                                            RemoteLocation,
                                            StringComparison.OrdinalIgnoreCase
                                        )
                                )
                            )
                            .Select(x => x.Location)
                    );
                    if (remote > 0)
                        locations = [new { value = RemoteLocation, count = remote }, .. locations];
                    return Results.Ok(
                        new
                        {
                            total = rows.Count,
                            departments = Count(rows.Select(x => x.Department)),
                            locations,
                            workModes = Count(rows.Select(x => x.WorkMode)),
                        }
                    );
                }
            )
            .RequireRateLimiting(PublicReadPolicy);

        api.MapGet(
                "/jobs/{id:guid}",
                async (Guid id, AtsDbContext db, CancellationToken ct) =>
                {
                    var job = await ListedJobs(db)
                        .AsNoTracking()
                        .IgnoreAutoIncludes()
                        .Include(x => x.Questions)
                        .SingleOrDefaultAsync(x => x.Id == id, ct);
                    return job is null ? Results.NotFound() : Results.Ok(PublicJobView(job));
                }
            )
            .RequireRateLimiting(PublicReadPolicy);

        // Upload first: the file is kept for a day and its contact details fill the form.
        api.MapPost(
            "/resume",
            async (
                HttpRequest request,
                AtsDbContext db,
                LocalFileStore files,
                ResumeTextExtractor extractor,
                CancellationToken ct
            ) =>
            {
                var file = (await request.ReadFormAsync(ct)).Files.GetFile("resume");
                if (file is null)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]>
                        {
                            ["resume"] = ["Choose a PDF or Word document."],
                        }
                    );
                (string StoredName, string ContentType) stored;
                try
                {
                    stored = await files.SaveValidatedAsync(file, ct);
                }
                catch (InvalidDataException exception)
                {
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["resume"] = [exception.Message] }
                    );
                }
                var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                var fileName = Path.GetFileName(file.FileName);
                db.ResumeUploads.Add(
                    new ResumeUpload
                    {
                        TokenHash = Hash(token),
                        StoredFileName = stored.StoredName,
                        OriginalFileName = fileName.Length > 260 ? fileName[^260..] : fileName,
                        ContentType = stored.ContentType,
                        Length = file.Length,
                    }
                );
                await db.SaveChangesAsync(ct);
                ResumeAutofill.Fields? fields = null;
                try
                {
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    timeout.CancelAfter(TimeSpan.FromSeconds(20));
                    await using var stream = await files.OpenReadAsync(
                        stored.StoredName,
                        timeout.Token
                    );
                    fields = ResumeAutofill.Read(
                        await extractor.ExtractAsync(stream, fileName, timeout.Token)
                    );
                }
                catch (Exception) when (!ct.IsCancellationRequested)
                {
                    // A scanned or old Word file still goes with the application; only the autofill is skipped.
                }
                return Results.Ok(
                    new
                    {
                        fileToken = token,
                        fileName,
                        readable = fields is not null,
                        fields,
                    }
                );
            }
        );

        // A file for a file question, uploaded before the form is sent (kept a day, like resumes).
        api.MapPost(
            "/answer-file",
            async (
                HttpRequest request,
                AtsDbContext db,
                LocalFileStore files,
                CancellationToken ct
            ) =>
            {
                var file = (await request.ReadFormAsync(ct)).Files.GetFile("file");
                if (file is null)
                    return Results.ValidationProblem(
                        new Dictionary<string, string[]> { ["file"] = ["Choose a file."] }
                    );
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
                var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
                var fileName = Path.GetFileName(file.FileName);
                db.ResumeUploads.Add(
                    new ResumeUpload
                    {
                        TokenHash = Hash(token),
                        StoredFileName = stored.StoredName,
                        OriginalFileName = fileName.Length > 260 ? fileName[^260..] : fileName,
                        ContentType = stored.ContentType,
                        Length = file.Length,
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { fileToken = token, fileName });
            }
        );

        api.MapPost(
            "/jobs/{id:guid}/applications",
            (
                Guid id,
                PublicApplyRequest request,
                AtsDbContext db,
                LocalFileStore files,
                IHostEnvironment environment,
                CancellationToken ct
            ) => ApplyAsync(id, request, null, db, files, environment, ct)
        );

        // Older form posts with the file attached. The apply page now uploads first and sends fileToken.
        api.MapPost(
                "/jobs/{id:guid}/applications/resume",
                async (
                    Guid id,
                    HttpRequest request,
                    AtsDbContext db,
                    LocalFileStore files,
                    IHostEnvironment environment,
                    CancellationToken ct
                ) =>
                {
                    var form = await request.ReadFormAsync(ct);
                    string? Field(string name) => form[name].ToString();
                    var apply = new PublicApplyRequest(
                        Field("firstName") ?? "",
                        Field("lastName") ?? "",
                        Field("email") ?? "",
                        Field("phone"),
                        Field("location"),
                        Field("linkedInUrl"),
                        Field("answersMarkdown"),
                        Field("timeZone"),
                        null,
                        Field("website"),
                        Field("source"),
                        Field("utmSource"),
                        Field("utmMedium"),
                        Field("utmCampaign")
                    );
                    var file = form.Files.GetFile("resume");
                    if (file is null)
                        return Results.ValidationProblem(
                            new Dictionary<string, string[]>
                            {
                                ["resume"] = ["Choose a PDF or Word document."],
                            }
                        );
                    return await ApplyAsync(id, apply, file, db, files, environment, ct);
                }
            )
            .Accepts<PublicResumeApplyRequest>("multipart/form-data");

        // "Send the email again" on the page after applying. Same answer whether or not it sent.
        api.MapPost(
            "/applications/{id:guid}/resend",
            async (
                Guid id,
                ResendApplicationEmailRequest request,
                AtsDbContext db,
                IHostEnvironment environment,
                CancellationToken ct
            ) =>
            {
                if (LooksLikeEmail(request.Email ?? ""))
                    await ApplicationIntake.ResendAsync(
                        db,
                        id,
                        request.Email!.Trim().ToLowerInvariant(),
                        environment,
                        ct
                    );
                return Results.Accepted();
            }
        );
    }

    /// <summary>
    /// A job as applicants see it: the posting, pay when the team shows it, the structured place
    /// and the typed questions (never their knockout answers). Needs Questions loaded.
    /// Status and Listed only for the workspace preview.
    /// </summary>
    internal static PublicJobDto PublicJobView(Requisition job, bool preview = false) =>
        new(
            job.Id,
            job.Code,
            job.Title,
            job.Department,
            job.Location,
            job.EmploymentType,
            job.WorkMode,
            job.Openings,
            job.Description,
            job.TargetStartDate,
            job.OpenedAt ?? job.CreatedAt,
            job.UpdatedAt,
            new PublicPlace(
                job.LocationCity,
                job.LocationRegion,
                job.LocationCountry,
                job.RemoteCountries
            ),
            job.ShowSalary && (job.SalaryMin ?? job.SalaryMax) is not null
                ? new PublicSalary(
                    job.SalaryMin,
                    job.SalaryMax,
                    job.SalaryCurrency,
                    job.SalaryPeriod,
                    AtsEndpoints.SalaryText(job)
                )
                : null,
            [.. job.Questions.OrderBy(x => x.SortOrder).Select(ApplicationQuestions.PublicView)],
            preview ? job.Status.ToString() : null,
            preview ? job.Status == RequisitionStatus.Open && !job.IsConfidential : null
        );

    private static async Task<IResult> ApplyAsync(
        Guid id,
        PublicApplyRequest request,
        IFormFile? file,
        AtsDbContext db,
        LocalFileStore files,
        IHostEnvironment environment,
        CancellationToken ct
    )
    {
        // People never see the "website" field; bots fill it in. Look accepted and keep nothing.
        if (!string.IsNullOrWhiteSpace(request.Website))
            return Results.Accepted(value: new { applicationId = Guid.NewGuid() });
        var (details, errors) = CheckApplication(request);
        if (details is null)
            return Results.ValidationProblem(errors);
        var job = await ListedJobs(db)
            .Include(x => x.Stages)
            .Include(x => x.Questions)
            .SingleOrDefaultAsync(x => x.Id == id, ct);
        if (job is null)
            return Results.NotFound();
        // Typed answers, checked against the job's questions; files must still be in the upload store.
        if (request.Answers is not null || job.Questions.Any(x => x.Required))
        {
            var (answers, answerErrors) = ApplicationQuestions.Check(
                job.Questions,
                request.Answers
            );
            var checkedAnswers = new List<CheckedAnswer>();
            foreach (var (question, values, token) in answers)
            {
                ResumeUpload? upload = null;
                if (token is not null)
                {
                    upload = await db
                        .ResumeUploads.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.TokenHash == Hash(token), ct);
                    if (upload is null)
                        answerErrors[$"answers.{question.Id}"] =
                        [
                            "Your file upload has expired. Add the file again.",
                        ];
                }
                checkedAnswers.Add(new CheckedAnswer(question, values, upload));
            }
            if (answerErrors.Count > 0)
                return Results.ValidationProblem(answerErrors);
            details = details with { Answers = checkedAnswers };
        }
        // The careers settings can make a resume required.
        if (
            file is null
            && string.IsNullOrWhiteSpace(request.FileToken)
            && await db.CareerSites.AnyAsync(x => x.RequireResume, ct)
        )
            return Results.ValidationProblem(
                new Dictionary<string, string[]> { ["resume"] = ["Add your resume to apply."] }
            );

        StoredResume? resume = null;
        if (file is not null)
        {
            try
            {
                var stored = await files.SaveValidatedAsync(file, ct);
                resume = new StoredResume(
                    stored.StoredName,
                    Path.GetFileName(file.FileName),
                    stored.ContentType,
                    file.Length
                );
            }
            catch (InvalidDataException exception)
            {
                return Results.ValidationProblem(
                    new Dictionary<string, string[]> { ["resume"] = [exception.Message] }
                );
            }
        }
        else if (!string.IsNullOrWhiteSpace(request.FileToken))
        {
            var upload = await db
                .ResumeUploads.AsNoTracking()
                .SingleOrDefaultAsync(x => x.TokenHash == Hash(request.FileToken.Trim()), ct);
            if (upload is null)
                return Results.ValidationProblem(
                    new Dictionary<string, string[]>
                    {
                        ["resume"] = ["Your resume upload has expired. Add the file again."],
                    }
                );
            resume = new StoredResume(
                upload.StoredFileName,
                upload.OriginalFileName,
                upload.ContentType,
                upload.Length,
                upload.Id
            );
        }

        try
        {
            var (applicationId, used) = await ApplicationIntake.SubmitAsync(
                db,
                files,
                job,
                details,
                resume,
                environment,
                ct
            );
            // A file sent with the form but not kept (applied before) is removed now; an upload waits for clean-up.
            if (file is not null && !used)
                files.Delete(resume!.StoredFileName);
            return Results.Accepted(value: new { applicationId });
        }
        catch
        {
            if (file is not null && resume is not null)
                files.Delete(resume.StoredFileName);
            throw;
        }
    }

    private static readonly Dictionary<string, string> KnownSources = new(
        StringComparer.OrdinalIgnoreCase
    )
    {
        ["linkedin"] = "LinkedIn",
        ["indeed"] = "Indeed",
        ["glassdoor"] = "Glassdoor",
        ["email"] = "Email",
        ["newsletter"] = "Newsletter",
        ["referral"] = "Referral",
        ["facebook"] = "Facebook",
        ["instagram"] = "Instagram",
        ["x"] = "X",
        ["twitter"] = "X",
        ["google"] = "Google",
    };

    /// <summary>Trimmed, length-checked details, or one message per field that needs fixing.</summary>
    internal static (ApplyDetails? Details, Dictionary<string, string[]> Errors) CheckApplication(
        PublicApplyRequest request
    )
    {
        var errors = new Dictionary<string, string[]>();
        string? Text(string field, string? value, int max, string? requiredMessage = null)
        {
            var clean = Clean(value);
            if (clean is null && requiredMessage is not null)
                errors[field] = [requiredMessage];
            else if (clean is not null && clean.Length > max)
                errors[field] = [$"Keep this under {max} characters."];
            return clean;
        }
        var firstName = Text("firstName", request.FirstName, 100, "Enter your first name.");
        var lastName = Text("lastName", request.LastName, 100, "Enter your last name.");
        var email = Clean(request.Email)?.ToLowerInvariant();
        if (
            email is null
            || !LooksLikeEmail(email)
            || !email.Contains('.', StringComparison.Ordinal)
        )
            errors["email"] = ["Enter an email like name@example.com."];
        var phone = Text("phone", request.Phone, 40);
        if (phone is not null && phone.Count(char.IsDigit) is < 6 or > 17)
            errors["phone"] =
            [
                "Enter a phone number with its country code, for example +1 312 555 0142.",
            ];
        var location = Text("location", request.Location, 200);
        var linkedIn = Text("linkedInUrl", request.LinkedInUrl, 300);
        if (
            linkedIn is not null
            && !(
                Uri.TryCreate(linkedIn, UriKind.Absolute, out var uri)
                && uri.Scheme is "https" or "http"
            )
        )
            errors["linkedInUrl"] = ["Paste the full link, starting with https://"];
        var answers = Text("answers", request.AnswersMarkdown, 40_000);
        if (errors.Count > 0)
            return (null, errors);

        var src = Short(request.Source);
        var utm = new Dictionary<string, string?>
        {
            ["src"] = src,
            ["utm_source"] = Short(request.UtmSource),
            ["utm_medium"] = Short(request.UtmMedium),
            ["utm_campaign"] = Short(request.UtmCampaign),
        }
            .Where(x => x.Value is not null)
            .ToDictionary();
        var source =
            KnownSources.GetValueOrDefault(src ?? Short(request.UtmSource) ?? "") ?? "Career site";
        return (
            new ApplyDetails(
                firstName!,
                lastName!,
                email!,
                phone,
                location,
                linkedIn,
                answers,
                Zone(request.TimeZone),
                source,
                utm.Count == 0 ? null : JsonSerializer.Serialize(utm)
            ),
            errors
        );
    }

    /// <summary>An IANA zone the server knows, or null.</summary>
    internal static string? Zone(string? id) =>
        Clean(id) is { Length: <= 64 } zone && TimeZoneInfo.TryFindSystemTimeZoneById(zone, out _)
            ? zone
            : null;

    private static string? Short(string? value) =>
        Clean(value) is { } clean ? clean[..Math.Min(clean.Length, 100)] : null;

    private static string[] Lowered(string[]? values) =>
        (values ?? [])
            .Select(v => v.Trim().ToLowerInvariant())
            .Where(v => v.Length > 0)
            .Distinct()
            .ToArray();
}
