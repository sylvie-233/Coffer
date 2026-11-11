import type { CreateFolderInput, FolderDto, UpdateFolderInput } from '@coffer/types';

import { dbClient } from '../db/index.js';
import {
  deleteFolder,
  detachItemsFromFolder,
  insertFolder,
  selectFolder,
  selectFoldersByUser,
  selectMaxSortNo,
  updateFolder,
  type FolderRow,
} from '../sql/folder.sql.js';
import { HttpError } from '../utils/http.js';
import { cipherTextOf } from '../utils/text.js';

function toDto(row: FolderRow): FolderDto {
  return {
    folderId: row.folderId,
    folderNameCipher: cipherTextOf(row.folderNameCipher),
    folderColor: row.folderColor,
    sortNo: row.sortNo,
    createTime: row.createTime,
    updateTime: row.updateTime,
  };
}

export async function listFolders(userId: number): Promise<FolderDto[]> {
  const statement = selectFoldersByUser(userId);
  const rows = await dbClient.query<FolderRow>(statement.sql, statement.params);
  return rows.map(toDto);
}

export async function findFolder(userId: number, folderId: number): Promise<FolderRow | null> {
  const statement = selectFolder(userId, folderId);
  return dbClient.queryOne<FolderRow>(statement.sql, statement.params);
}

export async function createFolder(
  userId: number,
  input: CreateFolderInput,
): Promise<FolderDto> {
  let sortNo = input.sortNo;
  if (sortNo === undefined) {
    const statement = selectMaxSortNo(userId);
    const row = await dbClient.queryOne<{ maxSortNo: number }>(statement.sql, statement.params);
    sortNo = Number(row?.maxSortNo ?? 0) + 1;
  }

  const operator = `user:${userId}`;
  const insert = insertFolder({
    userId,
    folderNameCipher: input.folderNameCipher,
    folderColor: input.folderColor,
    sortNo,
    operator,
  });
  const result = await dbClient.execute(insert.sql, insert.params);
  const row = await findFolder(userId, Number(result.insertId));
  if (!row) {
    throw new HttpError(500, '文件夹创建失败');
  }
  return toDto(row);
}

export async function editFolder(
  userId: number,
  folderId: number,
  input: UpdateFolderInput,
): Promise<FolderDto> {
  const statement = updateFolder({
    userId,
    folderId,
    ...input,
    operator: `user:${userId}`,
  });
  const result = await dbClient.execute(statement.sql, statement.params);
  if (result.affectedRows === 0) {
    throw new HttpError(404, '文件夹不存在');
  }
  const row = await findFolder(userId, folderId);
  if (!row) {
    throw new HttpError(404, '文件夹不存在');
  }
  return toDto(row);
}

/** 删除文件夹：其下条目自动移入「未分类」。 */
export async function removeFolder(userId: number, folderId: number): Promise<void> {
  const folder = await findFolder(userId, folderId);
  if (!folder) {
    throw new HttpError(404, '文件夹不存在');
  }

  await dbClient.transaction(async (conn) => {
    const detach = detachItemsFromFolder(userId, folderId);
    await conn.query(detach.sql, detach.params);
    const remove = deleteFolder(userId, folderId);
    const [result] = await conn.query(remove.sql, remove.params);
    if ((result as { affectedRows: number }).affectedRows === 0) {
      throw new HttpError(404, '文件夹不存在');
    }
  });
}
