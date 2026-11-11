# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库结构

- Git 根目录是 `Coffer/`，实际代码都在 `coffer-monorepo/`（pnpm workspace + Turborepo）。
- `coffer-monorepo/apps/`：`api`（Hono + MySQL + RustFS）、`web`（Next.js 静态导出）、`electron`（Electron Forge）、`rn`（Expo / React Native，仅 Android）。
- `coffer-monorepo/packages/`：`types`（共享 DTO/常量）、`utils`、`crypto`（Argon2id / SRP-6a / AES-256-GCM）、`db`（MySQL 客户端与 Drizzle schema）、`vault-core`（API 客户端 + 会话 + 保险库视图模型）、`vault`（Web 端页面与组件）、`ui`、`eslint-config`、`tsconfig`。
- `docs/`：`功能设计说明-v1.md` 是业务与加密契约的权威文档；`sql/coffer-v1.sql` 是权威表结构；`prototype/` 是 PC/移动端交互原型。
- 根目录 `manage.ps1` + `scripts/docker-compose.yml`：本机容器编排（MySQL / RustFS / API / Web）。

## 常用命令

在 `coffer-monorepo/` 下执行：

```bash
pnpm install
pnpm build                      # turbo 构建全部包（共享包需先于 apps 构建）
pnpm dev                        # API :3000 + Web :3001
pnpm lint                       # ESLint（每个包 --max-warnings 0）
pnpm typecheck                  # tsc --noEmit
```

单包操作（turbo 会自动处理依赖构建）：

```bash
pnpm --filter @coffer/api dev
pnpm --filter @coffer/web build
pnpm --filter @coffer/vault-core build      # 改共享包后必须重新构建，apps 读取的是 dist
pnpm --filter @coffer/rn typecheck
pnpm --filter @coffer/rn lint
```

桌面端与移动端（根目录脚本）：

```bash
pnpm desktop:dev                # 先构建 @coffer/vault 依赖，再 electron-forge start
pnpm desktop:make               # NSIS 安装包 -> apps/electron/out/make/
pnpm mobile:start               # Metro（Expo）
pnpm mobile:android             # expo run:android（会先跑工具链脚本）
pnpm --filter @coffer/rn prebuild:android   # prebuild --clean 后自动重建本机工具链
pnpm mobile:apk:debug           # apps/rn/android/app/build/outputs/apk/debug/app-debug.apk
```

容器环境（仓库根目录，PowerShell）：

```powershell
pwsh ./manage.ps1 up            # 全部服务；up -Target mysql 等可只起部分
pwsh ./manage.ps1 status|logs|down|reset|init
```

目前仓库**没有测试用例**，也没有任何包定义 `test` 脚本；不要假设存在单测命令。

## 架构与数据流

**分层复用**：`types` / `utils` / `crypto` / `vault-core` 是跨端共享的纯逻辑层；`vault` 是基于它们的 Web UI。Web 与 Electron 直接渲染同一个 `@coffer/vault` 的 `CofferApp`，只在启动时注入宿主配置：

- Web：同源 `/api`，开发态由 `next.config.ts` rewrites 代理到 `http://127.0.0.1:3000`；生产为静态导出 + Nginx 反代。
- Electron：主进程通过 `desktop-config.json` 提供 API 地址，`preload` 暴露给渲染进程，默认 `http://127.0.0.1:3000/api`；自定义 `app://coffer` 协议需保持 secure 上下文（WebCrypto / Clipboard 依赖）。
- RN：不复用 `@coffer/vault`（React 组件面向 Web），只复用 `crypto` / `types` / `utils` / `vault-core`，UI 在 `apps/rn/src/features` 中重写。

**零知识加密契约**（改动前先读 `docs/功能设计说明-v1.md` 附录 A）：

- `KEK = Argon2id(主密码, enc_salt, m=64MiB, t=3, p=2)`，只在客户端内存存在，不落盘不上传。
- 登录用 SRP-6a（RFC 5054 2048 位群、SHA-256）：`x = Argon2id(主密码, auth_salt)`，服务端只存 `auth_salt + verifier`；SRP 挑战会话存在服务端内存里，5 分钟过期。
- 密文格式统一为 `v1.` + Base64(Nonce 12B ‖ Ciphertext ‖ Tag 16B)，AES-256-GCM；条目内容整体作为 JSON 加密，服务端无字段级明文。
- 搜索、筛选、收藏排序都在客户端解密后完成；服务端只保留 `item_type`、`fav_flag`、`mime`、时间戳等非敏感元信息。
- 修改主密码 = 全库重加密，`sys_user.key_version` 递增，旧密文不保留。
- 会话策略见 `packages/vault-core/src/session.ts`：token 放 `sessionStorage`（RN 只有内存）、profile/KEK 仅内存；锁定只清 KEK。

**API 分层**（`apps/api/src`）：`routes` 注册 → `controllers` 处理请求 → `services` 业务逻辑 → `sql/*.sql.ts` 参数化 SQL（底层 `@coffer/db` 的 `DatabaseClient`；Drizzle schema 在 `packages/db/src/schema`）。统一响应 `{ code, message, data }`（`utils/http.ts`），错误走 `middleware/error.ts`，鉴权走 JWT 中间件。新增接口时同步更新 `validators`（Zod）、`openapi/spec.ts`（Scalar 文档 `/api/docs`）和 `@coffer/types` 的 DTO。

**数据库**：`sys_user` / `vault_folder` / `vault_item` / `vault_attachment`，软删除 `del_flag=2` + `deleted_time`，定时任务清理 30 天前的条目与对象存储文件。表结构以 `docs/sql/coffer-v1.sql` 为准，不用物理外键。

## RN（Expo）模块要点

- `src/app/` 只放 expo-router 路由文件（重新导出 feature 屏幕），业务 UI 在 `src/features/`；`src/providers/VaultProvider.tsx` 承担与 Web `VaultProvider` 相同的职责。
- 入口 `index.ts` **必须先** `import './src/lib/polyfills'`，再 `expo-router/entry`。共享 crypto 依赖 `crypto.subtle`、`TextEncoder`、`btoa/atob`，RN 只有部分能力，`polyfills.ts` 用 `@noble` 注入；注意它手写了 UTF-8 编码（`@noble/hashes` 的 `utf8ToBytes` 会调用被注入的全局 `TextEncoder`，导致无限递归）。
- `metro.config.js` 有两个不能删的处理：
  1. 把 `__dirname` 盘符规范成大写，否则 Windows 下 Expo Router 的 `require.context` 生成 `d:\D:\...` 非法路径；
  2. 用 `resolver.resolveRequest` 把 `hash-wasm` 强制指向 `src/lib/hash-wasm-shim.ts`。`extraNodeModules` 只在常规解析失败后才生效，对已安装的包无效。
- `modules/coffer-argon2/` 是本地 Expo 原生模块（BouncyCastle Argon2id）。Hermes 跑纯 JS Argon2 要 1～2 分钟，原生实现只需秒级；修改后必须重新编译安装 APK。`expo prebuild --clean` 后 autolinking 会自动接回。
- `scripts/setup-android-toolchain.mjs`：构建前自动写 `android/local.properties`，并把 SDK 的 CMake 3.22 + 新版 Ninja（≥ 1.11）复制到 `.android-cmake/`。原因是 SDK 自带 Ninja 1.10.2 在部分 Windows 环境会触发 `build.ninja still dirty after 100 tries`；不要直接改 SDK 内的 ninja。该目录已 gitignore，属于机器本地产物。
- 模拟器访问本机 API 走 `adb reverse tcp:3000 tcp:3000`（LDPlayer 不映射 `10.0.2.2`），`API_BASE_URL` 默认 `http://127.0.0.1:3000/api`，可用 `EXPO_PUBLIC_API_BASE_URL` 覆盖；Metro 需要 `adb reverse tcp:8081 tcp:8081`。API 客户端带 20s 超时。
- RN 端不支持 WebAssembly；新增依赖时先确认是否有 WASM / DOM 依赖。

## 代码约定

- 全仓 ESM；包内相对导入带 `.js` 后缀（`moduleResolution: Bundler` + `verbatimModuleSyntax`），`packages/tsconfig/base.json` 开启 `strict`、`noUncheckedIndexedAccess`、`noUnusedLocals/Parameters`。
- 共享包用 tsup 构建到 `dist/`，apps 通过 workspace 依赖消费 `dist`。改 `packages/*` 源码后要 `pnpm --filter <pkg> build`（或依赖 turbo 的 `^build`）才会生效。
- ESLint 用 flat config：基础包 `@coffer/eslint-config/base`，React 端 `@coffer/eslint-config/react`。每个包 `eslint . --max-warnings 0`，另有 Prettier。
- 注释、UI 文案、提交信息都用中文；类型/接口名用英文。
- 不要新增客户端本地持久化敏感数据（KEK、明文、附件明文都不落盘）；RN 端也没有本地离线副本。
