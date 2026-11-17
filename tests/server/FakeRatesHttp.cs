using System.Net;

namespace MyThorneAI.Ats.Api.Tests;

// Stands in for the rates source in the API tests: serves one ECB-shaped document, counts the
// calls, and fails on demand so the cache window and the fallback can be checked.
public sealed class FakeRatesHttp : IHttpClientFactory
{
    public int Calls { get; private set; }
    public bool Fail { get; set; }
    public string Day { get; set; } = "2026-11-13";

    public string Xml =>
        $"""
            <?xml version="1.0" encoding="UTF-8"?>
            <gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
              <gesmes:subject>Reference rates</gesmes:subject>
              <Cube>
                <Cube time="{Day}">
                  <Cube currency="USD" rate="1.1000"/>
                  <Cube currency="GBP" rate="0.8500"/>
                  <Cube currency="JPY" rate="165.00"/>
                </Cube>
              </Cube>
            </gesmes:Envelope>
            """;

    public HttpClient CreateClient(string name) => new(new Handler(this));

    private sealed class Handler(FakeRatesHttp owner) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct
        )
        {
            owner.Calls++;
            if (owner.Fail)
                throw new HttpRequestException("The rates source is down.");
            return Task.FromResult(
                new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(owner.Xml),
                }
            );
        }
    }
}
