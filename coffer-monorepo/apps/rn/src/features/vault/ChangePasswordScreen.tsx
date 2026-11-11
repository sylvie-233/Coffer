import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ShieldAlert } from 'lucide-react-native';
import { evaluatePasswordStrength } from '@coffer/utils';

import {
  Button,
  Field,
  PasswordStrengthView,
  ScreenHeader,
  Sheet,
  SheetActions,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import { colors, radii } from '../../constants/theme';

export function ChangePasswordScreen() {
  const { changeMasterPassword } = useVault();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const strength = evaluatePasswordStrength(newPassword);

  function requestSubmit() {
    if (busy) {
      return;
    }
    if (!oldPassword) {
      setError('请输入当前主密码');
      return;
    }
    if (newPassword.length < 8) {
      setError('新主密码至少需要 8 位');
      return;
    }
    if (newPassword === oldPassword) {
      setError('新主密码不能与当前主密码相同');
      return;
    }
    if (newPassword !== confirm) {
      setError('两次输入的新主密码不一致');
      return;
    }
    setError('');
    setConfirmOpen(true);
  }

  async function handleSubmit() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    setProgress('正在验证当前主密码…');
    try {
      await changeMasterPassword(oldPassword, newPassword, setProgress);
      setConfirmOpen(false);
      router.back();
    } catch (nextError) {
      setConfirmOpen(false);
      setError(nextError instanceof Error ? nextError.message : '修改主密码失败');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title="修改主密码"
        onBack={busy ? undefined : () => router.back()}
        left={busy ? <View /> : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.warning}>
          <ShieldAlert size={18} color={colors.warning} strokeWidth={1.9} />
          <Text style={styles.warningText}>
            主密码修改后，服务端会用新密钥重新加密所有文件夹、凭证与图片附件。过程中请保持网络畅通，不要关闭应用。
          </Text>
        </View>

        <Field
          label="当前主密码"
          value={oldPassword}
          onChangeText={setOldPassword}
          placeholder="用于验证身份"
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />
        <Field
          label="新主密码"
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="至少 8 位，建议 12 位以上"
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />
        {newPassword ? <PasswordStrengthView strength={strength} /> : null}
        <Field
          label="确认新主密码"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="再输一次"
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />

        <Text style={styles.note}>
          新主密码会生成全新的加密密钥。旧密钥不会保留，因此新密码遗失后同样无法恢复数据。
        </Text>

        <View style={styles.errorArea}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {busy ? (
          <View style={styles.progress}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.progressText}>{progress || '正在重新加密…'}</Text>
          </View>
        ) : (
          <Button label="继续修改主密码" onPress={requestSubmit} />
        )}
      </ScrollView>

      <Sheet
        visible={confirmOpen}
        onClose={() => {
          if (!busy) {
            setConfirmOpen(false);
          }
        }}
        title="确认修改主密码？"
        description="这是一个不可逆的密钥轮换操作：全部云端密文都会被重新加密。请确认新主密码已妥善记录。"
        dismissable={!busy}
      >
        {busy ? (
          <View style={styles.sheetProgress}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.progressText}>{progress || '正在重新加密…'}</Text>
          </View>
        ) : null}
        <SheetActions>
          <Button
            label="取消"
            variant="ghost"
            style={styles.sheetButton}
            disabled={busy}
            onPress={() => setConfirmOpen(false)}
          />
          <Button
            label="开始重新加密"
            style={styles.sheetButton}
            busy={busy}
            onPress={() => void handleSubmit()}
          />
        </SheetActions>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },

  warning: {
    flexDirection: 'row',
    gap: 10,
    padding: 13,
    borderRadius: radii.md,
    backgroundColor: '#FCF3E8',
    marginBottom: 18,
  },
  warningText: { flex: 1, fontSize: 11.3, lineHeight: 18, color: '#8A5A25' },

  note: { fontSize: 11, lineHeight: 18, color: colors.muted, marginTop: 4 },
  errorArea: { minHeight: 30, marginTop: 10 },
  errorText: { color: colors.danger, fontSize: 12.5, lineHeight: 18 },

  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 46,
    justifyContent: 'center',
  },
  sheetProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 4,
    minHeight: 26,
  },
  progressText: { fontSize: 12, color: colors.muted },
  sheetButton: { flex: 1 },
});
