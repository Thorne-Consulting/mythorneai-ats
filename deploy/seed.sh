#!/usr/bin/env sh
# Seeds the database on this host with the named sets, using the API image that is deployed here.
# Run by seed.yml on the self-hosted runner, or by hand from the deploy folder:
#
#   SEED_ENVIRONMENT=staging SEED_SETS=baseline,catalog,demo INFISICAL_ENV=staging ./seed.sh
#
# Settings come from Infisical the same way deploy.sh gets them. The image tag is the one the
# last deploy wrote to .env, or IMAGE_TAG. The API itself refuses demo data on production.
set -eu
cd "$(dirname "$0")"

: "${SEED_ENVIRONMENT:?set SEED_ENVIRONMENT (staging or production)}"
: "${SEED_SETS:=baseline,catalog}"
: "${INFISICAL_ENV:=prod}"
: "${INFISICAL_PROJECT_ID:?set INFISICAL_PROJECT_ID (the Infisical project for this app)}"

tag="${IMAGE_TAG:-$(grep -s '^IMAGE_TAG=' .env | cut -d= -f2-)}"
: "${tag:=latest}"

token="${INFISICAL_TOKEN:-}"
if [ -n "${INFISICAL_OIDC_JWT:-}" ]; then
  : "${INFISICAL_IDENTITY_ID:?set INFISICAL_IDENTITY_ID (the machine identity with GitHub OIDC auth)}"
  token=$(infisical login --method=oidc-auth --machine-identity-id="$INFISICAL_IDENTITY_ID" --oidc-jwt="$INFISICAL_OIDC_JWT" --plain --silent)
  unset INFISICAL_OIDC_JWT
fi

# 1. Settings, fresh, readable by this user only. Compose reads the file on the next step.
umask 077
INFISICAL_TOKEN="$token" infisical export --env="$INFISICAL_ENV" --projectId="$INFISICAL_PROJECT_ID" --format=dotenv > .env
unset token INFISICAL_TOKEN
echo "IMAGE_TAG=$tag" >> .env

# 2. The image, in case this host never deployed it.
if [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io --username "${GHCR_USER:-github}" --password-stdin
fi
docker compose -f compose.prod.yaml pull --quiet api

# 3. One short-lived API container runs the seed command against the stack's database and exits.
docker compose -f compose.prod.yaml run --rm --no-deps \
  -e SEED_ENVIRONMENT="$SEED_ENVIRONMENT" \
  api dotnet MyThorneAI.Ats.Api.dll seed --sets "$SEED_SETS"
echo "ok: seeded $SEED_SETS on $SEED_ENVIRONMENT"
