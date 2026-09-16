FROM node:26-bookworm-slim AS web-build
WORKDIR /source/web
COPY src/web/package.json src/web/package-lock.json ./
RUN npm ci
COPY src/web/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS server-build
WORKDIR /source
COPY global.json Directory.Packages.props ./
COPY src/server/MyThorneAI.Ats.Api.csproj src/server/
RUN dotnet restore src/server/MyThorneAI.Ats.Api.csproj
COPY src/server/ src/server/
COPY --from=web-build /source/server/wwwroot/ src/server/wwwroot/
RUN dotnet publish src/server/MyThorneAI.Ats.Api.csproj --no-restore --configuration Release --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
USER root
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir --parents /app/data-protection-keys \
    && mkdir --parents /app/uploads \
    && chown app:app /app/data-protection-keys /app/uploads
WORKDIR /app
COPY --from=server-build /app/publish/ ./
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
USER $APP_UID
ENTRYPOINT ["dotnet", "MyThorneAI.Ats.Api.dll"]
