#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"
exec dotnet run --project src/server/MyThorneAI.Ats.Api.csproj
