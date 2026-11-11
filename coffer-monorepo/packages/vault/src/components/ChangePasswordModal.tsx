'use client';

import { useState } from 'react';
import type { UserProfile } from '@coffer/types';
import { X } from 'lucide-react';

export interface ChangePasswordModalProps {
  onClose: () => void;
  onChangeMasterPassword: (
    oldPassword: string,
    newPassword: string,
    onProgress: (message: string) => void,
  ) => Promise<UserProfile>;
}

 /** 修改主密码：客户端全量重加密后一次性提交，期间禁止关闭弹窗。 */
export function ChangePasswordModal({ onClose, onChangeMasterPassword }: ChangePasswordModalProps) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (!oldPassword) {
      setError('请输入当前主密码');
      return;
    }
    if (newPassword.length < 8) {
      setError('新主密码至少需要 8 位');
      return;
    }
    if (newPassword === oldPassword) {
      setError('新主密码不能与当前主密码相同');
      return;
    }
    if (newPassword !== confirm) {
      setError('两次输入的新主密码不一致');
      return;
    }

    setBusy(true);
    setError('');
    setProgress('正在本地验证当前主密码…');
    try {
      await onChangeMasterPassword(oldPassword, newPassword, setProgress);
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '修改失败，请重试');
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label="修改主密码">
      <form className="modal xs" onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>修改主密码</h3>
          <button
            type="button"
            className="x"
            onClick={onClose}
            disabled={busy}
            aria-label="关闭"
          >
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="modal-body">
          <p className="pw-note">
            保存后会用新密钥重新加密全部凭证与附件，其他设备需要重新登录。
            过程中请勿关闭页面或切换网络。
          </p>

          <div className="mf">
            <label htmlFor="pw-old">当前主密码</label>
            <input
              id="pw-old"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder="输入当前主密码"
              autoComplete="off"
              autoFocus
              disabled={busy}
            />
          </div>

          <div className="mf">
            <label htmlFor="pw-new">新主密码</label>
            <input
              id="pw-new"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="至少 8 位，建议 12 位以上"
              autoComplete="off"
              disabled={busy}
            />
          </div>

          <div className="mf" style={{ marginBottom: 6 }}>
            <label htmlFor="pw-new2">再次输入新主密码</label>
            <input
              id="pw-new2"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              placeholder="再输入一次"
              autoComplete="off"
              disabled={busy}
            />
          </div>

          {busy && progress && <div className="progress-note">{progress}</div>}
          <div className="auth-error" style={{ margin: '4px 0 0', minHeight: 16 }}>
            {busy && !progress ? '正在处理…' : error}
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="submit" className="btn-ok" disabled={busy}>
            {busy ? '重新加密中…' : '确认修改'}
          </button>
        </div>
      </form>
    </div>
  );
}
