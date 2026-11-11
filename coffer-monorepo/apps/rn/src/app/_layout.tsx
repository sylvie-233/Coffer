import '../lib/polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureApi } from '@coffer/vault-core';

import { ToastProvider } from '../components/Toast';
import { API_BASE_URL } from '../lib/config';
import { colors } from '../constants/theme';

configureApi({ baseUrl: API_BASE_URL, timeoutMs: 20_000 });

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ToastProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" />
          <Stack.Screen name="lock" options={{ animation: 'fade' }} />
          <Stack.Screen name="vault" />
        </Stack>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
