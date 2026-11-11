import type { ItemType } from './constants.js';

/** 当前用户资料。cipher 字段均为客户端密文，服务端不持有密钥。 */
export interface UserProfile {
  userId: number;
  email: string;
  nickname: string;
  avatar: string;
  avatarColor: string;
  encSalt: string;
  keyVersion: number;
  keyCheckCipher: string;
  createTime: string;
  updateTime: string | null;
}

export interface FolderDto {
  folderId: number;
  folderNameCipher: string;
  folderColor: string;
  sortNo: number;
  createTime: string;
  updateTime: string | null;
}

export interface AttachmentDto {
  attachId: number;
  itemId: number;
  fileNameCipher: string;
  mimeType: string;
  fileSize: number;
  fileSha256: string;
  keyVersion: number;
  createTime: string;
}

export interface ItemDto {
  itemId: number;
  folderId: number | null;
  itemType: ItemType;
  nameCipher: string;
  dataCipher: string;
  favFlag: '0' | '1';
  keyVersion: number;
  deletedTime: string | null;
  createTime: string;
  updateTime: string | null;
  attachments: AttachmentDto[];
}

export interface RegisterInput {
  email: string;
  authSalt: string;
  authVerifier: string;
  encSalt: string;
  keyCheckCipher: string;
  nickname?: string;
}

export interface SrpChallengeInput {
  email: string;
}

export interface SrpChallengeResult {
  srpSessionId: string;
  salt: string;
  B: string;
  /** 服务器允许客户端使用的最大会话时长（秒），便于客户端提示。 */
  expiresIn: number;
}

export interface SrpVerifyInput {
  srpSessionId: string;
  A: string;
  M1: string;
}

export interface LoginResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  /** 服务端证明码：客户端应校验，证明服务器知道验证器。 */
  M2: string;
  profile: UserProfile;
}

export interface RegisterResult {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  profile: UserProfile;
}

export interface TokenPayload {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

export interface CreateItemInput {
  folderId?: number | null;
  itemType: ItemType;
  nameCipher: string;
  dataCipher: string;
  favFlag?: '0' | '1';
  keyVersion: number;
}

export interface UpdateItemInput {
  folderId?: number | null;
  nameCipher: string;
  dataCipher: string;
  keyVersion: number;
}

export interface CreateFolderInput {
  folderNameCipher: string;
  folderColor: string;
  sortNo?: number;
}

export interface UpdateFolderInput {
  folderNameCipher?: string;
  folderColor?: string;
  sortNo?: number;
}

export interface RekeyItemInput {
  itemId: number;
  nameCipher: string;
  dataCipher: string;
  keyVersion: number;
}

export interface RekeyFolderInput {
  folderId: number;
  folderNameCipher: string;
}

export interface RekeyAttachmentInput {
  attachId: number;
  fileNameCipher: string;
  keyVersion: number;
}

export interface RekeyInput {
  authSalt: string;
  authVerifier: string;
  encSalt: string;
  keyVersion: number;
  keyCheckCipher: string;
  folders: RekeyFolderInput[];
  items: RekeyItemInput[];
  attachments: RekeyAttachmentInput[];
}

export type { ApiResponse, PageResult } from './common.js';
