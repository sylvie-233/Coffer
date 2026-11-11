import * as itemService from '../services/item.service.js';
import type { AppContext } from '../types/context.js';
import { HttpError, success } from '../utils/http.js';
import { parseId, parseJson, parseQuery } from '../utils/validate.js';
import {
  createItemSchema,
  favSchema,
  itemQuerySchema,
  updateItemSchema,
} from '../validators/item.js';

/** GET /api/items */
export async function list(c: AppContext): Promise<Response> {
  const query = parseQuery(c, itemQuerySchema);

  let folderId: number | 'none' | undefined;
  if (query.folderId === 'none') {
    folderId = 'none';
  } else if (query.folderId !== undefined && query.folderId !== '') {
    const parsed = Number(query.folderId);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new HttpError(400, 'folderId 无效');
    }
    folderId = parsed;
  }

  const data = await itemService.listItems(c.get('currentUser').userId, {
    type: query.type,
    fav: query.fav,
    folderId,
    includeDeleted: query.includeDeleted === '1',
  });
  return success(c, data);
}

/** POST /api/items */
export async function create(c: AppContext): Promise<Response> {
  const input = await parseJson(c, createItemSchema);
  const data = await itemService.createItem(c.get('currentUser').userId, input);
  return success(c, data, '凭证已保存');
}

/** GET /api/items/:id */
export async function detail(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  const data = await itemService.getItem(c.get('currentUser').userId, itemId);
  return success(c, data);
}

/** PUT /api/items/:id */
export async function update(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  const input = await parseJson(c, updateItemSchema);
  const data = await itemService.editItem(c.get('currentUser').userId, itemId, input);
  return success(c, data, '凭证已更新');
}

/** PATCH /api/items/:id/fav */
export async function favorite(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  const input = await parseJson(c, favSchema);
  await itemService.setFavorite(c.get('currentUser').userId, itemId, input.favFlag);
  return success(c, null, input.favFlag === '1' ? '已加入收藏' : '已取消收藏');
}

/** DELETE /api/items/:id */
export async function remove(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  await itemService.removeItem(c.get('currentUser').userId, itemId);
  return success(c, null, '凭证已移入回收站，保留 30 天');
}

/** POST /api/items/:id/restore */
export async function restore(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  const data = await itemService.restoreFromTrash(c.get('currentUser').userId, itemId);
  return success(c, data, '凭证已恢复');
}
