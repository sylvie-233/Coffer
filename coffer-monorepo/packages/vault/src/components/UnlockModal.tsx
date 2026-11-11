'use client';

import { useState } from 'react';
import type { UserProfile } from '@coffer/types';
import { X } from 'lucide-react';

import { unlockWithPassword } from '@coffer/vault-core';

export interface UnlockModalProps {
  itemName: string;
  profile: UserProfile;
  onClose: () => void;
  onUnlocked: (kek: CryptoKey) => void;
}

/** 详情二次验证：重新派生 KEK 并校验 keycheck，密码错误不会解锁。 */
export function UnlockModal({ itemName, profile, onClose, onUnlocked }: UnlockModalProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!password) {
      setError('请输入主密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const kek = await unlockWithPassword(password, profile);
      if (!kek) {
        setError('主密码错误，请重试');
        return;
      }
      onUnlocked(kek);
    } catch {
      setError('密钥派生失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label="验证身份">
      <form className="modal xs" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>验证身份</h3>
          <button type="button" className="x" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>
        <div className="modal-body" style={{ paddingBottom: 8 }}>
          <p style={{ fontSize: 12.5, color: '#948e82', lineHeight: 1.7, marginBottom: 14 }}>
            输入主密码以查看「{itemName}」的内容。验证只在本地进行，不会发送到服务端。
          </p>
          <div className="mf" style={{ marginBottom: 0 }}>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="主密码"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
          </div>
          <div className="auth-error" style={{ margin: '8px 0 0', minHeight: 16 }}>
            {busy ? '正在本地派生密钥…' : error}
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn-ok" disabled={busy}>
            {busy ? '验证中…' : '解锁'}
          </button>
        </div>
      </form>
    </div>
  );
}
