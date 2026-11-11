import type { UserProfile } from '@coffer/types';

/**
 * 会话存储策略：
 * - JWT 放 sessionStorage，关闭标签页即失效；
 * - 用户资料只存在内存（页面刷新后重新向服务端拉取）；
 * - KEK 只存在内存，绝不写入 localStorage / sessionStorage / Cookie。
 *   页面刷新或点击“锁定保险库”后必须重新输入主密码。
 */
const TOKEN_KEY = 'coffer.token';

let memoryToken: string | null = null;
let memoryProfile: UserProfile | null = null;
let memoryKek: CryptoKey | null = null;

function readStoredToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  if (memoryToken) {
    return memoryToken;
  }
  memoryToken = readStoredToken();
  return memoryToken;
}

export function setToken(token: string): void {
  memoryToken = token;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // 隐私模式下 sessionStorage 可能不可用，退化为仅内存会话
    }
  }
}

export function clearToken(): void {
  memoryToken = null;
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  }
}

export function getProfile(): UserProfile | null {
  return memoryProfile;
}

export function setProfile(profile: UserProfile | null): void {
  memoryProfile = profile;
}

export function getKek(): CryptoKey | null {
  return memoryKek;
}

export function setKek(kek: CryptoKey | null): void {
  memoryKek = kek;
}

/** 进入登录会话：保存 token、资料与刚派生出的 KEK。 */
export function startSession(token: string, profile: UserProfile, kek: CryptoKey): void {
  setToken(token);
  setProfile(profile);
  setKek(kek);
}

/** 锁定保险库：仅丢弃内存中的密钥，token 仍保留，可免邮箱重新输入主密码。 */
export function lockSession(): void {
  setKek(null);
}

/** 退出登录：token、资料、密钥全部清除。 */
export function clearSession(): void {
  clearToken();
  setProfile(null);
  setKek(null);
}
