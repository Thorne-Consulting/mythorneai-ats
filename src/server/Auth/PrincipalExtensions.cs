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

    public const string DepartmentClaim = "ats_department";

    /// <summary>The person's teams (job departments), carried in the session and refreshed when an admin changes them.</summary>
    public static string[] Departments(this ClaimsPrincipal principal) =>
        principal.FindAll(DepartmentClaim).Select(x => x.Value).ToArray();

    /// <summary>Keeps candidate records: adds and edits them and sees all of them (the "candidates" capability).</summary>
    public static bool IsHiringStaff(this ClaimsPrincipal principal) =>
        principal.Has(Permissions.Candidates);
}
