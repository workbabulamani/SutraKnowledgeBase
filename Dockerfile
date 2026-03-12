FROM node:20-slim AS client-build
WORKDIR /app/client
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci --production && npm rebuild better-sqlite3 --build-from-source
COPY server/ ./
COPY --from=client-build /app/client/dist ./public
RUN mkdir -p /app/data/uploads/images /app/data/backups

ENV NODE_ENV=production
ENV DB_PATH=/app/data/md_viewer.db
ENV UPLOAD_DIR=/app/data/uploads/images

EXPOSE ${PORT:-3001}
CMD ["node", "index.js"]
