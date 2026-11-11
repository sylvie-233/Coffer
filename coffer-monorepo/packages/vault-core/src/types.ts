import type { ItemData, ItemType, UserProfile } from '@coffer/types';

/** 文件夹（名称已由浏览器解密）。 */
export interface FolderView {
  id: number;
  name: string;
  color: string;
  sortNo: number;
  createTime: string;
  updateTime: string | null;
  broken: boolean;
}

/** 附件（文件名已解密，内容按需解密）。 */
export interface AttachmentView {
  id: number;
  itemId: number;
  name: string;
  mimeType: string;
  /** 密文字节数（用于展示）。 */
  size: number;
  keyVersion: number;
  createTime: string;
  broken: boolean;
}

/** 凭证条目（名称与数据均已解密，仅存在于浏览器内存）。 */
export interface ItemView {
  id: number;
  folderId: number | null;
  type: ItemType;
  name: string;
  data: ItemData | null;
  fav: boolean;
  keyVersion: number;
  deletedTime: string | null;
  createTime: string;
  updateTime: string | null;
  attachments: AttachmentView[];
  /** 任一密文无法解密时为 true（例如历史密钥版本残留）。 */
  broken: boolean;
}

/** 由表单提交的条目内容（尚未加密）。 */
export interface ItemDraft {
  name: string;
  type: ItemType;
  data: ItemData;
  folderId: number | null;
}

export interface ProfileState {
  profile: UserProfile;
  avatarUrl: string | null;
}
