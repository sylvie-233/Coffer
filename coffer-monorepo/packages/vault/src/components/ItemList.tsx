'use client';

import type { ItemType } from '@coffer/types';
import { ITEM_TYPE_SHORT_LABELS } from '@coffer/types';
import { cn, itemSubtitle } from '@coffer/utils';
import { Plus, Star } from 'lucide-react';

import type { FolderView, ItemView } from '@coffer/vault-core';

export type TypeFilter = 'all' | ItemType;

const TYPE_TABS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: '0', label: '账号' },
  { key: '1', label: '卡片' },
  { key: '2', label: '笔记' },
];

export interface ItemListProps {
  title: string;
  subtitle: string;
  items: ItemView[];
  folders: FolderView[];
  selectedId: number | null;
  typeFilter: TypeFilter;
  showCreate: boolean;
  emptyText: string;
  loading: boolean;
  error: string | null;
  onTypeFilter: (filter: TypeFilter) => void;
  onSelect: (item: ItemView) => void;
  onCreate: () => void;
  onRetry: () => void;
}

function tileColors(item: ItemView, folder: FolderView | undefined): React.CSSProperties {
  const base =
    folder?.color ??
    (item.type === '1' ? '#C9752F' : item.type === '2' ? '#35707B' : '#125B4A');
  return { background: `${base}1F`, color: base };
}

function strengthClass(item: ItemView): string {
  if (item.type === '1') {
    return 's-img';
  }
  if (item.type === '2') {
    return 's-none';
  }
  if (item.data && 'password' in item.data) {
    if (!item.data.password) {
      return 's-none';
    }
    return item.data.password.length >= 12 ? 's-strong' : 's-mid';
  }
  return 's-none';
}

function glyphOf(item: ItemView): string {
  if (item.broken) {
    return '?';
  }
  const chars = Array.from(item.name.trim());
  return chars[0] ?? (item.type === '1' ? '卡' : item.type === '2' ? '记' : '账');
}

export function ItemList({
  title,
  subtitle,
  items,
  folders,
  selectedId,
  typeFilter,
  showCreate,
  emptyText,
  loading,
  error,
  onTypeFilter,
  onSelect,
  onCreate,
  onRetry,
}: ItemListProps) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));

  return (
    <section className="col-list">
      <div className="list-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {showCreate && (
          <button type="button" className="btn-new" onClick={onCreate}>
            <Plus size={12} strokeWidth={2.6} />
            新建
          </button>
        )}
      </div>

      <div className="list-tabs">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={cn('lt', typeFilter === tab.key && 'on')}
            onClick={() => onTypeFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="rows">
        {loading && items.length === 0 ? (
          <div className="loading-center">
            <span className="spinner" />
            正在本地解密保险库…
          </div>
        ) : error ? (
          <div className="empty">
            {error}
            <br />
            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: 14, display: 'inline-flex' }}
              onClick={onRetry}
            >
              重新加载
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          items.map((item) => {
            const folder = item.folderId ? folderById.get(item.folderId) : undefined;
            const subtitleText = itemSubtitle(item.type, item.data);
            return (
              <button
                key={item.id}
                type="button"
                className={cn('row', item.id === selectedId && 'sel')}
                onClick={() => onSelect(item)}
              >
                <div className="tile" style={tileColors(item, folder)}>
                  {glyphOf(item)}
                </div>
                <div className="row-txt">
                  <b>{item.name}</b>
                  <span>
                    {item.deletedTime
                      ? `回收站 · ${subtitleText === '密文校验失败' ? '已删除' : subtitleText}`
                      : subtitleText ||
                        ITEM_TYPE_SHORT_LABELS[item.type]}
                  </span>
                </div>
                {item.fav && (
                  <span className="fav-mark" title="已收藏">
                    <Star size={11} fill="currentColor" strokeWidth={1.7} />
                  </span>
                )}
                <span className={cn('strength', strengthClass(item))} />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
