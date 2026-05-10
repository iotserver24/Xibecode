# syntax=docker/dockerfile:1
#
# Build (from this directory):
#   docker build -t xibecode-e2b-gateway .
#
# Run:
#   docker run --env-file .env -p 8787:8787 xibecode-e2b-gateway
#
# Coolify: set build context to `packages/e2b-gateway` (or repo root with context
# `packages/e2b-gateway` and Dockerfile path `packages/e2b-gateway/Dockerfile`).

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN npm install && npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/dist ./dist

RUN npm install --omit=dev && chown -R node:node /app

USER node

EXPOSE 8787

ENV PORT=8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
