import { sign, verify } from 'hono/jwt';

import type { TokenPayload } from '@coffer/types';

import { env } from '../config/env.js';

/** 签发 JWT。 */
export async function signToken(
  userId: number,
  email: string,
): Promise<{ token: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = env.JWT_EXPIRES_IN;
  const payload = { userId, email, iat: now, exp: now + expiresIn };
  const token = await sign(payload, env.JWT_SECRET, 'HS256');
  return { token, expiresIn };
}

/** 校验 JWT；失败返回 null。 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const payload = await verify(token, env.JWT_SECRET, 'HS256');
    const userId = Number(payload['userId']);
    const email = payload['email'];
    if (!Number.isSafeInteger(userId) || userId <= 0 || typeof email !== 'string') {
      return null;
    }
    return {
      userId,
      email,
      iat: typeof payload['iat'] === 'number' ? payload['iat'] : undefined,
      exp: typeof payload['exp'] === 'number' ? payload['exp'] : undefined,
    };
  } catch {
    return null;
  }
}
