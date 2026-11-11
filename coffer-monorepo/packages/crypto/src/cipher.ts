import {
  base64Decode,
  base64Encode,
  concatBytes,
  randomBytes,
  utf8ToBytes,
  bytesToUtf8,
} from './bytes.js';

const VERSION_PREFIX = 'v1.';
const NONCE_BYTES = 12;

export interface EncryptedPayload {
  nonce: Uint8Array;
  /** WebCrypto AES-GCM 输出的密文 + 认证标签（Tag 已在末尾）。 */
  ciphertext: Uint8Array;
}

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<EncryptedPayload> {
  const nonce = randomBytes(NONCE_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource, tagLength: 128 },
    key,
    plaintext as unknown as BufferSource,
  );
  return { nonce, ciphertext: new Uint8Array(ciphertext) };
}

async function aesDecrypt(
  key: CryptoKey,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce as unknown as BufferSource, tagLength: 128 },
    key,
    ciphertext as unknown as BufferSource,
  );
  return new Uint8Array(plaintext);
}

/**
 * 字段级密文格式：`v1.` + Base64(Nonce(12B) ‖ Ciphertext ‖ Tag(16B))。
 * 适用于 name_cipher / data_cipher / folder_name_cipher / file_name_cipher。
 */
export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  const payload = await aesEncrypt(key, utf8ToBytes(plaintext));
  return `${VERSION_PREFIX}${base64Encode(concatBytes(payload.nonce, payload.ciphertext))}`;
}

export async function decryptText(key: CryptoKey, cipher: string): Promise<string> {
  if (!cipher.startsWith(VERSION_PREFIX)) {
    throw new Error('不支持的密文版本');
  }
  const packed = base64Decode(cipher.slice(VERSION_PREFIX.length));
  if (packed.length <= NONCE_BYTES) {
    throw new Error('密文格式损坏');
  }
  const nonce = packed.slice(0, NONCE_BYTES);
  const ciphertext = packed.slice(NONCE_BYTES);
  return bytesToUtf8(await aesDecrypt(key, nonce, ciphertext));
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return encryptText(key, JSON.stringify(value));
}

export async function decryptJson<T>(key: CryptoKey, cipher: string): Promise<T> {
  return JSON.parse(await decryptText(key, cipher)) as T;
}

const FILE_PREFIX = utf8ToBytes(VERSION_PREFIX);

/**
 * 附件 / 头像的密文文件格式：ASCII `v1.` + Nonce(12B) + Ciphertext + Tag(16B)。
 * 与文本密文共享算法与版本前缀，但文件直接存原始二进制，避免 Base64 膨胀。
 */
export async function encryptFile(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const payload = await aesEncrypt(key, plaintext);
  return concatBytes(FILE_PREFIX, payload.nonce, payload.ciphertext);
}

export async function decryptFile(key: CryptoKey, packed: Uint8Array): Promise<Uint8Array> {
  if (packed.length < FILE_PREFIX.length + NONCE_BYTES) {
    throw new Error('密文文件格式损坏');
  }
  for (let i = 0; i < FILE_PREFIX.length; i += 1) {
    if (packed[i] !== FILE_PREFIX[i]) {
      throw new Error('不支持的密文版本');
    }
  }
  const nonce = packed.slice(FILE_PREFIX.length, FILE_PREFIX.length + NONCE_BYTES);
  const ciphertext = packed.slice(FILE_PREFIX.length + NONCE_BYTES);
  return aesDecrypt(key, nonce, ciphertext);
}

/** 校验字段密文的基本格式，供后端入参校验使用。 */
export function looksLikeCipherText(value: string): boolean {
  return /^v1\.[A-Za-z0-9+/]+={0,2}$/.test(value);
}
