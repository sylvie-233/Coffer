import { createHash, randomUUID } from 'node:crypto';

import type { AttachmentDto } from '@coffer/types';
import { MAX_CIPHER_FILE_BYTES } from '@coffer/types';

import { dbClient } from '../db/index.js';
import {
  deleteAttachmentRow,
  insertAttachment,
  selectAttachment,
  updateAttachmentContent,
  type AttachmentRow,
} from '../sql/attachment.sql.js';
import { selectItem } from '../sql/item.sql.js';
import { HttpError } from '../utils/http.js';
import { cipherTextOf } from '../utils/text.js';
import { deleteObject, getObject, putObject } from './storage.service.js';
import { loadUserById } from './user.service.js';

function toDto(row: AttachmentRow): AttachmentDto {
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

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

async function currentKeyVersion(userId: number): Promise<number> {
  const user = await loadUserById(userId);
  if (!user || user.delFlag === '2') {
    throw new HttpError(401, '账号不存在或已被删除');
  }
  return user.keyVersion;
}

async function assertItem(userId: number, itemId: number): Promise<void> {
  const statement = selectItem(userId, itemId);
  const row = await dbClient.queryOne(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '凭证不存在或已删除');
  }
}

/** 上传加密图片：客户端已完成 AES-GCM 加密，服务端只存密文文件。 */
export async function uploadAttachment(
  userId: number,
  itemId: number,
  input: { fileNameCipher: string; mimeType: string; keyVersion: number },
  bytes: Uint8Array,
): Promise<AttachmentDto> {
  await assertItem(userId, itemId);
  const keyVersion = await currentKeyVersion(userId);
  if (input.keyVersion !== keyVersion) {
    throw new HttpError(409, '客户端密钥版本已过期，请刷新后重试');
  }
  if (bytes.length === 0) {
    throw new HttpError(400, '附件文件为空');
  }
  if (bytes.length > MAX_CIPHER_FILE_BYTES) {
    throw new HttpError(413, '附件密文超过 3MB 限制');
  }

  const objectKey = `users/${userId}/attachments/${randomUUID()}.bin`;
  await putObject(objectKey, bytes);

  const statement = insertAttachment({
    itemId,
    userId,
    fileNameCipher: input.fileNameCipher,
    mimeType: input.mimeType,
    fileSize: bytes.length,
    objectKey,
    fileSha256: sha256Hex(bytes),
    keyVersion,
    operator: `user:${userId}`,
  });
  const result = await dbClient.execute(statement.sql, statement.params);
  const query = selectAttachment(userId, Number(result.insertId));
  const row = await dbClient.queryOne<AttachmentRow>(query.sql, query.params);
  if (!row) {
    throw new HttpError(500, '附件保存失败');
  }
  return toDto(row);
}

/** 读取附件密文（客户端下载后自行解密，服务器不感知图片内容）。 */
export async function getAttachmentContent(
  userId: number,
  attachId: number,
): Promise<{ bytes: Uint8Array; row: AttachmentRow }> {
  const statement = selectAttachment(userId, attachId);
  const row = await dbClient.queryOne<AttachmentRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '附件不存在或已删除');
  }
  const bytes = await getObject(row.objectKey);
  return { bytes, row };
}

/**
 * 替换附件密文内容（修改主密码时重加密用）。
 * 覆盖同一 object key，旧密文不在云端保留。
 */
export async function replaceAttachmentContent(
  userId: number,
  attachId: number,
  bytes: Uint8Array,
  keyVersion: number,
): Promise<void> {
  const statement = selectAttachment(userId, attachId);
  const row = await dbClient.queryOne<AttachmentRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '附件不存在或已删除');
  }
  const current = await currentKeyVersion(userId);
  if (keyVersion !== current && keyVersion !== current + 1) {
    throw new HttpError(409, '附件密钥版本不合法');
  }
  if (bytes.length === 0) {
    throw new HttpError(400, '附件文件为空');
  }
  if (bytes.length > MAX_CIPHER_FILE_BYTES) {
    throw new HttpError(413, '附件密文超过 3MB 限制');
  }

  await putObject(row.objectKey, bytes);
  const update = updateAttachmentContent({
    userId,
    attachId,
    fileSize: bytes.length,
    fileSha256: sha256Hex(bytes),
    keyVersion,
  });
  const result = await dbClient.execute(update.sql, update.params);
  if (result.affectedRows === 0) {
    throw new HttpError(404, '附件不存在或已删除');
  }
}

/**
 * 用户显式移除附件：对象与数据库记录一并删除，不进入回收站。
 * 条目进入回收站时附件才随条目保留 30 天，显式删除不应留下无法读取的孤儿行。
 */
export async function removeAttachment(userId: number, attachId: number): Promise<void> {
  const statement = selectAttachment(userId, attachId);
  const row = await dbClient.queryOne<AttachmentRow>(statement.sql, statement.params);
  if (!row) {
    throw new HttpError(404, '附件不存在或已删除');
  }
  const remove = deleteAttachmentRow(userId, attachId);
  const result = await dbClient.execute(remove.sql, remove.params);
  if (result.affectedRows === 0) {
    throw new HttpError(404, '附件不存在或已删除');
  }
  await deleteObject(row.objectKey);
}
