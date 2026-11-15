using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;
using MyThorneAI.Ats.Api.Infrastructure;

namespace MyThorneAI.Ats.Api.Api;

public sealed record SaveTemplateRequest(
    string Subject,
    string Body,
    string? Name = null,
    string? Category = null,
    bool? Shared = null,
    Guid? RequisitionId = null
);

public sealed record TemplatePreviewRequest(
    string Subject,
    string Body,
    string? Id = null,
    Guid? ApplicationId = null
);

public sealed record RestoreTemplateRequest(int Version, Guid? RequisitionId = null);

/// <summary>
/// The one template library at /messages/templates: saved replies (personal or shared) and the
/// automatic emails, with versions, per-job wording, previews and test sends. An automatic email
/// is addressed by its key ("rejection"), a saved reply by its id.
/// </summary>
public static class TemplateEndpoints
{
    private const int MaxBody = 20_000;

    public static RouteGroupBuilder MapTemplates(this RouteGroupBuilder api)
    {
        var group = api.MapGroup("/templates").RequireAuthorization(AtsPolicies.ManageHiring);

        group.MapGet(
            "",
            async (ClaimsPrincipal principal, AtsDbContext db, CancellationToken ct) =>
            {
                var me = principal.Email();
                var canEdit = await Permissions.HasAsync(db, principal, Permissions.Templates, ct);
                var saved = await db
                    .EmailTemplates.AsNoTracking()
                    .Where(x =>
                        x.Kind == TemplateKind.Saved && (x.OwnerEmail == null || x.OwnerEmail == me)
                    )
                    .OrderBy(x => x.Name)
                    .Select(x => new
                    {
                        Id = x.Id.ToString(),
                        x.Name,
                        x.Category,
                        x.Subject,
                        x.Body,
                        Shared = x.OwnerEmail == null,
                        x.UpdatedAt,
                        UpdatedByName = db
                            .Users.Where(u => u.Email == x.UpdatedBy)
                            .Select(u => u.DisplayName)
                            .FirstOrDefault(),
                        CanEdit = x.OwnerEmail == me || (x.OwnerEmail == null && canEdit),
                    })
                    .ToListAsync(ct);
                var stored = await db
                    .EmailTemplates.AsNoTracking()
                    .Where(x => x.Kind == TemplateKind.Automatic)
                    .Select(x => new
                    {
                        x.Key,
                        x.RequisitionId,
                        x.UpdatedAt,
                        UpdatedByName = db
                            .Users.Where(u => u.Email == x.UpdatedBy)
                            .Select(u => u.DisplayName)
                            .FirstOrDefault(),
                    })
                    .ToListAsync(ct);
                return Results.Ok(
                    new
                    {
                        CanEditAutomatic = canEdit,
                        CanShare = canEdit,
                        Details = EmailTemplates.Details,
                        SavedReplyDetails = EmailTemplates.SavedReplyDetails,
                        Saved = saved,
                        Automatic = EmailTemplates.Defaults.Select(entry =>
                        {
                            var org = stored.FirstOrDefault(x =>
                                x.Key == entry.Key && x.RequisitionId == null
                            );
                            return new
                            {
                                entry.Key,
                                entry.Value.Label,
                                Audience = entry.Value.Audience.ToString(),
                                entry.Value.SentWhen,
                                entry.Value.Subject,
                                Changed = org is not null,
                                Overrides = stored.Count(x =>
                                    x.Key == entry.Key && x.RequisitionId != null
                                ),
                                org?.UpdatedAt,
                                org?.UpdatedByName,
                            };
                        }),
                    }
                );
            }
        );

        group.MapGet(
            "/{id}",
            async (
                string id,
                Guid? requisitionId,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var canEdit = await Permissions.HasAsync(db, principal, Permissions.Templates, ct);
                if (EmailTemplates.Defaults.TryGetValue(id, out var standard))
                {
                    if (
                        requisitionId is not null
                        && await ManagedJobAsync(db, requisitionId.Value, principal, ct) is null
                    )
                        return Results.NotFound();
                    var rows = await db
                        .EmailTemplates.AsNoTracking()
                        .Where(x => x.Kind == TemplateKind.Automatic && x.Key == id)
                        .ToListAsync(ct);
                    var org = rows.FirstOrDefault(x => x.RequisitionId == null);
                    var job = requisitionId is null
                        ? null
                        : rows.FirstOrDefault(x => x.RequisitionId == requisitionId);
                    var current = job ?? org;
                    var overrideIds = rows.Where(x => x.RequisitionId != null)
                        .Select(x => x.RequisitionId!.Value)
                        .ToArray();
                    var jobTitles = await db
                        .Requisitions.AsNoTracking()
                        .Where(x => overrideIds.Contains(x.Id))
                        .ToDictionaryAsync(x => x.Id, x => x.Title, ct);
                    return Results.Ok(
                        new
                        {
                            Id = id,
                            Kind = "Automatic",
                            Name = standard.Label,
                            Audience = standard.Audience.ToString(),
                            standard.SentWhen,
                            Details = standard.Variables.Contains("company")
                                ? standard.Variables
                                : [.. standard.Variables, "company"],
                            Subject = current?.Subject ?? standard.Subject,
                            Body = current?.Body ?? standard.Body,
                            DefaultSubject = standard.Subject,
                            DefaultBody = standard.Body,
                            // "job" and "organization" wording can be reset; with a job chosen, its wording falls back to the organization's.
                            Source = job is not null ? "job"
                            : org is not null ? "organization"
                            : "default",
                            Version = current?.Version ?? 0,
                            current?.UpdatedAt,
                            UpdatedByName = await NameAsync(db, current?.UpdatedBy, ct),
                            Overrides = rows.Where(x =>
                                    x.RequisitionId != null
                                    && jobTitles.ContainsKey(x.RequisitionId.Value)
                                )
                                .Select(x => new
                                {
                                    RequisitionId = x.RequisitionId!.Value,
                                    Title = jobTitles[x.RequisitionId.Value],
                                    x.UpdatedAt,
                                }),
                            CanEdit = canEdit,
                        }
                    );
                }
                var saved = await SavedAsync(db, id, principal, ct);
                if (saved is null)
                    return Results.NotFound();
                return Results.Ok(
                    new
                    {
                        Id = saved.Id.ToString(),
                        Kind = "Saved",
                        saved.Name,
                        saved.Category,
                        Details = EmailTemplates.SavedReplyDetails,
                        saved.Subject,
                        saved.Body,
                        Shared = saved.OwnerEmail == null,
                        saved.Version,
                        saved.UpdatedAt,
                        UpdatedByName = await NameAsync(db, saved.UpdatedBy, ct),
                        CanEdit = CanEditSaved(saved, principal, canEdit),
                    }
                );
            }
        );

        group.MapPost(
            "",
            async (
                SaveTemplateRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var shared = request.Shared == true;
                if (shared && !await Permissions.HasAsync(db, principal, Permissions.Templates, ct))
                    return Results.Forbid();
                if (Validate(request, EmailTemplates.SavedReplyDetails, saved: true) is { } problem)
                    return problem;
                var me = principal.Email();
                var template = new EmailTemplate
                {
                    Kind = TemplateKind.Saved,
                    Name = request.Name!.Trim(),
                    Category = Clean(request.Category),
                    OwnerEmail = shared ? null : me,
                    Subject = (request.Subject ?? "").Trim(),
                    Body = EmailTemplates.Camel(request.Body.Trim()),
                    UpdatedBy = me,
                };
                db.EmailTemplates.Add(template);
                AddVersion(db, template.Id.ToString(), null, template, "Saved", me);
                Audit.Add(
                    db,
                    principal,
                    "EmailTemplate",
                    template.Id,
                    "Created",
                    new { template.Name, shared }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { Id = template.Id.ToString() });
            }
        );

        group.MapPut(
            "/{id}",
            async (
                string id,
                SaveTemplateRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var me = principal.Email();
                var canEdit = await Permissions.HasAsync(db, principal, Permissions.Templates, ct);
                if (EmailTemplates.Defaults.TryGetValue(id, out var standard))
                {
                    if (!canEdit)
                        return Results.Forbid();
                    if (
                        request.RequisitionId is { } jobId
                        && await ManagedJobAsync(db, jobId, principal, ct) is null
                    )
                        return Results.NotFound();
                    if (Validate(request, standard.Variables, saved: false) is { } problem)
                        return problem;
                    var row = await db.EmailTemplates.SingleOrDefaultAsync(
                        x =>
                            x.Kind == TemplateKind.Automatic
                            && x.Key == id
                            && x.RequisitionId == request.RequisitionId,
                        ct
                    );
                    if (row is null)
                        db.EmailTemplates.Add(
                            row = new EmailTemplate
                            {
                                Key = id,
                                RequisitionId = request.RequisitionId,
                                Subject = "",
                                Body = "",
                            }
                        );
                    row.Subject = request.Subject.Trim();
                    row.Body = EmailTemplates.Camel(request.Body.Trim());
                    row.Version = await NextVersionAsync(db, id, request.RequisitionId, ct);
                    row.UpdatedAt = DateTimeOffset.UtcNow;
                    row.UpdatedBy = me;
                    AddVersion(db, id, request.RequisitionId, row, "Saved", me);
                    Audit.Add(
                        db,
                        principal,
                        "EmailTemplate",
                        id,
                        "Updated",
                        new { request.RequisitionId, row.Version }
                    );
                    await db.SaveChangesAsync(ct);
                    return Results.Ok(new { row.Version });
                }
                var saved = await SavedAsync(db, id, principal, ct);
                if (saved is null)
                    return Results.NotFound();
                if (
                    !CanEditSaved(saved, principal, canEdit) || (request.Shared == true && !canEdit)
                )
                    return Results.Forbid();
                if (
                    Validate(request, EmailTemplates.SavedReplyDetails, saved: true) is
                    { } savedProblem
                )
                    return savedProblem;
                saved.Name = request.Name!.Trim();
                saved.Category = Clean(request.Category);
                saved.Subject = (request.Subject ?? "").Trim();
                saved.Body = EmailTemplates.Camel(request.Body.Trim());
                if (request.Shared is { } shared)
                    saved.OwnerEmail = shared ? null : saved.OwnerEmail ?? me;
                saved.Version = await NextVersionAsync(db, id, null, ct);
                saved.UpdatedAt = DateTimeOffset.UtcNow;
                saved.UpdatedBy = me;
                AddVersion(db, id, null, saved, "Saved", me);
                Audit.Add(
                    db,
                    principal,
                    "EmailTemplate",
                    saved.Id,
                    "Updated",
                    new { saved.Version }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { saved.Version });
            }
        );

        // Saved reply: delete it. Automatic email: back to the standard wording (or, for a job, to
        // the wording for all jobs). The reset is kept in the history.
        group.MapDelete(
            "/{id}",
            async (
                string id,
                Guid? requisitionId,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var canEdit = await Permissions.HasAsync(db, principal, Permissions.Templates, ct);
                if (EmailTemplates.Defaults.TryGetValue(id, out var standard))
                {
                    if (!canEdit)
                        return Results.Forbid();
                    if (
                        requisitionId is { } jobId
                        && await ManagedJobAsync(db, jobId, principal, ct) is null
                    )
                        return Results.NotFound();
                    var row = await db.EmailTemplates.SingleOrDefaultAsync(
                        x =>
                            x.Kind == TemplateKind.Automatic
                            && x.Key == id
                            && x.RequisitionId == requisitionId,
                        ct
                    );
                    if (row is null)
                        return Results.NoContent();
                    db.EmailTemplates.Remove(row);
                    var (subject, body, _) = requisitionId is null
                        ? (standard.Subject, standard.Body, 0)
                        : await EmailTemplates.WordingAsync(db, id, null, ct);
                    AddVersion(
                        db,
                        id,
                        requisitionId,
                        new EmailTemplate
                        {
                            Subject = subject,
                            Body = body,
                            Version = await NextVersionAsync(db, id, requisitionId, ct),
                        },
                        "Reset",
                        principal.Email()
                    );
                    Audit.Add(db, principal, "EmailTemplate", id, "Reset", new { requisitionId });
                    await db.SaveChangesAsync(ct);
                    return Results.NoContent();
                }
                var saved = await SavedAsync(db, id, principal, ct);
                if (saved is null)
                    return Results.NotFound();
                if (!CanEditSaved(saved, principal, canEdit))
                    return Results.Forbid();
                db.EmailTemplates.Remove(saved);
                Audit.Add(db, principal, "EmailTemplate", saved.Id, "Deleted", new { saved.Name });
                await db.SaveChangesAsync(ct);
                return Results.NoContent();
            }
        );

        group.MapGet(
            "/{id}/versions",
            async (
                string id,
                Guid? requisitionId,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    !EmailTemplates.Defaults.ContainsKey(id)
                    && await SavedAsync(db, id, principal, ct) is null
                )
                    return Results.NotFound();
                // A job's own wording is for the people who manage that job.
                if (
                    requisitionId is { } jobId
                    && await ManagedJobAsync(db, jobId, principal, ct) is null
                )
                    return Results.NotFound();
                return Results.Ok(
                    await db
                        .EmailTemplateVersions.AsNoTracking()
                        .Where(x => x.TemplateRef == id && x.RequisitionId == requisitionId)
                        .OrderByDescending(x => x.Version)
                        .Take(100)
                        .Select(x => new
                        {
                            x.Version,
                            x.Subject,
                            x.Body,
                            x.Action,
                            x.EditedAt,
                            EditedByName = db.Users.Where(u => u.Email == x.EditedBy)
                                .Select(u => u.DisplayName)
                                .FirstOrDefault()
                                ?? x.EditedBy,
                        })
                        .ToListAsync(ct)
                );
            }
        );

        // Restoring copies an old wording into a new version; nothing in the history is lost.
        group.MapPost(
            "/{id}/restore",
            async (
                string id,
                RestoreTemplateRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                if (
                    request.RequisitionId is { } managedJob
                    && await ManagedJobAsync(db, managedJob, principal, ct) is null
                )
                    return Results.NotFound();
                var old = await db
                    .EmailTemplateVersions.AsNoTracking()
                    .SingleOrDefaultAsync(
                        x =>
                            x.TemplateRef == id
                            && x.RequisitionId == request.RequisitionId
                            && x.Version == request.Version,
                        ct
                    );
                if (old is null)
                    return Results.NotFound();
                var canEdit = await Permissions.HasAsync(db, principal, Permissions.Templates, ct);
                var me = principal.Email();
                EmailTemplate? row;
                if (EmailTemplates.Defaults.ContainsKey(id))
                {
                    if (!canEdit)
                        return Results.Forbid();
                    if (
                        request.RequisitionId is { } jobId
                        && await ManagedJobAsync(db, jobId, principal, ct) is null
                    )
                        return Results.NotFound();
                    row = await db.EmailTemplates.SingleOrDefaultAsync(
                        x =>
                            x.Kind == TemplateKind.Automatic
                            && x.Key == id
                            && x.RequisitionId == request.RequisitionId,
                        ct
                    );
                    if (row is null)
                        db.EmailTemplates.Add(
                            row = new EmailTemplate
                            {
                                Key = id,
                                RequisitionId = request.RequisitionId,
                                Subject = "",
                                Body = "",
                            }
                        );
                }
                else
                {
                    row = await SavedAsync(db, id, principal, ct);
                    if (row is null)
                        return Results.NotFound();
                    if (!CanEditSaved(row, principal, canEdit))
                        return Results.Forbid();
                }
                row.Subject = old.Subject;
                row.Body = old.Body;
                row.Version = await NextVersionAsync(db, id, request.RequisitionId, ct);
                row.UpdatedAt = DateTimeOffset.UtcNow;
                row.UpdatedBy = me;
                AddVersion(db, id, request.RequisitionId, row, "Restored", me);
                Audit.Add(
                    db,
                    principal,
                    "EmailTemplate",
                    id,
                    "Restored",
                    new { request.Version, request.RequisitionId }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { row.Version });
            }
        );

        // Sample details, or a real candidate's when an application is chosen. Details the
        // candidate has no value for come back in "missing" and show their sample.
        group.MapPost(
            "/preview",
            async (
                TemplatePreviewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var values = await PreviewValuesAsync(db, request.ApplicationId, principal, ct);
                if (values is null)
                    return Results.NotFound();
                var (subject, body) = EmailTemplates.Render(
                    request.Subject ?? "",
                    request.Body ?? "",
                    values.Value.All
                );
                var missing = request.ApplicationId is null
                    ? []
                    : EmailTemplates.Missing(
                        request.Subject + "\n" + request.Body,
                        values.Value.Real
                    );
                var company = values.Value.All["company"];
                return Results.Ok(
                    new
                    {
                        Subject = subject,
                        Html = EmailHtml.Wrap(
                            company,
                            body,
                            await CareerSites.EmailBrandAsync(db, ct)
                        ),
                        Missing = missing.Select(key => new
                        {
                            Key = key,
                            Label = EmailTemplates.DetailLabel(key),
                        }),
                    }
                );
            }
        );

        // "Send me a test": to the signed-in person, marked [Test], at most 10 an hour.
        group.MapPost(
            "/test",
            async (
                TemplatePreviewRequest request,
                ClaimsPrincipal principal,
                AtsDbContext db,
                CancellationToken ct
            ) =>
            {
                var me = principal.Email();
                var hourAgo = DateTimeOffset.UtcNow.AddHours(-1);
                if (
                    await db.EmailOutbox.CountAsync(
                        x => x.Recipient == me && x.TemplateKey == "test" && x.CreatedAt > hourAgo,
                        ct
                    ) >= 10
                )
                    return Results.Json(
                        new { message = "You sent 10 tests in the last hour. Try again later." },
                        statusCode: StatusCodes.Status429TooManyRequests
                    );
                var values = await PreviewValuesAsync(db, request.ApplicationId, principal, ct);
                if (values is null)
                    return Results.NotFound();
                var (subject, body) = EmailTemplates.Render(
                    request.Subject ?? "",
                    request.Body ?? "",
                    values.Value.All
                );
                db.EmailOutbox.Add(
                    new EmailOutboxItem
                    {
                        Recipient = me,
                        Subject = $"[Test] {subject}",
                        Body = body,
                        TemplateKey = "test",
                    }
                );
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { Recipient = me });
            }
        );

        return api;
    }

    private static async Task<(
        Dictionary<string, string> All,
        Dictionary<string, string> Real
    )?> PreviewValuesAsync(
        AtsDbContext db,
        Guid? applicationId,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var samples = EmailTemplates.Details.ToDictionary(x => x.Key, x => x.Example);
        var site = (
            await db.Organizations.AsNoTracking().Select(x => x.PublicUrl).SingleOrDefaultAsync(ct)
        )?.TrimEnd('/');
        foreach (
            var key in samples
                .Keys.Where(k => k.EndsWith("Link", StringComparison.Ordinal))
                .ToList()
        )
            samples[key] = site is null ? "" : $"{site}/candidate-portal";
        samples["senderName"] =
            await db
                .Users.AsNoTracking()
                .Where(x => x.Email == principal.Email())
                .Select(x => x.DisplayName)
                .SingleOrDefaultAsync(ct)
            ?? samples["senderName"];
        var all = await EmailTemplates.WithOrganizationAsync(db, samples, ct);
        if (applicationId is null)
            return (all, new Dictionary<string, string>());
        var application = await db
            .Applications.Include(x => x.Candidate)
            .Include(x => x.Requisition)
            .SingleOrDefaultAsync(x => x.Id == applicationId, ct);
        if (
            application?.Requisition is null
            || !AtsEndpoints.CanManage(application.Requisition, principal)
        )
            return null;
        var real = await EmailThreads.DetailsAsync(db, application, principal.Email(), ct);
        foreach (var (key, value) in real.Where(x => x.Value.Length > 0))
            all[key] = value;
        return (all, real);
    }

    private static IResult? Validate(
        SaveTemplateRequest request,
        IEnumerable<string> allowed,
        bool saved
    )
    {
        var errors = new Dictionary<string, string[]>();
        if (saved && string.IsNullOrWhiteSpace(request.Name))
            errors["name"] = ["Give it a name."];
        if (saved && request.Name?.Trim().Length > 120)
            errors["name"] = ["Keep the name under 120 characters."];
        // A saved reply goes into a conversation, whose subject stays the same; only automatic emails need one.
        if (!saved && string.IsNullOrWhiteSpace(request.Subject))
            errors["subject"] = ["Write a subject."];
        if ((request.Subject ?? "").Length > 300)
            errors["subject"] = ["Keep the subject under 300 characters."];
        if (string.IsNullOrWhiteSpace(request.Body))
            errors["body"] = ["Write the message."];
        else if (request.Body.Length > MaxBody)
            errors["body"] = ["Keep the message under 20,000 characters."];
        var unknown = EmailTemplates.Unknown(
            (request.Subject ?? "") + "\n" + (request.Body ?? ""),
            allowed
        );
        if (unknown.Length > 0)
            errors["body"] =
            [
                $"This email can't use {string.Join(", ", unknown.Select(x => "{{" + x + "}}"))}. Use the details offered in the editor.",
            ];
        else if (MediaEndpoints.HasImageWithoutAlt(request.Body))
            errors["body"] = [MediaEndpoints.AltRequired];
        return errors.Count == 0 ? null : Results.ValidationProblem(errors);
    }

    private static async Task<EmailTemplate?> SavedAsync(
        AtsDbContext db,
        string id,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        if (!Guid.TryParse(id, out var guid))
            return null;
        var me = principal.Email();
        return await db.EmailTemplates.SingleOrDefaultAsync(
            x =>
                x.Id == guid
                && x.Kind == TemplateKind.Saved
                && (x.OwnerEmail == null || x.OwnerEmail == me),
            ct
        );
    }

    private static bool CanEditSaved(
        EmailTemplate template,
        ClaimsPrincipal principal,
        bool canEditShared
    ) => template.OwnerEmail == principal.Email() || (template.OwnerEmail is null && canEditShared);

    private static async Task<Requisition?> ManagedJobAsync(
        AtsDbContext db,
        Guid id,
        ClaimsPrincipal principal,
        CancellationToken ct
    )
    {
        var job = await db.Requisitions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return job is not null && AtsEndpoints.CanManage(job, principal) ? job : null;
    }

    // Versions keep counting across resets, so a restored or re-saved wording never reuses a number.
    private static async Task<int> NextVersionAsync(
        AtsDbContext db,
        string templateRef,
        Guid? requisitionId,
        CancellationToken ct
    ) =>
        (
            await db
                .EmailTemplateVersions.Where(x =>
                    x.TemplateRef == templateRef && x.RequisitionId == requisitionId
                )
                .MaxAsync(x => (int?)x.Version, ct)
            ?? 0
        ) + 1;

    internal static void AddVersion(
        AtsDbContext db,
        string templateRef,
        Guid? requisitionId,
        EmailTemplate wording,
        string action,
        string editedBy
    ) =>
        db.EmailTemplateVersions.Add(
            new EmailTemplateVersion
            {
                TemplateRef = templateRef,
                RequisitionId = requisitionId,
                Version = wording.Version,
                Subject = wording.Subject,
                Body = wording.Body,
                Action = action,
                EditedBy = editedBy,
            }
        );

    private static async Task<string?> NameAsync(
        AtsDbContext db,
        string? email,
        CancellationToken ct
    ) =>
        email is null
            ? null
            : await db
                .Users.AsNoTracking()
                .Where(x => x.Email == email)
                .Select(x => x.DisplayName)
                .SingleOrDefaultAsync(ct)
                ?? email;

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
