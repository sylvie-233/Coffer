'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  decryptJson,
  decryptText,
  encryptFile,
  encryptJson,
  encryptText,
} from '@coffer/crypto';
import {
  MAX_ATTACHMENT_BYTES,
  type AttachmentDto,
  type FolderDto,
  type ItemDto,
  type RekeyAttachmentInput,
  type RekeyFolderInput,
  type RekeyItemInput,
  type UserProfile,
} from '@coffer/types';

import { ApiError, attachmentApi, authApi, folderApi, itemApi, userApi } from '@coffer/vault-core';
import { getKek, setKek, setProfile as rememberProfile } from '@coffer/vault-core';
import { toast } from '@coffer/ui';
import type { AttachmentView, FolderView, ItemDraft, ItemView } from '@coffer/vault-core';
import {
  buildRekeyKeys,
  decryptBinary,
  decryptFolder,
  decryptItem,
  deriveKek,
  encryptAttachment,
  encryptFolderName,
  encryptItem,
  keyCheckCipher,
  verifyKeyCheck,
} from '@coffer/vault-core';

export interface VaultContextValue {
  profile: UserProfile;
  avatarUrl: string | null;
  folders: FolderView[];
  items: ItemView[];
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  createItem: (draft: ItemDraft) => Promise<ItemView>;
  updateItem: (itemId: number, draft: ItemDraft) => Promise<ItemView>;
  toggleFavorite: (item: ItemView) => Promise<void>;
  removeItem: (itemId: number) => Promise<void>;
  restoreItem: (itemId: number) => Promise<ItemView>;
  createFolder: (name: string, color: string) => Promise<FolderView>;
  updateFolder: (
    folderId: number,
    input: { name?: string; color?: string },
  ) => Promise<FolderView>;
  deleteFolder: (folderId: number) => Promise<void>;
  uploadAttachment: (itemId: number, file: File) => Promise<AttachmentView>;
  removeAttachment: (attachment: AttachmentView) => Promise<void>;
  loadAttachmentUrl: (attachment: AttachmentView) => Promise<string>;
  updateProfile: (input: {
    nickname?: string;
    avatarColor?: string;
  }) => Promise<UserProfile>;
  uploadAvatar: (file: File) => Promise<UserProfile>;
  removeAvatar: () => Promise<UserProfile>;
  changeMasterPassword: (
    oldPassword: string,
    newPassword: string,
    onProgress: (message: string) => void,
  ) => Promise<UserProfile>;
  lock: () => void;
  logout: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (!value) {
    throw new Error('useVault 必须在 VaultProvider 内使用');
  }
  return value;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || '操作失败';
  }
  return '操作失败，请稍后重试';
}

function requiredKek(): CryptoKey {
  const kek = getKek();
  if (!kek) {
    throw new Error('保险库已锁定，请重新解锁');
  }
  return kek;
}

function blobOf(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type });
}

/** 头像未记录 MIME，用文件头猜测常见图片类型，保证浏览器能正确解码。 */
function sniffImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

async function decryptAttachmentView(
  kek: CryptoKey,
  dto: AttachmentDto,
): Promise<AttachmentView> {
  let name = '';
  let broken = false;
  try {
    name = await decryptText(kek, dto.fileNameCipher);
  } catch {
    name = `附件 #${dto.attachId}`;
    broken = true;
  }
  return {
    id: dto.attachId,
    itemId: dto.itemId,
    name,
    mimeType: dto.mimeType,
    size: dto.fileSize,
    keyVersion: dto.keyVersion,
    createTime: dto.createTime,
    broken,
  };
}

export interface VaultProviderProps {
  profile: UserProfile;
  onLock: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function VaultProvider({ profile: initialProfile, onLock, onLogout, children }: VaultProviderProps) {
  const [profile, setProfileState] = useState<UserProfile>(initialProfile);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderView[]>([]);
  const [items, setItems] = useState<ItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const attachmentUrls = useRef<Map<number, string>>(new Map());

  const applyItems = useCallback((updater: (prev: ItemView[]) => ItemView[]) => {
    setItems((prev) => updater(prev));
  }, []);

  const applyProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
    rememberProfile(next);
  }, []);

  const revokeAttachmentUrls = useCallback(() => {
    for (const url of attachmentUrls.current.values()) {
      URL.revokeObjectURL(url);
    }
    attachmentUrls.current.clear();
  }, []);

  const refresh = useCallback(async () => {
    const kek = getKek();
    if (!kek) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [folderDtos, itemDtos, latestProfile] = await Promise.all([
        folderApi.list(),
        itemApi.list({ includeDeleted: true }),
        authApi.me(),
      ]);
      const [folderViews, itemViews] = await Promise.all([
        Promise.all(folderDtos.map((dto: FolderDto) => decryptFolder(kek, dto))),
        Promise.all(itemDtos.map((dto: ItemDto) => decryptItem(kek, dto))),
      ]);
      setFolders(folderViews);
      applyItems(() => itemViews);
      applyProfile(latestProfile);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        toast('登录状态已失效，请重新登录');
        onLogout();
        return;
      }
      setLoadError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }, [applyItems, applyProfile, onLogout]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 头像需在浏览器内解密后显示；对象 URL 在密钥或头像变更时释放
  useEffect(() => {
    const kek = getKek();
    if (!kek || !profile.avatar) {
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const bytes = await userApi.getAvatar();
        if (!bytes) {
          return;
        }
        const plain = await decryptBinary(kek, bytes);
        if (cancelled) {
          return;
        }
        created = URL.createObjectURL(blobOf(plain, sniffImageMime(plain)));
        setAvatarUrl(created);
      } catch {
        if (!cancelled) {
          setAvatarUrl(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [profile.avatar, profile.keyVersion]);

  useEffect(() => {
    const cache = attachmentUrls.current;
    return () => {
      for (const url of cache.values()) {
        URL.revokeObjectURL(url);
      }
      cache.clear();
    };
  }, []);

  /* ============================ 凭证 ============================ */

  const createItem = useCallback(
    async (draft: ItemDraft): Promise<ItemView> => {
      const kek = requiredKek();
      const { nameCipher, dataCipher } = await encryptItem(kek, draft);
      const dto = await itemApi.create({
        folderId: draft.folderId,
        itemType: draft.type,
        nameCipher,
        dataCipher,
        keyVersion: profile.keyVersion,
      });
      const view = await decryptItem(kek, dto);
      applyItems((prev) => [view, ...prev]);
      toast('凭证已保存');
      return view;
    },
    [applyItems, profile.keyVersion],
  );

  const updateItem = useCallback(
    async (itemId: number, draft: ItemDraft): Promise<ItemView> => {
      const kek = requiredKek();
      const { nameCipher, dataCipher } = await encryptItem(kek, draft);
      const dto = await itemApi.update(itemId, {
        folderId: draft.folderId,
        nameCipher,
        dataCipher,
        keyVersion: profile.keyVersion,
      });
      const view = await decryptItem(kek, dto);
      applyItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...view, attachments: item.attachments } : item,
        ),
      );
      toast('凭证已更新');
      return view;
    },
    [applyItems, profile.keyVersion],
  );

  const toggleFavorite = useCallback(
    async (item: ItemView): Promise<void> => {
      const next = item.fav ? '0' : '1';
      await itemApi.favorite(item.id, next);
      applyItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, fav: next === '1' } : entry)),
      );
      toast(next === '1' ? '已加入收藏' : '已取消收藏');
    },
    [applyItems],
  );

  const removeItem = useCallback(
    async (itemId: number): Promise<void> => {
      await itemApi.remove(itemId);
      const deletedTime = new Date().toISOString();
      applyItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, deletedTime } : item)),
      );
      toast('凭证已移入回收站，保留 30 天');
    },
    [applyItems],
  );

  const restoreItem = useCallback(
    async (itemId: number): Promise<ItemView> => {
      const kek = requiredKek();
      const dto = await itemApi.restore(itemId);
      const view = await decryptItem(kek, dto);
      applyItems((prev) =>
        prev.map((item) => (item.id === itemId ? view : item)),
      );
      toast('凭证已恢复');
      return view;
    },
    [applyItems],
  );

  /* ============================ 文件夹 ============================ */

  const createFolder = useCallback(
    async (name: string, color: string): Promise<FolderView> => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('请输入文件夹名称');
      }
      if (Array.from(trimmed).length > 12) {
        throw new Error('文件夹名称最多 12 个字');
      }
      if (folders.some((folder) => folder.name === trimmed)) {
        throw new Error('已有同名文件夹');
      }
      const kek = requiredKek();
      const folderNameCipher = await encryptFolderName(kek, trimmed);
      const dto = await folderApi.create({
        folderNameCipher,
        folderColor: color.replace(/^#/, ''),
      });
      const view = await decryptFolder(kek, dto);
      setFolders((prev) => [...prev, view].sort((a, b) => a.sortNo - b.sortNo || a.id - b.id));
      toast(`已新建文件夹「${trimmed}」`);
      return view;
    },
    [folders],
  );

  const updateFolder = useCallback(
    async (
      folderId: number,
      input: { name?: string; color?: string },
    ): Promise<FolderView> => {
      const payload: { folderNameCipher?: string; folderColor?: string } = {};
      const kek = requiredKek();
      if (input.name !== undefined) {
        const trimmed = input.name.trim();
        if (!trimmed) {
          throw new Error('请输入文件夹名称');
        }
        if (Array.from(trimmed).length > 12) {
          throw new Error('文件夹名称最多 12 个字');
        }
        if (
          folders.some((folder) => folder.id !== folderId && folder.name === trimmed)
        ) {
          throw new Error('已有同名文件夹');
        }
        payload.folderNameCipher = await encryptFolderName(kek, trimmed);
      }
      if (input.color !== undefined) {
        payload.folderColor = input.color.replace(/^#/, '');
      }
      if (Object.keys(payload).length === 0) {
        throw new Error('没有需要更新的内容');
      }
      const dto = await folderApi.update(folderId, payload);
      const view = await decryptFolder(kek, dto);
      setFolders((prev) =>
        prev.map((folder) => (folder.id === folderId ? view : folder)),
      );
      toast('文件夹已更新');
      return view;
    },
    [folders],
  );

  const deleteFolder = useCallback(
    async (folderId: number): Promise<void> => {
      await folderApi.remove(folderId);
      setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
      // 服务端会把该文件夹中的凭证移到“未分类”，本地同步该结果
      applyItems((prev) =>
        prev.map((item) =>
          item.folderId === folderId ? { ...item, folderId: null } : item,
        ),
      );
      toast('文件夹已删除，其中凭证已移入未分类');
    },
    [applyItems],
  );

  /* ============================ 附件 ============================ */

  const loadAttachmentUrl = useCallback(async (attachment: AttachmentView): Promise<string> => {
    const cached = attachmentUrls.current.get(attachment.id);
    if (cached) {
      return cached;
    }
    const kek = requiredKek();
    const bytes = await attachmentApi.content(attachment.id);
    if (!bytes) {
      throw new Error('附件内容不存在或已被删除');
    }
    const plain = await decryptBinary(kek, bytes);
    const url = URL.createObjectURL(blobOf(plain, attachment.mimeType || 'image/*'));
    attachmentUrls.current.set(attachment.id, url);
    return url;
  }, []);

  const uploadAttachment = useCallback(
    async (itemId: number, file: File): Promise<AttachmentView> => {
      if (!file.type.startsWith('image/')) {
        throw new Error('目前仅支持图片附件');
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('图片不能超过 3MB');
      }
      const kek = requiredKek();
      const { bytes, fileNameCipher } = await encryptAttachment(kek, file);
      const dto = await attachmentApi.upload(
        itemId,
        {
          fileNameCipher,
          mimeType: file.type || 'application/octet-stream',
          keyVersion: profile.keyVersion,
        },
        bytes,
      );
      const view = await decryptAttachmentView(kek, dto);
      applyItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, attachments: [...item.attachments, view] }
            : item,
        ),
      );
      toast('图片已加密上传');
      return view;
    },
    [applyItems, profile.keyVersion],
  );

  const removeAttachment = useCallback(
    async (attachment: AttachmentView): Promise<void> => {
      await attachmentApi.remove(attachment.id);
      const url = attachmentUrls.current.get(attachment.id);
      if (url) {
        URL.revokeObjectURL(url);
        attachmentUrls.current.delete(attachment.id);
      }
      applyItems((prev) =>
        prev.map((item) =>
          item.id === attachment.itemId
            ? {
                ...item,
                attachments: item.attachments.filter((entry) => entry.id !== attachment.id),
              }
            : item,
        ),
      );
      toast('附件已删除');
    },
    [applyItems],
  );

  /* ============================ 个人资料 ============================ */

  const updateProfile = useCallback(
    async (input: { nickname?: string; avatarColor?: string }): Promise<UserProfile> => {
      const next = await userApi.updateProfile(input);
      applyProfile(next);
      toast('个人资料已保存');
      return next;
    },
    [applyProfile],
  );

  const uploadAvatar = useCallback(
    async (file: File): Promise<UserProfile> => {
      if (!file.type.startsWith('image/')) {
        throw new Error('请选择图片文件');
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new Error('图片不能超过 3MB');
      }
      const kek = requiredKek();
      const plain = new Uint8Array(await file.arrayBuffer());
      const cipher = await encryptFile(kek, plain);
      const next = await userApi.uploadAvatar(cipher);
      applyProfile(next);
      toast('头像已更新');
      return next;
    },
    [applyProfile],
  );

  const removeAvatar = useCallback(async (): Promise<UserProfile> => {
    const next = await userApi.deleteAvatar();
    applyProfile(next);
    toast('已恢复文字头像');
    return next;
  }, [applyProfile]);

  /* ============================ 修改主密码 ============================ */

  const changeMasterPassword = useCallback(
    async (
      oldPassword: string,
      newPassword: string,
      onProgress: (message: string) => void,
    ): Promise<UserProfile> => {
      const oldKek = requiredKek();
      const oldCheck = await deriveKek(oldPassword, profile.encSalt);
      if (!(await verifyKeyCheck(oldCheck, profile.keyCheckCipher))) {
        throw new Error('当前主密码错误');
      }

      const newKeys = await buildRekeyKeys(newPassword, profile.email);
      const newKek = await deriveKek(newPassword, newKeys.encSalt);
      const newCheck = await keyCheckCipher(newKek);
      const newVersion = profile.keyVersion + 1;

      onProgress('正在同步全部密文…');
      const [folderDtos, itemDtos, latestProfile] = await Promise.all([
        folderApi.list(),
        itemApi.list({ includeDeleted: true }),
        authApi.me(),
      ]);
      if (latestProfile.keyVersion !== profile.keyVersion) {
        throw new Error('云端密钥版本已变化，请刷新后重试');
      }

      onProgress('正在重新加密文件夹…');
      const foldersRekey: RekeyFolderInput[] = [];
      for (const dto of folderDtos) {
        const name = await decryptText(oldKek, dto.folderNameCipher);
        const folderNameCipher = await encryptText(newKek, name);
        foldersRekey.push({ folderId: dto.folderId, folderNameCipher });
      }

      onProgress('正在重新加密凭证…');
      const itemsRekey: RekeyItemInput[] = [];
      for (const dto of itemDtos) {
        const name = await decryptText(oldKek, dto.nameCipher);
        const data = await decryptJson<unknown>(oldKek, dto.dataCipher);
        itemsRekey.push({
          itemId: dto.itemId,
          nameCipher: await encryptText(newKek, name),
          dataCipher: await encryptJson(newKek, data),
          keyVersion: newVersion,
        });
      }

      const attachments = itemDtos.flatMap((dto) => dto.attachments);
      onProgress('正在重新加密图片附件…');
      const attachmentsRekey: RekeyAttachmentInput[] = [];
      const attachmentUploads: Array<{ attachId: number; bytes: Uint8Array }> = [];
      for (const dto of attachments) {
        const fileName = await decryptText(oldKek, dto.fileNameCipher);
        const content = await attachmentApi.content(dto.attachId);
        if (!content) {
          throw new Error(`附件 #${dto.attachId} 内容缺失，无法完成重加密`);
        }
        const plain = await decryptBinary(oldKek, content);
        attachmentsRekey.push({
          attachId: dto.attachId,
          fileNameCipher: await encryptText(newKek, fileName),
          keyVersion: newVersion,
        });
        attachmentUploads.push({
          attachId: dto.attachId,
          bytes: await encryptFile(newKek, plain),
        });
      }

      // 头像不参与 rekey 数组，单独用新密钥重新加密
      let avatarCipher: Uint8Array | null = null;
      if (profile.avatar) {
        const currentAvatar = await userApi.getAvatar();
        if (!currentAvatar) {
          throw new Error('当前头像内容缺失，请先在个人资料中移除头像后重试');
        }
        try {
          avatarCipher = await encryptFile(newKek, await decryptBinary(oldKek, currentAvatar));
        } catch {
          throw new Error('当前头像无法解密，请先在个人资料中移除头像后重试');
        }
      }

      onProgress('正在上传重新加密的附件…');
      for (const upload of attachmentUploads) {
        await attachmentApi.replaceContent(upload.attachId, upload.bytes, newVersion);
      }

      onProgress('正在更新密钥材料…');
      const result = await authApi.rekey({
        authSalt: newKeys.authSalt,
        authVerifier: newKeys.authVerifier,
        encSalt: newKeys.encSalt,
        keyVersion: newVersion,
        keyCheckCipher: newCheck,
        folders: foldersRekey,
        items: itemsRekey,
        attachments: attachmentsRekey,
      });

      setKek(newKek);
      // 附件内容已用新密钥覆盖，旧对象 URL 必须失效，刷新后重新拉取
      revokeAttachmentUrls();

      let finalProfile = result;
      if (avatarCipher) {
        try {
          finalProfile = await userApi.uploadAvatar(avatarCipher);
        } catch {
          toast('主密码已更新，但头像未能重新上传，请重新设置头像');
        }
      }
      applyProfile(finalProfile);

      onProgress('正在刷新本地数据…');
      await refresh();
      toast('主密码已更新，全部数据已重新加密');
      return finalProfile;
    },
    [applyProfile, profile, refresh, revokeAttachmentUrls],
  );

  /* ============================ 锁屏 / 退出 ============================ */

  const lock = useCallback(() => {
    setKek(null);
    onLock();
  }, [onLock]);

  const logout = useCallback(() => {
    onLogout();
  }, [onLogout]);

  const value = useMemo<VaultContextValue>(
    () => ({
      profile,
      avatarUrl,
      folders,
      items,
      loading,
      loadError,
      refresh,
      createItem,
      updateItem,
      toggleFavorite,
      removeItem,
      restoreItem,
      createFolder,
      updateFolder,
      deleteFolder,
      uploadAttachment,
      removeAttachment,
      loadAttachmentUrl,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      changeMasterPassword,
      lock,
      logout,
    }),
    [
      profile,
      avatarUrl,
      folders,
      items,
      loading,
      loadError,
      refresh,
      createItem,
      updateItem,
      toggleFavorite,
      removeItem,
      restoreItem,
      createFolder,
      updateFolder,
      deleteFolder,
      uploadAttachment,
      removeAttachment,
      loadAttachmentUrl,
      updateProfile,
      uploadAvatar,
      removeAvatar,
      changeMasterPassword,
      lock,
      logout,
    ],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
