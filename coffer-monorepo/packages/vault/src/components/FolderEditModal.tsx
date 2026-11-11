'use client';

import { useState } from 'react';
import { COLOR_PALETTE } from '@coffer/types';
import { cn } from '@coffer/utils';
import { X } from 'lucide-react';

import type { FolderView } from '@coffer/vault-core';

export interface FolderEditModalProps {
  folder: FolderView;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<unknown>;
}

export function FolderEditModal({ folder, onClose, onSave }: FolderEditModalProps) {
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState(folder.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    if (Array.from(trimmed).length > 12) {
      setError('文件夹名称最多 12 个字');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(trimmed, color);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label="编辑文件夹">
      <form className="modal xs" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>编辑文件夹</h3>
          <button type="button" className="x" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body">
          <div className="mf">
            <label htmlFor="fx-name">名称</label>
            <input
              id="fx-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={12}
              placeholder="文件夹名称"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="mf" style={{ marginBottom: 8 }}>
            <label>颜色</label>
            <div className="swrow">
              {COLOR_PALETTE.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cn('sw', color === entry && 'on')}
                  style={{
                    background: entry,
                    boxShadow:
                      color === entry ? `0 0 0 2px #fff, 0 0 0 3.5px ${entry}` : undefined,
                  }}
                  onClick={() => setColor(entry)}
                  title={entry}
                  disabled={busy}
                />
              ))}
            </div>
          </div>
          <div className="auth-error" style={{ margin: 0, minHeight: 16 }}>
            {error}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn-ok" disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
