'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@coffer/types';
import { COLOR_PALETTE } from '@coffer/types';
import { cn } from '@coffer/utils';
import {
  LayoutGrid,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';

import { toast } from '@coffer/ui';
import type { FolderView, ItemView } from '@coffer/vault-core';
import { Avatar } from '@coffer/ui';
import { getBrandIconSrc } from '../config';

export type NavKey = 'all' | 'fav' | 'trash';

export interface SidebarProps {
  open: boolean;
  nav: NavKey;
  folderId: number | null;
  query: string;
  onQueryChange: (value: string) => void;
  profile: UserProfile;
  avatarUrl: string | null;
  folders: FolderView[];
  /** 仅活动条目（回收站另计）。 */
  activeItems: ItemView[];
  trashCount: number;
  onNav: (nav: NavKey) => void;
  onSelectFolder: (folderId: number) => void;
  onCreateFolder: (name: string, color: string) => Promise<FolderView>;
  onUpdateFolder: (
    folderId: number,
    input: { name?: string; color?: string },
  ) => Promise<FolderView>;
  onEditFolder: (folder: FolderView) => void;
  onDeleteFolder: (folder: FolderView) => void;
  onOpenProfile: () => void;
  onLock: () => void;
  onLogout: () => void;
}

interface MenuState {
  folder: FolderView;
  left: number;
  top: number;
}

export function Sidebar({
  open,
  nav,
  folderId,
  query,
  onQueryChange,
  profile,
  avatarUrl,
  folders,
  activeItems,
  trashCount,
  onNav,
  onSelectFolder,
  onCreateFolder,
  onUpdateFolder,
  onEditFolder,
  onDeleteFolder,
  onOpenProfile,
  onLock,
  onLogout,
}: SidebarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const committingRef = useRef(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(COLOR_PALETTE[0]);

  const favoriteCount = activeItems.filter((item) => item.fav).length;
  const uncategorizedCount = activeItems.filter((item) => item.folderId === null).length;

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }
    function close() {
      setMenu(null);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close();
      }
    }
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKey);
    };
  }, [menu]);

  function startCreating() {
    setCreating(true);
    setNewName('');
    setNewColor(COLOR_PALETTE[0]);
  }

  function cancelCreating() {
    setCreating(false);
    setNewName('');
  }

  async function commitCreating() {
    if (committingRef.current) {
      return;
    }
    const name = newName.trim();
    if (!name) {
      cancelCreating();
      return;
    }
    committingRef.current = true;
    try {
      await onCreateFolder(name, newColor);
      cancelCreating();
    } catch (error) {
      toast(error instanceof Error ? error.message : '新建文件夹失败');
    } finally {
      committingRef.current = false;
    }
  }

  function openMenu(folder: FolderView, event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({
      folder,
      left: Math.max(8, rect.right - 158),
      top: Math.min(window.innerHeight - 172, rect.bottom + 4),
    });
  }

  async function pickColor(folder: FolderView, color: string) {
    setMenu(null);
    try {
      await onUpdateFolder(folder.id, { color });
      toast('文件夹颜色已更新');
    } catch (error) {
      toast(error instanceof Error ? error.message : '颜色更新失败');
    }
  }

  return (
    <aside className={cn('rail', open && 'open')}>
      <div className="rail-top">
        <div className="brand">
          <div className="brand-mark">
            <img src={getBrandIconSrc()} alt="Coffer" />
          </div>
          <div className="brand-name">
            Coffer<span>.</span>
          </div>
        </div>

        <label className="search">
          <Search size={13} strokeWidth={2.2} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索凭证"
            autoComplete="off"
          />
          <span className="kbd">⌘K</span>
        </label>
      </div>

      <div className="nav-label">保险库</div>
      <button
        type="button"
        className={cn('nav-item', nav === 'all' && folderId === null && 'active')}
        onClick={() => onNav('all')}
      >
        <LayoutGrid size={15} strokeWidth={1.9} />
        全部凭证 <span className="count">{activeItems.length}</span>
      </button>
      <button
        type="button"
        className={cn('nav-item', nav === 'fav' && 'active')}
        onClick={() => onNav('fav')}
      >
        <Star size={15} strokeWidth={1.9} />
        收藏 <span className="count">{favoriteCount}</span>
      </button>
      <button
        type="button"
        className={cn('nav-item', nav === 'trash' && 'active')}
        onClick={() => onNav('trash')}
      >
        <Trash2 size={15} strokeWidth={1.9} />
        回收站 <span className="count">{trashCount}</span>
      </button>

      <div className="nav-label row" style={{ marginTop: 18 }}>
        文件夹
        <button type="button" className="plus" title="新建文件夹" onClick={startCreating}>
          <Plus size={11} strokeWidth={2.6} />
        </button>
      </div>

      <div>
        {folders.map((folder) => {
          const count = activeItems.filter((item) => item.folderId === folder.id).length;
          return (
            <div
              key={folder.id}
              className={cn(
                'nav-item nav-folder',
                nav === 'all' && folderId === folder.id && 'active',
              )}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFolder(folder.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  onSelectFolder(folder.id);
                }
              }}
            >
              <span className="fdot" style={{ background: folder.color }} />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minWidth: 0,
                  flex: 1,
                }}
              >
                {folder.name}
              </span>
              <span className="count">{count}</span>
              <button
                type="button"
                className="more"
                title="重命名 / 删除 / 换颜色"
                onClick={(event) => openMenu(folder, event)}
              >
                ···
              </button>
            </div>
          );
        })}

        {uncategorizedCount > 0 && (
          <div
            className={cn('nav-item nav-folder', nav === 'all' && folderId === -1 && 'active')}
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder(-1)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onSelectFolder(-1);
              }
            }}
          >
            <span className="fdot" style={{ background: '#C9C2B2' }} />
            <span style={{ flex: 1 }}>未分类</span>
            <span className="count">{uncategorizedCount}</span>
          </div>
        )}
      </div>

      {creating && (
        <>
          <div className="folder-edit">
            <span className="fdot" style={{ background: newColor }} />
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="新文件夹名"
              maxLength={12}
              autoComplete="off"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitCreating();
                } else if (event.key === 'Escape') {
                  cancelCreating();
                }
              }}
              onBlur={() => {
                if (newName.trim()) {
                  void commitCreating();
                } else {
                  cancelCreating();
                }
              }}
            />
          </div>
          <div className="folder-swatches on">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className="sw"
                style={{
                  background: color,
                  boxShadow:
                    color === newColor ? `0 0 0 2px var(--rail), 0 0 0 3.5px ${color}` : undefined,
                }}
                title={color}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setNewColor(color)}
              />
            ))}
          </div>
        </>
      )}

      <div className="rail-spacer" />

      <div
        className="user"
        role="button"
        tabIndex={0}
        title="编辑个人资料"
        onClick={onOpenProfile}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onOpenProfile();
          }
        }}
      >
        <Avatar url={avatarUrl} name={profile.nickname} color={profile.avatarColor} />
        <div className="user-meta">
          <b>{profile.nickname}</b>
          <i>零知识加密已启用</i>
        </div>
        <button
          type="button"
          className="lock-btn"
          title="锁定保险库"
          onClick={(event) => {
            event.stopPropagation();
            onLock();
          }}
        >
          <Lock size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="power-btn"
          title="退出登录"
          onClick={(event) => {
            event.stopPropagation();
            onLogout();
          }}
        >
          <LogOut size={14} strokeWidth={2} />
        </button>
      </div>

      {menu && (
        <div
          className="fmenu"
          style={{ left: menu.left, top: menu.top }}
          onClick={(event) => event.stopPropagation()}
          role="menu"
        >
          <div className="fsw">
            {COLOR_PALETTE.map((color) => (
              <button
                key={color}
                type="button"
                className={cn('sw', menu.folder.color === color && 'on')}
                style={{
                  background: color,
                  boxShadow:
                    menu.folder.color === color
                      ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}`
                      : undefined,
                }}
                title={color}
                onClick={() => void pickColor(menu.folder, color)}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const folder = menu.folder;
              setMenu(null);
              onEditFolder(folder);
            }}
          >
            <Pencil size={12} strokeWidth={2} />
            重命名
          </button>
          <button
            type="button"
            className="dgr"
            onClick={() => {
              const folder = menu.folder;
              setMenu(null);
              onDeleteFolder(folder);
            }}
          >
            <Trash2 size={12} strokeWidth={2} />
            删除文件夹
          </button>
        </div>
      )}
    </aside>
  );
}
