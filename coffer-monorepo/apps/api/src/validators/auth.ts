import { z } from 'zod';

import {
  cipherTextSchema,
  idSchema,
  saltSchema,
  verifierSchema,
} from './common.js';

export const emailSchema = z
  .string()
  .trim()
  .min(1, '请输入邮箱')
  .max(128, '邮箱长度不能超过 128 位')
  .email('邮箱格式不正确')
  .transform((value) => value.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  authSalt: saltSchema,
  authVerifier: verifierSchema,
  encSalt: saltSchema,
  keyCheckCipher: cipherTextSchema(500),
  nickname: z.string().trim().max(16, '昵称不能超过 16 个字').optional(),
});

export const challengeSchema = z.object({
  email: emailSchema,
});

export const verifySchema = z.object({
  srpSessionId: z.string().trim().min(16, '会话标识无效').max(64, '会话标识无效'),
  A: z.string().trim().regex(/^[0-9a-fA-F]{1,512}$/, '客户端公钥 A 无效'),
  M1: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, '客户端证明码 M1 无效'),
});

const rekeyBase = {
  authSalt: saltSchema,
  authVerifier: verifierSchema,
  encSalt: saltSchema,
  keyVersion: z.coerce.number().int().positive(),
  keyCheckCipher: cipherTextSchema(500),
};

export const rekeySchema = z.object({
  ...rekeyBase,
  folders: z
    .array(
      z.object({
        folderId: idSchema,
        folderNameCipher: cipherTextSchema(1024),
      }),
    )
    .max(1000),
  items: z
    .array(
      z.object({
        itemId: idSchema,
        nameCipher: cipherTextSchema(1024),
        dataCipher: cipherTextSchema(2_000_000),
        keyVersion: z.coerce.number().int().positive(),
      }),
    )
    .max(5000),
  attachments: z
    .array(
      z.object({
        attachId: idSchema,
        fileNameCipher: cipherTextSchema(1024),
        keyVersion: z.coerce.number().int().positive(),
      }),
    )
    .max(10000),
});
