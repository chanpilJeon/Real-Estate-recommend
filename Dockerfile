# Node 24 matches the local runtime; Node 20 in the initial plan has reached EOL.
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.7.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY prisma prisma
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm exec prisma generate && pnpm --filter @apt/shared build && pnpm --filter @apt/api build

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production API_PORT=4000
# Keep Prisma CLI for migrate deploy; source, keys, CSV files and build caches are excluded.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node docker/api-entrypoint.sh ./docker/api-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>r.json()).then(x=>process.exit(x.status==='ok'?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "/app/docker/api-entrypoint.sh"]
