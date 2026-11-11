import type { SqlStatement } from './shared.js';

export interface UserRow {
  userId: number;
  email: string;
  nickname: string;
  avatar: string;
  avatarColor: string;
  authSalt: string;
  authVerifier: string;
  encSalt: string;
  keyVersion: number;
  keyCheckCipher: string | null;
  status: string;
  delFlag: string;
  createTime: string;
  updateTime: string | null;
}

const USER_COLUMNS = `
  user_id AS userId, email, nickname, avatar, avatar_color AS avatarColor,
  auth_salt AS authSalt, auth_verifier AS authVerifier, enc_salt AS encSalt,
  key_version AS keyVersion, remark AS keyCheckCipher,
  status, del_flag AS delFlag, create_time AS createTime, update_time AS updateTime
`;

export function selectUserByEmail(email: string): SqlStatement {
  return {
    sql: `SELECT ${USER_COLUMNS} FROM sys_user WHERE email = ? AND del_flag = '0' LIMIT 1`,
    params: [email],
  };
}

export function selectUserById(userId: number): SqlStatement {
  return {
    sql: `SELECT ${USER_COLUMNS} FROM sys_user WHERE user_id = ? LIMIT 1`,
    params: [userId],
  };
}

export function insertUser(input: {
  email: string;
  nickname: string;
  avatarColor: string;
  authSalt: string;
  authVerifier: string;
  encSalt: string;
  keyCheckCipher: string;
}): SqlStatement {
  return {
    sql: `INSERT INTO sys_user
            (email, nickname, avatar_color, auth_salt, auth_verifier, enc_salt,
             key_version, remark, create_by, update_by)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    params: [
      input.email,
      input.nickname,
      input.avatarColor,
      input.authSalt,
      input.authVerifier,
      input.encSalt,
      input.keyCheckCipher,
      input.email,
      input.email,
    ],
  };
}

export function updateProfile(input: {
  userId: number;
  nickname?: string;
  avatarColor?: string;
  operator: string;
}): SqlStatement {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.nickname !== undefined) {
    sets.push('nickname = ?');
    params.push(input.nickname);
  }
  if (input.avatarColor !== undefined) {
    sets.push('avatar_color = ?');
    params.push(input.avatarColor);
  }
  sets.push('update_by = ?', 'update_time = CURRENT_TIMESTAMP');
  params.push(input.operator, input.userId);
  return {
    sql: `UPDATE sys_user SET ${sets.join(', ')} WHERE user_id = ?`,
    params,
  };
}

export function updateAvatar(userId: number, avatarKey: string): SqlStatement {
  return {
    sql: `UPDATE sys_user
             SET avatar = ?, update_time = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
    params: [avatarKey, userId],
  };
}

export function rekeyUser(input: {
  userId: number;
  authSalt: string;
  authVerifier: string;
  encSalt: string;
  keyVersion: number;
  keyCheckCipher: string;
}): SqlStatement {
  return {
    sql: `UPDATE sys_user
             SET auth_salt = ?, auth_verifier = ?, enc_salt = ?,
                 key_version = ?, remark = ?, update_time = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
    params: [
      input.authSalt,
      input.authVerifier,
      input.encSalt,
      input.keyVersion,
      input.keyCheckCipher,
      input.userId,
    ],
  };
}
