FROM node:20-slim

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV DB_PATH=/app/data/time-planner.db

RUN mkdir -p /app/data

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node node_modules/.bin/next start -p 3000"]
