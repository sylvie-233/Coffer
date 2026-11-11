import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Copy,
  Eye,
  EyeOff,
  ImageOff,
  LockKeyhole,
  Pencil,
  Star,
  Undo2,
  X,
} from 'lucide-react-native';
import { ITEM_TYPE, type ItemData } from '@coffer/types';

import { unlockWithPassword } from '@coffer/vault-core';
import type { AttachmentView, ItemView } from '@coffer/vault-core';

import { toast } from '../../components/Toast';
import {
  Button,
  EmptyState,
  IconButton,
  ScreenHeader,
  Sheet,
  SheetActions,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import { copyText } from '../../lib/clipboard';
import { colors, radii } from '../../constants/theme';

function typeName(type: ItemView['type']): string {
  return type === ITEM_TYPE.LOGIN ? '账号' : type === ITEM_TYPE.CARD ? '银行卡' : '笔记';
}

function primaryCopy(type: ItemView['type'], data: ItemData | null): string {
  if (!data) {
    return '';
  }
  if (type === ITEM_TYPE.LOGIN) {
    return (data as { password?: string }).password ?? '';
  }
  if (type === ITEM_TYPE.CARD) {
    return (data as { cardNo?: string }).cardNo ?? '';
  }
  return (data as { content?: string }).content ?? '';
}

function primaryCopyLabel(type: ItemView['type']): string {
  return type === ITEM_TYPE.LOGIN ? '复制密码' : type === ITEM_TYPE.CARD ? '复制卡号' : '复制内容';
}

export function DetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const itemId = Number(params.id);
  const { items, profile, loadAttachmentUrl, toggleFavorite, removeItem, restoreItem, removeAttachment } =
    useVault();

  const item = useMemo(() => items.find((entry) => entry.id === itemId), [items, itemId]);

  const [locked, setLocked] = useState(true);
  const [password, setPassword] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [revealFields, setRevealFields] = useState<Record<string, boolean>>({});
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [removeSheetOpen, setRemoveSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<number, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<number, boolean>>({});
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<AttachmentView | null>(null);

  useEffect(() => {
    setLocked(true);
    setPassword('');
    setUnlockError('');
    setRevealFields({});
  }, [itemId]);

  useEffect(() => {
    if (!item || locked || item.deletedTime) {
      return;
    }
    let cancelled = false;
    for (const attachment of item.attachments) {
      if (attachmentUrls[attachment.id] || attachmentErrors[attachment.id] || attachment.broken) {
        continue;
      }
      void loadAttachmentUrl(attachment)
        .then((uri) => {
          if (!cancelled) {
            setAttachmentUrls((prev) => ({ ...prev, [attachment.id]: uri }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setAttachmentErrors((prev) => ({ ...prev, [attachment.id]: true }));
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [attachmentErrors, attachmentUrls, item, loadAttachmentUrl, locked]);

  async function handleUnlock() {
    if (!password || unlockBusy) {
      return;
    }
    setUnlockBusy(true);
    setUnlockError('');
    try {
      const kek = await unlockWithPassword(password, profile);
      if (!kek) {
        setUnlockError('主密码错误，请重试');
        return;
      }
      setPassword('');
      setLocked(false);
    } catch {
      setUnlockError('密钥派生失败，请重试');
    } finally {
      setUnlockBusy(false);
    }
  }

  async function handleDelete() {
    if (!item || busy) {
      return;
    }
    setBusy(true);
    try {
      await removeItem(item.id);
      setDeleteSheetOpen(false);
      router.back();
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (!item || busy) {
      return;
    }
    setBusy(true);
    try {
      await restoreItem(item.id);
    } catch (error) {
      toast(error instanceof Error ? error.message : '恢复失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAttachment() {
    if (!pendingAttachment || busy) {
      return;
    }
    setBusy(true);
    try {
      await removeAttachment(pendingAttachment);
      setRemoveSheetOpen(false);
      setPendingAttachment(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : '删除附件失败');
    } finally {
      setBusy(false);
    }
  }

  if (!item) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="凭证详情" onBack={() => router.back()} />
        <EmptyState text="凭证不存在，可能已被删除" />
      </View>
    );
  }

  const data = item.data;
  const copyValue = primaryCopy(item.type, data);

  return (
    <View style={styles.root}>
      <ScreenHeader
        onBack={() => router.back()}
        left={
          <IconButton accessibilityLabel="返回" onPress={() => router.back()}>
            <Text style={styles.backText}>返回</Text>
          </IconButton>
        }
        title={locked ? '凭证详情' : item.name}
        right={
          locked ? (
            <IconButton accessibilityLabel="重新锁定" onPress={() => setLocked(true)}>
              <LockKeyhole size={17} color={colors.muted} strokeWidth={1.9} />
            </IconButton>
          ) : (
            <IconButton
              accessibilityLabel="编辑凭证"
              disabled={Boolean(item.deletedTime)}
              onPress={() =>
                router.push({ pathname: '/vault/form', params: { mode: 'edit', id: String(item.id) } })
              }
            >
              <Pencil size={17} color={item.deletedTime ? colors.faint : colors.accent} strokeWidth={1.9} />
            </IconButton>
          )
        }
      />

      {locked ? (
        <View style={styles.lockPanel}>
          <View style={styles.lockMark}>
            <LockKeyhole size={22} color={colors.brass} strokeWidth={1.8} />
          </View>
          <Text style={styles.lockTitle}>此凭证已加密</Text>
          <Text style={styles.lockText}>
            名称「{item.name}」可见，账号、密码与图片附件需要验证主密码后才能查看。
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="输入主密码"
            placeholderTextColor={colors.faint}
            secureTextEntry
            autoCapitalize="none"
            editable={!unlockBusy}
            style={styles.lockInput}
            onSubmitEditing={() => void handleUnlock()}
          />
          {unlockError ? <Text style={styles.lockError}>{unlockError}</Text> : null}
          <Button
            label="验证并查看"
            busy={unlockBusy}
            onPress={() => void handleUnlock()}
            style={styles.unlockButton}
          />
          <Text style={styles.lockHint}>密钥只在本机内存中派生，不会发送到服务器</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headRow}>
            <View style={[styles.typeBadge]}>
              <Text style={styles.typeText}>{typeName(item.type)}</Text>
            </View>
            {item.fav ? (
              <View style={styles.favBadge}>
                <Star size={11} color={colors.brass} fill={colors.brass} />
                <Text style={styles.favText}>已收藏</Text>
              </View>
            ) : null}
            {item.broken ? <Text style={styles.brokenTag}>部分密文无法解密</Text> : null}
          </View>

          <Pressable onLongPress={() => setDeleteSheetOpen(true)} delayLongPress={550}>
            <Text style={styles.itemTitle}>{item.name}</Text>
          </Pressable>
          <Text style={styles.itemMeta}>长按标题可删除 · 密文校验通过</Text>

          {item.deletedTime ? (
            <View style={styles.trashBanner}>
              <Text style={styles.trashText}>该凭证在回收站中，将在 30 天后自动清理。</Text>
              <Pressable onPress={() => void handleRestore()} style={styles.restoreButton} disabled={busy}>
                <Undo2 size={13} color={colors.accent} strokeWidth={2.1} />
                <Text style={styles.restoreText}>恢复</Text>
              </Pressable>
            </View>
          ) : null}

          {!data ? (
            <View style={styles.brokenPanel}>
              <Text style={styles.brokenText}>该凭证的数据密文无法解密，可能来自旧密钥版本。</Text>
            </View>
          ) : item.type === ITEM_TYPE.LOGIN ? (
            <>
              <DetailField
                label="用户名"
                value={(data as { username?: string }).username ?? ''}
                onCopy={(value) => copyText(value, '用户名已复制')}
              />
              <DetailField
                label="密码"
                value={(data as { password?: string }).password ?? ''}
                mono
                secret={!(revealFields.password ?? false)}
                onToggleReveal={() =>
                  setRevealFields((prev) => ({ ...prev, password: !prev.password }))
                }
                onCopy={(value) => copyText(value, '密码已复制，10 秒后自动清除', 10000)}
              />
              <DetailField
                label="网址"
                value={(data as { url?: string }).url ?? ''}
                link
              />
              <DetailField
                label="备注"
                value={(data as { note?: string }).note ?? ''}
                multiline
                onCopy={(value) => copyText(value, '备注已复制')}
              />
            </>
          ) : item.type === ITEM_TYPE.CARD ? (
            <>
              <DetailField
                label="卡号"
                value={(data as { cardNo?: string }).cardNo ?? ''}
                mono
                onCopy={(value) => copyText(value, '卡号已复制', 10000)}
              />
              <DetailField
                label="有效期"
                value={(data as { expiry?: string }).expiry ?? ''}
                mono
                onCopy={(value) => copyText(value, '有效期已复制')}
              />
              <DetailField
                label="PIN / CVV"
                value={(data as { pin?: string }).pin ?? ''}
                mono
                secret={!(revealFields.pin ?? false)}
                onToggleReveal={() => setRevealFields((prev) => ({ ...prev, pin: !prev.pin }))}
                onCopy={(value) => copyText(value, 'PIN 已复制，10 秒后自动清除', 10000)}
              />
              <DetailField
                label="备注"
                value={(data as { note?: string }).note ?? ''}
                multiline
                onCopy={(value) => copyText(value, '备注已复制')}
              />
            </>
          ) : (
            <DetailField
              label="内容"
              value={(data as { content?: string }).content ?? ''}
              multiline
              onCopy={(value) => copyText(value, '内容已复制')}
            />
          )}

          {item.attachments.length > 0 ? (
            <View style={styles.attachSection}>
              <Text style={styles.sectionLabel}>图片附件 · {item.attachments.length}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachRow}>
                {item.attachments.map((attachment) => {
                  const uri = attachmentUrls[attachment.id];
                  const failed = attachmentErrors[attachment.id] || attachment.broken;
                  return (
                    <Pressable
                      key={attachment.id}
                      accessibilityRole="button"
                      accessibilityLabel={`附件 ${attachment.name}`}
                      disabled={!uri}
                      onPress={() => uri && setViewerUri(uri)}
                      onLongPress={() => {
                        setPendingAttachment(attachment);
                        setRemoveSheetOpen(true);
                      }}
                      style={styles.attachTile}
                    >
                      {uri ? (
                        <Image source={{ uri }} style={styles.attachImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.attachPlaceholder}>
                          {failed ? (
                            <ImageOff size={17} color={colors.faint} strokeWidth={1.8} />
                          ) : (
                            <ActivityIndicator size="small" color={colors.muted} />
                          )}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={styles.attachHint}>点按查看大图，长按删除附件</Text>
            </View>
          ) : null}

          <Text style={styles.footer}>
            创建于 {new Date(item.createTime).toLocaleDateString('zh-CN')}
            {item.updateTime ? ` · 更新于 ${new Date(item.updateTime).toLocaleDateString('zh-CN')}` : ''}
          </Text>
        </ScrollView>
      )}

      {!locked && !item.deletedTime ? (
        <View style={styles.actionBar}>
          <Pressable
            accessibilityRole="button"
            onPress={() => copyText(copyValue, `${primaryCopyLabel(item.type).replace('复制', '')}已复制`, 10000)}
            disabled={!copyValue}
            style={({ pressed }) => [
              styles.copyButton,
              (pressed || !copyValue) && styles.actionDim,
            ]}
          >
            <Copy size={15} color="#fff" strokeWidth={2} />
            <Text style={styles.copyText}>{primaryCopyLabel(item.type)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void toggleFavorite(item)}
            style={({ pressed }) => [styles.favButton, pressed && styles.actionDim]}
          >
            <Star
              size={18}
              color={item.fav ? colors.brass : colors.ink2}
              fill={item.fav ? colors.brass : 'none'}
              strokeWidth={1.8}
            />
            <Text style={styles.favButtonText}>{item.fav ? '取消收藏' : '收藏'}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={Boolean(viewerUri)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setViewerUri(null)}
      >
        <View style={styles.viewer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭大图"
            style={styles.viewerClose}
            onPress={() => setViewerUri(null)}
          >
            <X size={22} color="#fff" strokeWidth={2.2} />
          </Pressable>
          {viewerUri ? (
            <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
        </View>
      </Modal>

      <Sheet
        visible={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        title="删除此凭证？"
        description="删除后进入回收站并保留 30 天，期间可在详情页恢复。"
      >
        <SheetActions>
          <Button label="取消" variant="ghost" style={styles.sheetButton} onPress={() => setDeleteSheetOpen(false)} />
          <Button
            label="移入回收站"
            variant="danger"
            busy={busy}
            style={styles.sheetButton}
            onPress={() => void handleDelete()}
          />
        </SheetActions>
      </Sheet>

      <Sheet
        visible={removeSheetOpen}
        onClose={() => {
          setRemoveSheetOpen(false);
          setPendingAttachment(null);
        }}
        title="删除附件？"
        description="附件内容会从服务端永久删除，无法恢复。"
      >
        <SheetActions>
          <Button
            label="取消"
            variant="ghost"
            style={styles.sheetButton}
            onPress={() => {
              setRemoveSheetOpen(false);
              setPendingAttachment(null);
            }}
          />
          <Button
            label="删除附件"
            variant="danger"
            busy={busy}
            style={styles.sheetButton}
            onPress={() => void handleRemoveAttachment()}
          />
        </SheetActions>
      </Sheet>
    </View>
  );
}

function DetailField({
  label,
  value,
  mono,
  secret,
  multiline,
  link,
  onCopy,
  onToggleReveal,
}: {
  label: string;
  value: string;
  mono?: boolean;
  secret?: boolean;
  multiline?: boolean;
  link?: boolean;
  onCopy?: (value: string) => void;
  onToggleReveal?: () => void;
}) {
  const empty = !value;
  const canOpen = link && /^https?:\/\//i.test(value);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldBox, multiline && styles.fieldBoxMultiline]}>
        <Text
          selectable={!secret}
          numberOfLines={multiline ? undefined : 1}
          style={[
            styles.fieldValue,
            mono && styles.mono,
            secret && styles.secretValue,
            empty && styles.emptyValue,
            multiline && styles.multilineValue,
          ]}
        >
          {empty ? '—' : secret ? '•'.repeat(Math.min(Array.from(value).length, 18)) : value}
        </Text>
        {!empty && onToggleReveal ? (
          <IconButton
            accessibilityLabel={secret ? '显示内容' : '隐藏内容'}
            onPress={onToggleReveal}
            style={styles.fieldAction}
          >
            {secret ? (
              <Eye size={15} color={colors.muted} strokeWidth={1.9} />
            ) : (
              <EyeOff size={15} color={colors.muted} strokeWidth={1.9} />
            )}
          </IconButton>
        ) : null}
        {canOpen ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(value)}
            style={styles.openLink}
          >
            <Text style={styles.openLinkText}>打开</Text>
          </Pressable>
        ) : null}
        {!empty && onCopy ? (
          <IconButton
            accessibilityLabel={`复制${label}`}
            onPress={() => onCopy(value)}
            style={styles.fieldAction}
          >
            <Copy size={14} color={colors.muted} strokeWidth={1.9} />
          </IconButton>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backText: { color: colors.ink2, fontSize: 13 },

  lockPanel: { paddingHorizontal: 30, paddingTop: 54, alignItems: 'center' },
  lockMark: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#F4EEDF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 16 },
  lockText: {
    fontSize: 12.3,
    lineHeight: 19,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  lockInput: {
    alignSelf: 'stretch',
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 13,
    fontSize: 14,
    color: colors.ink,
    marginTop: 22,
    textAlign: 'center',
    letterSpacing: 1.5,
  },
  lockError: { color: colors.danger, fontSize: 12, marginTop: 8 },
  unlockButton: { alignSelf: 'stretch', marginTop: 14 },
  lockHint: { fontSize: 10.5, color: colors.faint, marginTop: 14, textAlign: 'center' },

  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 110 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: {
    borderRadius: 100,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  typeText: { color: colors.accent, fontSize: 10.5, fontWeight: '600' },
  favBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  favText: { fontSize: 10.5, color: colors.brass },
  brokenTag: { marginLeft: 'auto', fontSize: 10, color: colors.danger },
  itemTitle: { fontSize: 25, fontWeight: '600', color: colors.ink, marginTop: 10, lineHeight: 32 },
  itemMeta: { fontSize: 11, color: colors.faint, marginTop: 5, marginBottom: 14 },

  trashBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    marginBottom: 14,
  },
  trashText: { flex: 1, fontSize: 11.5, color: colors.danger, lineHeight: 17 },
  restoreButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3 },
  restoreText: { fontSize: 11.5, color: colors.accent, fontWeight: '600' },

  brokenPanel: {
    padding: 14,
    borderRadius: radii.md,
    backgroundColor: '#FDF3EF',
    marginBottom: 8,
  },
  brokenText: { fontSize: 12, color: colors.danger, lineHeight: 19 },

  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 6,
    marginLeft: 1,
  },
  fieldBox: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  fieldBoxMultiline: { alignItems: 'flex-start', minHeight: 96 },
  fieldValue: { flex: 1, fontSize: 13.5, color: colors.ink, lineHeight: 20 },
  multilineValue: { lineHeight: 21 },
  mono: { fontFamily: 'monospace', letterSpacing: 0.6 },
  secretValue: { letterSpacing: 2.5, color: colors.ink2 },
  emptyValue: { color: colors.faint },
  fieldAction: { minWidth: 26, minHeight: 26, alignItems: 'center' },
  openLink: { paddingHorizontal: 2, paddingVertical: 3 },
  openLinkText: { color: colors.accent, fontSize: 12, fontWeight: '600' },

  attachSection: { marginTop: 4 },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginBottom: 9,
  },
  attachRow: { gap: 8 },
  attachTile: {
    width: 86,
    height: 86,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.field,
  },
  attachImage: { width: '100%', height: '100%' },
  attachPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.field,
  },
  attachHint: { fontSize: 10.5, color: colors.faint, marginTop: 7 },

  footer: { marginTop: 22, fontSize: 10.5, color: colors.faint },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
  },
  copyButton: {
    flex: 1,
    height: 46,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  copyText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '600' },
  favButton: {
    width: 96,
    height: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  favButtonText: { color: colors.ink2, fontSize: 12.5 },
  actionDim: { opacity: 0.55 },

  viewer: { flex: 1, backgroundColor: '#0B0A08', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', top: 54, right: 22, zIndex: 2, padding: 8 },
  viewerImage: { width: '100%', height: '82%' },

  sheetButton: { flex: 1 },
});
