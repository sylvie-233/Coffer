import { createMiddleware } from 'hono/factory';

import { dbClient } from '../db/index.js';
import type { AppEnv } from '../types/context.js';
import { HttpError } from '../utils/http.js';
import { verifyToken } from '../utils/jwt.js';

interface AuthUserRow {
  userId: number;
  email: string;
  nickname: string;
  status: string;
  delFlag: string;
}

/**
 * JWT 鉴权中间件：每次请求回查用户状态，
 * 账号被停用或删除后 token 立即失效。
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization');
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
  if (!match?.[1]) {
    throw new HttpError(401, '未登录或登录已过期');
  }

  const payload = await verifyToken(match[1].trim());
  if (!payload) {
    throw new HttpError(401, '登录状态已失效，请重新登录');
  }

  const user = await dbClient.queryOne<AuthUserRow>(
    `SELECT user_id AS userId, email, nickname, status, del_flag AS delFlag
       FROM sys_user
      WHERE user_id = ?
      LIMIT 1`,
    [payload.userId],
  );

  if (!user || user.delFlag === '2') {
    throw new HttpError(401, '账号不存在或已被删除');
  }
  if (user.status === '1') {
    throw new HttpError(403, '账号已停用，请联系管理员');
  }

  c.set('currentUser', {
    userId: user.userId,
    email: user.email,
    nickname: user.nickname,
  });

  await next();
});
