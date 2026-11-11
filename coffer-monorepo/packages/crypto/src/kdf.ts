import { argon2id } from 'hash-wasm';

import { hexToBytes } from './bytes.js';

/**
 * Argon2id 参数基线（见功能设计说明附录 A.5）：
 * 内存 64MB（hash-wasm 以 KiB 为单位）/ 迭代 3 / 并行 2。
 */
export const ARGON2_PARAMS = {
  parallelism: 2,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
} as const;

/** 用主密码与 16 字节盐派生 32 字节材料（KEK 或 SRP x 的输入）。 */
export async function deriveArgon2(password: string, saltHex: string): Promise<Uint8Array> {
  const output = await argon2id({
    password,
    salt: hexToBytes(saltHex),
    parallelism: ARGON2_PARAMS.parallelism,
    iterations: ARGON2_PARAMS.iterations,
    memorySize: ARGON2_PARAMS.memorySize,
    hashLength: ARGON2_PARAMS.hashLength,
    outputType: 'binary',
  });
  return output as Uint8Array;
}

/** 数据加密密钥的原始字节（KEK 只在内存中存在，不落盘、不上传）。 */
export function deriveKekRaw(password: string, encSaltHex: string): Promise<Uint8Array> {
  return deriveArgon2(password, encSaltHex);
}

/** 把原始 KEK 导入为不可导出的 AES-GCM 密钥。 */
export async function importKek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as unknown as BufferSource, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}
