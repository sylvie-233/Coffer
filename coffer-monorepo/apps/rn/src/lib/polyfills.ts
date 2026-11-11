/**
 * React Native 运行时补齐 WebCrypto / 编码相关的全局能力。
 *
 * 共享的 @coffer/crypto 直接使用 crypto.subtle、btoa/atob、TextEncoder，
 * 而 RN 只有部分能力；这里用 @noble 的纯 JS 实现补齐，保证与 Web 端密文兼容。
 * 必须在任何共享加密模块求值之前导入（见根目录 index.ts）。
 */
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';

/**
 * 手写 UTF-8 编码，不能调用 @noble/hashes 的 utf8ToBytes：
 * 它在内部使用全局 TextEncoder，而 TextEncoder 正是这里要注入的类，会无限递归。
 */
function utf8Encode(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    let code = input.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < input.length) {
      const next = input.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function bytesToUtf8(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; ) {
    const byte = bytes[index]!;
    if (byte < 0x80) {
      output += String.fromCharCode(byte);
      index += 1;
      continue;
    }
    if (byte < 0xe0) {
      const next = bytes[index + 1]!;
      output += String.fromCharCode(((byte & 0x1f) << 6) | (next & 0x3f));
      index += 2;
      continue;
    }
    if (byte < 0xf0) {
      const second = bytes[index + 1]!;
      const third = bytes[index + 2]!;
      output += String.fromCharCode(
        ((byte & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f),
      );
      index += 3;
      continue;
    }
    const second = bytes[index + 1]!;
    const third = bytes[index + 2]!;
    const fourth = bytes[index + 3]!;
    const codePoint =
      ((byte & 0x07) << 18) |
      ((second & 0x3f) << 12) |
      ((third & 0x3f) << 6) |
      (fourth & 0x3f);
    const offset = codePoint - 0x10000;
    output += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
    index += 4;
  }
  return output;
}

/** 把 WebCrypto 的 BufferSource 统一转成 Uint8Array。 */
function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError('不支持的二进制数据类型');
}

function fillRandom(array: ArrayBufferView): void {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let offset = 0;
  while (offset < bytes.length) {
    // expo-crypto 单次最多生成 1024 字节，分块填充。
    const chunk = Math.min(1024, bytes.length - offset);
    bytes.set(getRandomBytes(chunk), offset);
    offset += chunk;
  }
}

const keyBytes = new WeakMap<object, Uint8Array>();

function importAesKey(raw: Uint8Array, algorithm: string): CryptoKey {
  if (algorithm !== 'AES-GCM') {
    throw new Error(`不支持的密钥算法：${algorithm}`);
  }
  if (raw.length !== 16 && raw.length !== 24 && raw.length !== 32) {
    throw new Error('AES-GCM 密钥长度必须是 16 / 24 / 32 字节');
  }
  const key = { type: 'secret', algorithm: { name: 'AES-GCM', length: raw.length * 8 } };
  keyBytes.set(key, raw);
  return key as unknown as CryptoKey;
}

function keyRaw(key: CryptoKey): Uint8Array {
  const raw = keyBytes.get(key as unknown as object);
  if (!raw) {
    throw new Error('无效的 AES-GCM 密钥');
  }
  return raw;
}

function gcmIv(params: unknown): Uint8Array {
  if (!params || typeof params !== 'object') {
    throw new Error('缺少 AES-GCM 参数');
  }
  const iv = (params as { iv?: unknown }).iv;
  if (!iv) {
    throw new Error('缺少 AES-GCM IV');
  }
  const bytes = asBytes(iv);
  if (bytes.length !== 12) {
    throw new Error('AES-GCM IV 必须为 12 字节');
  }
  return bytes;
}

const subtle = {
  async digest(algorithm: string, data: unknown): Promise<ArrayBuffer> {
    if (algorithm !== 'SHA-256') {
      throw new Error(`不支持的摘要算法：${algorithm}`);
    }
    const output = sha256(asBytes(data));
    return output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    ) as ArrayBuffer;
  },

  async importKey(
    format: string,
    keyData: unknown,
    algorithm: string,
    _extractable: boolean,
    _usages: string[],
  ): Promise<CryptoKey> {
    if (format !== 'raw') {
      throw new Error('仅支持 raw 格式导入密钥');
    }
    return importAesKey(asBytes(keyData), algorithm);
  },

  async encrypt(params: unknown, key: CryptoKey, data: unknown): Promise<ArrayBuffer> {
    const output = gcm(keyRaw(key), gcmIv(params)).encrypt(asBytes(data));
    return output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    ) as ArrayBuffer;
  },

  async decrypt(params: unknown, key: CryptoKey, data: unknown): Promise<ArrayBuffer> {
    const output = gcm(keyRaw(key), gcmIv(params)).decrypt(asBytes(data));
    return output.buffer.slice(
      output.byteOffset,
      output.byteOffset + output.byteLength,
    ) as ArrayBuffer;
  },
};

function randomUuid(): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  // RFC 4122 v4
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const cryptoObject = {
  getRandomValues: <T extends ArrayBufferView>(array: T): T => {
    fillRandom(array);
    return array;
  },
  randomUUID: randomUuid,
  subtle,
};

/**
 * 共享包在模块顶层就创建了 TextEncoder，所以即使调用方晚于此处导入，
 * 也必须先定义全局构造函数。
 */
class RnTextEncoder {
  readonly encoding = 'utf-8';

  encode(input = ''): Uint8Array {
    return utf8Encode(String(input));
  }
}

class RnTextDecoder {
  readonly encoding = 'utf-8';

  decode(input?: unknown): string {
    if (input === undefined) {
      return '';
    }
    return bytesToUtf8(asBytes(input));
  }
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(binary: string): string {
  let output = '';
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const hasB = i + 1 < binary.length;
    const b = hasB ? binary.charCodeAt(i + 1) : 0;
    const hasC = i + 2 < binary.length;
    const c = hasC ? binary.charCodeAt(i + 2) : 0;
    const triple = (a << 16) | (b << 8) | c;
    output += BASE64_ALPHABET[(triple >> 18) & 0x3f];
    output += BASE64_ALPHABET[(triple >> 12) & 0x3f];
    output += hasB ? BASE64_ALPHABET[(triple >> 6) & 0x3f] : '=';
    output += hasC ? BASE64_ALPHABET[triple & 0x3f] : '=';
  }
  return output;
}

function decodeBase64(value: string): string {
  const clean = value.replace(/[\s=]/g, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) {
    throw new Error('无效的 Base64 字符串');
  }
  let binary = '';
  for (let i = 0; i < clean.length; i += 4) {
    const a = BASE64_ALPHABET.indexOf(clean[i]!);
    const b = BASE64_ALPHABET.indexOf(clean[i + 1]!);
    const cIndex = clean[i + 2];
    const dIndex = clean[i + 3];
    const c = cIndex ? BASE64_ALPHABET.indexOf(cIndex) : 0;
    const d = dIndex ? BASE64_ALPHABET.indexOf(dIndex) : 0;
    const triple = (a << 18) | (b << 12) | (c << 6) | d;
    binary += String.fromCharCode((triple >> 16) & 0xff);
    if (cIndex) {
      binary += String.fromCharCode((triple >> 8) & 0xff);
    }
    if (dIndex) {
      binary += String.fromCharCode(triple & 0xff);
    }
  }
  return binary;
}

const globals = {
  TextEncoder: RnTextEncoder,
  TextDecoder: RnTextDecoder,
  btoa: encodeBase64,
  atob: decodeBase64,
};

for (const [name, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

Object.defineProperty(globalThis, 'crypto', {
  value: cryptoObject,
  configurable: true,
  writable: true,
});

