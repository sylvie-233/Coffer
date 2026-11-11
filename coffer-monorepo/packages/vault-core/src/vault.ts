import {
  constantTimeEqual,
  decryptFile,
  decryptJson,
  decryptText,
  deriveKekRaw,
  deriveSrpX,
  encryptFile,
  encryptJson,
  encryptText,
  importKek,
  generateSrpSalt,
  computeVerifier,
} from '@coffer/crypto';
import {
  KEY_CHECK_PLAIN,
  type AttachmentDto,
  type FolderDto,
  type ItemData,
  type ItemDto,
  type ItemType,
  type UserProfile,
  isCardData,
  isLoginData,
  isNoteData,
} from '@coffer/types';

import type { AttachmentView, FolderView, ItemDraft, ItemView } from './types';

/** Argon2id 派生 KEK 并导入为不可导出的 AES-GCM 密钥。 */
export async function deriveKek(password: string, encSaltHex: string): Promise<CryptoKey> {
  const raw = await deriveKekRaw(password, encSaltHex);
  return importKek(raw);
}

/** 用 KEK 校验文验证主密码是否正确（服务端始终看不到明文）。 */
export async function verifyKeyCheck(
  kek: CryptoKey,
  keyCheckCipher: string,
): Promise<boolean> {
  try {
    const plain = await decryptText(kek, keyCheckCipher);
    return constantTimeEqual(plain, KEY_CHECK_PLAIN);
  } catch {
    return false;
  }
}

/** 输入主密码，派生 KEK 并验证；密码错误返回 null。 */
export async function unlockWithPassword(
  password: string,
  profile: UserProfile,
): Promise<CryptoKey | null> {
  const kek = await deriveKek(password, profile.encSalt);
  const ok = await verifyKeyCheck(kek, profile.keyCheckCipher);
  return ok ? kek : null;
}

/** 注册 / 改密码时生成的密钥校验文。 */
export function keyCheckCipher(kek: CryptoKey): Promise<string> {
  return encryptText(kek, KEY_CHECK_PLAIN);
}

/** 注册材料：auth_salt / enc_salt / SRP 验证器。 */
export interface RegistrationKeys {
  authSalt: string;
  encSalt: string;
  authVerifier: string;
}

export async function buildRegistrationKeys(
  password: string,
  email: string,
): Promise<RegistrationKeys> {
  const authSalt = generateSrpSalt();
  const encSalt = generateSrpSalt();
  const x = await deriveSrpX(password, authSalt, email);
  return { authSalt, encSalt, authVerifier: computeVerifier(x) };
}

/** 改密码材料：新的双盐与新的 SRP 验证器。 */
export async function buildRekeyKeys(
  password: string,
  email: string,
): Promise<RegistrationKeys> {
  return buildRegistrationKeys(password, email);
}

function fallbackName(type: ItemType, broken: boolean): string {
  if (broken) {
    return '无法解密的凭证';
  }
  return type === '0' ? '未命名账号' : type === '1' ? '未命名卡片' : '未命名笔记';
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** 按条目类型校验并收窄解密出的 JSON，避免脏数据直接进入界面。 */
function normalizeData(type: ItemType, value: unknown): ItemData | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (type === '0') {
    if (!isLoginData(record as unknown as ItemData)) {
      return null;
    }
    return {
      username: asText(record['username']),
      password: asText(record['password']),
      url: asText(record['url']),
      note: asText(record['note']),
    };
  }
  if (type === '1') {
    if (!isCardData(record as unknown as ItemData)) {
      return null;
    }
    return {
      cardNo: asText(record['cardNo']),
      expiry: asText(record['expiry']),
      pin: asText(record['pin']),
      note: asText(record['note']),
    };
  }
  if (!isNoteData(record as unknown as ItemData)) {
    return null;
  }
  return { content: asText(record['content']) };
}

async function decryptAttachmentView(
  kek: CryptoKey,
  dto: AttachmentDto,
): Promise<AttachmentView> {
  try {
    const name = await decryptText(kek, dto.fileNameCipher);
    return {
      id: dto.attachId,
      itemId: dto.itemId,
      name,
      mimeType: dto.mimeType,
      size: dto.fileSize,
      keyVersion: dto.keyVersion,
      createTime: dto.createTime,
      broken: false,
    };
  } catch {
    return {
      id: dto.attachId,
      itemId: dto.itemId,
      name: `附件 #${dto.attachId}`,
      mimeType: dto.mimeType,
      size: dto.fileSize,
      keyVersion: dto.keyVersion,
      createTime: dto.createTime,
      broken: true,
    };
  }
}

/** 解密单条凭证及其附件文件名。任一字段失败都不抛出，供列表降级展示。 */
export async function decryptItem(kek: CryptoKey, dto: ItemDto): Promise<ItemView> {
  let name = '';
  let nameBroken = false;
  try {
    name = await decryptText(kek, dto.nameCipher);
  } catch {
    name = fallbackName(dto.itemType, true);
    nameBroken = true;
  }

  let data: ItemData | null = null;
  let dataBroken = false;
  try {
    const parsed: unknown = await decryptJson(kek, dto.dataCipher);
    data = normalizeData(dto.itemType, parsed);
    if (!data) {
      dataBroken = true;
    }
  } catch {
    dataBroken = true;
  }

  const attachments = await Promise.all(
    dto.attachments.map((attachment) => decryptAttachmentView(kek, attachment)),
  );
  const attachmentsBroken = attachments.some((attachment) => attachment.broken);

  return {
    id: dto.itemId,
    folderId: dto.folderId,
    type: dto.itemType,
    name: name || fallbackName(dto.itemType, nameBroken),
    data,
    fav: dto.favFlag === '1',
    keyVersion: dto.keyVersion,
    deletedTime: dto.deletedTime,
    createTime: dto.createTime,
    updateTime: dto.updateTime,
    attachments,
    broken: nameBroken || dataBroken || attachmentsBroken,
  };
}

export async function decryptFolder(kek: CryptoKey, dto: FolderDto): Promise<FolderView> {
  let name = '';
  let broken = false;
  try {
    name = await decryptText(kek, dto.folderNameCipher);
  } catch {
    name = `文件夹 #${dto.folderId}`;
    broken = true;
  }
  return {
    id: dto.folderId,
    name,
    color: `#${(dto.folderColor || 'B08A2E').replace(/^#/, '')}`,
    sortNo: dto.sortNo,
    createTime: dto.createTime,
    updateTime: dto.updateTime,
    broken,
  };
}

/** 加密表单内容，返回服务端需要的两个密文字段。 */
export async function encryptItem(
  kek: CryptoKey,
  draft: ItemDraft,
): Promise<{ nameCipher: string; dataCipher: string }> {
  const [nameCipher, dataCipher] = await Promise.all([
    encryptText(kek, draft.name.trim()),
    encryptJson(kek, draft.data),
  ]);
  return { nameCipher, dataCipher };
}

export function encryptFolderName(kek: CryptoKey, name: string): Promise<string> {
  return encryptText(kek, name.trim());
}

/** 加密附件文件与文件名。 */
export async function encryptAttachment(
  kek: CryptoKey,
  file: File,
): Promise<{ bytes: Uint8Array; fileNameCipher: string }> {
  const plain = new Uint8Array(await file.arrayBuffer());
  const [bytes, fileNameCipher] = await Promise.all([
    encryptFile(kek, plain),
    encryptText(kek, file.name || '图片附件'),
  ]);
  return { bytes, fileNameCipher };
}

/** 附件 / 头像解密：失败抛出，由调用方展示提示。 */
export function decryptBinary(kek: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  return decryptFile(kek, bytes);
}
