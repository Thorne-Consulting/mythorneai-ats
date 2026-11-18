FROM mcr.microsoft.com/dotnet/sdk:11.0 AS server-build
WORKDIR /source
COPY global.json Directory.Packages.props ./
COPY src/server/MyThorneAI.Ats.Api.csproj src/server/
RUN dotnet restore src/server/MyThorneAI.Ats.Api.csproj
COPY src/server/ src/server/
RUN dotnet publish src/server/MyThorneAI.Ats.Api.csproj --no-restore --configuration Release --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
USER root
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl ffmpeg libgssapi-krb5-2 ocrmypdf \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir --parents /app/data-protection-keys \
    && mkdir --parents /app/uploads \
    && chown app:app /app/data-protection-keys /app/uploads
# The Infisical CLI, pinned. It is one static binary, so it is copied from its own image.
COPY --from=infisical/cli:0.44.12 /bin/infisical /usr/local/bin/infisical
WORKDIR /app
COPY --from=server-build /app/publish/ ./
ENV ASPNETCORE_HTTP_PORTS=8080 \
    DataProtection__KeyPath=/app/data-protection-keys \
    INFISICAL_DISABLE_TELEMETRY=1
EXPOSE 8080
USER $APP_UID
# With INFISICAL_CLIENT_ID set, the API fetches its own settings at start: it signs in to
# Infisical with that machine identity (universal auth), then `infisical run` starts the API
# with every secret of INFISICAL_ENV in its environment. Nothing is written to disk; HOME is the
# memory /tmp because the root file system is read-only. The login pair is dropped from the
# environment once the token is bought, so the API and the tools it starts never hold it. The
# token itself is short-lived (set its TTL low in Infisical). Without INFISICAL_CLIENT_ID it starts
# the API directly with the environment it was given (a developer machine, another platform).
# Arguments pass through, so `seed --sets baseline` works the same way.
ENTRYPOINT ["sh", "-c", "set -e; export HOME=/tmp; if [ -z \"${INFISICAL_CLIENT_ID:-}\" ]; then exec dotnet MyThorneAI.Ats.Api.dll \"$@\"; fi; token=$(infisical login --method=universal-auth --client-id=\"$INFISICAL_CLIENT_ID\" --client-secret=\"$INFISICAL_CLIENT_SECRET\" --plain --silent); unset INFISICAL_CLIENT_ID INFISICAL_CLIENT_SECRET; exec infisical run --token=\"$token\" --env=\"$INFISICAL_ENV\" --projectId=\"$INFISICAL_PROJECT_ID\" -- dotnet MyThorneAI.Ats.Api.dll \"$@\"", "api"]
