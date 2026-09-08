# syntax=docker/dockerfile:1
# Adapted from LiveKit's generated template: this project uses npm + tsx
# (runs TypeScript directly, no separate build step), not pnpm + tsc.

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base

# Required by the LiveKit SDK: the native Rust core reads the system trust
# store at runtime, which the slim base image doesn't ship.
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*

# --- Build stage ---
FROM base AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Pre-download any ML models the agent's plugins need; runs before COPY . .
# so this layer is cached across code-only changes.
RUN npx livekit-agents download-files

COPY . .

# --- Production stage ---
FROM base

ARG UID=10001
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/app" \
    --shell "/sbin/nologin" \
    --uid "${UID}" \
    appuser

WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app

USER appuser
ENV NODE_ENV=production

CMD [ "npm", "start" ]
