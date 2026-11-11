'use client';

import { useState } from 'react';
import type { UserProfile } from '@coffer/types';

import { setKek } from '@coffer/vault-core';
import { unlockWithPassword } from '@coffer/vault-core';
import { getBrandIconSrc } from '../config';

export interface LockScreenProps {
  profile: UserProfile;
  onUnlocked: (kek: CryptoKey) => void;
  onLogout: () => void;
}

/** 保险库锁定页：token 仍在，只需重新输入主密码派生 KEK。 */
export function LockScreen({ profile, onUnlocked, onLogout }: LockScreenProps) {
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
      setKek(kek);
      onUnlocked(kek);
    } catch {
      setError('密钥派生失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lock">
      <div className="mark">
        <img src={getBrandIconSrc()} alt="Coffer" width={42} height={42} />
      </div>
      <h3>Coffer 已锁定</h3>
      <p>{profile.email} · 输入主密码解锁保险库</p>
      <form onSubmit={handleSubmit}>
        <div className="box">
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="主密码"
            autoComplete="off"
            autoFocus
            disabled={busy}
          />
          <button type="submit" disabled={busy}>
            {busy ? '解锁中…' : '解锁'}
          </button>
        </div>
      </form>
      <div className="err">{error}</div>
      <button type="button" className="link-btn" onClick={onLogout} disabled={busy}>
        使用其他账号登录
      </button>
    </div>
  );
}
