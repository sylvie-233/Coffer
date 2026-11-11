import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronDown,
  CreditCard,
  Eye,
  EyeOff,
  FileText,
  ImagePlus,
  KeyRound,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { ITEM_TYPE, type ItemData, type ItemType } from '@coffer/types';
import { generatePassword } from '@coffer/utils';

import type { AttachmentView, ItemView } from '@coffer/vault-core';

import { toast } from '../../components/Toast';
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  ScreenHeader,
  Sheet,
  SheetOption,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import { pickImages } from '../../lib/media';
import type { PickedImage } from '../../lib/media';
import { colors, radii } from '../../constants/theme';

const TYPE_OPTIONS: Array<{
  type: ItemType;
  label: string;
  hint: string;
  Icon: typeof KeyRound;
}> = [
  { type: ITEM_TYPE.LOGIN, label: '账号', hint: '网站 / 应用登录信息', Icon: KeyRound },
  { type: ITEM_TYPE.CARD, label: '卡片', hint: '银行卡 / 会员卡', Icon: CreditCard },
  { type: ITEM_TYPE.NOTE, label: '笔记', hint: '纯文本私密内容', Icon: FileText },
];

interface FormFields {
  username: string;
  password: string;
  url: string;
  note: string;
  cardNo: string;
  expiry: string;
  pin: string;
  content: string;
}

const EMPTY_FIELDS: FormFields = {
  username: '',
  password: '',
  url: '',
  note: '',
  cardNo: '',
  expiry: '',
  pin: '',
  content: '',
};

function fieldsFrom(item: ItemView | undefined): FormFields {
  if (!item?.data) {
    return EMPTY_FIELDS;
  }
  const data = item.data as unknown as Record<string, unknown>;
  return {
    username: typeof data.username === 'string' ? data.username : '',
    password: typeof data.password === 'string' ? data.password : '',
    url: typeof data.url === 'string' ? data.url : '',
    note: typeof data.note === 'string' ? data.note : '',
    cardNo: typeof data.cardNo === 'string' ? data.cardNo : '',
    expiry: typeof data.expiry === 'string' ? data.expiry : '',
    pin: typeof data.pin === 'string' ? data.pin : '',
    content: typeof data.content === 'string' ? data.content : '',
  };
}

function buildData(type: ItemType, fields: FormFields): ItemData {
  if (type === ITEM_TYPE.LOGIN) {
    return {
      username: fields.username.trim(),
      password: fields.password,
      url: fields.url.trim(),
      note: fields.note.trim(),
    };
  }
  if (type === ITEM_TYPE.CARD) {
    return {
      cardNo: fields.cardNo.trim(),
      expiry: fields.expiry.trim(),
      pin: fields.pin.trim(),
      note: fields.note.trim(),
    };
  }
  return { content: fields.content };
}

export function ItemFormScreen() {
  const params = useLocalSearchParams<{ mode?: string; id?: string; folderId?: string }>();
  const editing = params.mode === 'edit';
  const editingId = Number(params.id);
  const { items, folders, createItem, updateItem, uploadAttachment, removeAttachment, loadAttachmentUrl } =
    useVault();

  const item = useMemo(
    () => (editing ? items.find((entry) => entry.id === editingId) : undefined),
    [editing, editingId, items],
  );

  const initialFolder = params.folderId ? Number(params.folderId) : null;

  const [type, setType] = useState<ItemType>(item?.type ?? ITEM_TYPE.LOGIN);
  const [name, setName] = useState(item?.name ?? '');
  const [folderId, setFolderId] = useState<number | null>(item?.folderId ?? initialFolder);
  const [fields, setFields] = useState<FormFields>(fieldsFrom(item));
  const [showPassword, setShowPassword] = useState(false);
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<PickedImage[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<number, string>>({});
  const [pendingRemove, setPendingRemove] = useState<AttachmentView | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) {
      setType(item.type);
      setName(item.name);
      setFolderId(item.folderId);
      setFields(fieldsFrom(item));
    }
    // 只在切换到另一条凭证时重新填充，附件变化不应覆盖正在编辑的表单。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  useEffect(() => {
    if (!item || editingId !== item.id) {
      return;
    }
    let cancelled = false;
    for (const attachment of item.attachments) {
      if (attachmentUrls[attachment.id] || attachment.broken) {
        continue;
      }
      void loadAttachmentUrl(attachment)
        .then((uri) => {
          if (!cancelled) {
            setAttachmentUrls((prev) => ({ ...prev, [attachment.id]: uri }));
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [attachmentUrls, editingId, item, loadAttachmentUrl]);

  const folderLabel = folderId === null ? '未分类' : (folders.find((folder) => folder.id === folderId)?.name ?? '未分类');

  function updateField<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function switchType(next: ItemType) {
    if (editing) {
      return;
    }
    setType(next);
  }

  async function handlePickPending() {
    if (pendingImages.length >= 9) {
      toast('最多添加 9 张图片');
      return;
    }
    const picked = await pickImages(true);
    setPendingImages((prev) => [...prev, ...picked].slice(0, 9));
  }

  async function handlePickAndUpload() {
    if (!item || uploadBusy) {
      return;
    }
    const picked = await pickImages(true);
    if (picked.length === 0) {
      return;
    }
    setUploadBusy(true);
    try {
      for (const image of picked) {
        await uploadAttachment(item.id, image);
      }
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : '图片上传失败');
    } finally {
      setUploadBusy(false);
    }
  }

  async function handleRemoveAttachment() {
    if (!pendingRemove) {
      return;
    }
    try {
      await removeAttachment(pendingRemove);
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : '删除附件失败');
    } finally {
      setPendingRemove(null);
    }
  }

  async function handleSave() {
    if (busy) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入凭证名称');
      return;
    }
    if (Array.from(trimmed).length > 60) {
      setError('凭证名称最多 60 个字');
      return;
    }
    const data = buildData(type, fields);
    if (type === ITEM_TYPE.LOGIN && !fields.username.trim() && !fields.password) {
      setError('请至少填写用户名或密码');
      return;
    }
    if (type === ITEM_TYPE.CARD && !fields.cardNo.trim()) {
      setError('请填写卡号');
      return;
    }
    if (type === ITEM_TYPE.NOTE && !fields.content.trim()) {
      setError('请填写笔记内容');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editing && item) {
        await updateItem(item.id, { name: trimmed, type, data, folderId });
        router.back();
        return;
      }

      const created = await createItem({ name: trimmed, type, data, folderId });
      for (const image of pendingImages) {
        await uploadAttachment(created.id, image);
      }
      router.replace({ pathname: '/vault/detail', params: { id: String(created.id) } });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  if (editing && !item) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="编辑凭证" onBack={() => router.back()} />
        <EmptyState text="凭证不存在，可能已被删除" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        title={editing ? '编辑凭证' : '新建凭证'}
        onBack={() => router.back()}
        right={
          editing ? <Text style={styles.draftHint}>修改后需重新加密</Text> : null
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>凭证类型</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map(({ type: entryType, label, hint, Icon }) => {
            const on = type === entryType;
            return (
              <Pressable
                key={entryType}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                disabled={editing && !on}
                onPress={() => switchType(entryType)}
                style={[
                  styles.typeCard,
                  on && styles.typeCardOn,
                  editing && !on && styles.typeCardDisabled,
                ]}
              >
                <Icon size={18} color={on ? colors.accent : colors.muted} strokeWidth={1.9} />
                <Text style={[styles.typeLabel, on && styles.typeLabelOn]}>{label}</Text>
                <Text style={styles.typeHint} numberOfLines={1}>
                  {hint}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {editing ? <Text style={styles.typeNote}>编辑时不可更改凭证类型</Text> : null}

        <Field
          label="名称"
          value={name}
          onChangeText={setName}
          placeholder={type === ITEM_TYPE.NOTE ? '笔记标题' : '例如：GitHub、招商银行'}
          maxLength={60}
          autoCapitalize="none"
          returnKeyType="next"
        />

        <Text style={styles.label}>文件夹</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFolderSheetOpen(true)}
          style={styles.folderRow}
        >
          <View style={styles.folderDot}>
            {folderId === null ? null : (
              <View
                style={[
                  styles.folderDotInner,
                  {
                    backgroundColor:
                      folders.find((folder) => folder.id === folderId)?.color ?? colors.brass,
                  },
                ]}
              />
            )}
          </View>
          <Text style={styles.folderName}>{folderLabel}</Text>
          <ChevronDown size={15} color={colors.muted} strokeWidth={2.2} />
        </Pressable>

        {type === ITEM_TYPE.LOGIN ? (
          <>
            <Field
              label="用户名 / 账号"
              value={fields.username}
              onChangeText={(value) => updateField('username', value)}
              placeholder="账号或邮箱"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="密码"
              value={fields.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="留空可稍后填写"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              right={
                <View style={styles.inputActions}>
                  <IconButton
                    accessibilityLabel={showPassword ? '隐藏密码' : '显示密码'}
                    onPress={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? (
                      <EyeOff size={16} color={colors.muted} strokeWidth={1.9} />
                    ) : (
                      <Eye size={16} color={colors.muted} strokeWidth={1.9} />
                    )}
                  </IconButton>
                  <IconButton
                    accessibilityLabel="生成随机密码"
                    onPress={() => {
                      updateField('password', generatePassword(18));
                      setShowPassword(true);
                    }}
                  >
                    <RefreshCw size={16} color={colors.accent} strokeWidth={1.9} />
                  </IconButton>
                </View>
              }
            />
            <Field
              label="网址"
              value={fields.url}
              onChangeText={(value) => updateField('url', value)}
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field
              label="备注"
              value={fields.note}
              onChangeText={(value) => updateField('note', value)}
              placeholder="仅自己可见的补充说明"
              multiline
            />
          </>
        ) : type === ITEM_TYPE.CARD ? (
          <>
            <Field
              label="卡号"
              value={fields.cardNo}
              onChangeText={(value) => updateField('cardNo', value)}
              placeholder="银行卡号 / 会员卡号"
              keyboardType="number-pad"
            />
            <Field
              label="有效期"
              value={fields.expiry}
              onChangeText={(value) => updateField('expiry', value)}
              placeholder="MM/YY"
              keyboardType="numbers-and-punctuation"
            />
            <Field
              label="PIN / CVV"
              value={fields.pin}
              onChangeText={(value) => updateField('pin', value)}
              placeholder="安全码"
              secureTextEntry={!showPassword}
              right={
                <IconButton
                  accessibilityLabel={showPassword ? '隐藏安全码' : '显示安全码'}
                  onPress={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? (
                    <EyeOff size={16} color={colors.muted} strokeWidth={1.9} />
                  ) : (
                    <Eye size={16} color={colors.muted} strokeWidth={1.9} />
                  )}
                </IconButton>
              }
            />
            <Field
              label="备注"
              value={fields.note}
              onChangeText={(value) => updateField('note', value)}
              placeholder="开户行、卡种等说明"
              multiline
            />
          </>
        ) : (
          <Field
            label="内容"
            value={fields.content}
            onChangeText={(value) => updateField('content', value)}
            placeholder="写下需要加密保存的内容…"
            multiline
            inputStyle={styles.contentInput}
          />
        )}

        <View style={styles.attachHead}>
          <Text style={styles.label}>图片附件</Text>
          <Text style={styles.attachCount}>
            {editing ? `${item?.attachments.length ?? 0} 张` : `${pendingImages.length} 张`}
          </Text>
        </View>

        {editing ? (
          <>
            <View style={styles.attachGrid}>
              {item?.attachments.map((attachment) => {
                const uri = attachmentUrls[attachment.id];
                return (
                  <View key={attachment.id} style={styles.attachTile}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.attachImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.attachLoading}>
                        <ActivityIndicator size="small" color={colors.muted} />
                      </View>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`删除附件 ${attachment.name}`}
                      onPress={() => setPendingRemove(attachment)}
                      style={styles.attachRemove}
                    >
                      <X size={12} color="#fff" strokeWidth={2.4} />
                    </Pressable>
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => void handlePickAndUpload()}
                disabled={uploadBusy}
                style={styles.addTile}
              >
                {uploadBusy ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <ImagePlus size={19} color={colors.accent} strokeWidth={1.9} />
                )}
                <Text style={styles.addTileText}>添加图片</Text>
              </Pressable>
            </View>
            <Text style={styles.attachHint}>图片会先在本地加密再上传，单张不超过 3MB</Text>
          </>
        ) : (
          <>
            <View style={styles.attachGrid}>
              {pendingImages.map((image, index) => (
                <View key={`${image.uri}-${index}`} style={styles.attachTile}>
                  <Image source={{ uri: image.uri }} style={styles.attachImage} resizeMode="cover" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="移除待上传图片"
                    onPress={() =>
                      setPendingImages((prev) => prev.filter((_, entryIndex) => entryIndex !== index))
                    }
                    style={styles.attachRemove}
                  >
                    <X size={12} color="#fff" strokeWidth={2.4} />
                  </Pressable>
                </View>
              ))}
              {pendingImages.length < 9 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void handlePickPending()}
                  style={styles.addTile}
                >
                  <Plus size={19} color={colors.accent} strokeWidth={2.1} />
                  <Text style={styles.addTileText}>添加图片</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.attachHint}>保存凭证后，图片会加密上传；单张不超过 3MB</Text>
          </>
        )}

        <View style={styles.errorArea}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <Button
          label={editing ? '保存修改' : '加密保存'}
          busy={busy}
          onPress={() => void handleSave()}
        />
      </View>

      <Sheet
        visible={folderSheetOpen}
        onClose={() => setFolderSheetOpen(false)}
        title="选择文件夹"
        description="凭证会归入所选文件夹，可随时在详情页或编辑页调整。"
      >
        <ScrollView style={styles.folderSheetList} showsVerticalScrollIndicator={false}>
          <SheetOption
            label="未分类"
            selected={folderId === null}
            onPress={() => {
              setFolderId(null);
              setFolderSheetOpen(false);
            }}
          />
          {folders.map((folder) => (
            <SheetOption
              key={folder.id}
              label={folder.name}
              color={folder.color}
              selected={folderId === folder.id}
              onPress={() => {
                setFolderId(folder.id);
                setFolderSheetOpen(false);
              }}
            />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={Boolean(pendingRemove)}
        onClose={() => setPendingRemove(null)}
        title="删除附件？"
        description="附件会立即从服务端删除，无法恢复。"
      >
        <View style={styles.sheetActionsColumn}>
          <Button
            label="取消"
            variant="ghost"
            onPress={() => setPendingRemove(null)}
          />
          <Button
            label="删除附件"
            variant="danger"
            onPress={() => void handleRemoveAttachment()}
          />
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  draftHint: { fontSize: 10.5, color: colors.muted },

  label: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 7,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  typeCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 10,
    paddingVertical: 11,
    gap: 5,
    alignItems: 'flex-start',
  },
  typeCardOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  typeCardDisabled: { opacity: 0.38 },
  typeLabel: { fontSize: 12.5, fontWeight: '600', color: colors.ink2 },
  typeLabelOn: { color: colors.accent },
  typeHint: { fontSize: 9, color: colors.muted },
  typeNote: { fontSize: 10.5, color: colors.faint, marginTop: 6 },

  folderRow: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  folderDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.field },
  folderDotInner: { width: 10, height: 10, borderRadius: 5 },
  folderName: { flex: 1, fontSize: 13.5, color: colors.ink },

  inputActions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 2 },

  contentInput: { minHeight: 150, lineHeight: 21 },

  attachHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  attachCount: { fontSize: 10.5, color: colors.muted, marginTop: 8 },
  attachGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  attachTile: {
    width: 78,
    height: 78,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.field,
  },
  attachImage: { width: '100%', height: '100%' },
  attachLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  attachRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(20,18,15,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 78,
    height: 78,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  addTileText: { fontSize: 9.5, color: colors.muted },
  attachHint: { fontSize: 10.5, color: colors.faint, marginTop: 7 },

  errorArea: { minHeight: 30, marginTop: 10 },
  errorText: { color: colors.danger, fontSize: 12.5 },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
  },
  folderSheetList: { maxHeight: 360 },
  sheetActionsColumn: { gap: 9, marginTop: 8 },
});
