#!/usr/bin/env sh
# Run the API on :5080 with dev sign-in, for local checks and the Cypress page walk.
# The repo .env sets a real AUTH_MODE, so this runs from a content root with no ../../.env.
set -eu
ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
CONTENT="${TMPDIR:-/tmp}/ats-dev-api/a/b"
mkdir -p "$CONTENT"
cp "$ROOT/src/server/appsettings.json" "$ROOT/src/server/appsettings.Development.json" "$CONTENT/"
# Only the database values come from .env.
if [ -f "$ROOT/.env" ]; then
  eval "$(grep -E '^POSTGRES_(DB|USER|PASSWORD)=' "$ROOT/.env" | sed 's/^/export /')"
fi
export ASPNETCORE_ENVIRONMENT=Development Auth__Mode=Development ASPNETCORE_URLS=http://localhost:5080
export ConnectionStrings__AtsDatabase="Host=localhost;Port=${POSTGRES_HOST_PORT:-55433};Database=${POSTGRES_DB:-internal_ats};Username=${POSTGRES_USER:-ats};Password=${POSTGRES_PASSWORD:-ats-local-only}"
export FileStorage__RootPath="$ROOT/src/server/uploads"
exec dotnet run --project "$ROOT/src/server/MyThorneAI.Ats.Api.csproj" --no-launch-profile -- --contentRoot "$CONTENT"
