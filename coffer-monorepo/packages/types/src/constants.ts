/** 条目类型：与 vault_item.item_type 一一对应。 */
export const ITEM_TYPE = {
  LOGIN: '0',
  CARD: '1',
  NOTE: '2',
} as const;

export type ItemType = (typeof ITEM_TYPE)[keyof typeof ITEM_TYPE];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  '0': '登录账号',
  '1': '卡片证件',
  '2': '安全笔记',
};

export const ITEM_TYPE_SHORT_LABELS: Record<ItemType, string> = {
  '0': '账号',
  '1': '卡片',
  '2': '笔记',
};

/** 9 色色板：头像底色与文件夹颜色共用。 */
export const COLOR_PALETTE = [
  '#4C8FD1',
  '#6E8F5A',
  '#C9752F',
  '#8C6BB1',
  '#A84A55',
  '#35707B',
  '#B08A2E',
  '#5B6C8F',
  '#7A8F4C',
] as const;

/** 默认头像底色（墨绿，6 位 HEX，不带 #，与数据库存储一致）。 */
export const DEFAULT_AVATAR_COLOR = '125B4A';

/** 图片附件明文大小上限：3MB。 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** 客户端上传的密文文件上限：密文仅比明文多 28 字节，留出余量。 */
export const MAX_CIPHER_FILE_BYTES = MAX_ATTACHMENT_BYTES + 64;

/** 回收站保留天数。 */
export const TRASH_RETENTION_DAYS = 30;

/**
 * 密钥校验文：注册/改主密码时用 KEK 加密该常量存入 sys_user.remark，
 * 解锁与登录时解密比对，用于判断主密码是否正确（服务端永远看不到明文）。
 */
export const KEY_CHECK_PLAIN = 'coffer-key-check-v1';
export const KEY_CHECK_PREFIX = 'keycheck:';

/** 详情解锁的有效范围：仅当前条目。 */
export type VaultDataScope = 'login' | 'card' | 'note';

/** 账号表单数据。 */
export interface LoginItemData {
  username: string;
  password: string;
  url: string;
  note: string;
}

/** 卡片证件表单数据。 */
export interface CardItemData {
  cardNo: string;
  expiry: string;
  pin: string;
  note: string;
}

/** 安全笔记表单数据。 */
export interface NoteItemData {
  content: string;
}

export type ItemData = LoginItemData | CardItemData | NoteItemData;

export function isLoginData(data: ItemData): data is LoginItemData {
  return 'username' in data;
}

export function isCardData(data: ItemData): data is CardItemData {
  return 'cardNo' in data;
}

export function isNoteData(data: ItemData): data is NoteItemData {
  return 'content' in data;
}
