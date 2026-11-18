FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG API_ORIGIN=http://api:8080
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# The server-side calls (who is signed in, the careers pages) read this when they run. The
# build stage's value is only for the routes fixed at build time; it does not carry over.
ENV API_ORIGIN=http://api:8080
RUN chown node:node /app
COPY --from=build --chown=node:node /app/.next/standalone ./
# Next's standalone build leaves public/ out: the logo, the help pictures and the icons.
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
