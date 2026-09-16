# Package catalog

This catalog defines the preferred package families and selection rules for the
ATS. It is intentionally not a lockfile, version list, or record of every
transitive dependency. The project files and central package-management file are
the source of truth for exact versions.

## Selection rules

- Prefer the .NET and browser platforms before adding a package.
- Prefer official vendor SDKs for external services.
- Prefer maintained packages with clear ownership, current runtime support, a
  small dependency tree, and a permissive license.
- Treat internal company use as commercial use when reviewing licenses.
- Add a package when a current feature needs it, not for possible future work.
- Keep vendors behind small application-owned interfaces where replacement is
  reasonably likely.
- Review direct and transitive vulnerabilities during upgrades and in CI.
- Record an architecture decision only when departing materially from this
  catalog.

## Preferred families

| Concern | Preferred approach |
| --- | --- |
| Web API | ASP.NET Core built-in APIs, authentication, authorization, validation primitives, problem details, rate limiting, health checks, and OpenAPI |
| Database | Entity Framework Core with the official PostgreSQL provider |
| Dates and time zones | Noda Time with PostgreSQL and JSON integration where useful |
| Request validation | FluentValidation or small application-owned validators |
| API reference | OpenAPI with Scalar |
| Outbound HTTP | HttpClientFactory with Microsoft resilience extensions |
| Authentication | OpenID Connect and cookies; use the identity provider's official integration only when it adds real value |
| Authorization | ASP.NET Core policies, resource handlers, and application-owned access scopes |
| Scheduled work | Quartz with durable PostgreSQL storage when jobs must survive restarts |
| Workflow state | Explicit domain transitions; Stateless may be used when it makes a complex state machine clearer |
| Email | A transactional email provider's official SDK, or MailKit for a company-managed mail server |
| Templates | Scriban for controlled text and email templates |
| Calendar | Microsoft Graph or the official Google Calendar SDK, selected from the company's suite |
| SMS and phone numbers | The selected provider's official SDK and libphonenumber |
| File storage | One official object-storage SDK behind an application-owned file-store interface |
| Document handling | Open XML for Office documents, PdfPig for PDF text, ClosedXML for spreadsheets, and CsvHelper for CSV |
| Malware scanning | A separately operated scanner with a small client integration |
| Search | PostgreSQL full-text and trigram search first; add a dedicated search service only after measured need |
| Telemetry | OpenTelemetry with the deployment platform's exporter; use structured platform logging by default |
| Testing | xUnit, Shouldly, NSubstitute, Testcontainers, Respawn, WireMock, and browser-side Playwright |

## Conditional infrastructure

Message brokers, distributed workflow engines, dedicated search clusters,
vector stores, OCR services, AI SDKs, SMS, e-signature, background checks, HRIS,
and job-board integrations are conditional. Choose them when the owning feature
and operating environment are known. Prefer the official service client; a
general abstraction library must justify its extra operational and licensing
cost.

## Application-owned concerns

Packages do not own the hiring model, candidate/application separation,
permission scopes, pipeline rules, decision reasons, approvals, audit history,
retention, consent, deduplication, exports, or compliance controls. These remain
application code backed by tests and reviewable data.

## Default exclusions

Avoid large application frameworks, generic repository and unit-of-work
wrappers, mediator layers used only for ceremony, automatic runtime mapping,
and dependencies whose commercial terms are unclear. Paid or restrictive
packages require an explicit license review before adoption.
