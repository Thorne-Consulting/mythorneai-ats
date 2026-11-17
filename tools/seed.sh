#!/usr/bin/env sh
# Seed the local database on purpose: tools/seed.sh [sets]. Default: every set (development).
#
#   tools/seed.sh                   # baseline, catalog and demo
#   tools/seed.sh baseline,catalog  # only the workspace basics
set -eu
ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT/.env" ]; then
  eval "$(grep -E '^(POSTGRES_(DB|USER|PASSWORD|HOST_PORT)|SEED_PRIVATE_PATH)=' "$ROOT/.env" | sed 's/^/export /')"
fi
export ASPNETCORE_ENVIRONMENT=Development Auth__Mode=Development
export ConnectionStrings__AtsDatabase="Host=localhost;Port=${POSTGRES_HOST_PORT:-55433};Database=${POSTGRES_DB:-internal_ats};Username=${POSTGRES_USER:-ats};Password=${POSTGRES_PASSWORD:-ats-local-only}"
export FileStorage__RootPath="$ROOT/src/server/uploads"
[ -n "${SEED_PRIVATE_PATH:-}" ] && export Seed__PrivatePath="$SEED_PRIVATE_PATH"
exec dotnet run --project "$ROOT/src/server/MyThorneAI.Ats.Api.csproj" --no-launch-profile -- seed --sets "${1:-baseline,catalog,demo}"
