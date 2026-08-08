# syntax=docker/dockerfile:1

FROM node:24.18.0-alpine3.23 AS builder

RUN corepack enable && corepack prepare pnpm@11.5.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm build && pnpm prune --prod

FROM node:24.18.0-alpine3.23 AS runner

LABEL org.opencontainers.image.title="moto-assistant-backend" \
      org.opencontainers.image.description="Backend API for Moto Assistant"

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 7410

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:7410/api/v1/health || exit 1

CMD ["node", "dist/main.js"]
