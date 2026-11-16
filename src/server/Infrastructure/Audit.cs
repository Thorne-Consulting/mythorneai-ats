using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class Audit
{
    public static void Add(
        AtsDbContext db,
        ClaimsPrincipal principal,
        string entityType,
        object entityId,
        string action,
        object? details = null,
        object? changes = null
    ) => Add(db, principal.Email(), entityType, entityId, action, details, changes);

    /// <summary>
    /// For events with no signed-in person yet, such as a sign-in or a refused sign-in.
    /// <paramref name="changes"/> gives before and after values the record can't show by itself
    /// (<c>{ Role = new { from, to } }</c> with role names); other changed fields are still added.
    /// </summary>
    public static void Add(
        AtsDbContext db,
        string actorEmail,
        string entityType,
        object entityId,
        string action,
        object? details = null,
        object? changes = null
    ) =>
        db.AuditEvents.Add(
            new AuditEvent
            {
                EntityType = entityType,
                EntityId = entityId.ToString() ?? "unknown",
                Action = action,
                ActorEmail = actorEmail,
                Details = details is null ? null : JsonSerializer.Serialize(details, Json),
                Changes = changes is null ? null : JsonSerializer.Serialize(changes, Json),
            }
        );

    // Enums as words ("Rejected", not 2), so the activity history can show them.
    internal static readonly JsonSerializerOptions Json = new()
    {
        Converters = { new JsonStringEnumConverter() },
    };

    // Audit entity type names that differ from the class name.
    private static readonly Dictionary<string, Type> Types = new()
    {
        ["User"] = typeof(AppUser),
        ["Webhook"] = typeof(WebhookEndpoint),
        ["Role"] = typeof(CustomRole),
    };

    // Never copied into a diff: secrets, and bookkeeping that changes on every save.
    private static readonly HashSet<string> Hidden =
    [
        "Secret",
        "PreviousSecret",
        "AccessToken",
        "RefreshToken",
        "UpdatedAt",
        "CreatedAt",
        "LastSignInAt",
        "PreferencesJson",
        "RequirementsEmbedding",
        "ResumeEmbedding",
        // A member's role: "RoleChanged" gives the old and new role by name instead.
        "CustomRoleId",
    ];

    /// <summary>
    /// Gives each new audit event the before and after of the record it names, when that record is
    /// being modified in the same save. Saves editing every call site.
    /// </summary>
    public static void FillChanges(DbContext db)
    {
        var events = db
            .ChangeTracker.Entries<AuditEvent>()
            .Where(x => x.State == EntityState.Added)
            .Select(x => x.Entity)
            .ToList();
        if (events.Count == 0)
            return;
        var modified = db
            .ChangeTracker.Entries()
            .Where(x => x.State == EntityState.Modified)
            .ToList();
        foreach (var audit in events)
        {
            var type = Types.GetValueOrDefault(audit.EntityType);
            var entry = modified.FirstOrDefault(x =>
                (
                    type is null
                        ? x.Metadata.ClrType.Name == audit.EntityType
                        : x.Metadata.ClrType == type
                )
                && x.Metadata.FindProperty("Id") is not null
                && x.Property("Id").CurrentValue?.ToString() == audit.EntityId
            );
            if (entry is null)
                continue;
            var changes = entry
                .Properties.Where(p =>
                    p.IsModified
                    && !Hidden.Contains(p.Metadata.Name)
                    && !(entry.Entity is AppUser && p.Metadata.Name == nameof(AppUser.Role))
                )
                .ToDictionary(
                    p => p.Metadata.Name,
                    p => new { from = p.OriginalValue, to = p.CurrentValue }
                );
            // Values given with the event win over the raw ones.
            var given = audit.Changes is null
                ? []
                : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(audit.Changes) ?? [];
            foreach (var (field, change) in changes)
                if (!given.ContainsKey(field))
                    given[field] = JsonSerializer.SerializeToElement(change, Json);
            if (given.Count > 0)
                audit.Changes = JsonSerializer.Serialize(given, Json);
        }
    }
}

/// <summary>Runs before every save: audit diffs, then webhook events and workflow runs for what changed.</summary>
public sealed class ChangeInterceptor : SaveChangesInterceptor
{
    public static readonly ChangeInterceptor Instance = new();

    public override InterceptionResult<int> SavingChanges(
        DbContextEventData eventData,
        InterceptionResult<int> result
    )
    {
        if (eventData.Context is { } db)
        {
            db.ChangeTracker.DetectChanges();
            Audit.FillChanges(db);
        }
        return result;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default
    )
    {
        if (eventData.Context is AtsDbContext db)
        {
            db.ChangeTracker.DetectChanges();
            Audit.FillChanges(db);
            await WebhookEvents.CollectAsync(db, cancellationToken);
            await Features.Workflows.WorkflowTriggers.CollectAsync(db, cancellationToken);
        }
        return result;
    }
}
