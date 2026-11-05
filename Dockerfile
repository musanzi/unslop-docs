FROM node:24-alpine AS tooling
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.11.2 --activate
ENV NX_DAEMON=false NX_ISOLATE_PLUGINS=false

FROM tooling AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM dependencies AS api-development
ENV UPLOADS_DIR=/app/apps/api/uploads
COPY . .
CMD ["pnpm", "dev:api"]

FROM dependencies AS web-development
COPY . .
CMD ["pnpm", "exec", "nx", "serve", "web", "--host=0.0.0.0"]

FROM dependencies AS api-build
COPY . .
RUN pnpm exec nx build api

FROM dependencies AS web-build
COPY . .
RUN pnpm exec nx build web

FROM tooling AS production-dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

FROM node:24-alpine AS api-production
ENV NODE_ENV=production UPLOADS_DIR=/app/apps/api/uploads
WORKDIR /app
COPY --from=production-dependencies /app/node_modules /app/node_modules
COPY --from=production-dependencies /app/package.json /app/package.json
COPY --from=api-build /app/dist/apps/api /app/dist/apps/api
RUN mkdir -p "$UPLOADS_DIR" && chown -R node:node "$UPLOADS_DIR"
USER node
CMD ["node", "dist/apps/api/src/main.js"]

FROM node:24-alpine AS web-production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json ./package.json
COPY --from=web-build /app/dist/apps/web ./dist/apps/web
USER node
CMD ["node", "dist/apps/web/server/server.mjs"]
