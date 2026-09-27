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
`http://localhost:5080`. The web app runs separately with `npm run dev` from
`src/web`.
