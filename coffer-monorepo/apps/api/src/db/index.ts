import { DatabaseClient } from '@coffer/db';

import { env } from '../config/env.js';

/** 应用级数据库实例：连接参数来自环境变量。 */
export const dbClient = new DatabaseClient({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
});

export { dbClient as db };
export * from '@coffer/db';
