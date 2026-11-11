import type { SqlStatement } from './shared.js';

export interface ItemRow {
  itemId: number;
  folderId: number | null;
  itemType: string;
  nameCipher: unknown;
  dataCipher: string;
  favFlag: string;
  keyVersion: number;
  deletedTime: string | null;
  createTime: string;
  updateTime: string | null;
}

const ITEM_COLUMNS = `
  item_id AS itemId, folder_id AS folderId, item_type AS itemType,
  name_cipher AS nameCipher, data_cipher AS dataCipher, fav_flag AS favFlag,
  key_version AS keyVersion, deleted_time AS deletedTime,
  create_time AS createTime, update_time AS updateTime
`;

export interface ItemFilters {
  type?: string;
  fav?: string;
  folderId?: number | 'none';
  includeDeleted?: boolean;
}

export function selectItemsByUser(userId: number, filters: ItemFilters = {}): SqlStatement {
  const conditions = ['user_id = ?'];
  const params: unknown[] = [userId];

  if (!filters.includeDeleted) {
    conditions.push(`del_flag = '0'`);
  }
  if (filters.type) {
    conditions.push('item_type = ?');
    params.push(filters.type);
  }
  if (filters.fav) {
    conditions.push('fav_flag = ?');
    params.push(filters.fav);
  }
  if (filters.folderId === 'none') {
    conditions.push('folder_id IS NULL');
  } else if (typeof filters.folderId === 'number') {
    conditions.push('folder_id = ?');
    params.push(filters.folderId);
  }

  return {
    sql: `SELECT ${ITEM_COLUMNS}
            FROM vault_item
           WHERE ${conditions.join(' AND ')}
           ORDER BY update_time DESC, item_id DESC`,
    params,
  };
}

export function selectItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `SELECT ${ITEM_COLUMNS}
            FROM vault_item
           WHERE item_id = ? AND user_id = ? AND del_flag = '0'
           LIMIT 1`,
    params: [itemId, userId],
  };
}

export function countAllItems(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM vault_item WHERE user_id = ?`,
    params: [userId],
  };
}

export function insertItem(input: {
  userId: number;
  folderId: number | null;
  itemType: string;
  nameCipher: string;
  dataCipher: string;
  favFlag: string;
  keyVersion: number;
  operator: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO vault_item
            (user_id, folder_id, item_type, name_cipher, data_cipher,
             fav_flag, key_version, create_by, update_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      input.userId,
      input.folderId,
      input.itemType,
      input.nameCipher,
      input.dataCipher,
      input.favFlag,
      input.keyVersion,
      input.operator,
      input.operator,
    ],
  };
}

export function updateItem(input: {
  userId: number;
  itemId: number;
  folderId: number | null;
  nameCipher: string;
  dataCipher: string;
  keyVersion: number;
  operator: string;
}): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET folder_id = ?, name_cipher = ?, data_cipher = ?, key_version = ?,
                 update_by = ?, update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [
      input.folderId,
      input.nameCipher,
      input.dataCipher,
      input.keyVersion,
      input.operator,
      input.itemId,
      input.userId,
    ],
  };
}

export function updateFavorite(userId: number, itemId: number, favFlag: string): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET fav_flag = ?, update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [favFlag, itemId, userId],
  };
}

/** 软删除条目：移入回收站，附件同步标记。 */
export function softDeleteItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET del_flag = '2', deleted_time = NOW(), update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [itemId, userId],
  };
}

export function restoreItem(userId: number, itemId: number): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET del_flag = '0', deleted_time = NULL, update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ? AND del_flag = '2'`,
    params: [itemId, userId],
  };
}

export function rekeyItem(input: {
  userId: number;
  itemId: number;
  nameCipher: string;
  dataCipher: string;
  keyVersion: number;
}): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET name_cipher = ?, data_cipher = ?, key_version = ?,
                 update_time = CURRENT_TIMESTAMP
           WHERE item_id = ? AND user_id = ?`,
    params: [
      input.nameCipher,
      input.dataCipher,
      input.keyVersion,
      input.itemId,
      input.userId,
    ],
  };
}

/** 找出超过保留期、应物理清除的回收站条目。 */
export function selectExpiredTrash(retentionDays: number, limit = 200): SqlStatement {
  return {
    sql: `SELECT item_id AS itemId
            FROM vault_item
           WHERE del_flag = '2'
             AND deleted_time IS NOT NULL
             AND deleted_time < DATE_SUB(NOW(), INTERVAL ? DAY)
           ORDER BY deleted_time ASC
           LIMIT ?`,
    params: [retentionDays, limit],
  };
}

export function deleteItemsPhysically(itemIds: readonly number[]): SqlStatement {
  return {
    sql: `DELETE FROM vault_item WHERE item_id IN (${itemIds.map(() => '?').join(', ')})`,
    params: [...itemIds],
  };
}
