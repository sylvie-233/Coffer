import { sql } from 'drizzle-orm';
import { bigint, char, datetime, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

import { varbinary1024 } from './shared.js';

/** 文件夹：名称以客户端密文存储，颜色仅用于 UI。 */
export const vaultFolder = mysqlTable('vault_folder', {
  folderId: bigint('folder_id', { mode: 'number' }).autoincrement().primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  folderNameCipher: varbinary1024('folder_name_cipher').notNull(),
  folderColor: char('folder_color', { length: 6 }).notNull().default('125B4A'),
  sortNo: int('sort_no').notNull().default(0),
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
