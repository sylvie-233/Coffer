import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { clearSession, getProfile } from '@coffer/vault-core';

import { VaultProvider } from '../../providers/VaultProvider';
import { colors } from '../../constants/theme';

export default function VaultLayout() {
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
    <VaultProvider
      profile={profile}
      onLock={() => router.replace('/lock')}
      onLogout={() => {
        clearSession();
        router.replace('/auth');
      }}
    >
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="detail" />
        <Stack.Screen name="form" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="folders" />
        <Stack.Screen name="change-password" />
      </Stack>
    </VaultProvider>
  );
}
