import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  datetime,
  int,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';

import { varbinary1024 } from './shared.js';

/** 图片附件：原始文件名加密；对象存储中保存的是密文图片字节。 */
export const vaultAttachment = mysqlTable('vault_attachment', {
  attachId: bigint('attach_id', { mode: 'number' }).autoincrement().primaryKey(),
  itemId: bigint('item_id', { mode: 'number' }).notNull(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  fileNameCipher: varbinary1024('file_name_cipher'),
  mimeType: varchar('mime_type', { length: 64 }).notNull().default(''),
  fileSize: bigint('file_size', { mode: 'number' }).notNull().default(0),
  objectKey: varchar('object_key', { length: 255 }).notNull(),
  fileSha256: char('file_sha256', { length: 64 }).notNull().default(''),
  keyVersion: int('key_version').notNull().default(1),
  deletedTime: datetime('deleted_time', { mode: 'string' }),
  status: char('status', { length: 1 }).notNull().default('0'),
  delFlag: char('del_flag', { length: 1 }).notNull().default('0'),
  createBy: varchar('create_by', { length: 64 }).notNull().default(''),
  createTime: datetime('create_time', { mode: 'string' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updateBy: varchar('update_by', { length: 64 }).notNull().default(''),
  updateTime: datetime('update_time', { mode: 'string' }),
  remark: varchar('remark', { length: 500 }),
});
