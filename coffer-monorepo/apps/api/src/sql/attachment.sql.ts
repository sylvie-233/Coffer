import type { SqlStatement } from './shared.js';

export interface AttachmentRow {
  attachId: number;
  itemId: number;
  fileNameCipher: unknown;
  mimeType: string;
  fileSize: number;
  objectKey: string;
  fileSha256: string;
  keyVersion: number;
  createTime: string;
}

const ATTACHMENT_COLUMNS = `
  attach_id AS attachId, item_id AS itemId, file_name_cipher AS fileNameCipher,
  mime_type AS mimeType, file_size AS fileSize, object_key AS objectKey,
  file_sha256 AS fileSha256, key_version AS keyVersion, create_time AS createTime
`;

export function selectAttachmentsByUser(
  userId: number,
  includeDeleted = false,
): SqlStatement {
  return {
    sql: `SELECT ${ATTACHMENT_COLUMNS}
            FROM vault_attachment
           WHERE user_id = ?${includeDeleted ? '' : ` AND del_flag = '0'`}
           ORDER BY attach_id ASC`,
    params: [userId],
  };
}

export function selectAttachment(userId: number, attachId: number): SqlStatement {
  return {
    sql: `SELECT ${ATTACHMENT_COLUMNS}
            FROM vault_attachment
           WHERE attach_id = ? AND user_id = ? AND del_flag = '0'
           LIMIT 1`,
    params: [attachId, userId],
  };
}

/** 某条目名下、当前有效的附件列表。 */
export function selectAttachmentsByItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `SELECT ${ATTACHMENT_COLUMNS}
            FROM vault_attachment
           WHERE user_id = ? AND item_id = ? AND del_flag = '0'
           ORDER BY attach_id ASC`,
    params: [userId, itemId],
  };
}

export function countAllAttachments(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM vault_attachment WHERE user_id = ?`,
    params: [userId],
  };
}

export function insertAttachment(input: {
  itemId: number;
  userId: number;
  fileNameCipher: string;
  mimeType: string;
  fileSize: number;
  objectKey: string;
  fileSha256: string;
  keyVersion: number;
  operator: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO vault_attachment
            (item_id, user_id, file_name_cipher, mime_type, file_size,
             object_key, file_sha256, key_version, create_by, update_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.itemId,
      input.userId,
      input.fileNameCipher,
      input.mimeType,
      input.fileSize,
      input.objectKey,
      input.fileSha256,
      input.keyVersion,
      input.operator,
      input.operator,
    ],
  };
}

export function updateAttachmentContent(input: {
  userId: number;
  attachId: number;
  fileSize: number;
  fileSha256: string;
  keyVersion: number;
}): SqlStatement {
  return {
    sql: `UPDATE vault_attachment
             SET file_size = ?, file_sha256 = ?, key_version = ?,
                 update_time = CURRENT_TIMESTAMP
           WHERE attach_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [
      input.fileSize,
      input.fileSha256,
      input.keyVersion,
      input.attachId,
      input.userId,
    ],
  };
}

export function rekeyAttachment(input: {
  userId: number;
  attachId: number;
  fileNameCipher: string;
  keyVersion: number;
}): SqlStatement {
  return {
    sql: `UPDATE vault_attachment
             SET file_name_cipher = ?, key_version = ?, update_time = CURRENT_TIMESTAMP
           WHERE attach_id = ? AND user_id = ?`,
    params: [input.fileNameCipher, input.keyVersion, input.attachId, input.userId],
  };
}

export function softDeleteAttachment(userId: number, attachId: number): SqlStatement {
  return {
    sql: `UPDATE vault_attachment
             SET del_flag = '2', deleted_time = NOW(), update_time = CURRENT_TIMESTAMP
           WHERE attach_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [attachId, userId],
  };
}

/** 条目软删除时，其附件一并进入回收站（对象文件保留至到期清理）。 */
export function softDeleteAttachmentsByItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `UPDATE vault_attachment
             SET del_flag = '2', deleted_time = NOW(), update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [itemId, userId],
  };
}

/** 条目从回收站恢复时，同步恢复曾随条目一起软删除的附件。 */
export function restoreAttachmentsByItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `UPDATE vault_attachment
             SET del_flag = '0', deleted_time = NULL, update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '2'`,
    params: [itemId, userId],
  };
}

export function selectAttachmentsByItems(itemIds: readonly number[]): SqlStatement {
  return {
    sql: `SELECT attach_id AS attachId, item_id AS itemId, object_key AS objectKey
            FROM vault_attachment
           WHERE item_id IN (${itemIds.map(() => '?').join(', ')})`,
    params: [...itemIds],
  };
}

export function deleteAttachmentsByItems(itemIds: readonly number[]): SqlStatement {
  return {
    sql: `DELETE FROM vault_attachment WHERE item_id IN (${itemIds.map(() => '?').join(', ')})`,
    params: [...itemIds],
  };
}

export function deleteAttachmentRow(userId: number, attachId: number): SqlStatement {
  return {
    sql: `DELETE FROM vault_attachment WHERE attach_id = ? AND user_id = ?`,
    params: [attachId, userId],
  };
}
