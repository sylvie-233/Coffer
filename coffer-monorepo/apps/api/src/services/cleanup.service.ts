import { TRASH_RETENTION_DAYS } from '@coffer/types';

import { dbClient } from '../db/index.js';
import {
  deleteAttachmentsByItems,
  selectAttachmentsByItems,
} from '../sql/attachment.sql.js';
import { deleteItemsPhysically, selectExpiredTrash } from '../sql/item.sql.js';
import { deleteObject } from './storage.service.js';

let timer: NodeJS.Timeout | null = null;

/**
 * 清理回收站：超过 30 天的条目物理删除，同时删除对象存储中的密文文件。
 * 每小时执行一次，多实例部署时应改为外部定时任务或分布式锁。
 */
export async function runCleanup(): Promise<number> {
  const statement = selectExpiredTrash(TRASH_RETENTION_DAYS);
  const expired = await dbClient.query<{ itemId: number }>(statement.sql, statement.params);
  if (expired.length === 0) {
    return 0;
  }

  const itemIds = expired.map((row) => Number(row.itemId));
  const attachmentStatement = selectAttachmentsByItems(itemIds);
  const attachments = await dbClient.query<{ attachId: number; objectKey: string }>(
    attachmentStatement.sql,
    attachmentStatement.params,
  );

  for (const attachment of attachments) {
    await deleteObject(attachment.objectKey);
  }

  await dbClient.transaction(async (conn) => {
    const removeAttachments = deleteAttachmentsByItems(itemIds);
    await conn.query(removeAttachments.sql, removeAttachments.params);
    const removeItems = deleteItemsPhysically(itemIds);
    await conn.query(removeItems.sql, removeItems.params);
  });

  console.log(`[api:cleanup] 已物理清除 ${itemIds.length} 条回收站凭证`);
  return itemIds.length;
}

export function startCleanupJob(): void {
  if (timer) {
    return;
  }
  const interval = setInterval(() => {
    void runCleanup().catch((error: unknown) => {
      console.error('[api:cleanup] 清理失败', error);
    });
  }, 60 * 60 * 1000);
  interval.unref();
  timer = interval;

  // 启动后延迟执行一次，避免与数据库初始化竞争
  setTimeout(() => {
    void runCleanup().catch((error: unknown) => {
      console.error('[api:cleanup] 启动清理失败', error);
    });
  }, 30_000).unref();
}

export function stopCleanupJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
