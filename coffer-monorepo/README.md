# Coffer · 零知识凭证管理器

Coffer 是一个零知识个人凭证管理器：账号密码、卡片证件、安全笔记与图片附件全部在
浏览器内加密，服务端只保存密文。登录使用 SRP-6a，主密码与派生密钥不会离开客户端。

## 技术栈

- **API**：Hono + `@hono/node-server` + MySQL 8（mysql2 / Drizzle）+ RustFS（S3 兼容）
- **Web**：Next.js 15（App Router，生产静态导出）+ React 19 + Tailwind CSS v4
- **共享包**：`@coffer/crypto`（Argon2id / AES-256-GCM / SRP-6a）、`@coffer/types`、
  `@coffer/utils`、`@coffer/db`、`@coffer/ui`、`@coffer/vault-core`、`@coffer/vault`
- **工程**：pnpm + Turborepo

## 目录结构

```
coffer-monorepo/
├── apps/
│   ├── api/              # Hono API（routes → controllers → services → sql）
│   └── web/              # 仅保留 Next.js 应用壳、静态资源与 Tailwind 入口
├── packages/
│   ├── crypto/           # 客户端加密与 SRP 实现
│   ├── db/               # Drizzle schema / 数据库客户端
│   ├── tsconfig/         # 共享 TypeScript 配置
│   ├── types/            # 共享 DTO、常量
│   ├── utils/            # 纯函数工具
│   ├── ui/               # Tailwind 主题、设计令牌、基础组件与共享样式
│   ├── vault-core/       # 业务内核：API 客户端、会话、加解密视图模型
│   └── vault/            # 保险库 React 页面与功能组件（Web / Electron 共用）
├── turbo.json
└── docker 相关文件位于仓库根目录的 scripts/ 与 Dockerfile
```

`apps/web` 只负责：

- `src/app/layout.tsx`、`src/app/page.tsx`（挂载 `@coffer/vault` 的 `CofferApp`）
- `src/app/globals.css`（导入 Tailwind 与 `@coffer/ui/styles.css`，并声明 `@source`）
- `public/` 静态资源与 Next / Tailwind 配置

所有样式、通用组件和保险库业务均位于 `packages/`，便于 Electron 渲染进程直接复用。

## Electron 复用

Electron 的 React 页面可以直接渲染共享页面，不需要复制 Web 组件：

```tsx
import { CofferApp, configureApi, configureVault } from '@coffer/vault';

configureApi({ baseUrl: 'http://127.0.0.1:3000/api' });
configureVault({ brandIconSrc: './assets/icon-v1.png' });

export function ElectronRoot() {
  return <CofferApp />;
}
```

渲染进程的 CSS 入口与 Web 保持一致（Tailwind v4 + 共享设计系统）：

```css
@import 'tailwindcss';
@import '@coffer/ui/styles.css';
@source '../node_modules/@coffer/ui/dist';
@source '../node_modules/@coffer/vault/dist';
```

`@coffer/ui` 提供 `Avatar`、`ToastHost`、`Lightbox`、`ConfirmDialog`、`toast()` 等基础能力；
`@coffer/vault-core` 可在非 React 环境直接调用（如 CLI / 测试）；`@coffer/vault` 暴露
`CofferApp`、`VaultProvider`、`useVault` 及全部功能组件。API 与品牌图标路径均可按宿主配置。

Electron 若以 `app://` 或独立开发端口加载页面，属于跨源访问，需要在 API 的 `CORS_ORIGIN`
中追加对应来源；走宿主代理（请求同源 `/api`）时无需额外配置。


API 分层约定与 `cloudhub_admin` 一致：`routes` 挂载路由，`controllers` 解析/校验请求，
`services` 承载业务与事务，`sql` 只拼装参数化 SQL，`validators` 使用 Zod 校验入参。

## 本地开发

```bash
pnpm install
pnpm build          # 先构建共享包（types / utils / crypto / db / ui / vault-core / vault）
pnpm dev            # Turbo 并行启动 API(3000) 与 Web(3001)
```

开发态 Web 的 `/api` 由 Next.js rewrites 代理到 `http://127.0.0.1:3000`。
API 环境变量参考 [apps/api/.env.example](apps/api/.env.example)。

也可以只用 Docker 启动 MySQL 与 RustFS，在宿主机跑两个应用：

```powershell
pwsh ./manage.ps1 up -Target mysql
docker compose -f scripts/docker-compose.yml up -d rustfs
```

## 一键容器化部署

仓库根目录提供 `manage.ps1`，编排文件为 `scripts/docker-compose.yml`
（MySQL + RustFS + API + Web）。

```powershell
pwsh ./manage.ps1 up              # 构建并启动全部服务
pwsh ./manage.ps1 up -Target web  # 只启动 Web（自动带起 API/MySQL/RustFS）
pwsh ./manage.ps1 status          # 查看状态与访问地址
pwsh ./manage.ps1 logs -Target api -Follow
pwsh ./manage.ps1 init            # 重新执行初始化 SQL（会清空业务表）
pwsh ./manage.ps1 reset -Force    # 删除数据卷并重建（数据全部丢失）
```

首次启动 MySQL 会自动执行 `docs/sql/coffer-v1.sql`。生产部署前请复制
`scripts/.env.example` 为 `scripts/.env`，并修改 MySQL 密码、`JWT_SECRET` 与
RustFS 密钥；对外暴露时请在 Nginx 前配置 HTTPS。

默认地址：

- Web：<http://localhost:8080>
- API 文档：<http://localhost:3000/api/docs>
- RustFS 控制台：<http://localhost:9001>

## 零知识约定

- 主密码通过 Argon2id 派生 KEK，KEK 只存在于浏览器内存，刷新或锁定后需重新输入主密码。
- 登录使用 SRP-6a：服务端只保存 `auth_verifier`，不保存可反推密码的材料。
- 字段密文格式 `v1.` + Base64(Nonce(12B)‖Ciphertext‖Tag(16B))；附件/头像为同算法的
  二进制密文文件。所有 `*_cipher` 字段对服务端不可读。
- 修改主密码即全库重加密：客户端下载全部密文、用新 KEK 重新加密后一次性提交，
  服务端校验数量与密钥版本后在同一事务中更新；旧密钥版本作废。
- 删除凭证进入回收站保留 30 天；显式删除的附件会立即从数据库与对象存储中移除。

> 备份时必须同时备份 MySQL 数据卷与 RustFS 数据卷：前者保存元数据，后者保存密文附件，
> 两者缺一都无法恢复完整保险库。
