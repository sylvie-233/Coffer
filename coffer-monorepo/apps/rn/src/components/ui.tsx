import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, TextInputProps, ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarInitials } from '@coffer/utils';
import type { PasswordStrength } from '@coffer/utils';

import { colors, radii } from '../constants/theme';

/* ============================ 文本 / 按钮 ============================ */

export function ErrorText({ children }: { children?: string }) {
  if (!children) {
    return <View style={styles.errorSpace} />;
  }
  return (
    <Text style={styles.errorText} numberOfLines={3}>
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export type ButtonVariant = 'primary' | 'danger' | 'ghost' | 'quiet';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inactive = disabled || busy;
  const buttonStyle =
    variant === 'primary'
      ? styles.primaryButton
      : variant === 'danger'
        ? styles.dangerButton
        : variant === 'quiet'
          ? styles.quietButton
          : styles.ghostButton;
  const textStyle =
    variant === 'primary'
      ? styles.primaryButtonText
      : variant === 'danger'
        ? styles.dangerButtonText
        : variant === 'quiet'
          ? styles.quietButtonText
          : styles.ghostButtonText;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonStyle,
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.accent} />
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </Pressable>
  );
}

export function IconButton({
  children,
  onPress,
  accessibilityLabel,
  disabled,
  style,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

/* ============================ 页头 ============================ */

export function ScreenHeader({
  title,
  onBack,
  left,
  right,
}: {
  title?: string;
  onBack?: () => void;
  left?: ReactNode;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerSide}>
        {onBack ? (
          <IconButton accessibilityLabel="返回" onPress={onBack}>
            <ChevronLeft size={20} strokeWidth={2.2} color={colors.ink} />
          </IconButton>
        ) : (
          left
        )}
      </View>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

/* ============================ 输入 ============================ */

export function Field({
  label,
  right,
  inputStyle,
  ...props
}: TextInputProps & {
  label?: string;
  right?: ReactNode;
  inputStyle?: StyleProp<ViewStyle>;
}) {
  const input = (
    <TextInput
      {...props}
      placeholderTextColor={colors.faint}
      style={[
        styles.input,
        props.multiline && styles.inputMultiline,
        inputStyle,
        props.editable === false && styles.inputReadonly,
      ]}
    />
  );
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {right ? (
        <View style={styles.inputRow}>
          <View style={styles.inputGrow}>{input}</View>
          {right}
        </View>
      ) : (
        input
      )}
    </View>
  );
}

/* ============================ 头像 / 色板 ============================ */

export function Avatar({
  url,
  name,
  color,
  size = 60,
  style,
}: {
  url?: string | null;
  name: string;
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color || colors.accent },
        style,
      ]}
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, { fontSize: Math.max(14, size * 0.31) }]}>
          {avatarInitials(name)}
        </Text>
      )}
    </View>
  );
}

export function SwatchRow({
  palette,
  selected,
  onSelect,
  disabled,
}: {
  palette: readonly string[];
  selected: string;
  onSelect: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.swatchRow}>
      {palette.map((entry) => {
        const on = entry.toLowerCase() === selected.toLowerCase();
        return (
          <Pressable
            key={entry}
            accessibilityRole="button"
            accessibilityLabel={entry}
            disabled={disabled}
            onPress={() => onSelect(entry)}
            style={[
              styles.swatch,
              { backgroundColor: entry },
              on && { borderWidth: 2, borderColor: colors.surface, transform: [{ scale: 1.18 }] },
            ]}
          />
        );
      })}
    </View>
  );
}

/* ============================ 底部弹层 ============================ */

export function Sheet({
  visible,
  onClose,
  title,
  description,
  children,
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  dismissable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismissable ? onClose : undefined}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityLabel="关闭弹层"
        />
        <View
          style={[
            styles.sheetCard,
            { paddingBottom: Math.max(insets.bottom, 14) + 12 },
          ]}
        >
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {description ? <Text style={styles.sheetDescription}>{description}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <View style={styles.sheetActions}>{children}</View>;
}

export function SheetOption({
  label,
  detail,
  selected,
  color,
  onPress,
  last,
}: {
  label: string;
  detail?: string;
  selected?: boolean;
  color?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        !last && styles.optionBorder,
        pressed && styles.optionPressed,
      ]}
    >
      {color ? <View style={[styles.optionDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.optionLabel, selected && styles.optionSelected]} numberOfLines={1}>
        {label}
      </Text>
      {detail ? <Text style={styles.optionDetail}>{detail}</Text> : null}
      {selected ? <Text style={styles.optionTick}>✓</Text> : <ChevronRight size={14} color={colors.faint} />}
    </Pressable>
  );
}

/* ============================ 列表 / 空态 ============================ */

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function LoadingBlock({ text = '正在同步保险库…' }: { text?: string }) {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.emptyText, styles.loadingText]}>{text}</Text>
    </View>
  );
}

/* ============================ 密码强度 ============================ */

const STRENGTH_COLORS = {
  weak: colors.danger,
  mid: colors.warning,
  strong: colors.success,
} as const;

export function PasswordStrengthView({ strength }: { strength: PasswordStrength }) {
  return (
    <Text style={[styles.strength, { color: STRENGTH_COLORS[strength.level] }]}>
      〔{strength.label}〕{strength.hint}
    </Text>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.55 },
  errorSpace: { minHeight: 16 },
  errorText: { color: colors.danger, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  hint: { color: colors.muted, fontSize: 10.8, lineHeight: 17, marginTop: 6 },

  button: {
    height: 46,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonPressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  buttonDisabled: { opacity: 0.5 },
  primaryButton: { backgroundColor: colors.accent },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  dangerButton: { backgroundColor: colors.danger },
  dangerButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  ghostButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  ghostButtonText: { color: colors.ink, fontSize: 13.5 },
  quietButton: { backgroundColor: 'transparent' },
  quietButtonText: { color: colors.muted, fontSize: 13.5 },

  iconButton: { minWidth: 32, minHeight: 32, alignItems: 'flex-start', justifyContent: 'center' },

  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
  },
  headerSide: { width: 84, justifyContent: 'center' },
  headerRight: { alignItems: 'flex-end' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  headerAction: { color: colors.accent, fontSize: 13.5, fontWeight: '600' },

  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10.8,
    color: colors.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 7,
  },
  inputRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  inputGrow: { flex: 1 },
  input: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    color: colors.ink,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top', lineHeight: 20 },
  inputReadonly: { backgroundColor: colors.field, color: colors.muted },

  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#FFFFFF', fontWeight: '600' },

  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 4 },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },

  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheetCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 6 },
  sheetDescription: { fontSize: 12.3, color: colors.muted, lineHeight: 19, marginBottom: 14 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  sheetActionsColumn: { flexDirection: 'column', gap: 8, marginTop: 16 },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    minHeight: 48,
  },
  optionBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineSoft },
  optionPressed: { opacity: 0.6 },
  optionDot: { width: 8, height: 8, borderRadius: 4 },
  optionLabel: { fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  optionSelected: { color: colors.accent, fontWeight: '600' },
  optionDetail: { marginLeft: 'auto', fontSize: 11.5, color: colors.muted },
  optionTick: { color: colors.accent, fontSize: 14, fontWeight: '700', marginLeft: 6 },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: colors.field,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { fontSize: 12.5, color: colors.ink2 },
  chipTextActive: { color: '#FFFFFF', fontWeight: '600' },

  empty: { paddingVertical: 44, paddingHorizontal: 22, alignItems: 'center' },
  emptyText: {
    color: colors.muted,
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  loadingText: { marginTop: 10 },

  strength: { fontSize: 11, lineHeight: 16, marginTop: 4 },
});
