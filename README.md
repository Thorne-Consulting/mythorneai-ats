# internal ATS

A company-agnostic, self-hosted applicant tracking system focused on resume review, applicant decisions, interview scheduling, structured evaluation, and feedback.

The source is available to inspect and modify for permitted internal business
use. It may not be sold, sublicensed, transferred, or redistributed. See the
[PolyForm Internal Use License 1.0.0](LICENSE) for the actual terms.

This is a single-company internal application. It is not a SaaS product and
does not include a marketing or landing page.

## Local development

With the database already running on host port `55433`, copy `.env.example` to
`.env`, fill the required values, then run the API directly:

```sh
dotnet run --project src/server/MyThorneAI.Ats.Api.csproj
```

The API reads local `.env` values in Development and listens on
`http://localhost:5080`. Its OpenAPI document is available at
`/openapi/v1.json`; Scalar API docs are available at `/docs` in Development.
Features worth knowing about when you run it: acceptance with approvals, AI job matching and
fit assessments (OpenAI), editable candidate emails, reports with CSV export, outbound webhooks,
and a candidate portal at `/candidate-portal`. Optional settings are in `.env.example`
(`RESEND_WEBHOOK_SECRET` for delivery and bounce tracking, `OPENAI_EMBEDDING_MODEL`). Set the
"Candidate portal address" in Administration > Settings so candidate emails link to the portal.
Public career-site clients can list and read open jobs, apply, verify their
email, and manage interview booking through the `/public` API. The web app runs
separately with `npm run dev` from `src/web` for the internal hiring workspace.
