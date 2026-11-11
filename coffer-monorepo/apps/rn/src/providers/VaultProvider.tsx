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
import type { AttachmentView, FolderView, ItemDraft, ItemView } from '@coffer/vault-core';
import {
  buildRekeyKeys,
  decryptBinary,
  decryptFolder,
  decryptItem,
  deriveKek,
  encryptAttachmentBytes,
  encryptFolderName,
  encryptItem,
  keyCheckCipher,
  verifyKeyCheck,
} from '@coffer/vault-core';

import { toast } from '../components/Toast';
import { deleteTempFile, readImageBytes, sniffImageMime, writeTempBinary, writeTempImage } from '../lib/media';
import type { PickedImage } from '../lib/media';

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
  uploadAttachment: (itemId: number, image: PickedImage) => Promise<AttachmentView>;
  removeAttachment: (attachment: AttachmentView) => Promise<void>;
  loadAttachmentUrl: (attachment: AttachmentView) => Promise<string>;
  updateProfile: (input: { nickname?: string; avatarColor?: string }) => Promise<UserProfile>;
  uploadAvatar: (image: PickedImage) => Promise<UserProfile>;
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

/** 已覆盖到服务端的附件重加密记录，用于失败回滚。 */
interface ReplacedAttachment {
  attachId: number;
  oldKeyVersion: number;
  oldBytes: Uint8Array;
  newBytes: Uint8Array;
}

type RekeyStatus =
  | { state: 'committed'; profile: UserProfile }
  | { state: 'foreign' }
  | { state: 'stale' }
  | { state: 'unknown' };

/**
 * rekey 响应丢失时，用 /auth/me 判断服务端是否其实已经提交。
 * rekey 只失效 SRP 挑战会话，不会让当前 JWT 失效，因此这里仍可查询。
 * 同时核对 encSalt：版本号一致但盐不同，说明是另一台设备抢先完成了改密。
 */
async function readRekeyStatus(
  newVersion: number,
  expectedEncSalt: string,
): Promise<RekeyStatus> {
  try {
    const latest = await authApi.me();
    if (latest.keyVersion !== newVersion) {
      return { state: 'stale' };
    }
    return latest.encSalt === expectedEncSalt
      ? { state: 'committed', profile: latest }
      : { state: 'foreign' };
  } catch {
    return { state: 'unknown' };
  }
}

/** 逆序回滚已覆盖的附件密文，返回回滚失败的附件 ID。 */
async function rollbackAttachments(
  replaced: ReplacedAttachment[],
  onProgress: (message: string) => void,
): Promise<number[]> {
  if (replaced.length === 0) {
    return [];
  }
  onProgress('重加密失败，正在回滚附件…');
  const failed: number[] = [];
  for (let index = replaced.length - 1; index >= 0; index -= 1) {
    const upload = replaced[index]!;
    try {
      await attachmentApi.replaceContent(upload.attachId, upload.oldBytes, upload.oldKeyVersion);
    } catch {
      failed.push(upload.attachId);
    }
  }
  return failed;
}

export interface VaultProviderProps {
  profile: UserProfile;
  onLock: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function VaultProvider({
  profile: initialProfile,
  onLock,
  onLogout,
  children,
}: VaultProviderProps) {
  const [profile, setProfileState] = useState<UserProfile>(initialProfile);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderView[]>([]);
  const [items, setItems] = useState<ItemView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const attachmentUrls = useRef<Map<number, string>>(new Map());
  const avatarUriRef = useRef<string | null>(null);

  const setAvatarUri = useCallback((uri: string | null) => {
    if (avatarUriRef.current && avatarUriRef.current !== uri) {
      deleteTempFile(avatarUriRef.current);
    }
    avatarUriRef.current = uri;
    setAvatarUrl(uri);
  }, []);

  const clearAttachmentCache = useCallback(() => {
    for (const uri of attachmentUrls.current.values()) {
      deleteTempFile(uri);
    }
    attachmentUrls.current.clear();
  }, []);

  const applyItems = useCallback((updater: (prev: ItemView[]) => ItemView[]) => {
    setItems((prev) => updater(prev));
  }, []);

  const applyProfile = useCallback((next: UserProfile) => {
    setProfileState(next);
    rememberProfile(next);
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

  // 头像需先解密再写入缓存文件，RN Image 才能显示。
  useEffect(() => {
    const kek = getKek();
    if (!kek || !profile.avatar) {
      setAvatarUri(null);
      return;
    }
    let cancelled = false;
    let current: string | null = null;
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
        const uri = await writeTempImage(plain, sniffImageMime(plain), 'avatar');
        current = uri;
        if (cancelled) {
          deleteTempFile(uri);
          return;
        }
        setAvatarUri(uri);
      } catch {
        if (!cancelled) {
          setAvatarUri(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (current && current === avatarUriRef.current) {
        deleteTempFile(current);
        avatarUriRef.current = null;
      }
    };
  }, [profile.avatar, profile.keyVersion, setAvatarUri]);

  useEffect(() => {
    return () => {
      clearAttachmentCache();
      if (avatarUriRef.current) {
        deleteTempFile(avatarUriRef.current);
        avatarUriRef.current = null;
      }
    };
  }, [clearAttachmentCache]);

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
      applyItems((prev) => prev.map((item) => (item.id === itemId ? view : item)));
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
        if (folders.some((folder) => folder.id !== folderId && folder.name === trimmed)) {
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
      setFolders((prev) => prev.map((folder) => (folder.id === folderId ? view : folder)));
      toast('文件夹已更新');
      return view;
    },
    [folders],
  );

  const deleteFolder = useCallback(
    async (folderId: number): Promise<void> => {
      await folderApi.remove(folderId);
      setFolders((prev) => prev.filter((folder) => folder.id !== folderId));
      applyItems((prev) =>
        prev.map((item) => (item.folderId === folderId ? { ...item, folderId: null } : item)),
      );
      toast('文件夹已删除，其中凭证已移入未分类');
    },
    [applyItems],
  );

  /* ============================ 附件 ============================ */

  const loadAttachmentUrl = useCallback(
    async (attachment: AttachmentView): Promise<string> => {
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
      const uri = await writeTempImage(plain, attachment.mimeType || 'image/jpeg', 'attach');
      attachmentUrls.current.set(attachment.id, uri);
      return uri;
    },
    [],
  );

  const uploadAttachment = useCallback(
    async (itemId: number, image: PickedImage): Promise<AttachmentView> => {
      if (!image.mimeType.startsWith('image/')) {
        throw new Error('目前仅支持图片附件');
      }
      const plain = await readImageBytes(image);
      if (plain.length > MAX_ATTACHMENT_BYTES) {
        throw new Error('图片不能超过 3MB');
      }
      const kek = requiredKek();
      const { bytes, fileNameCipher } = await encryptAttachmentBytes(kek, image.name, plain);
      const cipherFile = await writeTempBinary(bytes, 'attachment');
      try {
        // Expo 的 fetch 只接受 Blob / 带 bytes() 的对象，不能传 RN 的 { uri } 描述。
        const dto = await attachmentApi.upload(
          itemId,
          {
            fileNameCipher,
            mimeType: image.mimeType || 'application/octet-stream',
            keyVersion: profile.keyVersion,
          },
          cipherFile as unknown as Blob,
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
      } finally {
        deleteTempFile(cipherFile.uri);
      }
    },
    [applyItems, profile.keyVersion],
  );

  const removeAttachment = useCallback(
    async (attachment: AttachmentView): Promise<void> => {
      await attachmentApi.remove(attachment.id);
      const uri = attachmentUrls.current.get(attachment.id);
      if (uri) {
        deleteTempFile(uri);
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
    async (image: PickedImage): Promise<UserProfile> => {
      if (!image.mimeType.startsWith('image/')) {
        throw new Error('请选择图片文件');
      }
      const plain = await readImageBytes(image);
      if (plain.length > MAX_ATTACHMENT_BYTES) {
        throw new Error('图片不能超过 3MB');
      }
      const kek = requiredKek();
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
    setAvatarUri(null);
    toast('已恢复文字头像');
    return next;
  }, [applyProfile, setAvatarUri]);

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
        foldersRekey.push({
          folderId: dto.folderId,
          folderNameCipher: await encryptText(newKek, name),
        });
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
      // 附件内容是按 keyVersion 单独覆盖上传的，不在 rekey 事务里。
      // 这里必须保留旧密文：一旦后续步骤失败，新 KEK 会随函数退出被丢弃，
      // 未回滚的附件将永久无法解密。
      const attachmentUploads: ReplacedAttachment[] = [];
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
          oldKeyVersion: dto.keyVersion,
          oldBytes: content,
          newBytes: await encryptFile(newKek, plain),
        });
      }

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

      const replaced: ReplacedAttachment[] = [];
      let result: UserProfile | null = null;
      try {
        onProgress('正在上传重新加密的附件…');
        for (const upload of attachmentUploads) {
          await attachmentApi.replaceContent(upload.attachId, upload.newBytes, newVersion);
          replaced.push(upload);
        }

        onProgress('正在更新密钥材料…');
        result = await authApi.rekey({
          authSalt: newKeys.authSalt,
          authVerifier: newKeys.authVerifier,
          encSalt: newKeys.encSalt,
          keyVersion: newVersion,
          keyCheckCipher: newCheck,
          folders: foldersRekey,
          items: itemsRekey,
          attachments: attachmentsRekey,
        });
      } catch (error) {
        // rekey 是事务性的，但附件内容已经提前覆盖。失败时必须用旧密文回滚，
        // 否则本地 newKek 丢失后，这些附件再也无法解密。
        const status = await readRekeyStatus(newVersion, newKeys.encSalt);
        if (status.state === 'committed') {
          // 响应丢失但服务端已经提交：按成功处理，不能回滚新密文。
          result = status.profile;
        } else if (status.state === 'foreign') {
          // 另一台设备已经用它自己的新密钥完成了改密，本地 newKek 与云端不一致。
          throw new Error(
            '云端密钥已被另一台设备更换，当前改密未生效。请重新登录后检查附件是否完整；' +
              '如有异常请联系支持。',
          );
        } else {
          const failed = await rollbackAttachments(replaced, onProgress);
          if (failed.length > 0) {
            const reason = error instanceof Error ? error.message : '未知错误';
            throw new Error(
              `重加密失败（${reason}），附件 ${failed.join('、')} 无法回滚，` +
                '服务端与本地可能不一致。请勿删除应用数据或重复提交；' +
                '先用新主密码尝试登录，若旧密码仍可登录请立即联系支持。',
            );
          }
          throw error;
        }
      }
      if (!result) {
        throw new Error('重加密结果缺失，请重新登录后重试');
      }

      setKek(newKek);
      clearAttachmentCache();

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
    [applyProfile, clearAttachmentCache, profile, refresh],
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
