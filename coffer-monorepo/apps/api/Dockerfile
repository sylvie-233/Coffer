# syntax=docker/dockerfile:1

# ---------- 构建阶段：安装依赖并构建 API 及其 workspace 依赖 ----------
FROM node:22-alpine AS build

WORKDIR /app

# 与 package.json 的 packageManager 保持一致
RUN npm install -g pnpm@10.32.1 --no-fund --no-audit

# 先复制全部 workspace 的 manifest，最大化利用 Docker 层缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/crypto/package.json packages/crypto/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/utils/package.json packages/utils/package.json
COPY packages/vault/package.json packages/vault/package.json
COPY packages/vault-core/package.json packages/vault-core/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @coffer/api... build

# 生成仅含生产依赖、可直接运行的部署目录
RUN pnpm --filter @coffer/api --prod deploy --legacy /app/deploy

# ---------- 运行阶段：只保留产物与生产依赖 ----------
FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /app/deploy/package.json ./package.json
COPY --from=build --chown=node:node /app/deploy/dist ./dist
COPY --from=build --chown=node:node /app/deploy/node_modules ./node_modules

USER node

EXPOSE 3000

CMD ["node", "dist/main.js"]
