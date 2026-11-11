import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { constantTimeEqual, deriveSrpX, srpClientProof } from '@coffer/crypto';
import type { UserProfile } from '@coffer/types';
import { evaluatePasswordStrength } from '@coffer/utils';
import { Check } from 'lucide-react-native';

import { ApiError, authApi } from '@coffer/vault-core';
import { startSession } from '@coffer/vault-core';
import {
  buildRegistrationKeys,
  deriveKek,
  keyCheckCipher,
  unlockWithPassword,
} from '@coffer/vault-core';

import { ErrorText, PasswordStrengthView } from '../../components/ui';
import { colors, radii } from '../../constants/theme';

type Mode = 'login' | 'register';

export interface AuthScreenProps {
  onAuthenticated: (profile: UserProfile) => void;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || '操作失败，请稍后重试';
  }
  return '操作失败，请稍后重试';
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const register = mode === 'register';
  const strength = evaluatePasswordStrength(password);
  const normalizedEmail = email.trim().toLowerCase();

  function switchMode() {
    setMode(register ? 'login' : 'register');
    setError('');
    setPassword('');
    setConfirm('');
    setAcknowledged(false);
  }

  async function handleLogin() {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!password) {
      setError('请输入主密码');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const challenge = await authApi.challenge(normalizedEmail);
      const x = await deriveSrpX(password, challenge.salt, normalizedEmail);
      const proof = await srpClientProof(x, challenge.B);
      const result = await authApi.verify({
        srpSessionId: challenge.srpSessionId,
        A: proof.A,
        M1: proof.M1,
      });

      if (!constantTimeEqual(result.M2.toLowerCase(), proof.M2.toLowerCase())) {
        throw new Error('服务器身份校验失败，请检查网络环境后重试');
      }

      const kek = await unlockWithPassword(password, result.profile);
      if (!kek) {
        throw new Error('密钥校验失败，本地密钥与云端数据不匹配');
      }

      startSession(result.token, result.profile, kek);
      onAuthenticated(result.profile);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister() {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (password.length < 8) {
      setError('主密码至少需要 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的主密码不一致');
      return;
    }
    if (!acknowledged) {
      setError('请确认你已了解主密码无法找回');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const keys = await buildRegistrationKeys(password, normalizedEmail);
      const kek = await deriveKek(password, keys.encSalt);
      const check = await keyCheckCipher(kek);

      const result = await authApi.register({
        email: normalizedEmail,
        authSalt: keys.authSalt,
        authVerifier: keys.authVerifier,
        encSalt: keys.encSalt,
        keyCheckCipher: check,
      });

      startSession(result.token, result.profile, kek);
      onAuthenticated(result.profile);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit() {
    if (busy) {
      return;
    }
    if (register) {
      void handleRegister();
    } else {
      void handleLogin();
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 42, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Image source={require('../../../assets/icon.png')} style={styles.logo} />
          <Text style={styles.title}>{register ? '创建你的保险库' : '欢迎回来'}</Text>
          <Text style={styles.subtitle}>
            {register
              ? '主密码用于在本地加密所有数据\n服务端只保存密文'
              : '登录后解锁你的保险库'}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>邮箱</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.faint}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="off"
            autoFocus
            style={styles.input}
          />

          <Text style={styles.label}>{register ? '设置主密码' : '主密码'}</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={register ? '至少 8 位，建议 12 位以上' : '主密码'}
            placeholderTextColor={colors.faint}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="off"
            style={styles.input}
          />
          {register ? <PasswordStrengthView strength={strength} /> : null}

          {register ? (
            <>
              <Text style={styles.label}>确认主密码</Text>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="再输一次"
                placeholderTextColor={colors.faint}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="off"
                style={styles.input}
              />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acknowledged }}
                onPress={() => setAcknowledged((prev) => !prev)}
                style={styles.ackRow}
              >
                <View style={[styles.checkbox, acknowledged && styles.checkboxOn]}>
                  {acknowledged ? <Check size={12} color="#fff" strokeWidth={2.6} /> : null}
                </View>
                <Text style={styles.ackText}>
                  我了解：<Text style={styles.ackStrong}>主密码是唯一的解锁凭证，服务端无法找回</Text>
                  ，遗失将永久无法访问本保险库。
                </Text>
              </Pressable>
            </>
          ) : null}

          <View style={styles.errorArea}>
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.busyText}>正在本地派生密钥，请稍候…</Text>
              </View>
            ) : (
              <ErrorText>{error}</ErrorText>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.submit,
              pressed && !busy && styles.submitPressed,
              busy && styles.submitDisabled,
            ]}
          >
            <Text style={styles.submitText}>
              {busy ? '处理中…' : register ? '创建保险库' : '登录'}
            </Text>
          </Pressable>

          <Pressable disabled={busy} onPress={switchMode} style={styles.switchButton}>
            <Text style={styles.switchText}>
              {register ? '已有账号？直接登录 →' : '还没有账号？创建保险库 →'}
            </Text>
          </Pressable>

          <Text style={styles.note}>零知识加密 · 密钥只存在于你的设备内存</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 26 },
  hero: { alignItems: 'center' },
  logo: { width: 56, height: 56, borderRadius: 16, marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '700', color: colors.ink },
  subtitle: {
    marginTop: 7,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.muted,
    textAlign: 'center',
  },
  form: { marginTop: 24 },
  label: {
    fontSize: 10.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
    marginLeft: 1,
  },
  input: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.bg,
    paddingHorizontal: 13,
    fontSize: 14,
    color: colors.ink,
  },
  ackRow: { flexDirection: 'row', gap: 9, marginTop: 16, alignItems: 'flex-start' },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  ackText: { flex: 1, fontSize: 11.5, lineHeight: 18, color: colors.ink2 },
  ackStrong: { fontWeight: '600', color: colors.ink },
  errorArea: { minHeight: 34, marginTop: 8, justifyContent: 'center' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  busyText: { color: colors.muted, fontSize: 12 },
  submit: {
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  submitPressed: { opacity: 0.9 },
  submitDisabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  switchButton: { alignItems: 'center', marginTop: 15, paddingVertical: 6 },
  switchText: { color: colors.accent, fontSize: 12.5 },
  note: { textAlign: 'center', color: colors.faint, fontSize: 10.5, marginTop: 14 },
});
