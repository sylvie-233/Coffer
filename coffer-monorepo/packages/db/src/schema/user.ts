import { sql } from 'drizzle-orm';
import { bigint, char, datetime, int, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

/** 用户表：邮箱 + SRP 认证材料 + 密钥版本，服务端不保存任何明文凭证内容。 */
export const sysUser = mysqlTable('sys_user', {
  userId: bigint('user_id', { mode: 'number' }).autoincrement().primaryKey(),
  email: varchar('email', { length: 128 }).notNull(),
  nickname: varchar('nickname', { length: 64 }).notNull().default(''),
  avatar: varchar('avatar', { length: 255 }).notNull().default(''),
  avatarColor: char('avatar_color', { length: 6 }).notNull().default('125B4A'),
  authSalt: varchar('auth_salt', { length: 64 }).notNull(),
  authVerifier: varchar('auth_verifier', { length: 512 }).notNull(),
  encSalt: varchar('enc_salt', { length: 64 }).notNull(),
  keyVersion: int('key_version').notNull().default(1),
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
