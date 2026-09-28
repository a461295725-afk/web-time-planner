FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV DB_PATH=/app/data/time-planner.db

RUN mkdir -p /app/data

RUN npm run build
RUN ./node_modules/.bin/esbuild scripts/migrate.mjs \
  --bundle \
  --platform=node \
  --format=esm \
  --external:better-sqlite3 \
  --outfile=dist/migrate.mjs
RUN npm prune --omit=dev && npm cache clean --force

FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DB_PATH=/app/data/time-planner.db
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["sh", "-c", "node dist/migrate.mjs && node node_modules/next/dist/bin/next start -p 3000"]
