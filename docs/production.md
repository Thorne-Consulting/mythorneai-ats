# Running MyThorneAI ATS for real

How the code gets from a branch to the staging and production hosts, and what those hosts need.
The app is for internal use. Nothing here is on the public internet except the careers site, if
you choose to put it there.

## The flow

```
feature branch ──PR──▶ staging ──PR──▶ main
                         │               │
                      ci.yml          ci.yml          (tests run once, on the PR)
                         │               │
                    release.yml     release.yml       (images to GHCR)
                         │               │
                  staging host    production host     (each host pulls its tag)
```

1. **Work on a branch** named `<you>/<kind>/<what>`, for example `sirshak/feat/ci-cd`.
2. **Open a pull request into `staging`.** `ci.yml` runs: the web app's format, types, logic
   checks and build, and the server tests in four shards. One check called `ok` sums it up.
   Turn on auto-merge on the PR; it merges by itself when `ok` is green.
3. **Merging into `staging`** runs `release.yml`: it builds the two images, publishes them to
   GHCR with the tag `staging`, and the staging host pulls them.
4. **Open a pull request from `staging` into `main`** when staging looks right. `ci.yml` runs
   again on that PR, because the branch rules ask for it. One approval is needed.
5. **Merging into `main`** publishes the images with the tags `latest` and `main`. The
   production host pulls them on its next deploy.
6. **A tag `v1.2.3` on `main`** publishes the images as `1.2.3` and `1.2`, for a known
   rollback point. It deploys nothing. Only an admin can make a `v*` tag (the tags ruleset).

Every build also gets `sha-<commit>`, a tag that never moves. Set `IMAGE_TAG` to it on a host
to pin one exact image; `staging`, `main` and `latest` move with each merge.

Nothing runs twice. A push to a feature branch runs nothing: the PR is where checks happen.
Dependabot opens its PRs against `staging`, only for versions at least 14 days old, and patch
or minor updates merge by themselves once `ok` passes.

## The pieces

| Piece    | File                               | What it is                                                                                                                         |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Images   | `Dockerfile`, `src/web/Dockerfile` | Built by `release.yml`, published to GHCR. The API image has the Infisical CLI and fetches its own settings when it starts.        |
| Stack    | `deploy/compose.prod.yaml`         | One file, no scripts: the secrets fetch, the database, the object store, the API, the web app, and Caddy. |
| Secrets  | Infisical                          | Every setting. The host keeps only the Infisical login (below).                                                                     |
| Network  | Netbird, on the host               | The host joins Netbird once, outside the stack, so it reaches Infisical and staff reach it.                                       |
| CI       | `.github/workflows/release.yml`    | Builds and publishes the images. It does not deploy: the host pulls.                                                               |

On Dokploy, make a **Compose** service of type **Raw**, paste `deploy/compose.prod.yaml`, add a
registry login for `ghcr.io` with a token that has `read:packages`, and put the host keys
(below) in its environment. The repository is not needed there. By hand on any host with
Docker, put the same keys in a `.env` beside the file and run:

```bash
docker compose -f compose.prod.yaml up -d
```

## Branch rules

`tools/github-rules.sh` applies the rules in `.github/rulesets/` and the merge settings. Run it
once as an admin:

```bash
tools/github-rules.sh Thorne-Consulting/mythorneai-ats
```

It sets:

- **Merge settings:** squash only, auto-merge allowed, the branch is deleted after merge.
- **`staging`:** a pull request with the `ok` check. No force pushes, no deletion.
- **`main`:** a pull request with one approval, the `ok` check up to date with `main`, every
  review thread resolved, linear history. No force pushes, no deletion.
- **Tags `v*`:** only an admin can create, move or delete one.
- **Environments:** `staging` and `production`, usable only from protected branches, with a
  reviewer on `production`. No workflow deploys through them today (the hosts pull); they are
  there for a deploy job later.

The repository already has a ruleset named "Main Branch Protection Rules". It asks for signed
commits and 70% code coverage. Signed commits are fine: GitHub signs squash merges. The coverage
rule blocks merges unless a tool reports coverage, and none does yet. Remove that rule, or add a
coverage report to `ci.yml`, before the first merge to `main`.

## Images

`release.yml` publishes two images to the GitHub Container Registry:

| Image                                          | Built from           |
| ---------------------------------------------- | -------------------- |
| `ghcr.io/thorne-consulting/mythorneai-ats-api` | `Dockerfile`         |
| `ghcr.io/thorne-consulting/mythorneai-ats-web` | `src/web/Dockerfile` |

Keep both packages **private** on GitHub (Packages, then the package, then Package settings).
The repository is public, so a new package may inherit public access; check it after the first
release. A host pulls them with a token that has `read:packages`; the workflow uses its own.

## The hosts

Each host (staging, production) needs:

- Docker with the compose plugin.
- **Netbird, installed on the host** and joined once with a setup key (`netbird up
  --setup-key <key>`). It reconnects by itself after a restart. Infisical is only reachable
  over Netbird, so the stack cannot start without it. Public DNS sends
  `secrets.mythorneai.com` to its public address and containers do not see Netbird's DNS, so
  the `secrets` and `api` containers resolve `INFISICAL_HOSTNAME` to `INFISICAL_IP` (host
  keys, below).
- A Netbird policy that lets this host reach Infisical on port 443, and lets staff reach this
  host on `APP_PORT`.
- A public name pointing at the host, when candidates must reach the careers site and the
  portal from the internet. Staff never use it.

### The host keys

The host (Dokploy's environment, or a `.env` beside the compose file) holds only these. None is
an app secret:

| Key                       | What it is                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `INFISICAL_API_URL`       | `https://secrets.mythorneai.com`. The CLI adds `/api` itself.                                      |
| `INFISICAL_HOSTNAME`      | The host in `INFISICAL_API_URL`: `secrets.mythorneai.com`.                                         |
| `INFISICAL_IP`            | Infisical's Netbird address, for example `100.84.9.92`. The containers reach Infisical there.      |
| `INFISICAL_CLIENT_ID`     | This host's machine identity, universal auth.                                                       |
| `INFISICAL_CLIENT_SECRET` | Its client secret.                                                                                 |
| `INFISICAL_PROJECT_ID`    | The Infisical project of this app.                                                                 |
| `INFISICAL_ENV`           | `staging` or `prod`: the one Infisical environment this host reads.                                |
| `IMAGE_TAG`               | `staging`, `latest`, or a `sha-<commit>` to pin one build.                                         |
| `BIND_ADDRESS`, `APP_PORT` | Optional: where the staff door listens directly. Set `BIND_ADDRESS` to the host's Netbird address. Defaults: `127.0.0.1`, `8080`. |

### How the settings reach the containers

- **The API** fetches its own. Its image runs `infisical login` with the host's identity, then
  `infisical run --env=$INFISICAL_ENV --projectId=$INFISICAL_PROJECT_ID -- dotnet
  MyThorneAI.Ats.Api.dll`. Every secret is in the API process only, never in a file. The
  entrypoint drops the Infisical login from the environment once it has its token, and the API
  removes each setting it has read from its own environment, so ffmpeg and the OCR tool, which
  work on candidates' files, do not inherit any secret. The API
  reads the plain names (`AUTH_MODE`, `POSTGRES_PASSWORD`, `S3_SECRET_KEY` and the rest) from
  its environment. Without `INFISICAL_CLIENT_ID` the image starts the API directly, with
  whatever environment it was given.
- **Postgres and RustFS** have no Infisical CLI. The `secrets` service fetches
  `POSTGRES_PASSWORD`, `S3_ACCESS_KEY` and `S3_SECRET_KEY` into two memory volumes, one
  file each: `ats-secrets-database` for the database, `ats-secrets-objects` for the object
  store. Each of the two mounts only its own, so neither can read the other's secret. Postgres reads `POSTGRES_PASSWORD_FILE`; RustFS reads
  `RUSTFS_ACCESS_KEY_FILE` and `RUSTFS_SECRET_KEY_FILE`. The service then sleeps: Docker empties
  a memory volume when no running container has it mounted, so it must stay up.

### Infisical, once

1. One project with the environments `staging` and `prod`.
2. One **machine identity per host**, with **universal auth**, and read access to that host's
   environment only. A stolen login then opens one environment, not all of them.
3. On each identity, set **trusted IPs** for the client secret and the access token to that
   host's Netbird address. The login then works from that host only, so a copy of the host
   keys is useless anywhere else.
4. Keep the **access token TTL** short (10 minutes is plenty). The token is used only at start.

Whoever controls a host, or Dokploy itself, can read what runs on it; that is true of any
platform. What this setup keeps apart is the hosts: one host's login cannot read another
host's environment.

Put these keys in each Infisical environment. Required ones first.

| Key                                                                                           | What it is                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                                           | Required. The database password; the database runs in the same compose stack.               |
| `S3_ENDPOINT`                                                                                 | Required: `http://objects:9000`, the object store in the stack, or another S3-compatible store. |
| `AUTH_MODE`                                                                                   | `WorkOS` for real sign-in. `Development` only on a developer machine.                       |
| `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`                                   | WorkOS AuthKit. The redirect is `https://<app>/auth/callback`.                              |
| `AUTH_ALLOWED_EMAIL_DOMAINS`                                                                  | Company email domains that may sign in, separated by commas.                                |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`                                               | The first admin account, made at first start.                                               |
| `RESEND_API_KEY`, `RESEND_FROM`                                                               | Email sending.                                                                              |
| `RESEND_WEBHOOK_SECRET`                                                                       | Delivery and bounce tracking. Optional.                                                     |
| `RESEND_INBOUND_DOMAIN`                                                                       | Reply by email. Optional.                                                                   |
| `OPENAI_API_KEY`                                                                              | Resume reading, matching, transcription. Optional, but most AI features need it.            |
| `OPENAI_MODEL`, `OPENAI_RESUME_MODEL`, `OPENAI_EMBEDDING_MODEL`, `OPENAI_TRANSCRIPTION_MODEL` | Model names. The defaults are fine; pin the resume model.                                   |
| `INTEGRATIONS_PROVIDER`                                                                       | `None`, `Microsoft365` or `GoogleWorkspace`, for calendar invites and meetings.             |
| `MICROSOFT365_*`                                                                              | When the provider is Microsoft365: tenant, client id and secret, sender user.               |
| `GOOGLE_WORKSPACE_*`                                                                          | When the provider is GoogleWorkspace: the impersonated user and the service account JSON.   |
| `CALENDAR_OAUTH_*`                                                                            | Per-interviewer calendar connections (Google and Microsoft app credentials).                |
| `CURRENCY_RATES_URL`                                                                          | Where the daily exchange rates come from. Default: Frankfurter v2, every currency, no key.  |
| `CURRENCY_CACHE_HOURS`                                                                        | How long a fetched rate table is used before a new fetch. Default `24` (rates are daily).   |
| `CURRENCY_CONVERSION`                                                                         | `false` turns conversion off: amounts stay as entered and nothing is fetched. Default `true`. |
| `SEED_ENVIRONMENT`                                                                            | `staging` or `production`: which seed sets this host may take.                              |
| `SEED_SETS`                                                                                   | The seed sets the API keeps in place at every start, for example `baseline,catalog`.        |
| `SEED_PRIVATE_PATH`                                                                           | A SQL file with the company's private seed, run after the sets when the file exists.        |
| `S3_SECRET_KEY`, `S3_ACCESS_KEY`                                                              | Required. The keys of the object store, where uploads live. Access key defaults to `ats`.   |
| `S3_BUCKET`, `S3_REGION`                                                                      | The bucket and region. Defaults: `ats-files`, `us-east-1`.                                  |

The database name and user are fixed in the compose file (`internal_ats`, `ats`).
`ASPNETCORE_ENVIRONMENT` is `Production` on both hosts; staging is production code with
staging data.

The base currency and the list of supported currencies are workspace settings, not variables:
an admin sets them under Settings, then Currencies. The three `CURRENCY_*` variables are the
server's part: where the rates come from, how long they are kept, and an off switch.

## Seeding

The database is seeded on purpose, by set. A set says what the rows are, not where they go:

| Set        | What it holds                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseline` | What every workspace needs: pipeline templates, rejection reasons, candidate sources, saved replies, posting templates for common job families, candidate fields, offer letter templates and the currency catalog. Worded for every kind of work. |
| `catalog`  | Pick-lists: departments, locations and employment types (full time, part time, contract, temporary, internship, seasonal, apprenticeship).                                                                                                      |
| `demo`     | Sample jobs, candidates, applications, interviews, messages and offers, the development accounts (`admin@example.test` and the others) and the `@local.dev` portal candidates.                                                                  |

Roles, notification kinds and the automatic emails live in code and need no rows. Interview
kits, library questions, scorecard templates, compensation packages and pay bands are the
company's own and are **not** in any set in this public repository: enter them by hand, or put
them in the private seed file (below).

The environment map:

| Environment   | Sets                          |
| ------------- | ----------------------------- |
| `development` | `baseline`, `catalog`, `demo` |
| `staging`     | `baseline`, `catalog`, `demo` |
| `production`  | `baseline`, `catalog`         |

The code refuses `demo` on production (`Seeding.Plan`), whatever a person types. Jobs,
candidates, applications and anything that looks like hiring data never reach production this
way.

Seeding is safe to repeat. Each seeded row has a marker (`SeedRecords`) with a fingerprint of
the content as seeded. A later run adds rows that are new, rewrites a row only while it still
matches what the seed wrote, leaves a row an admin edited alone, and never brings back a row an
admin deleted. A row that already exists by name (from an older version of the app) is adopted,
not duplicated.

**In development** the API seeds every set when it starts. To run it by hand:

```bash
tools/seed.sh baseline,catalog
```

**On a host**, set `SEED_SETS` in that host's Infisical environment, for example
`baseline,catalog,demo` on staging and `baseline,catalog` on production. The API seeds those
sets every time it starts, after its migrations. Repeating is safe (above), so a restart
changes nothing. A set the environment refuses (`demo` on production) stops the API from
starting, with the reason in its log. To run the command once by hand on a host instead:

```bash
docker compose -f compose.prod.yaml run --rm --no-deps api seed --sets baseline,catalog
```

The command itself, inside the image or from a checkout, is:

```bash
dotnet run --project src/server/MyThorneAI.Ats.Api.csproj -- seed --sets baseline,demo
```

It runs the migrations first, prints what it seeded, and exits with code 2 when a set is refused
for the environment. `SEED_ENVIRONMENT` names the environment; without it, a Development host is
`development` and every other host is `production`.

**The private seed file.** Set `SEED_PRIVATE_PATH` to a SQL file on the host (mount it into the
API container). It runs after the sets, in one transaction, only when the file exists. Write its
statements so they can run twice (`INSERT ... ON CONFLICT DO NOTHING`). Keep the file out of the
repository.

Before you seed `demo` on staging, set `BOOTSTRAP_ADMIN_EMAIL` to your own address: the demo set
makes an admin account for it, so the sample accounts do not lock you out.

## Locked down by default

- Every workflow starts with no permissions and each job asks for what it needs: the test jobs
  read the code; the image job writes packages.
- Every action is pinned to a commit SHA, with its version in a comment. Dependabot moves them,
  14 days after a release.
- The images carry provenance and a software bill of materials. `sha-<commit>` tags never
  move, so `IMAGE_TAG` can pin one build. A manual run publishes only from the two protected
  branches, and only an admin can make a `v*` tag.
- In compose, every container runs as its own unprivileged user, drops every capability, cannot
  gain new ones, and the API and web containers have a read-only root file system with a
  `tmpfs` for scratch. The API keeps no files on disk: uploads live in the object store.
- The database, the API, the web app and the object store publish no ports. Caddy is the only
  door, and the staff door binds to the host's private address.
- No secret is written to the host's disk. The host keeps only an Infisical login that reads
  one environment and works from that host's Netbird address only. The API holds its settings
  in its process; the database and store keys live in a memory volume. Nothing is copied into
  GitHub.
- The API already limits public requests per address, checks CSRF on every change, and keeps
  webhooks away from private addresses.

## Two doors: public and staff

Caddy fronts the web app with two doors. Its Caddyfile is inside the compose file.

- **The public door**, port 80 inside the stack. On Dokploy, Traefik owns ports 80 and 443 on
  the host: give the public domain to the `caddy` service, port 80, and Traefik gets the
  certificate. It passes only what candidates, approvers and outside services need:
  `/careers`, `/candidate-portal`, `/book` and `/approve` (the links in emails, each with its
  own token), `/public` (the apply form, the portal API and the Resend webhook), `/docs`,
  `/openapi`, `/health`, the logo under `/brand` and the page assets. The bare address goes to
  `/careers`. Every other path answers 404, so the staff app never shows on the internet.
- **The staff door**, port 8080 inside the stack. It answers only Netbird
  addresses (`100.64.0.0/10`, edited in the Caddyfile if your range differs) and this host, and
  gives everyone else a 403. It has two
  ways in:
  - Port `APP_PORT` bound to `BIND_ADDRESS`, the host's Netbird address, at
    `http://<netbird address>:8080`. This is plain HTTP, so it is for checking the host. Sign-in
    does not work here: the sign-in cookie is `Secure`, and `WORKOS_REDIRECT_URI` must be an
    `https` URL (the API refuses to start otherwise).
  - A name with HTTPS, for sign-in and for daily use. See below.

Both doors pass WebSocket upgrades, so the inbox hub works.

### The staff name (HTTPS) on Dokploy

Sign-in needs `https`, so the staff app gets a name, for example `jobs.mythorneai.com`.
Traefik, which Dokploy runs, gets the certificate. The name is only reachable from the private
network, because the staff door checks the client address:

1. **Public DNS:** an `A` record for the name, pointing to the server's public address. Let's
   Encrypt needs it to issue the certificate. Anyone who reaches that address still gets a 403.
2. **Netbird DNS:** a zone or record that sends the same name to the server's Netbird address
   (`100.x.x.x`), for the group that uses the staff app, the way `secrets.mythorneai.com` is
   done. Staff then reach Traefik over Netbird, and the staff door sees their Netbird address.
3. **Dokploy, the compose service, Domains:** add the name with the service `caddy`, port
   `8080`, HTTPS on, certificate Let's Encrypt.
4. **Infisical:** `WORKOS_REDIRECT_URI=https://<the name>/auth/callback`, and add the same URL in
   the WorkOS dashboard under Redirects. Set `CALENDAR_OAUTH_REDIRECT_URI` the same way when
   calendar connections are used.

### The careers site (the public name)

Candidates and approvers use a second name, for example `careers.mythorneai.com`:

1. **Public DNS:** an `A` record for the name, pointing to the server's public address.
2. **Dokploy, the compose service, Domains:** add the name with the service `caddy`, port
   `80`, HTTPS on, certificate Let's Encrypt. Redeploy.
3. **In the app, Settings, General, "Web address of this app":** `https://careers.mythorneai.com`,
   with no path. Every link in a candidate's or approver's email starts with this address, so it
   must be the public name, not the staff name.
4. **Check from a network off Netbird:** `https://<name>/careers` shows the jobs, and
   `https://<name>/settings` answers 404.

Behind Traefik, Caddy trusts the address Traefik forwards (`X-Forwarded-For`, strictly: the
rightmost address the proxy chain vouches for), so a caller cannot fake a Netbird address.
Two checks: from a laptop on Netbird, `https://<the name>` loads the sign-in page; from a
network off Netbird, the same name answers 403.

## Files

In production, uploads (resumes, pictures, recordings, assessment files) live only in a
bucket: in the compose stack, the object store that runs beside the API (the `objects` service,
RustFS, S3-compatible). Nothing is written to disk. Uploads stream into the bucket and reads
stream out of it. Tools that need a path, such as ffmpeg and OCR, get a scratch copy in the
container's `/tmp`, which is memory, and the copy goes once the result is uploaded or the read
ends. A developer machine, with no `S3_ENDPOINT`, keeps files in a local folder instead.

The store keeps its data in the `ats-objects` volume and publishes no port. `S3_ACCESS_KEY`
and `S3_SECRET_KEY` are its root keys and the keys the API signs with. To use another
S3-compatible store instead (Backblaze B2, Cloudflare R2, AWS S3), set `S3_ENDPOINT` and that
store's keys and, if it is not `ats-files`, `S3_BUCKET`, all in Infisical; the `objects`
service then sits idle.
The API makes the bucket when it is missing.

## The public API

`/docs` shows the public API (jobs, applying, the candidate portal) with Scalar, and
`/openapi/public.json` is the OpenAPI document behind it. Both work in production. The full
document with the staff API, `/openapi/v1.json`, exists only in Development.

## Before the first release

- Run `tools/github-rules.sh` as an admin, and look at the coverage rule (above).
- Make the `staging` branch (the script does it) and change the open PR to target it.
- Set the Candidate portal address and the Careers site address in Settings after sign-in, so
  emails link to the right place.
- Back up the `ats-database` and `ats-objects` volumes. The data protection keys volume
  (`ats-data-protection`) must survive restarts, or every booking link and session breaks.
