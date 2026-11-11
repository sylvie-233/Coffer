import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

import { HttpError, failure } from '../utils/http.js';
import { formatZodError } from '../utils/validate.js';

interface ErrorWithCode {
  code?: string;
}

/** 全局错误处理：统一响应结构，不向客户端泄露 SQL / 堆栈。 */
export function errorHandler(error: Error, c: Context): Response {
  let status: ContentfulStatusCode = 500;
  let message = '服务器内部错误';

  if (error instanceof HttpError) {
    status = error.status as ContentfulStatusCode;
    message = error.message;
  } else if (error instanceof ZodError) {
    status = 400;
    message = formatZodError(error);
  } else if (error instanceof HTTPException) {
    status = error.status;
    message = error.message || '请求处理失败';
  } else {
    const code = (error as ErrorWithCode).code;
    if (code === 'ER_DUP_ENTRY') {
      status = 409;
      message = '数据已存在，请检查邮箱是否重复';
    } else if (code === 'ER_NO_SUCH_TABLE') {
      status = 500;
      message = '数据库表不存在，请先执行 docs/sql/coffer-v1.sql 初始化';
    } else if (code === 'ECONNREFUSED' || code === 'PROTOCOL_CONNECTION_LOST') {
      status = 503;
      message = '数据库连接不可用，请检查 MySQL 是否已启动';
    }
  }

  if (status >= 500) {
    console.error('[api:error]', error);
  }

  return failure(c, status, message);
}
