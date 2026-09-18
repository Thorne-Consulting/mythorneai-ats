using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Domain;

namespace MyThorneAI.Ats.Api.Auth;

public static class PrincipalExtensions
{
    public static string Email(this ClaimsPrincipal principal) =>
        principal.FindFirstValue(ClaimTypes.Email)?.ToLowerInvariant()
        ?? throw new InvalidOperationException("The signed-in user has no email claim.");

    public static bool IsHiringStaff(this ClaimsPrincipal principal) =>
        principal.IsInRole(nameof(UserRole.Admin))
        || principal.IsInRole(nameof(UserRole.Recruiter));
}
