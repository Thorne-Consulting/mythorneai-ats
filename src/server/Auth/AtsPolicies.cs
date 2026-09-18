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

public static class AtsPolicies
{
    public const string Read = "ats.read";
    public const string ManageHiring = "ats.manage-hiring";
    public const string ManageCandidates = "ats.manage-candidates";
    public const string SubmitScorecard = "ats.submit-scorecard";
    public const string Admin = "ats.admin";
}
