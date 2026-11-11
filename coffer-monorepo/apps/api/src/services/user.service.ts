import { randomUUID } from 'node:crypto';

import type { UserProfile } from '@coffer/types';
import { KEY_CHECK_PREFIX, MAX_CIPHER_FILE_BYTES } from '@coffer/types';

import { dbClient } from '../db/index.js';
import { updateAvatar, updateProfile, selectUserById, type UserRow } from '../sql/user.sql.js';
import { HttpError } from '../utils/http.js';
import { deleteObject, getObject, putObject } from './storage.service.js';

/** 把数据库行转换为客户端资料 DTO。 */
export function profileOf(row: UserRow): UserProfile {
  const remark = row.keyCheckCipher ?? '';
  return {
    userId: row.userId,
    email: row.email,
    nickname: row.nickname,
    avatar: row.avatar,
    avatarColor: row.avatarColor,
    encSalt: row.encSalt,
    keyVersion: row.keyVersion,
    keyCheckCipher: remark.startsWith(KEY_CHECK_PREFIX)
      ? remark.slice(KEY_CHECK_PREFIX.length)
      : remark,
    createTime: row.createTime,
    updateTime: row.updateTime,
  };
}

export async function loadUserById(userId: number): Promise<UserRow | null> {
  const statement = selectUserById(userId);
  return dbClient.queryOne<UserRow>(statement.sql, statement.params);
}

export async function getProfile(userId: number): Promise<UserProfile> {
  const row = await loadUserById(userId);
  if (!row || row.delFlag === '2') {
    throw new HttpError(404, '用户不存在');
  }
  return profileOf(row);
}

export async function updateUserProfile(
  userId: number,
  input: { nickname?: string; avatarColor?: string },
): Promise<UserProfile> {
  const operator = `user:${userId}`;
  const statement = updateProfile({ userId, ...input, operator });
  await dbClient.execute(statement.sql, statement.params);
  return getProfile(userId);
}

/** 上传头像密文（客户端已加密，服务器只做对象存储中转）。 */
export async function uploadAvatar(userId: number, bytes: Uint8Array): Promise<UserProfile> {
  if (bytes.length === 0) {
    throw new HttpError(400, '头像文件为空');
  }
  if (bytes.length > MAX_CIPHER_FILE_BYTES) {
    throw new HttpError(413, '头像密文超过大小限制');
  }
  const key = `avatars/${userId}/${randomUUID()}.bin`;
  await putObject(key, bytes);

  const row = await loadUserById(userId);
  if (row?.avatar) {
    await deleteObject(row.avatar);
  }

  const statement = updateAvatar(userId, key);
  await dbClient.execute(statement.sql, statement.params);
  return getProfile(userId);
}

export async function removeAvatar(userId: number): Promise<UserProfile> {
  const row = await loadUserById(userId);
  if (row?.avatar) {
    await deleteObject(row.avatar);
    const statement = updateAvatar(userId, '');
    await dbClient.execute(statement.sql, statement.params);
  }
  return getProfile(userId);
}

export async function getAvatarBytes(userId: number): Promise<{ bytes: Uint8Array; version: number } | null> {
  const row = await loadUserById(userId);
  if (!row?.avatar) {
    return null;
  }
  const bytes = await getObject(row.avatar);
  return { bytes, version: row.keyVersion };
}

/** 新用户默认昵称：邮箱 @ 前的部分，最多 16 个字符。 */
export function defaultNickname(email: string): string {
  const local = email.split('@')[0] ?? 'coffer';
  return Array.from(local).slice(0, 16).join('') || 'coffer';
}
