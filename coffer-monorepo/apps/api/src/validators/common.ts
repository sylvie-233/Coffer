import { z } from 'zod';

/** 路径 / 表单中的正整数 ID。 */
export const idSchema = z.coerce.number().int().positive();

/** 16 字节盐（Hex 32 字符）。 */
export const saltSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{32}$/, '盐必须是 32 位十六进制字符串');

/** SRP 验证器 v = g^x mod N（十六进制，最长 2048 位群的 512 字符）。 */
export const verifierSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{1,512}$/, '验证器必须是十六进制字符串');

/** 字段密文格式 v1.<Base64>。 */
export function cipherTextSchema(maxLength: number) {
  return z
    .string()
    .trim()
    .min(4, '密文不能为空')
    .max(maxLength, `密文长度不能超过 ${maxLength} 字符`)
    .regex(/^v1\.[A-Za-z0-9+/]+={0,2}$/, '密文格式不合法（应为 v1.<Base64>）');
}

/** 文件夹 / 头像颜色：6 位 HEX，不带 #（与数据库存储一致）。 */
export const colorSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Fa-f]{6}$/, '颜色必须是 6 位十六进制（如 125B4A）');

export const itemTypeSchema = z.enum(['0', '1', '2']);
export const flagSchema = z.enum(['0', '1']);
