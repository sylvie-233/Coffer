import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  datetime,
  int,
  mediumtext,
  mysqlTable,
  varchar,
} from 'drizzle-orm/mysql-core';

import { varbinary1024 } from './shared.js';

/** 凭证条目：类型、收藏、文件夹为明文元信息；名称与内容均为客户端密文。 */
export const vaultItem = mysqlTable('vault_item', {
  itemId: bigint('item_id', { mode: 'number' }).autoincrement().primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull(),
  folderId: bigint('folder_id', { mode: 'number' }),
  itemType: char('item_type', { length: 1 }).notNull().default('0'),
  nameCipher: varbinary1024('name_cipher').notNull(),
  dataCipher: mediumtext('data_cipher').notNull(),
  favFlag: char('fav_flag', { length: 1 }).notNull().default('0'),
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
