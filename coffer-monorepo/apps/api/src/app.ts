import { Scalar } from '@scalar/hono-api-reference';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { corsOrigins } from './config/env.js';
import { dbClient } from './db/index.js';
import { errorHandler } from './middleware/error.js';
import { openapiSpec } from './openapi/spec.js';
import apiRoutes from './routes/index.js';
import { storageHealthy } from './services/storage.service.js';
import type { AppEnv } from './types/context.js';
import { failure, success } from './utils/http.js';

export const app = new Hono<AppEnv>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: corsOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Disposition'],
    maxAge: 86400,
  }),
);
app.use(
  '*',
  bodyLimit({
    maxSize: 20 * 1024 * 1024,
    onError: (c) => failure(c, 413, '请求体过大'),
  }),
);

/** 健康检查：探测数据库与对象存储，供容器编排使用。 */
app.get('/health', async (c) => {
  try {
    await dbClient.ping();
    const storage = await storageHealthy();
    return success(c, {
      status: storage ? 'ok' : 'degraded',
      db: 'up',
      storage: storage ? 'up' : 'down',
    });
  } catch (error) {
    console.error('[api:health] 数据库连接异常', error);
    return failure(c, 503, '数据库连接不可用');
  }
});

/** OpenAPI JSON 与 Scalar API 文档。 */
app.get('/api/openapi.json', (c) => c.json(openapiSpec));
app.get(
  '/api/docs',
  Scalar({
    url: '/api/openapi.json',
    pageTitle: 'Coffer API 文档',
    persistAuth: true,
    authentication: { preferredSecurityScheme: 'BearerAuth' },
  }),
);

app.route('/api', apiRoutes);

app.notFound((c) => failure(c, 404, '接口不存在'));

app.onError(errorHandler);

export default app;
