import type {
  AttachmentDto,
  CreateItemInput,
  ItemDto,
  UpdateItemInput,
  ItemType,
} from '@coffer/types';

import { dbClient } from '../db/index.js';
import {
  insertItem,
  restoreItem,
  selectItem,
  selectItemsByUser,
  softDeleteItem,
  updateFavorite,
  updateItem,
  type ItemFilters,
  type ItemRow,
} from '../sql/item.sql.js';
import {
  restoreAttachmentsByItem,
  selectAttachmentsByItem,
  selectAttachmentsByUser,
  softDeleteAttachmentsByItem,
  type AttachmentRow,
} from '../sql/attachment.sql.js';
import { HttpError } from '../utils/http.js';
import { cipherTextOf } from '../utils/text.js';
import { findFolder } from './folder.service.js';
import { loadUserById } from './user.service.js';

function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    attachId: row.attachId,
    itemId: row.itemId,
    fileNameCipher: cipherTextOf(row.fileNameCipher),
    mimeType: row.mimeType,
    fileSize: Number(row.fileSize),
    fileSha256: row.fileSha256,
    keyVersion: row.keyVersion,
    createTime: row.createTime,
  };
}

function toDto(row: ItemRow, attachments: AttachmentRow[]): ItemDto {
  return {
    itemId: row.itemId,
    folderId: row.folderId,
    itemType: row.itemType as ItemType,
    nameCipher: cipherTextOf(row.nameCipher),
    dataCipher: row.dataCipher,
    favFlag: row.favFlag === '1' ? '1' : '0',
    keyVersion: row.keyVersion,
    deletedTime: row.deletedTime,
    createTime: row.createTime,
    updateTime: row.updateTime,
    attachments: attachments.map(toAttachmentDto),
  };
}

/** 当前用户的密钥版本：新写入必须使用最新版本。 */
async function currentKeyVersion(userId: number): Promise<number> {
  const user = await loadUserById(userId);
  if (!user || user.delFlag === '2') {
    throw new HttpError(401, '账号不存在或已被删除');
  }
  return user.keyVersion;
}

async function assertFolder(userId: number, folderId: number | null | undefined): Promise<void> {
  if (folderId === null || folderId === undefined) {
    return;
  }
  const folder = await findFolder(userId, folderId);
  if (!folder) {
    throw new HttpError(400, '文件夹不存在或已删除');
  }
}

export async function listItems(
  userId: number,
  filters: ItemFilters = {},
): Promise<ItemDto[]> {
  const itemStatement = selectItemsByUser(userId, filters);
  const attachmentStatement = selectAttachmentsByUser(
    userId,
    Boolean(filters.includeDeleted),
  );

  const [items, attachments] = await Promise.all([
    dbClient.query<ItemRow>(itemStatement.sql, itemStatement.params),
    dbClient.query<AttachmentRow>(attachmentStatement.sql, attachmentStatement.params),
  ]);

  const buckets = new Map<number, AttachmentRow[]>();
  for (const attachment of attachments) {
    const list = buckets.get(attachment.itemId) ?? [];
    list.push(attachment);
    buckets.set(attachment.itemId, list);
  }

  return items.map((item) => toDto(item, buckets.get(item.itemId) ?? []));
}

export async function getItem(userId: number, itemId: number): Promise<ItemDto> {
  const statement = selectItem(userId, itemId);
  const row = await dbClient.queryOne<ItemRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '凭证不存在或已删除');
  }
  return toDto(row, []);
}

export async function createItem(userId: number, input: CreateItemInput): Promise<ItemDto> {
  await assertFolder(userId, input.folderId);
  const keyVersion = await currentKeyVersion(userId);
  if (input.keyVersion !== keyVersion) {
    throw new HttpError(409, '客户端密钥版本已过期，请刷新后重试');
  }

  const operator = `user:${userId}`;
  const statement = insertItem({
    userId,
    folderId: input.folderId ?? null,
    itemType: input.itemType,
    nameCipher: input.nameCipher,
    dataCipher: input.dataCipher,
    favFlag: input.favFlag ?? '0',
    keyVersion,
    operator,
  });
  const result = await dbClient.execute(statement.sql, statement.params);
  const query = selectItem(userId, Number(result.insertId));
  const row = await dbClient.queryOne<ItemRow>(query.sql, query.params);
  if (!row) {
    throw new HttpError(500, '凭证创建失败');
  }
  return toDto(row, []);
}

export async function editItem(
  userId: number,
  itemId: number,
  input: UpdateItemInput,
): Promise<ItemDto> {
  const keyVersion = await currentKeyVersion(userId);
  if (input.keyVersion !== keyVersion) {
    throw new HttpError(409, '客户端密钥版本已过期，请刷新后重试');
  }
  await assertFolder(userId, input.folderId);

  const statement = updateItem({
    userId,
    itemId,
    folderId: input.folderId ?? null,
    nameCipher: input.nameCipher,
    dataCipher: input.dataCipher,
    keyVersion,
    operator: `user:${userId}`,
  });
  const result = await dbClient.execute(statement.sql, statement.params);
  if (result.affectedRows === 0) {
    throw new HttpError(404, '凭证不存在或已删除');
  }

  const query = selectItem(userId, itemId);
  const row = await dbClient.queryOne<ItemRow>(query.sql, query.params);
  if (!row) {
    throw new HttpError(404, '凭证不存在或已删除');
  }
  return toDto(row, []);
}

export async function setFavorite(
  userId: number,
  itemId: number,
  favFlag: '0' | '1',
): Promise<void> {
  const statement = updateFavorite(userId, itemId, favFlag);
  const result = await dbClient.execute(statement.sql, statement.params);
  if (result.affectedRows === 0) {
    throw new HttpError(404, '凭证不存在或已删除');
  }
}

/** 删除条目：移入回收站，附件对象保留至 30 天到期清理。 */
export async function removeItem(userId: number, itemId: number): Promise<void> {
  const existing = selectItem(userId, itemId);
  const row = await dbClient.queryOne<ItemRow>(existing.sql, existing.params);
  if (!row) {
    throw new HttpError(404, '凭证不存在或已删除');
  }

  await dbClient.transaction(async (conn) => {
    const removeItemStatement = softDeleteItem(userId, itemId);
    const [result] = await conn.query(removeItemStatement.sql, removeItemStatement.params);
    if ((result as { affectedRows: number }).affectedRows === 0) {
      throw new HttpError(404, '凭证不存在或已删除');
    }
    const removeAttachments = softDeleteAttachmentsByItem(userId, itemId);
    await conn.query(removeAttachments.sql, removeAttachments.params);
  });
}

export async function restoreFromTrash(userId: number, itemId: number): Promise<ItemDto> {
  await dbClient.transaction(async (conn) => {
    const statement = restoreItem(userId, itemId);
    const [result] = await conn.query(statement.sql, statement.params);
    if ((result as { affectedRows: number }).affectedRows === 0) {
      throw new HttpError(404, '回收站中没有该凭证');
    }
    // 附件随条目一起软删除，恢复时必须一并恢复，否则附件会永久失联
    const restoreAttachments = restoreAttachmentsByItem(userId, itemId);
    await conn.query(restoreAttachments.sql, restoreAttachments.params);
  });

  const query = selectItem(userId, itemId);
  const row = await dbClient.queryOne<ItemRow>(query.sql, query.params);
  if (!row) {
    throw new HttpError(404, '凭证不存在');
  }
  const attachmentsStatement = selectAttachmentsByItem(userId, itemId);
  const attachments = await dbClient.query<AttachmentRow>(
    attachmentsStatement.sql,
    attachmentsStatement.params,
  );
  return toDto(row, attachments);
}
