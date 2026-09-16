using System.Security.Claims;
using System.Text.Json;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Infrastructure;

public static class Audit
{
    public static void Add(AtsDbContext db, ClaimsPrincipal principal, string entityType, object entityId, string action, object? details = null)
    {
        db.AuditEvents.Add(new AuditEvent
        {
            EntityType = entityType,
            EntityId = entityId.ToString() ?? "unknown",
            Action = action,
            ActorEmail = principal.Email(),
            Details = details is null ? null : JsonSerializer.Serialize(details)
        });
    }
}
