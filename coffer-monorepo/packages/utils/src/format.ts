import {
  type ItemData,
  type ItemType,
  ITEM_TYPE,
  isCardData,
  isLoginData,
  isNoteData,
} from '@coffer/types';

/** 仅保留日期部分：2026-11-07 12:00:00 → 2026-11-07。 */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  return value.slice(0, 10);
}

/** 卡号脱敏：只显示尾号 4 位。 */
export function maskCardNumber(cardNo: string): string {
  const compact = cardNo.replace(/\s+/g, '');
  if (compact.length <= 4) {
    return compact;
  }
  return `•••• ${compact.slice(-4)}`;
}

/** 文字头像：取昵称前两个字符（中文按字符而非字节）。 */
export function avatarInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'C';
  }
  const chars = Array.from(trimmed);
  return chars.slice(0, 2).join('').toUpperCase();
}

/** 列表副标题：用户名 / 卡号尾号 / 安全笔记。 */
export function itemSubtitle(type: ItemType, data: ItemData | null): string {
  if (!data) {
    return '密文校验失败';
  }
  if (type === ITEM_TYPE.LOGIN && isLoginData(data)) {
    return data.username || '登录账号';
  }
  if (type === ITEM_TYPE.CARD && isCardData(data)) {
    return data.cardNo ? maskCardNumber(data.cardNo) : '卡片证件';
  }
  if (type === ITEM_TYPE.NOTE && isNoteData(data)) {
    return '安全笔记';
  }
  return '';
}

/** 搜索命中范围：名称 / 用户名 / 卡号 / 备注。 */
export function matchesQuery(name: string, type: ItemType, data: ItemData | null, query: string): boolean {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return true;
  }
  if (name.toLowerCase().includes(keyword)) {
    return true;
  }
  if (!data) {
    return false;
  }
  if (type === ITEM_TYPE.LOGIN && isLoginData(data)) {
    return [data.username, data.url, data.note]
      .join('\n')
      .toLowerCase()
      .includes(keyword);
  }
  if (type === ITEM_TYPE.CARD && isCardData(data)) {
    return [data.cardNo, data.expiry, data.note]
      .join('\n')
      .toLowerCase()
      .includes(keyword);
  }
  if (type === ITEM_TYPE.NOTE && isNoteData(data)) {
    return data.content.toLowerCase().includes(keyword);
  }
  return false;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 轻量 className 合并，避免引入额外依赖。 */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
