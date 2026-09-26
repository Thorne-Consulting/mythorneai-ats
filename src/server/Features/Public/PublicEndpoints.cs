using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.RateLimiting;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Api;

public static partial class PublicEndpoints
{
    public static void MapPublicEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/public").RequireRateLimiting("public-candidate");
        MapPublicJobs(api);
        MapPublicCandidateAccess(api);
        MapPublicPortal(api);
        MapPublicInterviewBooking(api);
    }

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    private static void QueueEmail(
        AtsDbContext db,
        string recipient,
        string subject,
        string body,
        Guid? applicationId = null
    ) => db.EmailOutbox.Add(new EmailOutboxItem
    {
        ApplicationId = applicationId,
        Recipient = recipient,
        Subject = subject,
        Body = body,
    });
    private static bool LooksLikeEmail(string value) => !string.IsNullOrWhiteSpace(value) && value.Contains('@') && value.Length <= 320;
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
