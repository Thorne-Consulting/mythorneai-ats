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
                    release.yml     release.yml       (images to GHCR, then deploy)
                         │               │
                  staging host    production host     (production waits for a reviewer)
```

1. **Work on a branch** named `<you>/<kind>/<what>`, for example `sirshak/feat/ci-cd`.
2. **Open a pull request into `staging`.** `ci.yml` runs: the web app's format, types, logic
   checks and build, and the server tests in four shards. One check called `ok` sums it up.
   Turn on auto-merge on the PR; it merges by itself when `ok` is green.
3. **Merging into `staging`** runs `release.yml`: it builds the two images, publishes them to
   GHCR with the tag `staging`, and the staging host pulls them.
4. **Open a pull request from `staging` into `main`** when staging looks right. `ci.yml` runs
   again on that PR, because the branch rules ask for it. One approval is needed.
5. **Merging into `main`** publishes the images with the tags `latest` and `main`, then waits
   for a reviewer on the `production` environment before the production host pulls them.
6. **A tag `v1.2.3` on `main`** publishes the images as `1.2.3` and `1.2`, for a known
   rollback point. It deploys nothing. Only an admin can make a `v*` tag (the tags ruleset).

Every build also gets `sha-<commit>`, and that is what the hosts deploy: the exact image the
run built, never a moving tag. `staging`, `main` and `latest` are for people.

Nothing runs twice. A push to a feature branch runs nothing: the PR is where checks happen.
Dependabot opens its PRs against `staging`, only for versions at least 14 days old, and patch
or minor updates merge by themselves once `ok` passes.

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
- **Environments:** `staging` deploys at once. `production` waits for the reviewer the script
  names, and only from `main`.

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
- [Netbird](https://netbird.io), joined to the mesh that holds Infisical and the people who use
  the app.
- The [Infisical CLI](https://infisical.com/docs/cli/overview), signed in with a machine
  identity (below).
- A GitHub Actions self-hosted runner with the labels `self-hosted`, `ats` and `staging` or
  `production`. The runner is what lets GitHub reach a host that is not on the internet.
- A copy of the `deploy/` folder, or a checkout of the repository.

Then set the repository variable `DEPLOY_RUNNERS` to `true`. Until it is set, `release.yml` skips
the deploy job instead of waiting for a runner that does not exist.

To deploy by hand from the `deploy/` folder:

```bash
IMAGE_TAG=staging INFISICAL_ENV=staging INFISICAL_PROJECT_ID=<id> ./deploy.sh
```

`deploy.sh` writes `.env` from Infisical, pulls the images, restarts what changed, and checks
`/health`. The API runs its database migrations when it starts.

## Settings and secrets: Infisical over Netbird

Secrets live in your self-hosted Infisical, in one project with the environments `staging` and
`prod`. The hosts read them at deploy time with `infisical export`. Nothing is copied into
GitHub, and GitHub never needs to reach Infisical.

Why not the Infisical GitHub integration: it copies secrets into GitHub Actions secrets, which
only helps when GitHub itself needs them. Here GitHub only builds images, and the images hold no
secrets. The hosts are the ones that need the values, and they are on the mesh with Infisical.
So the mesh is the convenient path, and no GitHub app or sync is needed.

Set up each host once:

1. In Infisical, make a **machine identity** with Universal Auth, give it read access to the
   project and its environment, and copy the client id and secret.
2. On the host, sign the CLI in:

   ```bash
   export INFISICAL_API_URL=https://infisical.<your mesh domain>
   infisical login --method=universal-auth --client-id=<id> --client-secret=<secret> --plain > ~/.infisical-token
   ```

   Then put `INFISICAL_TOKEN=$(cat ~/.infisical-token)`, `INFISICAL_API_URL` and
   `INFISICAL_PROJECT_ID` in the runner's environment (`.env` in the runner folder, or the
   service unit). `deploy.sh` reads them.

3. Put these keys in the Infisical environment. Required ones first.

| Key                                                                                           | What it is                                                                                  |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                                                           | Required. The database password; the database runs in the same compose stack.               |
| `POSTGRES_DB`, `POSTGRES_USER`                                                                | Database name and user. Defaults: `internal_ats`, `ats`.                                    |
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
| `APP_PORT`                                                                                    | The host port the web app listens on. Default `8080`.                                       |
| `BIND_ADDRESS`                                                                                | The address it listens on. Default `127.0.0.1`: only the proxy or the mesh peer reaches it. |

`ASPNETCORE_ENVIRONMENT` stays `Production` on both hosts; staging is production code with
staging data.

## Running the images somewhere else

The compose file is for a host you own. The same two images also run on a platform (DigitalOcean
App Platform, Dokploy, Cloud Run and the like) that does its own routing and TLS. What the
images need from the platform:

- **The API** listens on port 8080 and gets its settings as environment variables, the same
  names as in `deploy/compose.prod.yaml` (`ConnectionStrings__AtsDatabase`, `Auth__Mode` and so
  on). It needs two persistent disks: `/app/data-protection-keys` and `/app/uploads`. Do not
  give it a public address.
- **The web app** listens on port 3000 and is the only thing the outside reaches. It proxies
  `/api`, `/public`, `/auth`, `/docs`, `/openapi` and `/health` to the API. Where the API lives
  is baked in when the image is built, from the build argument `API_ORIGIN`, and the published
  image uses `http://api:8080`. So either name the API service `api` on port 8080, which is what
  Dokploy and App Platform give a component with that name, or build the web image yourself with
  `--build-arg API_ORIGIN=http://<your api host>:8080`.
- **PostgreSQL 18** with a persistent disk, reachable only from the API.
- The proxy or platform in front of the web app must pass WebSocket upgrades for `/api/hubs/*`.

## Locked down by default

- Every workflow starts with no permissions and each job asks for what it needs: the test jobs
  read the code; the image job writes packages; the deploy job reads packages.
- Every action is pinned to a commit SHA, with its version in a comment. Dependabot moves them,
  14 days after a release.
- The images carry provenance and a software bill of materials. The hosts deploy `sha-<commit>`
  tags, which never move; `staging`, `main` and `latest` are labels for people. A manual run
  publishes only from the two protected branches, and only an admin can make a `v*` tag.
- In compose, every container runs as its own unprivileged user, drops every capability, cannot
  gain new ones, and the API and web containers have a read-only root file system with a small
  `tmpfs` for scratch. If the API ever logs a write error on the first staging deploy, that is
  where to look.
- The database and the API publish no ports. The web app binds to the loopback address.
- The deploy host holds secrets only in a `.env` that one user can read, written fresh on each
  deploy from Infisical over the mesh. Nothing is copied into GitHub.
- The API already limits public requests per address, checks CSRF on every change, and keeps
  webhooks away from private addresses.

## In front of the app

Whatever sits in front, a reverse proxy on the host or the platform's router, points at the web
app alone (`127.0.0.1:${APP_PORT}` in compose, port 3000 on a platform) and passes WebSocket
upgrades for `/api/hubs/*`. For an internal-only app, expose it only on the Netbird address or
the platform's private network. If the careers site must be public, forward only `/careers`,
`/public`, `/docs`, `/openapi`, `/candidate-portal` and `/book` from a public address.

## The public API

`/docs` shows the public API (jobs, applying, the candidate portal) with Scalar, and
`/openapi/public.json` is the OpenAPI document behind it. Both work in production. The full
document with the staff API, `/openapi/v1.json`, exists only in Development.

## Before the first release

- Run `tools/github-rules.sh` as an admin, and look at the coverage rule (above).
- Make the `staging` branch (the script does it) and change the open PR to target it.
- Install `ffmpeg` on the API image if long recordings matter (`Dockerfile`, next to `ocrmypdf`).
- Set the Candidate portal address and the Careers site address in Settings after sign-in, so
  emails link to the right place.
- Back up the `ats-database` and `ats-uploads` volumes. The data protection keys volume
  (`ats-data-protection`) must survive restarts, or every booking link and session breaks.
