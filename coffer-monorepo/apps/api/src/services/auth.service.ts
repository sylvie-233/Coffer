import type {
  LoginResult,
  RegisterInput,
  RegisterResult,
  RekeyInput,
  SrpChallengeInput,
  SrpChallengeResult,
  SrpVerifyInput,
  UserProfile,
} from '@coffer/types';
import { SRP_N, randomHex, srpServerChallenge, srpServerVerify } from '@coffer/crypto';

import { dbClient } from '../db/index.js';
import { countActiveFolders, rekeyFolder } from '../sql/folder.sql.js';
import { countAllAttachments, rekeyAttachment } from '../sql/attachment.sql.js';
import { countAllItems, rekeyItem } from '../sql/item.sql.js';
import { insertUser, rekeyUser, selectUserByEmail, selectUserById, type UserRow } from '../sql/user.sql.js';
import { HttpError } from '../utils/http.js';
import { signToken } from '../utils/jwt.js';
import {
  defaultNickname,
  getProfile,
  loadUserById,
  profileOf,
} from './user.service.js';

interface SrpSession {
  userId: number;
  email: string;
  salt: string;
  verifier: string;
  b: string;
  B: string;
  expiresAt: number;
}

/** SRP 挑战会话只存在内存中，5 分钟过期。 */
const sessions = new Map<string, SrpSession>();
const SESSION_TTL_MS = 5 * 60 * 1000;

function sweepSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
  // 防止内存被大量匿名挑战撑爆
  if (sessions.size > 20_000) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (const [id] of oldest.slice(0, sessions.size - 20_000)) {
      sessions.delete(id);
    }
  }
}

function invalidateUserSessions(userId: number): void {
  for (const [id, session] of sessions) {
    if (session.userId === userId) {
      sessions.delete(id);
    }
  }
}

async function issueToken(
  user: UserRow,
): Promise<{ token: string; expiresIn: number }> {
  return signToken(user.userId, user.email);
}

function parseVerifier(value: string): bigint {
  try {
    const parsed = BigInt(`0x${value}`);
    if (parsed <= 0n || parsed >= SRP_N) {
      throw new Error('out of range');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'SRP 验证器无效');
  }
}

/** 注册：客户端已完成 SRP 验证器与 KEK 校验文计算，服务端只保存材料。 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  parseVerifier(input.authVerifier);

  const existing = await dbClient.queryOne<UserRow>(
    selectUserByEmail(input.email).sql,
    selectUserByEmail(input.email).params,
  );
  if (existing) {
    throw new HttpError(409, '该邮箱已注册');
  }

  const nickname = input.nickname?.trim() || defaultNickname(input.email);
  const statement = insertUser({
    email: input.email,
    nickname: Array.from(nickname).slice(0, 16).join(''),
    avatarColor: '125B4A',
    authSalt: input.authSalt.toLowerCase(),
    authVerifier: input.authVerifier.toLowerCase(),
    encSalt: input.encSalt.toLowerCase(),
    keyCheckCipher: input.keyCheckCipher,
  });
  const result = await dbClient.execute(statement.sql, statement.params);
  const user = await dbClient.queryOne<UserRow>(
    selectUserById(Number(result.insertId)).sql,
    selectUserById(Number(result.insertId)).params,
  );
  if (!user) {
    throw new HttpError(500, '注册失败，请稍后重试');
  }

  const { token, expiresIn } = await issueToken(user);
  return {
    token,
    tokenType: 'Bearer',
    expiresIn,
    profile: profileOf(user),
  };
}

/** SRP 第一步：下发盐与服务器公开值 B。 */
export async function challenge(input: SrpChallengeInput): Promise<SrpChallengeResult> {
  sweepSessions();

  const user = await dbClient.queryOne<UserRow>(
    selectUserByEmail(input.email).sql,
    selectUserByEmail(input.email).params,
  );
  if (!user) {
    throw new HttpError(404, '账号不存在，请先创建保险库');
  }
  if (user.status === '1') {
    throw new HttpError(403, '账号已停用，请联系管理员');
  }

  const server = await srpServerChallenge(user.authVerifier);
  const srpSessionId = randomHex(16);
  sessions.set(srpSessionId, {
    userId: user.userId,
    email: user.email,
    salt: user.authSalt,
    verifier: user.authVerifier,
    b: server.b,
    B: server.B,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });

  return {
    srpSessionId,
    salt: user.authSalt,
    B: server.B,
    expiresIn: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** SRP 第二步：验证 M1，签发 JWT 并返回 M2 供客户端校验服务器。 */
export async function verify(input: SrpVerifyInput): Promise<LoginResult> {
  const session = sessions.get(input.srpSessionId);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(input.srpSessionId);
    throw new HttpError(401, '登录会话已过期，请重新登录');
  }

  // 一次挑战只允许一次验证，失败后必须重新开始，避免重放与暴力尝试
  sessions.delete(input.srpSessionId);

  const result = await srpServerVerify({
    bHex: session.b,
    BHex: session.B,
    verifierHex: session.verifier,
    AHex: input.A,
    M1Hex: input.M1,
  });

  if (!result.ok) {
    throw new HttpError(401, '主密码错误，请重试');
  }

  const user = await loadUserById(session.userId);
  if (!user || user.delFlag === '2') {
    throw new HttpError(401, '账号不存在或已被删除');
  }
  if (user.status === '1') {
    throw new HttpError(403, '账号已停用，请联系管理员');
  }

  const { token, expiresIn } = await issueToken(user);
  return {
    token,
    tokenType: 'Bearer',
    expiresIn,
    M2: result.M2,
    profile: profileOf(user),
  };
}

export async function me(userId: number): Promise<UserProfile> {
  return getProfile(userId);
}

/**
 * 修改主密码（全库重加密）。
 *
 * 客户端用旧 KEK 解密全部数据、用新 KEK 重新加密后一次性提交；
 * 服务端校验数据完整性后在同一事务内更新用户材料与所有密文。
 */
export async function rekey(userId: number, input: RekeyInput): Promise<UserProfile> {
  const user = await loadUserById(userId);
  if (!user || user.delFlag === '2') {
    throw new HttpError(401, '账号不存在或已被删除');
  }
  if (input.keyVersion !== user.keyVersion + 1) {
    throw new HttpError(409, `密钥版本必须为 ${user.keyVersion + 1}`);
  }
  parseVerifier(input.authVerifier);

  const folderIds = new Set(input.folders.map((folder) => folder.folderId));
  const itemIds = new Set(input.items.map((item) => item.itemId));
  const attachIds = new Set(input.attachments.map((attach) => attach.attachId));
  if (
    folderIds.size !== input.folders.length ||
    itemIds.size !== input.items.length ||
    attachIds.size !== input.attachments.length
  ) {
    throw new HttpError(400, '重加密数据包含重复 ID');
  }
  if (input.items.some((item) => item.keyVersion !== input.keyVersion)) {
    throw new HttpError(400, '条目密钥版本与用户密钥版本不一致');
  }
  if (input.attachments.some((attach) => attach.keyVersion !== input.keyVersion)) {
    throw new HttpError(400, '附件密钥版本与用户密钥版本不一致');
  }

  const [folderCount, itemCount, attachCount] = await Promise.all([
    dbClient.queryOne<{ total: number }>(
      countActiveFolders(userId).sql,
      countActiveFolders(userId).params,
    ),
    dbClient.queryOne<{ total: number }>(
      countAllItems(userId).sql,
      countAllItems(userId).params,
    ),
    dbClient.queryOne<{ total: number }>(
      countAllAttachments(userId).sql,
      countAllAttachments(userId).params,
    ),
  ]);

  if (
    Number(folderCount?.total ?? 0) !== input.folders.length ||
    Number(itemCount?.total ?? 0) !== input.items.length ||
    Number(attachCount?.total ?? 0) !== input.attachments.length
  ) {
    throw new HttpError(
      400,
      '重加密数据不完整：请先同步全部文件夹、条目与附件后再修改主密码',
    );
  }

  await dbClient.transaction(async (conn) => {
    const rekeyUserStatement = rekeyUser({
      userId,
      authSalt: input.authSalt,
      authVerifier: input.authVerifier,
      encSalt: input.encSalt,
      keyVersion: input.keyVersion,
      keyCheckCipher: input.keyCheckCipher,
    });
    const [userResult] = await conn.query(rekeyUserStatement.sql, rekeyUserStatement.params);
    if ((userResult as { affectedRows: number }).affectedRows !== 1) {
      throw new HttpError(500, '更新用户密钥材料失败');
    }

    for (const folder of input.folders) {
      const statement = rekeyFolder({
        userId,
        folderId: folder.folderId,
        folderNameCipher: folder.folderNameCipher,
      });
      const [result] = await conn.query(statement.sql, statement.params);
      if ((result as { affectedRows: number }).affectedRows === 0) {
        throw new HttpError(400, `文件夹 ${folder.folderId} 不属于当前用户`);
      }
    }

    for (const item of input.items) {
      const statement = rekeyItem({
        userId,
        itemId: item.itemId,
        nameCipher: item.nameCipher,
        dataCipher: item.dataCipher,
        keyVersion: item.keyVersion,
      });
      const [result] = await conn.query(statement.sql, statement.params);
      if ((result as { affectedRows: number }).affectedRows === 0) {
        throw new HttpError(400, `条目 ${item.itemId} 不属于当前用户`);
      }
    }

    for (const attach of input.attachments) {
      const statement = rekeyAttachment({
        userId,
        attachId: attach.attachId,
        fileNameCipher: attach.fileNameCipher,
        keyVersion: attach.keyVersion,
      });
      const [result] = await conn.query(statement.sql, statement.params);
      if ((result as { affectedRows: number }).affectedRows === 0) {
        throw new HttpError(400, `附件 ${attach.attachId} 不属于当前用户`);
      }
    }
  });

  // 旧 SRP 会话与旧密钥材料不再有效
  invalidateUserSessions(userId);

  return getProfile(userId);
}
