'use client';

import { useEffect, useState } from 'react';
import type { UserProfile } from '@coffer/types';

import { authApi } from '@coffer/vault-core';
import { clearSession, getProfile, getToken, setProfile } from '@coffer/vault-core';
import { AuthScreen } from './AuthScreen';
import { LockScreen } from './LockScreen';
import { ToastHost } from '@coffer/ui';
import { VaultProvider } from './VaultProvider';
import { VaultWorkspace } from './VaultWorkspace';
import { getBrandIconSrc } from '../config';

type Stage = 'boot' | 'auth' | 'locked' | 'vault';

export function CofferApp() {
  const [stage, setStage] = useState<Stage>('boot');
  const [profile, setProfileState] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setStage('auth');
      return;
    }

    const cached = getProfile();
    if (cached) {
      setProfileState(cached);
    }
    void authApi
      .me()
      .then((latest) => {
        if (cancelled) {
          return;
        }
        setProfile(latest);
        setProfileState(latest);
        setStage('locked');
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        clearSession();
        setProfileState(null);
        setStage('auth');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function handleAuthenticated(_token: string, next: UserProfile, _kek: CryptoKey) {
    // AuthScreen 已完成 startSession，这里只切换界面阶段
    setProfileState(next);
    setStage('vault');
  }

  function handleLocked() {
    const latest = getProfile();
    if (latest) {
      setProfileState(latest);
    }
    setStage('locked');
  }

  function handleLogout() {
    clearSession();
    setProfileState(null);
    setStage('auth');
  }

  return (
    <>
      <ToastHost />

      {stage === 'boot' && (
        <div className="lock">
          <div className="mark">
            <img src={getBrandIconSrc()} alt="Coffer" width={42} height={42} />
          </div>
          <h3>Coffer</h3>
          <p>正在同步保险库…</p>
          <div style={{ marginTop: 8 }}>
            <span className="spinner" />
          </div>
        </div>
      )}

      {stage === 'auth' && <AuthScreen onAuthenticated={handleAuthenticated} />}

      {stage === 'locked' && profile && (
        <LockScreen profile={profile} onUnlocked={() => setStage('vault')} onLogout={handleLogout} />
      )}

      {stage === 'vault' && profile && (
        <VaultProvider
          profile={profile}
          onLock={handleLocked}
          onLogout={handleLogout}
        >
          <VaultWorkspace />
        </VaultProvider>
      )}
    </>
  );
}
