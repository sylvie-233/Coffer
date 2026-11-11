import type { Context } from 'hono';
import { z } from 'zod';

import { HttpError } from './http.js';

/** 把 Zod 错误压成一条中文提示。 */
export function formatZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) {
    return '请求参数不合法';
  }
  const path = first.path.join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

export async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch {
    throw new HttpError(400, '请求体必须是合法的 JSON');
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new HttpError(400, formatZodError(result.error));
  }
  return result.data;
}

export function parseQuery<T>(c: Context, schema: z.ZodType<T>): T {
  const result = schema.safeParse(c.req.query());
  if (!result.success) {
    throw new HttpError(400, formatZodError(result.error));
  }
  return result.data;
}

/** 解析路径中的正整数 ID。 */
export function parseId(value: string | undefined, label = 'ID'): number {
  if (!value) {
    throw new HttpError(400, `${label} 无效`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, `${label} 无效`);
  }
  return id;
}
