import type { SqlStatement } from './shared.js';

export interface FolderRow {
  folderId: number;
  folderNameCipher: unknown;
  folderColor: string;
  sortNo: number;
  createTime: string;
  updateTime: string | null;
}

export function selectFoldersByUser(userId: number): SqlStatement {
  return {
    sql: `SELECT folder_id AS folderId, folder_name_cipher AS folderNameCipher,
                 folder_color AS folderColor, sort_no AS sortNo,
                 create_time AS createTime, update_time AS updateTime
            FROM vault_folder
           WHERE user_id = ? AND del_flag = '0'
           ORDER BY sort_no ASC, folder_id ASC`,
    params: [userId],
  };
}

export function selectFolder(userId: number, folderId: number): SqlStatement {
  return {
    sql: `SELECT folder_id AS folderId, folder_name_cipher AS folderNameCipher,
                 folder_color AS folderColor, sort_no AS sortNo,
                 create_time AS createTime, update_time AS updateTime
            FROM vault_folder
           WHERE folder_id = ? AND user_id = ? AND del_flag = '0'
           LIMIT 1`,
    params: [folderId, userId],
  };
}

export function selectMaxSortNo(userId: number): SqlStatement {
  return {
    sql: `SELECT COALESCE(MAX(sort_no), 0) AS maxSortNo
            FROM vault_folder
           WHERE user_id = ? AND del_flag = '0'`,
    params: [userId],
  };
}

export function countActiveFolders(userId: number): SqlStatement {
  return {
    sql: `SELECT COUNT(*) AS total FROM vault_folder WHERE user_id = ? AND del_flag = '0'`,
    params: [userId],
  };
}

export function insertFolder(input: {
  userId: number;
  folderNameCipher: string;
  folderColor: string;
  sortNo: number;
  operator: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO vault_folder
            (user_id, folder_name_cipher, folder_color, sort_no, create_by, update_by)
          VALUES (?, ?, ?, ?, ?, ?)`,
    params: [
      input.userId,
      input.folderNameCipher,
      input.folderColor,
      input.sortNo,
      input.operator,
      input.operator,
    ],
  };
}

export function updateFolder(input: {
  userId: number;
  folderId: number;
  folderNameCipher?: string;
  folderColor?: string;
  sortNo?: number;
  operator: string;
}): SqlStatement {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.folderNameCipher !== undefined) {
    sets.push('folder_name_cipher = ?');
    params.push(input.folderNameCipher);
  }
  if (input.folderColor !== undefined) {
    sets.push('folder_color = ?');
    params.push(input.folderColor);
  }
  if (input.sortNo !== undefined) {
    sets.push('sort_no = ?');
    params.push(input.sortNo);
  }
  sets.push('update_by = ?', 'update_time = CURRENT_TIMESTAMP');
  params.push(input.operator, input.folderId, input.userId);
  return {
    sql: `UPDATE vault_folder
             SET ${sets.join(', ')}
           WHERE folder_id = ? AND user_id = ? AND del_flag = '0'`,
    params,
  };
}

/** 删除文件夹时把其下条目移到「未分类」。 */
export function detachItemsFromFolder(userId: number, folderId: number): SqlStatement {
  return {
    sql: `UPDATE vault_item
             SET folder_id = NULL, update_time = CURRENT_TIMESTAMP
           WHERE user_id = ? AND folder_id = ? AND del_flag = '0'`,
    params: [userId, folderId],
  };
}

export function deleteFolder(userId: number, folderId: number): SqlStatement {
  return {
    sql: `UPDATE vault_folder
             SET del_flag = '2', update_time = CURRENT_TIMESTAMP
           WHERE folder_id = ? AND user_id = ? AND del_flag = '0'`,
    params: [folderId, userId],
  };
}

export function rekeyFolder(input: {
  userId: number;
  folderId: number;
  folderNameCipher: string;
}): SqlStatement {
  return {
    sql: `UPDATE vault_folder
             SET folder_name_cipher = ?, update_time = CURRENT_TIMESTAMP
           WHERE folder_id = ? AND user_id = ?`,
    params: [input.folderNameCipher, input.folderId, input.userId],
  };
}
