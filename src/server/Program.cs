using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
var dataProtectionPath = builder.Configuration["DataProtection:KeyPath"];
if (!string.IsNullOrWhiteSpace(dataProtectionPath))
{
    builder
        .Services.AddDataProtection()
        .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionPath))
        .SetApplicationName("Internal.Ats");
}
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";
    options.Cookie.Name = "internal.ats.csrf";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
});
builder.Services.AddDbContext<AtsDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("AtsDatabase"))
);
builder.Services.AddAtsAuthentication(builder.Configuration, builder.Environment);
builder.Services.AddScoped<AntiforgeryEndpointFilter>();
builder.Services.AddSingleton<LocalFileStore>();
builder.Services.AddWorkplaceIntegrations(builder.Configuration);
builder.Services.AddHealthChecks();

var app = builder.Build();

app.UseForwardedHeaders(
    new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    }
);
app.UseExceptionHandler();
app.Use(
    async (context, next) =>
    {
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        context.Response.Headers["Content-Security-Policy"] =
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'";
        await next();
    }
);
app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference("/docs");
}

app.MapHealthChecks("/health").AllowAnonymous();
app.MapAtsAuth(app.Configuration, app.Environment);
app.MapGet(
        "/api/auth/csrf",
        (HttpContext context, IAntiforgery antiforgery) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            return Results.Ok(new { token = tokens.RequestToken });
        }
    )
    .RequireAuthorization();

var api = app.MapGroup("/api")
    .RequireAuthorization(AtsPolicies.Read)
    .AddEndpointFilter<AntiforgeryEndpointFilter>();
api.MapAtsEndpoints();

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
    await db.Database.MigrateAsync();
    await SeedData.InitializeAsync(db, app.Environment, app.Configuration);
}

await app.RunAsync();

public partial class Program;
