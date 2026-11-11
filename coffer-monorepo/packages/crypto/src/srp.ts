import {
  bytesToHex,
  concatBytes,
  constantTimeEqual,
  hexToBytes,
  randomBytes,
  sha256,
} from './bytes.js';
import { deriveArgon2 } from './kdf.js';

/**
 * SRP-6a（RFC 5054 2048 位群、SHA-256）。
 *
 * 注册：客户端由主密码派生 x，计算 v = g^x mod N，服务器只保存盐与 v。
 * 登录：双方交换 A / B，服务器用 v 验证 M1，客户端校验 M2。
 * 主密码与 x 永不上网络，服务器被拖库也无法反推。
 */

const N_HEX =
  'AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC3192943DB56050' +
  'A37329CBB4A099ED8193E0757767A13DD52312AB4B03310DCD7F48A9DA04FD50' +
  'E8083969EDB767B0CF6095179A163AB3661A05FBD5FAAAE82918A9962F0B93B8' +
  '55F97993EC975EEAA80D740ADBF4FF747359D041D5C33EA71D281E446B14773B' +
  'CA97B43A23FB801676BD207A436C6481F1D2B9078717461A5B9D32E688F87748' +
  '544523B524B0D57D5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6' +
  'AF874E7303CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6' +
  '94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F9E4AFF73';

export const SRP_N = BigInt(`0x${N_HEX}`);
export const SRP_G = 2n;
export const SRP_N_BYTES = N_HEX.length / 2;
export const SRP_SALT_BYTES = 16;

function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = mod(base, modulus);
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % modulus;
    }
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let current = value;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = Number(current & 0xffn);
    current >>= 8n;
  }
  return out;
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function padded(value: bigint): Uint8Array {
  return bigIntToBytes(mod(value, SRP_N), SRP_N_BYTES);
}

let kPromise: Promise<bigint> | null = null;

/** k = H(N ‖ PAD(g))，与 N 等长。 */
function getK(): Promise<bigint> {
  if (!kPromise) {
    kPromise = sha256(concatBytes(padded(SRP_N), padded(SRP_G))).then(bytesToBigInt);
  }
  return kPromise;
}

/** 生成 16 字节随机盐（Hex 32 字符）。 */
export function generateSrpSalt(): string {
  return bytesToHex(randomBytes(SRP_SALT_BYTES));
}

/**
 * x = SHA-256( Argon2id(主密码, auth_salt) ‖ 规范化邮箱 ) mod N。
 * 兼顾“慢哈希抗爆破”与“绑定账号”，盐与 KEK 的 enc_salt 分离。
 */
export async function deriveSrpX(
  password: string,
  authSaltHex: string,
  email: string,
): Promise<bigint> {
  const slow = await deriveArgon2(password, authSaltHex);
  const digest = await sha256(concatBytes(slow, new TextEncoder().encode(email.trim().toLowerCase())));
  return mod(bytesToBigInt(digest), SRP_N);
}

/** v = g^x mod N，十六进制（小写）。 */
export function computeVerifier(x: bigint): string {
  return bytesToHex(padded(modPow(SRP_G, x, SRP_N)));
}

export interface SrpClientProof {
  /** 客户端公开值 A（Hex）。 */
  A: string;
  /** 客户端证明码 M1（Hex）。 */
  M1: string;
  /** 期望服务器返回的证明码 M2（Hex）。 */
  M2: string;
}

/** 客户端第二步：已知 x 与服务器 B，生成 A / M1 / 期望的 M2。 */
export async function srpClientProof(x: bigint, bHex: string): Promise<SrpClientProof> {
  const B = bytesToBigInt(hexToBytes(bHex));
  if (B % SRP_N === 0n) {
    throw new Error('服务器公钥无效');
  }

  let a = 0n;
  while (a <= 1n) {
    a = bytesToBigInt(randomBytes(32));
  }
  const A = modPow(SRP_G, a, SRP_N);

  const u = bytesToBigInt(await sha256(concatBytes(padded(A), padded(B))));
  if (u === 0n) {
    throw new Error('会话参数异常，请重试');
  }

  const k = await getK();
  const verifier = modPow(SRP_G, x, SRP_N);
  const base = mod(B - k * verifier, SRP_N);
  const exponent = a + u * x;
  const S = modPow(base, exponent, SRP_N);

  return buildProof(A, B, S);
}

export interface SrpServerChallenge {
  /** 服务器私钥 b 的十六进制形式，仅保存在服务端会话内存。 */
  b: string;
  /** 服务器公开值 B。 */
  B: string;
}

/** 服务器第一步：由已保存的验证器生成 b 与 B。 */
export async function srpServerChallenge(verifierHex: string): Promise<SrpServerChallenge> {
  const verifier = bytesToBigInt(hexToBytes(verifierHex));
  if (verifier % SRP_N === 0n) {
    throw new Error('验证器无效');
  }

  let b = 0n;
  while (b <= 1n) {
    b = bytesToBigInt(randomBytes(32));
  }
  const k = await getK();
  const B = mod(k * verifier + modPow(SRP_G, b, SRP_N), SRP_N);
  if (B % SRP_N === 0n) {
    return srpServerChallenge(verifierHex);
  }
  return { b: bytesToHex(padded(b)), B: bytesToHex(padded(B)) };
}

export interface SrpVerifyResult {
  ok: boolean;
  /** 验证通过时返回的服务器证明码 M2。 */
  M2: string;
}

/** 服务器第二步：验证客户端 M1，并生成 M2。 */
export async function srpServerVerify(params: {
  bHex: string;
  BHex: string;
  verifierHex: string;
  AHex: string;
  M1Hex: string;
}): Promise<SrpVerifyResult> {
  const b = bytesToBigInt(hexToBytes(params.bHex));
  const B = bytesToBigInt(hexToBytes(params.BHex));
  const verifier = bytesToBigInt(hexToBytes(params.verifierHex));
  const A = bytesToBigInt(hexToBytes(params.AHex));
  const clientM1 = params.M1Hex.trim().toLowerCase();

  if (A % SRP_N === 0n) {
    return { ok: false, M2: '' };
  }

  const u = bytesToBigInt(await sha256(concatBytes(padded(A), padded(B))));
  if (u === 0n) {
    return { ok: false, M2: '' };
  }

  const S = modPow(mod(A * modPow(verifier, u, SRP_N), SRP_N), b, SRP_N);
  const K = await sha256(padded(S));
  const Abytes = padded(A);
  const Bbytes = padded(B);
  const computedM1 = bytesToHex(await sha256(concatBytes(Abytes, Bbytes, K)));
  const M2 = bytesToHex(await sha256(concatBytes(Abytes, hexToBytes(clientM1), K)));

  return { ok: constantTimeEqual(computedM1, clientM1), M2 };
}

/** 客户端 / 服务器共用的证明码构造，保证两侧算法完全一致。 */
async function buildProof(A: bigint, B: bigint, S: bigint): Promise<SrpClientProof> {
  const Abytes = padded(A);
  const Bbytes = padded(B);
  const K = await sha256(padded(S));
  const M1 = bytesToHex(await sha256(concatBytes(Abytes, Bbytes, K)));
  const M2 = bytesToHex(await sha256(concatBytes(Abytes, hexToBytes(M1), K)));
  return { A: bytesToHex(Abytes), M1, M2 };
}
