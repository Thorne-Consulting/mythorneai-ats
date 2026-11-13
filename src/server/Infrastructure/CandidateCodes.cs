using System.Security.Cryptography;

namespace MyThorneAI.Ats.Api.Infrastructure;

/// <summary>
/// One-time codes emailed to candidates (portal sign-in, application verification).
/// In Development, every <c>@local.dev</c> address gets the fixed code <see cref="LocalCode"/> so the
/// seeded local candidates can sign in without email delivery. Never applies outside Development.
/// </summary>
public static class CandidateCodes
{
    public const string LocalDomain = "@local.dev";
    public const string LocalCode = "123456";

    public static string New(string email, IHostEnvironment environment) =>
        environment.IsDevelopment() && email.EndsWith(LocalDomain, StringComparison.OrdinalIgnoreCase)
            ? LocalCode
            : RandomNumberGenerator.GetInt32(100000, 1000000).ToString();
}
