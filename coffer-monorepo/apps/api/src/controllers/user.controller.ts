import * as userService from '../services/user.service.js';
import type { AppContext } from '../types/context.js';
import { binary, failure, success } from '../utils/http.js';
import { parseJson } from '../utils/validate.js';
import { updateProfileSchema } from '../validators/user.js';

/** PATCH /api/users/me */
export async function updateMe(c: AppContext): Promise<Response> {
  const input = await parseJson(c, updateProfileSchema);
  const data = await userService.updateUserProfile(c.get('currentUser').userId, input);
  return success(c, data, '个人资料已保存');
}

/** PUT /api/users/me/avatar（原始密文二进制） */
export async function uploadAvatar(c: AppContext): Promise<Response> {
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  const data = await userService.uploadAvatar(c.get('currentUser').userId, bytes);
  return success(c, data, '头像已更新');
}

/** GET /api/users/me/avatar */
export async function getAvatar(c: AppContext): Promise<Response> {
  const result = await userService.getAvatarBytes(c.get('currentUser').userId);
  if (!result) {
    return failure(c, 404, '尚未上传头像');
  }
  return binary(c, result.bytes);
}

/** DELETE /api/users/me/avatar */
export async function deleteAvatar(c: AppContext): Promise<Response> {
  const data = await userService.removeAvatar(c.get('currentUser').userId);
  return success(c, data, '已恢复文字头像');
}
