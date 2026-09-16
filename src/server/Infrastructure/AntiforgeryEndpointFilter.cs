using Microsoft.AspNetCore.Antiforgery;

namespace MyThorneAI.Ats.Api.Infrastructure;

public sealed class AntiforgeryEndpointFilter(IAntiforgery antiforgery) : IEndpointFilter
{
    private static readonly HashSet<string> SafeMethods = new(StringComparer.OrdinalIgnoreCase)
    {
        HttpMethods.Get,
        HttpMethods.Head,
        HttpMethods.Options
    };

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        if (!SafeMethods.Contains(context.HttpContext.Request.Method))
        {
            try
            {
                await antiforgery.ValidateRequestAsync(context.HttpContext);
            }
            catch (AntiforgeryValidationException)
            {
                return Results.BadRequest(new { message = "The security token is missing or invalid." });
            }
        }

        return await next(context);
    }
}
