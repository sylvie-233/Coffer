'use client';

import { useState } from 'react';
import {
  ITEM_TYPE,
  type CardItemData,
  type ItemData,
  type ItemType,
  type LoginItemData,
  type NoteItemData,
} from '@coffer/types';
import { cn, generatePassword } from '@coffer/utils';
import { X } from 'lucide-react';

import type { FolderView, ItemDraft, ItemView } from '@coffer/vault-core';

export interface ItemFormModalProps {
  mode: 'create' | 'edit';
  item?: ItemView;
  folders: FolderView[];
  initialFolderId: number | null;
  onClose: () => void;
  onSubmit: (draft: ItemDraft) => Promise<unknown>;
}

const EMPTY_LOGIN: LoginItemData = { username: '', password: '', url: '', note: '' };
const EMPTY_CARD: CardItemData = { cardNo: '', expiry: '', pin: '', note: '' };
const EMPTY_NOTE: NoteItemData = { content: '' };

function loginOf(data: ItemData | null): LoginItemData {
  if (data && 'username' in data) {
    return {
      username: data.username,
      password: data.password,
      url: data.url,
      note: data.note,
    };
  }
  return { ...EMPTY_LOGIN };
}

function cardOf(data: ItemData | null): CardItemData {
  if (data && 'cardNo' in data) {
    return {
      cardNo: data.cardNo,
      expiry: data.expiry,
      pin: data.pin,
      note: data.note,
    };
  }
  return { ...EMPTY_CARD };
}

function noteOf(data: ItemData | null): NoteItemData {
  if (data && 'content' in data) {
    return { content: data.content };
  }
  return { ...EMPTY_NOTE };
}

export function ItemFormModal({
  mode,
  item,
  folders,
  initialFolderId,
  onClose,
  onSubmit,
}: ItemFormModalProps) {
  const [type, setType] = useState<ItemType>(item?.type ?? ITEM_TYPE.LOGIN);
  const [name, setName] = useState(item?.name ?? '');
  const [login, setLogin] = useState<LoginItemData>(() => loginOf(item?.data ?? null));
  const [card, setCard] = useState<CardItemData>(() => cardOf(item?.data ?? null));
  const [note, setNote] = useState<NoteItemData>(() => noteOf(item?.data ?? null));
  const [folderId, setFolderId] = useState<string>(() => {
    if (item) {
      return item.folderId === null ? '' : String(item.folderId);
    }
    return initialFolderId === null ? '' : String(initialFolderId);
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function buildData(): ItemData {
    if (type === ITEM_TYPE.LOGIN) {
      return login;
    }
    if (type === ITEM_TYPE.CARD) {
      return card;
    }
    return note;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!name.trim()) {
      setError(type === ITEM_TYPE.NOTE ? '请输入笔记标题' : '请输入凭证名称');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        type,
        data: buildData(),
        folderId: folderId === '' ? null : Number(folderId),
      });
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  const isNote = type === ITEM_TYPE.NOTE;
  const isCard = type === ITEM_TYPE.CARD;

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label="凭证表单">
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>{mode === 'create' ? '新建凭证' : '编辑凭证'}</h3>
          <button type="button" className="x" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="modal-body">
          <div className={cn('seg', mode === 'edit' && 'fm-locked')}>
            <button
              type="button"
              className={cn(type === ITEM_TYPE.LOGIN && 'on')}
              onClick={() => setType(ITEM_TYPE.LOGIN)}
            >
              登录账号
            </button>
            <button
              type="button"
              className={cn(type === ITEM_TYPE.CARD && 'on')}
              onClick={() => setType(ITEM_TYPE.CARD)}
            >
              卡片证件
            </button>
            <button
              type="button"
              className={cn(type === ITEM_TYPE.NOTE && 'on')}
              onClick={() => setType(ITEM_TYPE.NOTE)}
            >
              安全笔记
            </button>
          </div>

          <div className="mf">
            <label htmlFor="fm-name">{isNote ? '标题' : '名称'}</label>
            <input
              id="fm-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                isCard ? '例如：招商银行储蓄卡' : isNote ? '例如：服务器 SSH 说明' : '例如：阿里云控制台'
              }
              maxLength={80}
              autoComplete="off"
              autoFocus
            />
          </div>

          {type === ITEM_TYPE.LOGIN && (
            <div className="mf">
              <label htmlFor="fm-user">用户名</label>
              <input
                id="fm-user"
                value={login.username}
                onChange={(event) => setLogin({ ...login, username: event.target.value })}
                placeholder="邮箱或用户名"
                autoComplete="off"
              />
            </div>
          )}

          {isCard && (
            <div className="mf">
              <label htmlFor="fm-cardno">卡号 / 证件号</label>
              <input
                id="fm-cardno"
                value={card.cardNo}
                onChange={(event) => setCard({ ...card, cardNo: event.target.value })}
                placeholder="6225 8801 4472 3721"
                autoComplete="off"
              />
            </div>
          )}

          {(type === ITEM_TYPE.LOGIN || isCard) && (
            <div className="mf">
              <label htmlFor="fm-pwd">{isCard ? '密码 / PIN（可选）' : '密码'}</label>
              <div className="row2">
                <input
                  id="fm-pwd"
                  value={isCard ? card.pin : login.password}
                  onChange={(event) =>
                    isCard
                      ? setCard({ ...card, pin: event.target.value })
                      : setLogin({ ...login, password: event.target.value })
                  }
                  placeholder={isCard ? '卡片 PIN 或取款密码' : '输入或生成'}
                  autoComplete="off"
                />
                {!isCard && (
                  <button
                    type="button"
                    className="mini"
                    onClick={() => setLogin({ ...login, password: generatePassword(16) })}
                  >
                    生成
                  </button>
                )}
              </div>
            </div>
          )}

          {isCard && (
            <div className="mf">
              <label htmlFor="fm-expiry">有效期</label>
              <input
                id="fm-expiry"
                value={card.expiry}
                onChange={(event) => setCard({ ...card, expiry: event.target.value })}
                placeholder="2031-06 或 09/28"
                autoComplete="off"
              />
            </div>
          )}

          {type === ITEM_TYPE.LOGIN && (
            <div className="mf">
              <label htmlFor="fm-url">网址</label>
              <input
                id="fm-url"
                value={login.url}
                onChange={(event) => setLogin({ ...login, url: event.target.value })}
                placeholder="https://"
                autoComplete="off"
              />
            </div>
          )}

          <div className="mf">
            <label htmlFor="fm-note">{isNote ? '正文' : '备注'}</label>
            <textarea
              id="fm-note"
              value={isNote ? note.content : isCard ? card.note : login.note}
              onChange={(event) => {
                if (isNote) {
                  setNote({ content: event.target.value });
                } else if (isCard) {
                  setCard({ ...card, note: event.target.value });
                } else {
                  setLogin({ ...login, note: event.target.value });
                }
              }}
              placeholder={isNote ? '正文会整段加密保存' : '写点什么…'}
              rows={isNote ? 7 : 3}
            />
          </div>

          <div className="mf" style={{ marginBottom: 4 }}>
            <label htmlFor="fm-folder">文件夹</label>
            <select
              id="fm-folder"
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
            >
              <option value="">未分类</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'edit' && (
            <p className="fhint">保存后在详情页解锁即可添加或移除加密图片附件。</p>
          )}

          <div className="auth-error" style={{ margin: '8px 0 0', minHeight: 16 }}>
            {error}
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn-ok" disabled={busy}>
            {busy ? '加密保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}
