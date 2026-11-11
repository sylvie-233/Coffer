import * as authService from '../services/auth.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { parseJson } from '../utils/validate.js';
import {
  challengeSchema,
  registerSchema,
  rekeySchema,
  verifySchema,
} from '../validators/auth.js';

/** POST /api/auth/register */
export async function register(c: AppContext): Promise<Response> {
  const input = await parseJson(c, registerSchema);
  const data = await authService.register(input);
  return success(c, data, '保险库创建成功');
}

/** POST /api/auth/challenge */
export async function challenge(c: AppContext): Promise<Response> {
  const input = await parseJson(c, challengeSchema);
  const data = await authService.challenge(input);
  return success(c, data, '已生成登录挑战');
}

/** POST /api/auth/verify */
export async function verify(c: AppContext): Promise<Response> {
  const input = await parseJson(c, verifySchema);
  const data = await authService.verify(input);
  return success(c, data, '登录成功');
}

/** GET /api/auth/me */
export async function me(c: AppContext): Promise<Response> {
  const data = await authService.me(c.get('currentUser').userId);
  return success(c, data);
}

/** POST /api/auth/rekey */
export async function rekey(c: AppContext): Promise<Response> {
  const input = await parseJson(c, rekeySchema);
  const data = await authService.rekey(c.get('currentUser').userId, input);
  return success(c, data, '主密码已更新，全部数据已重新加密');
}
