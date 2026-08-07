# syntax=docker/dockerfile:1

FROM node:24.18.0-alpine3.23

LABEL org.opencontainers.image.title="moto-assistant-api" \
      org.opencontainers.image.description="Backend API for Moto Assistant" \
      org.opencontainers.image.authors="Jay.M.Hu <hm910705@163.com>"

ENV NODE_ENV=production

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --chown=node:node dist/ ./

USER node

EXPOSE 7410

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
