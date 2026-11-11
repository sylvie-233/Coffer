import * as folderService from '../services/folder.service.js';
import type { AppContext } from '../types/context.js';
import { success } from '../utils/http.js';
import { parseId, parseJson } from '../utils/validate.js';
import { createFolderSchema, updateFolderSchema } from '../validators/folder.js';

/** GET /api/folders */
export async function list(c: AppContext): Promise<Response> {
  const data = await folderService.listFolders(c.get('currentUser').userId);
  return success(c, data);
}

/** POST /api/folders */
export async function create(c: AppContext): Promise<Response> {
  const input = await parseJson(c, createFolderSchema);
  const data = await folderService.createFolder(c.get('currentUser').userId, input);
  return success(c, data, '文件夹已创建');
}

/** PUT /api/folders/:id */
export async function update(c: AppContext): Promise<Response> {
  const folderId = parseId(c.req.param('id'), '文件夹 ID');
  const input = await parseJson(c, updateFolderSchema);
  const data = await folderService.editFolder(c.get('currentUser').userId, folderId, input);
  return success(c, data, '文件夹已更新');
}

/** DELETE /api/folders/:id */
export async function remove(c: AppContext): Promise<Response> {
  const folderId = parseId(c.req.param('id'), '文件夹 ID');
  await folderService.removeFolder(c.get('currentUser').userId, folderId);
  return success(c, null, '文件夹已删除，其中凭证已移入未分类');
}
