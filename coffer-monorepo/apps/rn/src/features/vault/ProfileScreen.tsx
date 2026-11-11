import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Camera, ChevronRight, KeyRound } from 'lucide-react-native';
import { COLOR_PALETTE } from '@coffer/types';

import {
  Avatar,
  Button,
  Field,
  ScreenHeader,
  SwatchRow,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import { pickImages } from '../../lib/media';
import type { PickedImage } from '../../lib/media';
import { colors, radii } from '../../constants/theme';

export function ProfileScreen() {
  const { profile, avatarUrl, updateProfile, uploadAvatar, removeAvatar } = useVault();

  const [nickname, setNickname] = useState(profile.nickname);
  const [color, setColor] = useState(`#${profile.avatarColor.replace(/^#/, '')}`);
  const [pendingAvatar, setPendingAvatar] = useState<PickedImage | null>(null);
  const [removeCustomAvatar, setRemoveCustomAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const displayUrl = pendingAvatar?.uri ?? (removeCustomAvatar ? null : avatarUrl);
  const displayName = nickname.trim() || profile.nickname;

  async function handlePickAvatar() {
    if (busy) {
      return;
    }
    const picked = await pickImages(false);
    if (picked[0]) {
      setPendingAvatar(picked[0]);
      setRemoveCustomAvatar(false);
    }
  }

  async function handleSave() {
    if (busy) {
      return;
    }
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('昵称不能为空');
      return;
    }
    if (Array.from(trimmed).length > 16) {
      setError('昵称不能超过 16 个字');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateProfile({
        nickname: trimmed,
        avatarColor: color.replace(/^#/, ''),
      });
      if (pendingAvatar) {
        await uploadAvatar(pendingAvatar);
      } else if (removeCustomAvatar) {
        await removeAvatar();
      }
      router.back();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader title="个人资料" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上传头像"
            disabled={busy}
            onPress={() => void handlePickAvatar()}
          >
            <Avatar url={displayUrl} name={displayName} color={color} size={84} />
            <View style={styles.cameraBadge}>
              <Camera size={13} color="#fff" strokeWidth={2} />
            </View>
          </Pressable>
          <Text style={styles.heroHint}>点击头像从相册选择图片</Text>
          {displayUrl ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPendingAvatar(null);
                setRemoveCustomAvatar(true);
              }}
            >
              <Text style={styles.removeLink}>移除自定义头像，恢复文字头像</Text>
            </Pressable>
          ) : null}
        </View>

        <Field
          label="昵称"
          value={nickname}
          onChangeText={setNickname}
          placeholder="怎么称呼你"
          maxLength={16}
          autoCapitalize="none"
        />

        <Text style={styles.label}>头像底色</Text>
        <SwatchRow
          palette={COLOR_PALETTE}
          selected={color}
          onSelect={setColor}
          disabled={busy}
        />

        <Field
          label="邮箱"
          value={profile.email}
          editable={false}
          inputStyle={styles.readonlyInput}
        />
        <Text style={styles.emailHint}>邮箱用于登录，不可修改</Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/vault/change-password')}
          style={({ pressed }) => [styles.securityEntry, pressed && styles.pressed]}
        >
          <KeyRound size={16} color={colors.accent} strokeWidth={1.9} />
          <View style={styles.securityText}>
            <Text style={styles.securityTitle}>修改主密码</Text>
            <Text style={styles.securityHint}>保存后将对全部凭证重新加密</Text>
          </View>
          <ChevronRight size={15} color={colors.faint} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.errorArea}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Button label="保存个人资料" busy={busy} onPress={() => void handleSave()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingBottom: 18 },
  pressed: { opacity: 0.6 },

  hero: { alignItems: 'center', paddingTop: 18, paddingBottom: 22 },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroHint: { fontSize: 10.5, color: colors.faint, marginTop: 9 },
  removeLink: { fontSize: 11, color: colors.danger, marginTop: 9 },

  label: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginTop: 14,
    marginBottom: 10,
  },
  readonlyInput: { backgroundColor: colors.field, color: colors.muted },
  emailHint: { fontSize: 10.5, color: colors.faint, marginTop: -8 },

  securityEntry: {
    marginTop: 22,
    minHeight: 58,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  securityText: { flex: 1 },
  securityTitle: { fontSize: 13, fontWeight: '600', color: colors.ink },
  securityHint: { fontSize: 10.5, color: colors.muted, marginTop: 2 },

  errorArea: { minHeight: 26, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 12.5 },

  bottomBar: {
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
  },
});
