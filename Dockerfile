FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG SOURCE_COMMIT
RUN node_modules/.bin/tsx scripts/systems.ts prepare . /app/system-bundle "$SOURCE_COMMIT"
RUN npx vite build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production \
    SERVER_PORT=3001
COPY --from=build /app/node_modules ./node_modules
COPY package.json tsconfig.json sessions.json ./
COPY shared ./shared
COPY content-locales ./content-locales
COPY vendor ./vendor
COPY server ./server
COPY drizzle ./drizzle
COPY scripts/fantasy-backup.ts scripts/fantasy-account-admin.ts scripts/fantasy-diagnostics.ts ./scripts/
COPY scripts/check-kokoa-ai.ts ./scripts/check-kokoa-ai.ts
COPY scripts/systems.ts ./scripts/systems.ts
COPY scripts/content-translations.ts ./scripts/content-translations.ts
COPY --from=build /app/system-bundle ./system-bundle
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.SERVER_PORT || 3001) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
