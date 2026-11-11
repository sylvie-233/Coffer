/**
 * hash-wasm 在 RN 中不可用（依赖 WebAssembly）。该 shim 通过 Metro resolver
 * 替换 `hash-wasm` 导入，仅实现 @coffer/crypto 用到的 argon2id。
 *
 * 优先调用 modules/coffer-argon2 的原生实现（Hermes 跑纯 JS Argon2 需要几十秒），
 * 原生模块缺失时才退回 @noble/hashes 的纯 JS 版本。
 */
import { argon2idAsync } from '@noble/hashes/argon2.js';
import { hexToBytes } from '@noble/hashes/utils.js';

import { nativeArgon2 } from './native-argon2';

export interface Argon2idOptions {
  password: string;
  salt: Uint8Array;
  parallelism: number;
  iterations: number;
  /** 以 KiB 为单位，与 hash-wasm 保持一致。 */
  memorySize: number;
  hashLength: number;
  outputType: 'binary' | 'hex';
}

function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

export async function argon2id(options: Argon2idOptions): Promise<Uint8Array | string> {
  if (nativeArgon2) {
    const hex = await nativeArgon2.argon2id(
      options.password,
      toHex(options.salt),
      options.iterations,
      options.memorySize,
      options.parallelism,
      options.hashLength,
    );
    return options.outputType === 'hex' ? hex : hexToBytes(hex);
  }

  const output = await argon2idAsync(options.password, options.salt, {
    t: options.iterations,
    m: options.memorySize,
    p: options.parallelism,
    dkLen: options.hashLength,
    asyncTick: 10,
  });
  if (options.outputType === 'hex') {
    return toHex(output);
  }
  return output;
}
