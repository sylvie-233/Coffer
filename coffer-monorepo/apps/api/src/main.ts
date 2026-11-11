import { serve } from '@hono/node-server';

import app from './app.js';
import { env } from './config/env.js';
import { dbClient } from './db/index.js';
import { startCleanupJob, stopCleanupJob } from './services/cleanup.service.js';
import { ensureBucket } from './services/storage.service.js';

async function bootstrap(): Promise<void> {
  // 启动前确认数据库可用，避免“服务可访问但所有接口报错”的假健康状态
  await dbClient.ping();
  await ensureBucket();
  startCleanupJob();

  const server = serve(
    {
      fetch: app.fetch,
      port: env.PORT,
      hostname: env.HOST,
    },
    (info) => {
      console.log(`[api] 服务已启动：http://${info.address}:${info.port}`);
      console.log('[api] 接口前缀：/api，健康检查：/health');
      console.log('[api] API 文档：/api/docs，OpenAPI JSON：/api/openapi.json');
    },
  );

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) {
      return;
    }
    closing = true;
    console.log(`[api] 收到 ${signal}，正在关闭服务...`);
    stopCleanupJob();

    server.close(() => {
      void dbClient
        .close()
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          console.error('[api] 关闭数据库连接失败', error);
          process.exit(1);
        });
    });

    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('[api] 启动失败：', error);
  process.exit(1);
});
