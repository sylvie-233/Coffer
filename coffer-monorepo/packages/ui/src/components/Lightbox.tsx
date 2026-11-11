'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export interface LightboxProps {
  url: string;
  caption: string;
  onClose: () => void;
}

/** 图片查看层：解密后的对象 URL 只在浏览器内存在。 */
export function Lightbox({ url, caption, onClose }: LightboxProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-[14px] bg-[rgba(16,14,12,0.92)]"
      role="dialog"
      aria-modal="true"
      aria-label={caption}
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute right-6 top-5 grid h-8 w-8 place-items-center rounded-full border-0 bg-white/12 text-white"
        onClick={onClose}
        aria-label="关闭"
      >
        <X size={15} strokeWidth={2.2} />
      </button>
      <img
        className="max-h-[76vh] max-w-[74vw] rounded-[10px] shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        src={url}
        alt={caption}
        onClick={(event) => event.stopPropagation()}
      />
      <div className="text-[12.5px] text-white/75">{caption}</div>
    </div>
  );
}
