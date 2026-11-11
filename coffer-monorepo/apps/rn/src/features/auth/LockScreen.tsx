import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserProfile } from '@coffer/types';
import { LockKeyhole } from 'lucide-react-native';

import { setKek, unlockWithPassword } from '@coffer/vault-core';

import { colors, radii } from '../../constants/theme';

export interface LockScreenProps {
  profile: UserProfile;
  onUnlocked: () => void;
  onLogout: () => void;
}

export function LockScreen({ profile, onUnlocked, onLogout }: LockScreenProps) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleUnlock() {
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
      onUnlocked();
    } catch {
      setError('密钥派生失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <View style={styles.mark}>
          <Image source={require('../../../assets/icon.png')} style={styles.logo} />
        </View>
        <Text style={styles.title}>Coffer 已锁定</Text>
        <Text style={styles.subtitle}>{profile.email} · 输入主密码解锁保险库</Text>

        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="主密码"
          placeholderTextColor="rgba(255,255,255,0.34)"
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          editable={!busy}
          style={styles.input}
          onSubmitEditing={() => void handleUnlock()}
        />

        <View style={styles.errorArea}>
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator size="small" color="#EBD9B4" />
              <Text style={styles.busyText}>正在解锁…</Text>
            </View>
          ) : (
            <Text style={styles.errorText}>{error}</Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void handleUnlock()}
          style={[styles.unlockButton, busy && styles.disabled]}
        >
          <LockKeyhole size={16} color={colors.accent} strokeWidth={2} />
          <Text style={styles.unlockText}>{busy ? '解锁中…' : '解锁'}</Text>
        </Pressable>

        <Pressable disabled={busy} onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>使用其他账号登录</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#123F35',
  },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 34 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 8,
  },
  logo: { width: 40, height: 40, borderRadius: 11 },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  input: {
    height: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: '#FFFFFF',
    fontSize: 14,
    paddingHorizontal: 14,
    textAlign: 'center',
    letterSpacing: 2,
  },
  errorArea: { minHeight: 30, justifyContent: 'center', alignItems: 'center' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  busyText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  errorText: { color: '#F3C6CB', fontSize: 12 },
  unlockButton: {
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: '#EBD9B4',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  unlockText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  logoutButton: { alignItems: 'center', marginTop: 18, paddingVertical: 8 },
  logoutText: { color: 'rgba(255,255,255,0.65)', fontSize: 12.5 },
});
