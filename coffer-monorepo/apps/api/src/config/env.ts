import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

/**
 * 环境变量加载与校验：以进程工作目录为基准加载 .env / .env.local。
 * 校验失败立即退出，避免带病启动。
 */
const workingDir = process.cwd();
const baseEnvFile = resolve(workingDir, '.env');
const localEnvFile = resolve(workingDir, '.env.local');

if (existsSync(baseEnvFile)) {
  loadEnv({ path: baseEnvFile, quiet: true });
}
if (existsSync(localEnvFile)) {
  loadEnv({ path: localEnvFile, override: true, quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('coffer'),
  DB_PASSWORD: z.string().default('123456'),
  DB_NAME: z.string().default('coffer'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET 长度至少 16 位'),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(7200),

  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:8080'),

  S3_ENDPOINT: z.string().default('http://127.0.0.1:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default('rustfsadmin'),
  S3_SECRET_KEY: z.string().default('rustfsadmin'),
  S3_BUCKET: z.string().default('coffer'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((value) => value !== 'false'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('；');
  console.error(`环境变量校验失败：${detail}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
