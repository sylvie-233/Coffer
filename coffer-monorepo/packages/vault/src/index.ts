'use client';

export { configureVault, getBrandIconSrc } from './config';
export { configureApi } from '@coffer/vault-core';

export { CofferApp } from './components/CofferApp';
export { VaultProvider, useVault, type VaultContextValue } from './components/VaultProvider';
export { VaultWorkspace } from './components/VaultWorkspace';
export { AuthScreen, type AuthScreenProps } from './components/AuthScreen';
export { LockScreen, type LockScreenProps } from './components/LockScreen';
export { AttachmentThumb, type AttachmentThumbProps } from './components/AttachmentThumb';
export { ChangePasswordModal, type ChangePasswordModalProps } from './components/ChangePasswordModal';
export { DetailPanel, type DetailPanelProps } from './components/DetailPanel';
export { FolderEditModal, type FolderEditModalProps } from './components/FolderEditModal';
export { ItemFormModal, type ItemFormModalProps } from './components/ItemFormModal';
export { ItemList, type ItemListProps, type TypeFilter } from './components/ItemList';
export { ProfileModal, type ProfileModalProps } from './components/ProfileModal';
export { Sidebar, type SidebarProps, type NavKey } from './components/Sidebar';
export { UnlockModal, type UnlockModalProps } from './components/UnlockModal';

export type { FolderView, AttachmentView, ItemView, ItemDraft } from '@coffer/vault-core';
