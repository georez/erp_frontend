# Next.js frontend image. Built by deploy/docker-compose.yml (see deploy/README.md); by hand:
#   docker build --build-arg BACKEND_URL=http://backend:4000 -t erp-frontend .
#
# Runtime environment (secrets come from deploy/secrets/frontend.env):
#   REPORT_SIGNING_SECRET, COOKIE_SECURE, BACKEND_URL

# --- dependencies: installed exactly as locked ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:22-alpine AS build
WORKDIR /app
# The /api rewrite is fixed at build time (see src/utils/backend.js), so the backend address is a build argument
ARG BACKEND_URL=http://backend:4000
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Needs internet access: next/font downloads the Cairo font while building
RUN npm run build

# --- runtime: only the standalone server and the static files it doesn't include ---
FROM node:22-alpine AS runtime
WORKDIR /app
# The zone data for TZ (deploy/.env): Node has its own, but the container's tools (date, logs) read the system's
RUN apk add --no-cache tzdata
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Listen on every interface inside the container; the port is not published, only Apache reaches it
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.next/standalone ./
# output: 'standalone' leaves these out: without them pages load with no scripts, styles or fonts
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
