#!/usr/bin/env sh
# Pulls the published images and restarts the stack on this host. Run by release.yml on the
# self-hosted runner, or by hand from the deploy folder:
#
#   IMAGE_TAG=staging INFISICAL_ENV=staging ./deploy.sh
#
# Settings come from Infisical over the Netbird mesh. From the workflow, the job signs in with
# a short-lived GitHub token (INFISICAL_OIDC_JWT) bound to the GitHub environment, so the host
# keeps no credential. By hand, sign in first: `infisical login` with your own account, or set
# INFISICAL_TOKEN for this shell only.
set -eu
cd "$(dirname "$0")"

: "${IMAGE_TAG:=latest}"
: "${INFISICAL_ENV:=prod}"
: "${INFISICAL_PROJECT_ID:?set INFISICAL_PROJECT_ID (the Infisical project for this app)}"

# The GitHub token lives for minutes and only this identity accepts it. The Infisical token it
# buys is used for the one export below and nowhere else.
token="${INFISICAL_TOKEN:-}"
if [ -n "${INFISICAL_OIDC_JWT:-}" ]; then
  : "${INFISICAL_IDENTITY_ID:?set INFISICAL_IDENTITY_ID (the machine identity with GitHub OIDC auth)}"
  token=$(infisical login --method=oidc-auth --machine-identity-id="$INFISICAL_IDENTITY_ID" --oidc-jwt="$INFISICAL_OIDC_JWT" --plain --silent)
  unset INFISICAL_OIDC_JWT
fi

# 1. Settings. The file is only readable by this user; compose reads it on the next line.
umask 077
INFISICAL_TOKEN="$token" infisical export --env="$INFISICAL_ENV" --projectId="$INFISICAL_PROJECT_ID" --format=dotenv > .env
unset token INFISICAL_TOKEN
echo "IMAGE_TAG=$IMAGE_TAG" >> .env

# 2. Images. GHCR_USER and GHCR_TOKEN come from the workflow; by hand, `docker login ghcr.io` first.
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "${GHCR_USER:-github}" --password-stdin
fi
docker compose -f compose.prod.yaml pull --quiet

# 3. Restart what changed. The API runs its migrations at start; the web app waits for its health.
docker compose -f compose.prod.yaml up -d --remove-orphans
docker image prune -f >/dev/null

# 4. Say so.
docker compose -f compose.prod.yaml ps
curl -fsS "http://127.0.0.1:${APP_PORT:-8080}/health" && echo " ok: $IMAGE_TAG is up"
