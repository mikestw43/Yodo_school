# YODO: React client + Node API in one image. Data lives in the /data volume.

# ---- build the web client ----
FROM node:22-bookworm-slim AS client
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- build the API ----
FROM node:22-bookworm-slim AS server
# Prisma checks the OpenSSL version. Set to 0 only where Debian mirrors are unreachable.
ARG INSTALL_OPENSSL=1
RUN if [ "$INSTALL_OPENSSL" = 1 ]; then apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*; fi
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim
ARG INSTALL_OPENSSL=1
RUN if [ "$INSTALL_OPENSSL" = 1 ]; then apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*; fi
ENV NODE_ENV=production \
    TZ=Asia/Bangkok \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/yodo.db \
    APP_PORT=3000 \
    PUBLIC_DIR=/app/client/dist \
    EXTRA_DIR=/app/web
WORKDIR /app/server
COPY --from=server /src/server/node_modules ./node_modules
COPY --from=server /src/server/dist ./dist
COPY --from=server /src/server/prisma ./prisma
COPY --from=server /src/server/package.json ./
COPY --from=client /src/client/dist /app/client/dist
COPY web/ /app/web/
COPY deploy/start.sh /app/start.sh
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "/app/start.sh"]
