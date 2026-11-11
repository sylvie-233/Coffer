'use client';

import { useState } from 'react';

export interface ConfirmDialogProps {
  title: string;
  text: React.ReactNode;
  okLabel: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

/** 通用确认弹窗：负责 busy 状态，成功后才关闭。 */
export function ConfirmDialog({
  title,
  text,
  okLabel,
  danger,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm();
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal sm">
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="modal-body" style={{ paddingBottom: 4 }}>
          <div style={{ fontSize: 12.5, color: '#948e82', lineHeight: 1.7 }}>{text}</div>
          {error && (
            <div className="auth-error" style={{ margin: '10px 0 0', minHeight: 16 }}>
              {error}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className={`btn-ok${danger ? ' danger' : ''}`}
            onClick={() => void handleConfirm()}
            disabled={busy}
          >
            {busy ? '处理中…' : okLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
