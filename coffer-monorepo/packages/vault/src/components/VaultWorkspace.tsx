'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { matchesQuery } from '@coffer/utils';
import { Menu } from 'lucide-react';

import { toast } from '@coffer/ui';
import type { FolderView, ItemView } from '@coffer/vault-core';
import { Avatar } from '@coffer/ui';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ConfirmDialog } from '@coffer/ui';
import { DetailPanel } from './DetailPanel';
import { FolderEditModal } from './FolderEditModal';
import { ItemFormModal } from './ItemFormModal';
import { ItemList, type TypeFilter } from './ItemList';
import { ProfileModal } from './ProfileModal';
import { Sidebar, type NavKey } from './Sidebar';
import { UnlockModal } from './UnlockModal';
import { useVault } from './VaultProvider';
import { getBrandIconSrc } from '../config';

type FormState = { mode: 'create' } | { mode: 'edit'; item: ItemView };

interface UnlockState {
  item: ItemView;
  after: 'view' | 'edit';
}

type ConfirmState =
  | { kind: 'item'; item: ItemView }
  | { kind: 'folder'; folder: FolderView }
  | { kind: 'logout' };

const FILTER_TITLES = {
  '0': '账号',
  '1': '卡片证件',
  '2': '安全笔记',
} as const;

export function VaultWorkspace() {
  const {
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
  } = useVault();

  const [nav, setNav] = useState<NavKey>('all');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [unlockedId, setUnlockedId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [unlock, setUnlock] = useState<UnlockState | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [folderEdit, setFolderEdit] = useState<FolderView | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const keyVersionRef = useRef(profile.keyVersion);

  const activeItems = useMemo(() => items.filter((item) => !item.deletedTime), [items]);
  const trashItems = useMemo(() => items.filter((item) => Boolean(item.deletedTime)), [items]);

  const pool = useMemo(() => {
    let list = nav === 'trash' ? trashItems : activeItems;
    if (nav === 'fav') {
      list = list.filter((item) => item.fav);
    }
    if (folderId !== null) {
      list =
        folderId === -1
          ? list.filter((item) => item.folderId === null)
          : list.filter((item) => item.folderId === folderId);
    }
    if (typeFilter !== 'all') {
      list = list.filter((item) => item.type === typeFilter);
    }
    return list.filter((item) => matchesQuery(item.name, item.type, item.data, query));
  }, [activeItems, folderId, nav, query, trashItems, typeFilter]);

  const selectedItem = useMemo(
    () => pool.find((item) => item.id === selectedId) ?? pool[0] ?? null,
    [pool, selectedId],
  );
  const unlocked = selectedItem !== null && unlockedId === selectedItem.id;
  const isTrash = nav === 'trash';

  // 修改主密码后密钥版本递增，此前的详情解锁状态全部作废
  useEffect(() => {
    if (keyVersionRef.current !== profile.keyVersion) {
      keyVersionRef.current = profile.keyVersion;
      setUnlockedId(null);
    }
  }, [profile.keyVersion]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
      } else if (mobileDetailOpen) {
        setMobileDetailOpen(false);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [drawerOpen, mobileDetailOpen]);

  function changeNav(next: NavKey) {
    setNav(next);
    setFolderId(null);
    setTypeFilter('all');
    setSelectedId(null);
    setUnlockedId(null);
    setMobileDetailOpen(false);
    setDrawerOpen(false);
  }

  function selectFolder(id: number) {
    setNav('all');
    setFolderId(id);
    setTypeFilter('all');
    setSelectedId(null);
    setUnlockedId(null);
    setMobileDetailOpen(false);
    setDrawerOpen(false);
  }

  function changeTypeFilter(next: TypeFilter) {
    setTypeFilter(next);
    setSelectedId(null);
    setUnlockedId(null);
  }

  function selectItem(item: ItemView) {
    if (!selectedItem || selectedItem.id !== item.id) {
      setUnlockedId(null);
    }
    setSelectedId(item.id);
    setMobileDetailOpen(true);
  }

  const baseTitle =
    nav === 'trash'
      ? '回收站'
      : nav === 'fav'
        ? '收藏'
        : folderId !== null
          ? (folders.find((folder) => folder.id === folderId)?.name ?? '未分类')
          : '全部凭证';
  const title =
    typeFilter === 'all'
      ? baseTitle
      : baseTitle === '全部凭证'
        ? FILTER_TITLES[typeFilter]
        : `${baseTitle} · ${FILTER_TITLES[typeFilter]}`;

  const imageCount = pool.filter((item) => item.attachments.length > 0).length;
  const subtitle = `${pool.length} 条${imageCount ? ` · ${imageCount} 条含图片` : ''}${
    isTrash ? ' · 保留 30 天' : ''
  }`;

  let emptyText = '没有匹配的凭证，换个筛选条件，或点右上角「新建」';
  if (query.trim()) {
    emptyText = '没有匹配的凭证，试试其他关键词';
  } else if (isTrash) {
    emptyText = '回收站是空的。删除的凭证会在这里保留 30 天';
  } else if (nav === 'fav') {
    emptyText = '还没有收藏的凭证';
  } else if (folderId !== null) {
    emptyText = '这个文件夹里还没有凭证';
  }

  function requestEdit() {
    if (!selectedItem || selectedItem.broken) {
      return;
    }
    if (unlocked) {
      setForm({ mode: 'edit', item: selectedItem });
    } else {
      setUnlock({ item: selectedItem, after: 'edit' });
    }
  }

  function handleUnlocked() {
    if (!unlock) {
      return;
    }
    const target = unlock.item;
    setUnlock(null);
    setUnlockedId(target.id);
    if (unlock.after === 'edit') {
      const current = items.find((item) => item.id === target.id);
      if (current) {
        setForm({ mode: 'edit', item: current });
      }
    }
  }

  async function handleToggleFavorite() {
    if (!selectedItem) {
      return;
    }
    try {
      await toggleFavorite(selectedItem);
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function handleRestore() {
    if (!selectedItem) {
      return;
    }
    try {
      await restoreItem(selectedItem.id);
      setUnlockedId(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : '恢复失败');
    }
  }

  async function runConfirm() {
    if (!confirm) {
      return;
    }
    if (confirm.kind === 'logout') {
      logout();
      return;
    }
    if (confirm.kind === 'item') {
      await removeItem(confirm.item.id);
      setUnlockedId(null);
      return;
    }
    await deleteFolder(confirm.folder.id);
    if (folderId === confirm.folder.id) {
      setFolderId(null);
    }
    setUnlockedId(null);
  }

  const initialFolderId = folderId !== null && folderId > 0 ? folderId : null;
  const folderItemCount =
    confirm?.kind === 'folder'
      ? activeItems.filter((item) => item.folderId === confirm.folder.id).length
      : 0;

  return (
    <div className="app">
      <div className="mobile-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label="打开导航"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={18} strokeWidth={2} />
        </button>
        <div className="brand">
          <div className="brand-mark">
            <img src={getBrandIconSrc()} alt="Coffer" />
          </div>
          <div className="brand-name">
            Coffer<span>.</span>
          </div>
        </div>
        <div className="spacer" />
        <Avatar
          url={avatarUrl}
          name={profile.nickname}
          color={profile.avatarColor}
          title="个人资料"
          onClick={() => setProfileOpen(true)}
        />
      </div>

      {drawerOpen && (
        <button
          type="button"
          className="rail-backdrop"
          aria-label="关闭导航"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <Sidebar
        open={drawerOpen}
        nav={nav}
        folderId={folderId}
        query={query}
        onQueryChange={setQuery}
        profile={profile}
        avatarUrl={avatarUrl}
        folders={folders}
        activeItems={activeItems}
        trashCount={trashItems.length}
        onNav={changeNav}
        onSelectFolder={selectFolder}
        onCreateFolder={createFolder}
        onUpdateFolder={updateFolder}
        onEditFolder={(folder) => setFolderEdit(folder)}
        onDeleteFolder={(folder) => setConfirm({ kind: 'folder', folder })}
        onOpenProfile={() => setProfileOpen(true)}
        onLock={lock}
        onLogout={() => setConfirm({ kind: 'logout' })}
      />

      <ItemList
        title={title}
        subtitle={subtitle}
        items={pool}
        folders={folders}
        selectedId={selectedItem?.id ?? null}
        typeFilter={typeFilter}
        showCreate={!isTrash}
        emptyText={emptyText}
        loading={loading}
        error={loadError}
        onTypeFilter={changeTypeFilter}
        onSelect={selectItem}
        onCreate={() => setForm({ mode: 'create' })}
        onRetry={() => void refresh()}
      />

      <DetailPanel
        item={selectedItem}
        folders={folders}
        unlocked={unlocked}
        isTrash={isTrash}
        mobileOpen={mobileDetailOpen && selectedItem !== null}
        loadAttachmentUrl={loadAttachmentUrl}
        onBack={() => setMobileDetailOpen(false)}
        onUnlock={() => {
          if (selectedItem) {
            setUnlock({ item: selectedItem, after: 'view' });
          }
        }}
        onToggleFavorite={() => void handleToggleFavorite()}
        onEdit={requestEdit}
        onDelete={() => {
          if (selectedItem) {
            setConfirm({ kind: 'item', item: selectedItem });
          }
        }}
        onRestore={() => void handleRestore()}
        onUploadAttachment={(file) => {
          if (!selectedItem) {
            return Promise.reject(new Error('请选择凭证'));
          }
          return uploadAttachment(selectedItem.id, file);
        }}
        onRemoveAttachment={removeAttachment}
      />

      {form && (
        <ItemFormModal
          mode={form.mode}
          item={form.mode === 'edit' ? form.item : undefined}
          folders={folders}
          initialFolderId={initialFolderId}
          onClose={() => setForm(null)}
          onSubmit={async (draft) => {
            if (form.mode === 'edit') {
              const updated = await updateItem(form.item.id, draft);
              setSelectedId(updated.id);
              setUnlockedId(updated.id);
              return updated;
            }
            const created = await createItem(draft);
            setNav('all');
            setFolderId(null);
            setTypeFilter('all');
            setQuery('');
            setSelectedId(created.id);
            setUnlockedId(null);
            setMobileDetailOpen(true);
            return created;
          }}
        />
      )}

      {unlock && (
        <UnlockModal
          itemName={unlock.item.name}
          profile={profile}
          onClose={() => setUnlock(null)}
          onUnlocked={handleUnlocked}
        />
      )}

      {profileOpen && (
        <ProfileModal
          profile={profile}
          avatarUrl={avatarUrl}
          onClose={() => setProfileOpen(false)}
          onSave={updateProfile}
          onUploadAvatar={uploadAvatar}
          onRemoveAvatar={removeAvatar}
          onChangePassword={() => {
            setProfileOpen(false);
            setPasswordOpen(true);
          }}
          onLogout={() => {
            setProfileOpen(false);
            setConfirm({ kind: 'logout' });
          }}
        />
      )}

      {passwordOpen && (
        <ChangePasswordModal
          onClose={() => setPasswordOpen(false)}
          onChangeMasterPassword={async (oldPassword, newPassword, onProgress) => {
            const result = await changeMasterPassword(oldPassword, newPassword, onProgress);
            setUnlockedId(null);
            return result;
          }}
        />
      )}

      {folderEdit && (
        <FolderEditModal
          folder={folderEdit}
          onClose={() => setFolderEdit(null)}
          onSave={(name, color) => updateFolder(folderEdit.id, { name, color })}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={
            confirm.kind === 'item'
              ? `删除「${confirm.item.name}」？`
              : confirm.kind === 'folder'
                ? `删除文件夹「${confirm.folder.name}」？`
                : '退出登录？'
          }
          text={
            confirm.kind === 'item'
              ? '删除后可在回收站保留 30 天，期间可恢复。'
              : confirm.kind === 'folder'
                ? folderItemCount
                  ? `其中 ${folderItemCount} 条凭证会移到「未分类」，不会被删除。`
                  : '这个文件夹里没有凭证，可直接删除。'
                : '退出后需要重新输入邮箱与主密码登录。凭证以密文形式保存在云端，退出登录不会删除任何数据。'
          }
          okLabel={
            confirm.kind === 'item'
              ? '移入回收站'
              : confirm.kind === 'folder'
                ? '删除文件夹'
                : '退出登录'
          }
          danger
          onClose={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      )}
    </div>
  );
}
