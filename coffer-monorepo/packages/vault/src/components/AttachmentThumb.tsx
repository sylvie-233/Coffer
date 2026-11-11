'use client';

import { useEffect, useState } from 'react';
import { ImageOff, X } from 'lucide-react';

import type { AttachmentView } from '@coffer/vault-core';

export interface AttachmentThumbProps {
  attachment: AttachmentView;
  loadUrl: (attachment: AttachmentView) => Promise<string>;
  removeable: boolean;
  onOpen: (url: string, caption: string) => void;
  onRemove: (attachment: AttachmentView) => void;
}

/** 单张加密图片：挂载时解密为本地对象 URL，卸载后由 Provider 统一回收。 */
export function AttachmentThumb({
  attachment,
  loadUrl,
  removeable,
  onOpen,
  onRemove,
}: AttachmentThumbProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setUrl(null);
    void loadUrl(attachment)
      .then((next) => {
        if (active) {
          setUrl(next);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });
    return () => {
      active = false;
    };
  }, [attachment, loadUrl]);

  return (
    <div
      className="thumb"
      role="button"
      tabIndex={0}
      title={attachment.broken ? '附件密文无法解密' : attachment.name}
      onClick={() => {
        if (url) {
          onOpen(url, attachment.name);
        }
      }}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && url) {
          onOpen(url, attachment.name);
        }
      }}
    >
      {url ? (
        <img src={url} alt={attachment.name} />
      ) : (
        <div className="thumb-fallback">
          {failed ? <ImageOff size={18} /> : <span className="spinner" />}
          <span>{failed ? '无法解密' : '解密中…'}</span>
        </div>
      )}
      <div className="cap">{attachment.name}</div>
      {removeable && (
        <button
          type="button"
          className="rm"
          title="删除附件"
          onClick={(event) => {
            event.stopPropagation();
            onRemove(attachment);
          }}
        >
          <X size={10} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
