using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.AI;
using MyThorneAI.Ats.Api.Api;
using MyThorneAI.Ats.Api.Auth;
using MyThorneAI.Ats.Api.Data;
using MyThorneAI.Ats.Api.Infrastructure;
using MyThorneAI.Ats.Api.Integrations;
using OpenAI;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
if (builder.Environment.IsDevelopment())
    LocalDotEnvConfiguration.Add(builder.Configuration, builder.Environment.ContentRootPath);
else
    LocalDotEnvConfiguration.AddFromEnvironment(builder.Configuration);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services.AddProblemDetails();

// The public API (careers site, apply, candidate portal) has its own OpenAPI document, served
// with Scalar at /docs everywhere. The full document covers every endpoint and is for developers.
builder.Services.AddOpenApi(
    "public",
    options =>
        options.ShouldInclude = description =>
            description.RelativePath?.StartsWith("public", StringComparison.OrdinalIgnoreCase)
            == true
);
if (builder.Environment.IsDevelopment())
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
builder.Services.AddSingleton<LocalResumeOcr>();
builder.Services.AddSingleton<ResumeTextExtractor>();
builder.Services.AddScoped<ResumeExtractor>();
builder.Services.AddMemoryCache();

// Every chat model call goes through Microsoft.Extensions.AI on the OpenAI Responses API, so the model
// (OpenAI:Model, or the organization's setting) and even the provider are configuration, not code.
builder.Services.AddSingleton<IChatClient>(services =>
{
    var configuration = services.GetRequiredService<IConfiguration>();
    var apiKey = configuration["OpenAI:ApiKey"];
    return string.IsNullOrWhiteSpace(apiKey)
        ? new UnconfiguredChatClient()
        : new OpenAIClient(apiKey)
            .GetResponsesClient()
            .AsIChatClient(ResumeExtractor.ModelName(configuration));
});
builder.Services.AddHostedService<ResumeParseWorker>();
builder.Services.AddHostedService<EmailOutboxWorker>();

// Live message updates (InboxHub). One API instance needs no backplane; add Redis when running several.
builder.Services.AddSignalR();
builder.Services.AddHostedService<EmbeddingWorker>();
builder.Services.AddHostedService<FitWorker>();
builder.Services.AddHostedService<WebhookWorker>();
builder.Services.AddHostedService<ReportDigestWorker>();
builder.Services.AddHostedService<ApplicationFollowUpWorker>();
builder.Services.AddHostedService<WorkflowWorker>();
builder.Services.AddHostedService<OfferExpiryWorker>();
builder.Services.AddHostedService<MediaSweepWorker>();
builder.Services.AddAssessments();
builder
    .Services.AddHttpClient("webhooks", client => client.Timeout = TimeSpan.FromSeconds(10))
    .ConfigurePrimaryHttpMessageHandler(() =>
        SsrfGuard.Handler(allowLoopback: builder.Environment.IsDevelopment())
    );

// Exchange rates come from a public address an admin may change, so the same guard applies.
builder
    .Services.AddHttpClient(
        CurrencyRates.HttpClientName,
        client => client.Timeout = TimeSpan.FromSeconds(15)
    )
    .ConfigurePrimaryHttpMessageHandler(() =>
        SsrfGuard.Handler(allowLoopback: builder.Environment.IsDevelopment())
    );
builder.Services.AddScoped<CurrencyRates>();
builder.Services.AddWorkplaceIntegrations(builder.Configuration);
builder.Services.AddHttpClient<IEmailSender, ResendEmailSender>(client =>
    client.BaseAddress = new Uri("https://api.resend.com/")
);
builder.Services.AddHttpClient<IAiAssistant, OpenAiAssistant>(client =>
    client.BaseAddress = new Uri("https://api.openai.com/v1/")
);
builder.Services.AddHealthChecks();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(
        "public-candidate",
        context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }
            )
    );
    // Job pages are read-only and also fetched by the web server while it renders them.
    options.AddPolicy(
        PublicEndpoints.PublicReadPolicy,
        context =>
            RateLimitPartition.GetFixedWindowLimiter(
                context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 600,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }
            )
    );
});

var app = builder.Build();

app.UseForwardedHeaders(
    new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    }
);

// Bad input (a missing or malformed parameter) is the caller's fault: 400, not 500.
app.UseExceptionHandler(
    new ExceptionHandlerOptions
    {
        StatusCodeSelector = ex =>
            ex is BadHttpRequestException bad
                ? bad.StatusCode
                : StatusCodes.Status500InternalServerError,
    }
);
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

// The candidate portal's session cookie, read by the /public endpoints.
app.UseCandidateSessionCookie();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.UseAntiforgery();

app.MapOpenApi();
app.MapScalarApiReference(
    "/docs",
    options =>
    {
        options.WithTitle("MyThorneAI ATS API");
        options.AddDocument("public", "Public API", isDefault: true);
        if (app.Environment.IsDevelopment())
            options.AddDocument("v1", "Everything (development)");
    }
);

app.MapHealthChecks("/health").AllowAnonymous();
app.MapAtsAuth(app.Configuration, app.Environment);
app.MapPublicEndpoints();
app.MapPublicAssessments();
app.MapPublicOffers();
app.MapPublicMedia();
app.MapGroup("/public").RequireRateLimiting("public-candidate").MapPublicCurrencies();

// Long polls end before the Next proxy's 30-second timeout, so the fallback works through it too.
app.MapHub<InboxHub>(
    InboxHub.Path,
    options => options.LongPolling.PollTimeout = TimeSpan.FromSeconds(20)
);
app.MapCalendarConnections();
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
api.MapAssessments();
api.MapCandidateFacingStaff();
MyThorneAI.Ats.Api.Features.Workflows.WorkflowEndpoints.MapWorkflows(api);
api.MapTemplates();
api.MapNotifications();
api.MapTeamChannel();
api.MapEmailSettings();
api.MapMedia();
api.MapCurrencies();

// `dotnet MyThorneAI.Ats.Api.dll seed --sets baseline,demo`: migrate, seed the named sets for the
// seed environment (SEED_ENVIRONMENT, else this host's), and exit. See docs/production.md, Seeding.
var seedCommand = args.Length > 0 && args[0] == "seed";
await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AtsDbContext>();
    var files = scope.ServiceProvider.GetRequiredService<LocalFileStore>();
    await db.Database.MigrateAsync();
    await files.EnsureBucketAsync();
    var seedEnvironment = Seeding.Environment(app.Configuration, app.Environment);
    if (seedCommand)
    {
        var setsArg =
            Array.IndexOf(args, "--sets") is var i and >= 0 && i + 1 < args.Length
                ? args[i + 1]
                : null;
        var sets = setsArg is null ? Seeding.Plan(seedEnvironment) : Seeding.ParseSets(setsArg);
        var refused = Seeding.Refused(seedEnvironment, sets);
        if (refused.Length > 0)
        {
            Console.Error.WriteLine(
                $"Refused: the {seedEnvironment} environment does not take the {string.Join(", ", refused)} seed set."
            );
            return 2;
        }
        await Seeding.RunAsync(db, files, app.Configuration, seedEnvironment, sets, app.Logger);
        Console.WriteLine($"Seeded {string.Join(", ", sets)} for {seedEnvironment}.");
        return 0;
    }
    // Development seeds itself at start. Elsewhere SEED_SETS names the sets to keep in place at
    // every start; the sets are idempotent, so a restart changes nothing. A refused set stops the
    // start, so demo data can never reach production by a wrong setting.
    var startSets =
        app.Environment.IsDevelopment() ? Seeding.Plan(seedEnvironment)
        : app.Configuration["Seed:Sets"] is { Length: > 0 } named ? Seeding.ParseSets(named)
        : null;
    if (startSets is not null)
    {
        var refused = Seeding.Refused(seedEnvironment, startSets);
        if (refused.Length > 0)
            throw new InvalidOperationException(
                $"SEED_SETS: the {seedEnvironment} environment does not take the {string.Join(", ", refused)} seed set."
            );
        await Seeding.RunAsync(
            db,
            files,
            app.Configuration,
            seedEnvironment,
            startSets,
            app.Logger
        );
    }
    // The old per-role switches become custom roles, once.
    await AtsEndpoints.CarryOverRoleSwitchesAsync(db);
    // Stage types and job teams for rows from before them; both skip rows already done.
    await StageRules.BackfillAsync(db);
    await RequisitionTeam.BackfillAsync(db);
    // Markdown application questions become typed questions, once.
    await ApplicationQuestions.BackfillAsync(db);
    await InterviewLibrarySeed.EnsureAsync(db);
    // Offer letters, rejection reasons, and decline reasons as a list (evaluation area); each runs once.
    await OfferLetters.EnsureAsync(db);
    await RejectionReasons.EnsureAsync(db);
    await OfferDeclines.BackfillAsync(db);
    // The managed candidate sources: the starting list once, then any name in use it lacks.
    await Sources.EnsureAsync(db);
}

await app.RunAsync();
return 0;

public partial class Program;
