import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { clearSession, getProfile } from '@coffer/vault-core';

import { LockScreen } from '../features/auth/LockScreen';

export default function LockRoute() {
  const profile = getProfile();

  useEffect(() => {
    if (!profile) {
      router.replace('/auth');
    }
  }, [profile]);

  if (!profile) {
    return null;
  }

  return (
    <>
      <StatusBar style="light" />
      <LockScreen
        profile={profile}
        onUnlocked={() => router.replace('/vault')}
        onLogout={() => {
          clearSession();
          router.replace('/auth');
        }}
      />
    </>
  );
}
