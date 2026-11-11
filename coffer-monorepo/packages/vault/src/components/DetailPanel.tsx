'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ITEM_TYPE_LABELS,
  TRASH_RETENTION_DAYS,
  type ItemData,
} from '@coffer/types';
import { cn, formatDate, formatFileSize } from '@coffer/utils';
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  ImageOff,
  Lock,
  Pencil,
  RotateCcw,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';

import { copyText } from '@coffer/ui';
import { toast } from '@coffer/ui';
import type { AttachmentView, FolderView, ItemView } from '@coffer/vault-core';
import { AttachmentThumb } from './AttachmentThumb';
import { Lightbox } from '@coffer/ui';

export interface DetailPanelProps {
  item: ItemView | null;
  folders: FolderView[];
  unlocked: boolean;
  isTrash: boolean;
  mobileOpen: boolean;
  loadAttachmentUrl: (attachment: AttachmentView) => Promise<string>;
  onBack: () => void;
  onUnlock: () => void;
  onToggleFavorite: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onUploadAttachment: (file: File) => Promise<unknown>;
  onRemoveAttachment: (attachment: AttachmentView) => Promise<void>;
}

function tileStyle(item: ItemView, folder: FolderView | undefined): React.CSSProperties {
  const base =
    folder?.color ??
    (item.type === '1' ? '#C9752F' : item.type === '2' ? '#35707B' : '#125B4A');
  return { background: `${base}1F`, color: base };
}

function glyphOf(item: ItemView): string {
  if (item.broken) {
    return '?';
  }
  const chars = Array.from(item.name.trim());
  return chars[0] ?? (item.type === '2' ? '记' : item.type === '1' ? '卡' : '账');
}

function daysLeft(deletedTime: string): number {
  const elapsed = Date.now() - new Date(deletedTime).getTime();
  const passed = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return Math.max(0, TRASH_RETENTION_DAYS - passed);
}

export interface FieldRowProps {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
  placeholder?: string;
}

function FieldRow({ label, value, mono, link, placeholder = '—' }: FieldRowProps) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div
        className={cn('field-val', mono && 'mono', link && 'link')}
        style={value ? undefined : { color: 'var(--muted)' }}
      >
        {value || placeholder}
      </div>
      {value && (
        <div className="field-tools">
          <button
            type="button"
            className="tool"
            title="复制"
            onClick={() => void copyText(value, '已复制')}
          >
            <Copy size={13} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

export interface SecretRowProps {
  label: string;
  value: string;
  clearAfterMs?: number;
}

function SecretRow({ label, value, clearAfterMs = 0 }: SecretRowProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
  }, [value]);

  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className={cn('field-val', 'mono')}>
        {value ? (shown ? value : '••••••••••••••••') : '—'}
      </div>
      {value && (
        <div className="field-tools">
          <button
            type="button"
            className="tool"
            title={shown ? '隐藏' : '显示'}
            onClick={() => setShown((prev) => !prev)}
          >
            {shown ? <EyeOff size={14} strokeWidth={1.9} /> : <Eye size={14} strokeWidth={1.9} />}
          </button>
          <button
            type="button"
            className="tool"
            title="复制"
            onClick={() =>
              void copyText(
                value,
                label.includes('密码') ? '密码已复制' : '已复制',
                clearAfterMs,
              )
            }
          >
            <Copy size={13} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

function LoginFields({ data }: { data: Extract<ItemData, { username: string }> }) {
  return (
    <>
      <FieldRow label="用户名" value={data.username} />
      <SecretRow label="密码" value={data.password} clearAfterMs={10_000} />
      <FieldRow
        label="网址"
        value={data.url ? data.url.replace(/^https?:\/\//, '') : ''}
        link
        placeholder="未填写网址"
      />
      {data.note && <NoteRow note={data.note} />}
    </>
  );
}

function CardFields({ data }: { data: Extract<ItemData, { cardNo: string }> }) {
  return (
    <>
      <FieldRow label="卡号 / 证件号" value={data.cardNo} mono placeholder="未填写卡号" />
      <FieldRow label="有效期" value={data.expiry} placeholder="未填写" />
      <SecretRow label="密码 / PIN" value={data.pin} clearAfterMs={10_000} />
      {data.note && <NoteRow note={data.note} />}
    </>
  );
}

function NoteRow({ note }: { note: string }) {
  return (
    <div className="field">
      <div className="field-label">备注</div>
      <div className="field-val muted" style={{ whiteSpace: 'normal', lineHeight: 1.6 }}>
        {note}
      </div>
    </div>
  );
}

export function DetailPanel({
  item,
  folders,
  unlocked,
  isTrash,
  mobileOpen,
  loadAttachmentUrl,
  onBack,
  onUnlock,
  onToggleFavorite,
  onEdit,
  onDelete,
  onRestore,
  onUploadAttachment,
  onRemoveAttachment,
}: DetailPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<{ url: string; caption: string } | null>(null);

  if (!item) {
    return (
      <main className={cn('col-detail', mobileOpen && 'mobile-show')}>
        <div className="detail-empty">
          <div className="mark">
            <Lock size={22} strokeWidth={1.7} />
          </div>
          <p>从左侧选择一条凭证查看详情。<br />内容只在你的浏览器内解密。</p>
        </div>
      </main>
    );
  }

  const folder = item.folderId ? folders.find((entry) => entry.id === item.folderId) : undefined;
  const folderLabel = folder?.name ?? '未分类';
  const imageLabel = item.type === '1' ? '卡片正反面 / 附件' : '图片附件';
  const typeLabel = ITEM_TYPE_LABELS[item.type];

  const lockedHint =
    item.type === '0'
      ? '用户名、密码和图片附件'
      : item.type === '1'
        ? '卡号、有效期、PIN 和图片附件'
        : '笔记正文';

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await onUploadAttachment(file);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : '附件上传失败');
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  }

  async function handleRemoveAttachment(attachment: AttachmentView) {
    try {
      await onRemoveAttachment(attachment);
    } catch (error) {
      toast(error instanceof Error ? error.message : '附件删除失败');
    }
  }

  function renderBody() {
    if (!item) {
      return null;
    }
    if (item.broken) {
      return (
        <>
          <div className="notice" style={{ borderColor: '#efd3d6', background: '#fbf1f2', color: '#8c3f48' }}>
            <AlertTriangle size={13} strokeWidth={2.1} />
            该条目的密文无法解密，可能来自旧密钥版本。请确认数据完整性，或从备份恢复。
          </div>
        </>
      );
    }

    if (!unlocked) {
      return (
        <div className="locked">
          <div className="seal">
            <Lock size={22} strokeWidth={1.7} />
          </div>
          <h4>此条目已加密保护</h4>
          <p>
            查看{lockedHint}需要再次验证身份。标题、类型和修改时间不加密，可以直接看到。
          </p>
          <button type="button" className="go" onClick={onUnlock}>
            <Lock size={12} strokeWidth={2.2} />
            解锁查看
          </button>
          <div className="hintline">解锁仅对当前条目有效，切换条目会重新上锁</div>
          <div className="blur-rows">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      );
    }

    if (item.data && item.type === '0' && 'username' in item.data) {
      return <LoginFields data={item.data} />;
    }
    if (item.data && item.type === '1' && 'cardNo' in item.data) {
      return <CardFields data={item.data} />;
    }
    if (item.data && item.type === '2' && 'content' in item.data) {
      return <div className="note-block">{item.data.content || '（空白笔记）'}</div>;
    }
    return <div className="note-block">没有可展示的字段。</div>;
  }

  return (
    <main className={cn('col-detail', mobileOpen && 'mobile-show')}>
      <div className="detail-head">
        <button type="button" className="detail-back" title="返回列表" onClick={onBack}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="big-tile" style={tileStyle(item, folder)}>
          {glyphOf(item)}
        </div>
        <div className="detail-title">
          <h2>{item.name}</h2>
          <div className="meta">
            <span className="tag">{typeLabel}</span>
            <span className="dot-sep" />
            <em>{folderLabel}</em>
            {item.deletedTime && (
              <>
                <span className="dot-sep" />
                <em style={{ color: 'var(--danger)' }}>回收站</em>
              </>
            )}
          </div>
        </div>
        <div className="head-actions">
          {isTrash ? (
            <button type="button" className="btn-ghost" onClick={onRestore}>
              <RotateCcw size={12} strokeWidth={2.2} />
              <span>恢复</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={cn('btn-icon', item.fav && 'on')}
                title={item.fav ? '取消收藏' : '收藏'}
                aria-pressed={item.fav}
                onClick={onToggleFavorite}
              >
                <Star size={15} strokeWidth={1.7} fill={item.fav ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={onEdit}
                disabled={item.broken}
              >
                <Pencil size={12} strokeWidth={2.2} />
                <span>编辑</span>
              </button>
              <button type="button" className="btn-icon" title="删除" onClick={onDelete}>
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="detail-body">
        {item.deletedTime && (
          <div className="notice">
            <AlertTriangle size={13} strokeWidth={2.1} />
            已在回收站保留，剩余 {daysLeft(item.deletedTime)} 天，到期后自动永久删除。
          </div>
        )}

        {renderBody()}

        {!item.broken && unlocked && (
          <div className="sec">
            <div className="sec-title">
              <span>{imageLabel}</span>
              <em>{item.attachments.length ? `${item.attachments.length} 张 · 已加密` : '暂无'}</em>
              {!isTrash && (
                <button type="button" className="add" onClick={() => fileRef.current?.click()}>
                  + 添加
                </button>
              )}
            </div>
            <div className="thumbs">
              {item.attachments.map((attachment) => (
                <AttachmentThumb
                  key={attachment.id}
                  attachment={attachment}
                  loadUrl={loadAttachmentUrl}
                  removeable={!isTrash}
                  onOpen={(url, caption) => setLightbox({ url, caption })}
                  onRemove={(entry) => void handleRemoveAttachment(entry)}
                />
              ))}
              {!isTrash && (
                <button
                  type="button"
                  className="thumb-upload"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <span className="spinner" /> : <Upload size={15} strokeWidth={2} />}
                  {uploading ? '上传中…' : '上传图片'}
                </button>
              )}
              {isTrash && item.attachments.length === 0 && (
                <span className="fm-imgs">
                  <span className="tip">无附件</span>
                </span>
              )}
            </div>
            {!isTrash && (
              <p className="fhint" style={{ marginTop: 8 }}>
                图片在浏览器内加密后上传，服务端与对象存储只能看到密文。
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </div>
        )}

        {item.broken && (
          <div className="sec">
            <div className="sec-title">
              <span>加密状态</span>
              <em>
                <ImageOff size={11} strokeWidth={2} /> 不可读
              </em>
            </div>
            <p className="fhint">
              该条目包含无法解密的字段。若你最近修改过主密码，请确认当前密钥版本与云端一致。
            </p>
          </div>
        )}

        <div className="foot-meta">
          <div>
            <dt>创建时间</dt>
            <dd>{formatDate(item.createTime)}</dd>
          </div>
          <div>
            <dt>最近修改</dt>
            <dd>{formatDate(item.updateTime ?? item.createTime)}</dd>
          </div>
          <div>
            <dt>密钥版本</dt>
            <dd>v{item.keyVersion}</dd>
          </div>
          {item.attachments.length > 0 && (
            <div>
              <dt>附件合计</dt>
              <dd>
                {formatFileSize(item.attachments.reduce((sum, entry) => sum + entry.size, 0))}
              </dd>
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <Lightbox url={lightbox.url} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      )}
    </main>
  );
}
