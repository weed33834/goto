# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
# 构建期需要 devDependencies 中的 typescript 以执行 tsc
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app

# 非 root 用户运行，降低容器逃逸后的影响面
RUN addgroup -S relay && adduser -S relay -G relay

# 运行时仅安装生产依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist

USER relay

# 运行时配置：所有可调环境变量及默认值（参考 .env.example）
ENV NODE_ENV=production
ENV PORT=8787
ENV HOST=0.0.0.0
ENV PUBLIC_WS_URL=
ENV TOKEN_TTL_MS=86400000
ENV CODE_TTL_MS=300000
ENV QUEUE_TTL_MS=604800000
ENV MAX_FRAME_SIZE=8388608
ENV MAX_QUEUE_BYTES_PER_PEER=67108864
ENV MAX_QUEUE_FRAMES_PER_PEER=10000
ENV PAIRING_RATE_LIMIT_MS=10000
ENV MAX_CODE_ATTEMPTS=5
ENV PING_INTERVAL_MS=30000
ENV TIMESTAMP_TOLERANCE_SECONDS=60
ENV MAX_BODY_SIZE=100kb
ENV CLEANUP_INTERVAL_MS=60000
ENV SHUTDOWN_TIMEOUT_MS=10000
ENV ALLOWED_ORIGINS=*
ENV LOG_LEVEL=info

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1

CMD ["node", "dist/index.js"]
