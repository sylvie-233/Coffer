# syntax=docker/dockerfile:1

# ---------- 构建阶段：安装依赖并构建 Web 及其 workspace 依赖 ----------
FROM node:22-alpine AS build

WORKDIR /app

# 国内 npm 镜像；需要私有源时可用 --build-arg NPM_REGISTRY=... 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com

# npm 自身与 pnpm 安装都走镜像
RUN npm config set registry "$NPM_REGISTRY" \
 && npm install -g pnpm@10.32.1 --no-fund --no-audit \
 && pnpm config set registry "$NPM_REGISTRY"

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

# 先构建 Web 依赖的共享包（types / utils / crypto / ui / vault-core / vault），再构建静态站
RUN pnpm --filter @coffer/web... build

# ---------- 运行阶段：Nginx 托管静态资源并反向代理 /api ----------
FROM nginx:1.27-alpine AS runner

ENV TZ=Asia/Shanghai

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html

EXPOSE 80
