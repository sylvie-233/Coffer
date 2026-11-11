import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronRight, FolderPlus, Pencil } from 'lucide-react-native';
import { COLOR_PALETTE } from '@coffer/types';

import { toast } from '../../components/Toast';
import {
  Button,
  EmptyState,
  Field,
  ScreenHeader,
  Sheet,
  SheetActions,
  SwatchRow,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import type { FolderView } from '@coffer/vault-core';
import { colors, radii } from '../../constants/theme';

type EditorMode = { kind: 'create' } | { kind: 'edit'; folder: FolderView };

export function FoldersScreen() {
  const { folders, items, createFolder, updateFolder, deleteFolder } = useVault();
  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(COLOR_PALETTE[0]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FolderView | null>(null);

  const activeItems = items.filter((item) => !item.deletedTime);

  function openCreate() {
    setEditor({ kind: 'create' });
    setName('');
    setColor(COLOR_PALETTE[folders.length % COLOR_PALETTE.length]);
    setError('');
  }

  function openEdit(folder: FolderView) {
    setEditor({ kind: 'edit', folder });
    setName(folder.name);
    setColor(folder.color);
    setError('');
  }

  async function handleSave() {
    if (!editor || busy) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请输入文件夹名称');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editor.kind === 'create') {
        await createFolder(trimmed, color);
      } else {
        await updateFolder(editor.folder.id, { name: trimmed, color });
      }
      setEditor(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete || busy) {
      return;
    }
    setBusy(true);
    try {
      await deleteFolder(pendingDelete.id);
      setPendingDelete(null);
      setEditor(null);
    } catch (nextError) {
      toast(nextError instanceof Error ? nextError.message : '删除文件夹失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="文件夹管理"
        onBack={() => router.back()}
        right={
          <Pressable accessibilityRole="button" onPress={openCreate} hitSlop={8}>
            <Text style={styles.headerAction}>新建</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          文件夹名称同样以密文保存。删除文件夹不会删除其中凭证，它们会移入「未分类」。
        </Text>

        {folders.length === 0 ? (
          <EmptyState text={'还没有文件夹\n点右上角「新建」创建第一个'} />
        ) : (
          <View style={styles.list}>
            {folders.map((folder) => {
              const count = activeItems.filter((item) => item.folderId === folder.id).length;
              return (
                <Pressable
                  key={folder.id}
                  accessibilityRole="button"
                  onPress={() => openEdit(folder)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={[styles.dot, { backgroundColor: folder.color }]} />
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {folder.name}
                    </Text>
                    <Text style={styles.rowCount}>{count} 条凭证</Text>
                  </View>
                  {folder.broken ? <Text style={styles.brokenTag}>密文异常</Text> : null}
                  <Pencil size={14} color={colors.muted} strokeWidth={1.9} />
                  <ChevronRight size={15} color={colors.faint} strokeWidth={2.2} />
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={openCreate}
          style={({ pressed }) => [styles.createRow, pressed && styles.rowPressed]}
        >
          <FolderPlus size={17} color={colors.accent} strokeWidth={1.9} />
          <Text style={styles.createText}>新建文件夹</Text>
        </Pressable>
      </ScrollView>

      <Sheet
        visible={Boolean(editor)}
        onClose={() => {
          if (!busy) {
            setEditor(null);
          }
        }}
        title={editor?.kind === 'edit' ? '编辑文件夹' : '新建文件夹'}
        description="名称最多 12 个字，颜色用于列表中的标识。"
        dismissable={!busy}
      >
        <Field
          label="文件夹名称"
          value={name}
          onChangeText={setName}
          placeholder="例如：工作、金融、私人"
          maxLength={12}
          autoFocus
        />
        <Text style={styles.sheetSwatchLabel}>颜色</Text>
        <SwatchRow palette={COLOR_PALETTE} selected={color} onSelect={setColor} disabled={busy} />
        <View style={styles.sheetErrorArea}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
        <SheetActions>
          {editor?.kind === 'edit' ? (
            <Button
              label="删除"
              variant="ghost"
              style={styles.deleteButton}
              onPress={() => {
                if (editor.kind === 'edit') {
                  setPendingDelete(editor.folder);
                }
              }}
              disabled={busy}
            />
          ) : null}
          <Button
            label={editor?.kind === 'edit' ? '保存' : '创建'}
            style={styles.saveButton}
            busy={busy}
            onPress={() => void handleSave()}
          />
        </SheetActions>
      </Sheet>

      <Sheet
        visible={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={`删除「${pendingDelete?.name ?? ''}」？`}
        description="文件夹会被永久删除，其中的凭证会移入「未分类」，凭证本身不受影响。"
      >
        <SheetActions>
          <Button
            label="取消"
            variant="ghost"
            style={styles.sheetButton}
            onPress={() => setPendingDelete(null)}
          />
          <Button
            label="删除文件夹"
            variant="danger"
            style={styles.sheetButton}
            busy={busy}
            onPress={() => void handleDelete()}
          />
        </SheetActions>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerAction: { color: colors.accent, fontSize: 13.5, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  intro: { fontSize: 11.3, lineHeight: 18, color: colors.muted, marginTop: 8, marginBottom: 14 },

  list: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 54,
    paddingHorizontal: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft,
  },
  rowPressed: { opacity: 0.6 },
  dot: { width: 11, height: 11, borderRadius: 5.5 },
  rowText: { flex: 1 },
  rowName: { fontSize: 13.5, color: colors.ink, fontWeight: '500' },
  rowCount: { fontSize: 10.5, color: colors.muted, marginTop: 2 },
  brokenTag: { fontSize: 10, color: colors.danger },

  createRow: {
    marginTop: 12,
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createText: { fontSize: 12.5, color: colors.accent, fontWeight: '600' },

  sheetSwatchLabel: {
    fontSize: 10.5,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 10,
  },
  sheetErrorArea: { minHeight: 24, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 12 },
  deleteButton: { paddingHorizontal: 18 },
  saveButton: { flex: 1 },
  sheetButton: { flex: 1 },
});
