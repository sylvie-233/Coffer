'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '@coffer/types';
import { COLOR_PALETTE, MAX_ATTACHMENT_BYTES } from '@coffer/types';
import { cn } from '@coffer/utils';
import { ChevronRight, KeyRound, X } from 'lucide-react';

import { toast } from '@coffer/ui';
import { Avatar } from '@coffer/ui';

export interface ProfileModalProps {
  profile: UserProfile;
  avatarUrl: string | null;
  onClose: () => void;
  onSave: (input: { nickname?: string; avatarColor?: string }) => Promise<UserProfile>;
  onUploadAvatar: (file: File) => Promise<UserProfile>;
  onRemoveAvatar: () => Promise<UserProfile>;
  onChangePassword: () => void;
  onLogout: () => void;
}

export function ProfileModal({
  profile,
  avatarUrl,
  onClose,
  onSave,
  onUploadAvatar,
  onRemoveAvatar,
  onChangePassword,
  onLogout,
}: ProfileModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState(profile.nickname);
  const [color, setColor] = useState(`#${profile.avatarColor.replace(/^#/, '')}`);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pendingAvatar) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingAvatar);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingAvatar]);

  function pickFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast('请选择图片文件');
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast('图片不能超过 3MB');
      return;
    }
    setPendingAvatar(file);
    setRemoveAvatar(false);
  }

  async function handleSave() {
    if (busy) {
      return;
    }
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError('昵称不能为空');
      return;
    }
    if (Array.from(trimmed).length > 16) {
      setError('昵称不能超过 16 个字');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await onSave({
        nickname: trimmed,
        avatarColor: color.replace(/^#/, ''),
      });
      if (pendingAvatar) {
        await onUploadAvatar(pendingAvatar);
      } else if (removeAvatar) {
        await onRemoveAvatar();
      }
      onClose();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  const displayUrl = preview ?? (removeAvatar ? null : avatarUrl);

  return (
    <div className="mask" role="dialog" aria-modal="true" aria-label="个人资料">
      <div className="modal sm">
        <div className="modal-head">
          <h3>个人资料</h3>
          <button type="button" className="x" onClick={onClose} disabled={busy} aria-label="关闭">
            <X size={15} strokeWidth={2.2} />
          </button>
        </div>

        <div className="modal-body">
          <div className="pf-top">
            <button
              type="button"
              className="pf-avatar-btn"
              title="点击上传头像"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Avatar
                url={displayUrl}
                name={nickname || profile.nickname}
                color={color}
                className="pf-avatar"
              />
            </button>
          </div>

          <div className="mf">
            <label htmlFor="pf-name">昵称</label>
            <input
              id="pf-name"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
              placeholder="怎么称呼你"
              autoComplete="off"
            />
          </div>

          <div className="mf">
            <label>头像底色</label>
            <div className="swrow">
              {COLOR_PALETTE.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={cn('sw', color === entry && 'on')}
                  style={{
                    background: entry,
                    boxShadow:
                      color === entry ? `0 0 0 2px #fff, 0 0 0 3.5px ${entry}` : undefined,
                  }}
                  onClick={() => setColor(entry)}
                  title={entry}
                />
              ))}
            </div>
            {displayUrl && (
              <button
                type="button"
                className="rm-link"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setPendingAvatar(null);
                  setRemoveAvatar(true);
                }}
              >
                移除自定义头像，恢复文字头像
              </button>
            )}
          </div>

          <div className="mf">
            <label htmlFor="pf-email">邮箱</label>
            <input id="pf-email" value={profile.email} readOnly />
            <p className="fhint">邮箱用于登录，不可修改</p>
          </div>

          <div className="mf" style={{ marginBottom: 2 }}>
            <label>安全</label>
            <button type="button" className="sec-entry" onClick={onChangePassword}>
              <KeyRound size={15} strokeWidth={1.9} />
              <span className="se-txt">
                <b>修改主密码</b>
                <em>保存后将对全部凭证重新加密</em>
              </span>
              <ChevronRight className="se-chev" size={13} strokeWidth={2.2} />
            </button>
          </div>

          <div className="auth-error" style={{ margin: '8px 0 0', minHeight: 16 }}>
            {error}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => pickFile(event.target.files)}
          />
        </div>

        <div className="modal-foot">
          <button type="button" className="foot-link" onClick={onLogout} disabled={busy}>
            退出登录
          </button>
          <button type="button" className="btn-cancel" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button type="button" className="btn-ok" onClick={() => void handleSave()} disabled={busy}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
