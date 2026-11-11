import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  ChevronDown,
  ChevronRight,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  Search,
  Star,
  User,
  Wallet,
  FolderCog,
} from 'lucide-react-native';
import { ITEM_TYPE, type ItemType } from '@coffer/types';
import { itemSubtitle, matchesQuery } from '@coffer/utils';

import type { FolderView, ItemView } from '@coffer/vault-core';

import { toast } from '../../components/Toast';
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  LoadingBlock,
  ScreenHeader,
  Sheet,
  SheetActions,
  SheetOption,
} from '../../components/ui';
import { useVault } from '../../providers/VaultProvider';
import { colors, radii } from '../../constants/theme';

type Tab = 'vault' | 'fav' | 'me';
type FolderFilter = 'all' | 'none' | number;
type TypeFilter = 'all' | ItemType;

const CHIPS: Array<{ key: TypeFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: ITEM_TYPE.LOGIN, label: '账号' },
  { key: ITEM_TYPE.CARD, label: '卡片' },
  { key: ITEM_TYPE.NOTE, label: '笔记' },
];

function glyphOf(item: ItemView): string {
  if (item.broken) {
    return '?';
  }
  const chars = Array.from(item.name.trim());
  return chars[0] ?? (item.type === ITEM_TYPE.NOTE ? '记' : item.type === ITEM_TYPE.CARD ? '卡' : '账');
}

function tileColors(item: ItemView, folder: FolderView | undefined): { color: string; background: string } {
  const base =
    folder?.color ??
    (item.type === ITEM_TYPE.CARD ? colors.warning : item.type === ITEM_TYPE.NOTE ? '#35707B' : colors.accent);
  return { color: base, background: `${base}1F` };
}

export function VaultHomeScreen() {
  const insets = useSafeAreaInsets();
  const {
    profile,
    avatarUrl,
    folders,
    items,
    loading,
    loadError,
    refresh,
    lock,
    logout,
  } = useVault();

  const [tab, setTab] = useState<Tab>('vault');
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [folderSheetOpen, setFolderSheetOpen] = useState(false);
  const [logoutSheetOpen, setLogoutSheetOpen] = useState(false);

  const activeItems = useMemo(() => items.filter((item) => !item.deletedTime), [items]);

  const folderById = useMemo(() => {
    const map = new Map<number, FolderView>();
    for (const folder of folders) {
      map.set(folder.id, folder);
    }
    return map;
  }, [folders]);

  const pool = useMemo(() => {
    let list = activeItems;
    if (tab === 'fav') {
      list = list.filter((item) => item.fav);
    }
    if (folderFilter === 'none') {
      list = list.filter((item) => item.folderId === null);
    } else if (typeof folderFilter === 'number') {
      list = list.filter((item) => item.folderId === folderFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter((item) => item.type === typeFilter);
    }
    return list.filter((item) => matchesQuery(item.name, item.type, item.data, query));
  }, [activeItems, folderFilter, query, tab, typeFilter]);

  const folderLabel =
    folderFilter === 'all'
      ? tab === 'fav'
        ? '收藏'
        : '保险库'
      : folderFilter === 'none'
        ? '未分类'
        : (folderById.get(folderFilter)?.name ?? '未分类');

  const countLabel =
    tab === 'fav'
      ? `收藏 · ${pool.length}`
      : `${folderLabel} · ${pool.length}`;

  const emptyText = query.trim()
    ? '没有匹配的凭证\n换个关键词，或点右下角 + 新建'
    : tab === 'fav'
      ? '还没有收藏的凭证'
      : folderFilter !== 'all'
        ? '这个文件夹里还没有凭证'
        : '保险库还是空的\n点右下角 + 新建第一条凭证';

  function switchTab(next: Tab) {
    setTab(next);
    if (next !== 'vault') {
      setFolderFilter('all');
    }
  }

  function selectFolder(filter: FolderFilter) {
    setFolderFilter(filter);
    setFolderSheetOpen(false);
  }

  function openDetail(item: ItemView) {
    router.push({ pathname: '/vault/detail', params: { id: String(item.id) } });
  }

  return (
    <View style={styles.root}>
      {tab === 'me' ? (
        <MePanel
          avatarUrl={avatarUrl}
          nickname={profile.nickname}
          avatarColor={profile.avatarColor}
          itemCount={activeItems.length}
          folderCount={folders.length}
          onLogout={() => setLogoutSheetOpen(true)}
        />
      ) : (
        <>
          <View style={[styles.nav, { paddingTop: insets.top + 4 }]}>
            {tab === 'vault' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setFolderSheetOpen(true)}
                style={styles.titleButton}
              >
                <Text style={styles.titleText} numberOfLines={1}>
                  {folderLabel}
                </Text>
                <ChevronDown size={14} color={colors.muted} strokeWidth={2.2} />
              </Pressable>
            ) : (
              <Text style={styles.titleText}>收藏</Text>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="锁定保险库"
              onPress={lock}
              hitSlop={10}
              style={styles.lockButton}
            >
              <Lock size={18} color={colors.ink2} strokeWidth={1.9} />
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <Search size={14} color={colors.muted} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="搜索凭证"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chips}
          >
            {CHIPS.map((chip) => (
              <Chip
                key={chip.key}
                label={chip.label}
                active={typeFilter === chip.key}
                onPress={() => setTypeFilter(chip.key)}
              />
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>{countLabel}</Text>

          {loading ? (
            <LoadingBlock />
          ) : loadError ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Button label="重试" variant="ghost" onPress={() => void refresh()} style={styles.retry} />
            </View>
          ) : (
            <FlatList
              data={pool}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<EmptyState text={emptyText} />}
              renderItem={({ item }) => {
                const folder = item.folderId ? folderById.get(item.folderId) : undefined;
                const tint = tileColors(item, folder);
                return (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openDetail(item)}
                    style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                  >
                    <View style={[styles.tile, { backgroundColor: tint.background }]}>
                      <Text style={[styles.tileText, { color: tint.color }]}>{glyphOf(item)}</Text>
                    </View>
                    <View style={styles.itemText}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemSub} numberOfLines={1}>
                        {item.broken ? '密文校验失败' : itemSubtitle(item.type, item.data)}
                      </Text>
                    </View>
                    {item.fav ? <Star size={13} color={colors.brass} fill={colors.brass} /> : null}
                    <ChevronRight size={15} color="#CFC9BB" strokeWidth={2.2} />
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="新建凭证"
            onPress={() =>
              router.push({
                pathname: '/vault/form',
                params: {
                  mode: 'create',
                  ...(typeof folderFilter === 'number' ? { folderId: String(folderFilter) } : {}),
                },
              })
            }
            style={({ pressed }) => [
              styles.fab,
              { bottom: insets.bottom + 76 },
              pressed && styles.fabPressed,
            ]}
          >
            <Plus size={22} color="#fff" strokeWidth={2.4} />
          </Pressable>
        </>
      )}

      <TabBar active={tab} onChange={switchTab} bottomInset={insets.bottom} />

      <Sheet
        visible={folderSheetOpen}
        onClose={() => setFolderSheetOpen(false)}
        title="选择文件夹"
        description="按文件夹筛选当前凭证列表。"
      >
        <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
          <SheetOption
            label="全部凭证"
            selected={folderFilter === 'all'}
            onPress={() => selectFolder('all')}
          />
          <SheetOption
            label="未分类"
            selected={folderFilter === 'none'}
            onPress={() => selectFolder('none')}
          />
          {folders.map((folder) => (
            <SheetOption
              key={folder.id}
              label={folder.name}
              color={folder.color}
              selected={folderFilter === folder.id}
              detail={`${activeItems.filter((item) => item.folderId === folder.id).length} 条`}
              onPress={() => selectFolder(folder.id)}
            />
          ))}
        </ScrollView>
      </Sheet>

      <Sheet
        visible={logoutSheetOpen}
        onClose={() => setLogoutSheetOpen(false)}
        title="退出登录？"
        description="退出后需要重新输入邮箱与主密码登录。凭证以密文形式保存在云端，退出登录不会删除任何数据。"
      >
        <SheetActions>
          <Button
            label="取消"
            variant="ghost"
            style={styles.actionButton}
            onPress={() => setLogoutSheetOpen(false)}
          />
          <Button
            label="退出登录"
            variant="danger"
            style={styles.actionButton}
            onPress={() => {
              setLogoutSheetOpen(false);
              logout();
            }}
          />
        </SheetActions>
      </Sheet>
    </View>
  );
}

function MePanel({
  avatarUrl,
  nickname,
  avatarColor,
  itemCount,
  folderCount,
  onLogout,
}: {
  avatarUrl: string | null;
  nickname: string;
  avatarColor: string;
  itemCount: number;
  folderCount: number;
  onLogout: () => void;
}) {
  const { lock } = useVault();

  return (
    <View style={styles.meRoot}>
      <ScreenHeader title="我的" />
      <ScrollView contentContainerStyle={styles.meContent} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/vault/profile')}
          style={({ pressed }) => [styles.meHead, pressed && styles.pressed]}
        >
          <Avatar
            url={avatarUrl}
            name={nickname}
            color={`#${avatarColor.replace(/^#/, '')}`}
            size={62}
          />
          <Text style={styles.meName}>{nickname}</Text>
          <Text style={styles.meSub}>
            {itemCount} 条凭证 · {folderCount} 个文件夹 · 已解锁
          </Text>
        </Pressable>

        <View style={styles.meList}>
          <MenuRow
            icon={<User size={17} color="#A9A398" strokeWidth={1.9} />}
            label="个人信息"
            onPress={() => router.push('/vault/profile')}
          />
          <MenuRow
            icon={<KeyRound size={17} color="#A9A398" strokeWidth={1.9} />}
            label="修改主密码"
            onPress={() => router.push('/vault/change-password')}
          />
          <MenuRow
            icon={<FolderCog size={17} color="#A9A398" strokeWidth={1.9} />}
            label="文件夹管理"
            onPress={() => router.push('/vault/folders')}
          />
          <MenuRow
            icon={<Lock size={17} color="#A9A398" strokeWidth={1.9} />}
            label="锁定保险库"
            onPress={lock}
            last
          />
          <MenuRow
            icon={<Info size={17} color="#A9A398" strokeWidth={1.9} />}
            label="关于 Coffer"
            detail="v1.0"
            onPress={() => toast('Coffer v1.0 · 零知识本地加密')}
            last
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onLogout}
          style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}
        >
          <LogOut size={16} color={colors.danger} strokeWidth={1.9} />
          <Text style={styles.logoutText}>退出登录</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  onPress,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        !last && styles.menuRowBorder,
        pressed && styles.pressed,
      ]}
    >
      {icon}
      <Text style={styles.menuLabel}>{label}</Text>
      {detail ? <Text style={styles.menuDetail}>{detail}</Text> : null}
      {!detail ? <ChevronRight size={15} color={colors.faint} strokeWidth={2.2} /> : null}
    </Pressable>
  );
}

function TabBar({
  active,
  onChange,
  bottomInset,
}: {
  active: Tab;
  onChange: (tab: Tab) => void;
  bottomInset: number;
}) {
  const tabs = [
    { key: 'vault' as const, label: '凭证', Icon: Wallet },
    { key: 'fav' as const, label: '收藏', Icon: Star },
    { key: 'me' as const, label: '我的', Icon: User },
  ];
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabs.map(({ key, label, Icon }) => {
        const on = active === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(key)}
            style={styles.tab}
          >
            <Icon
              size={19}
              color={on ? colors.accent : '#A29C90'}
              strokeWidth={1.9}
              fill={key === 'fav' && on ? colors.accent : 'none'}
            />
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  pressed: { opacity: 0.6 },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 8,
    minHeight: 46,
  },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 230 },
  titleText: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  lockButton: { marginLeft: 'auto', padding: 4 },

  searchWrap: {
    marginHorizontal: 18,
    marginTop: 2,
    marginBottom: 10,
    height: 38,
    backgroundColor: colors.field,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: colors.ink, paddingVertical: 0 },
  chipsScroll: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: 7, paddingHorizontal: 18, paddingBottom: 12 },
  sectionLabel: {
    fontSize: 10.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 18,
    paddingBottom: 7,
  },
  listContent: { paddingHorizontal: 10, paddingBottom: 100 },

  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 11,
  },
  itemPressed: { backgroundColor: '#F6F4ED' },
  tile: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 13, fontWeight: '700' },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  itemSub: { fontSize: 11.5, color: colors.muted, marginTop: 2 },

  errorWrap: { padding: 24, alignItems: 'center' },
  errorText: { color: colors.danger, fontSize: 12.5, textAlign: 'center' },
  retry: { marginTop: 14, minWidth: 120 },

  fab: {
    position: 'absolute',
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabPressed: { transform: [{ scale: 0.94 }], opacity: 0.9 },

  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.lineSoft,
    backgroundColor: colors.surface,
    paddingTop: 9,
    paddingHorizontal: 6,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingBottom: 4 },
  tabLabel: { fontSize: 10, color: '#A29C90' },
  tabLabelOn: { color: colors.accent, fontWeight: '600' },

  sheetList: { maxHeight: 360, marginTop: 2 },
  actionButton: { flex: 1 },

  meRoot: { flex: 1, backgroundColor: colors.surface },
  meContent: { paddingBottom: 24 },
  meHead: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft,
  },
  meName: { fontSize: 16, fontWeight: '600', color: colors.ink, marginTop: 10 },
  meSub: { fontSize: 11.5, color: colors.muted, marginTop: 4 },
  meList: { paddingHorizontal: 18, paddingTop: 6 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 15,
    minHeight: 50,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineSoft,
  },
  menuLabel: { flex: 1, fontSize: 13.5, color: colors.ink },
  menuDetail: { fontSize: 11.5, color: colors.muted },
  logout: {
    marginHorizontal: 18,
    marginTop: 20,
    height: 46,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4C6CA',
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutPressed: { backgroundColor: colors.dangerSoft },
  logoutText: { color: colors.danger, fontSize: 13.5, fontWeight: '600' },
});
