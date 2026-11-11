'use client';

import { useState } from 'react';
import { constantTimeEqual, deriveSrpX, srpClientProof } from '@coffer/crypto';
import type { UserProfile } from '@coffer/types';
import { evaluatePasswordStrength } from '@coffer/utils';

import { ApiError, authApi } from '@coffer/vault-core';
import { startSession } from '@coffer/vault-core';
import { buildRegistrationKeys, deriveKek, keyCheckCipher, unlockWithPassword } from '@coffer/vault-core';
import { getBrandIconSrc } from '../config';

type Mode = 'login' | 'register';

export interface AuthScreenProps {
  onAuthenticated: (token: string, profile: UserProfile, kek: CryptoKey) => void;
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || '操作失败，请稍后重试';
  }
  return '操作失败，请稍后重试';
}

const STRENGTH_COLORS = {
  weak: '#A84A55',
  mid: '#C9752F',
  strong: '#2F8C63',
} as const;

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nickname, setNickname] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const register = mode === 'register';
  const strength = evaluatePasswordStrength(password);
  const normalizedEmail = email.trim().toLowerCase();

  function switchMode() {
    setMode(register ? 'login' : 'register');
    setError('');
    setPassword('');
    setConfirm('');
    setAcknowledged(false);
  }

  async function handleLogin() {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (!password) {
      setError('请输入主密码');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const challenge = await authApi.challenge(normalizedEmail);
      const x = await deriveSrpX(password, challenge.salt, normalizedEmail);
      const proof = await srpClientProof(x, challenge.B);
      const result = await authApi.verify({
        srpSessionId: challenge.srpSessionId,
        A: proof.A,
        M1: proof.M1,
      });

      if (!constantTimeEqual(result.M2.toLowerCase(), proof.M2.toLowerCase())) {
        throw new Error('服务器身份校验失败，请检查网络环境后重试');
      }

      const kek = await unlockWithPassword(password, result.profile);
      if (!kek) {
        throw new Error('密钥校验失败，本地密钥与云端数据不匹配');
      }

      startSession(result.token, result.profile, kek);
      onAuthenticated(result.token, result.profile, kek);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister() {
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('请输入有效的邮箱地址');
      return;
    }
    if (password.length < 8) {
      setError('主密码至少需要 8 位');
      return;
    }
    if (password !== confirm) {
      setError('两次输入的主密码不一致');
      return;
    }
    if (!acknowledged) {
      setError('请确认你已了解主密码无法找回');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const keys = await buildRegistrationKeys(password, normalizedEmail);
      const kek = await deriveKek(password, keys.encSalt);
      const check = await keyCheckCipher(kek);

      const result = await authApi.register({
        email: normalizedEmail,
        authSalt: keys.authSalt,
        authVerifier: keys.authVerifier,
        encSalt: keys.encSalt,
        keyCheckCipher: check,
        nickname: nickname.trim() || undefined,
      });

      startSession(result.token, result.profile, kek);
      onAuthenticated(result.token, result.profile, kek);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (register) {
      void handleRegister();
    } else {
      void handleLogin();
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <div className="abrand">
          <span className="mk">
            <img src={getBrandIconSrc()} alt="Coffer" />
          </span>
        </div>
        <h3>{register ? '创建 Coffer 保险库' : '登录 Coffer'}</h3>
        <p className="asub">
          {register
            ? '主密码在浏览器中派生出加密密钥，服务端只保存无法解密的密文。'
            : '输入邮箱和主密码解锁你的保险库。'}
        </p>

        <div className="af">
          <label htmlFor="auth-email">邮箱</label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
            autoFocus
          />
        </div>

        {register && (
          <div className="af">
            <label htmlFor="auth-nickname">昵称（可选）</label>
            <input
              id="auth-nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="怎么称呼你"
              maxLength={16}
              autoComplete="off"
            />
          </div>
        )}

        <div className="af">
          <label htmlFor="auth-pwd">主密码</label>
          <input
            id="auth-pwd"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={register ? '至少 8 位，建议 12 位以上' : '主密码'}
            autoComplete="off"
          />
        </div>

        {register && (
          <div
            className="a-strength"
            style={{ color: STRENGTH_COLORS[strength.level] }}
          >
            〔{strength.label}〕{strength.hint}
          </div>
        )}

        {register && (
          <>
            <div className="af">
              <label htmlFor="auth-pwd2">确认主密码</label>
              <input
                id="auth-pwd2"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="再输一次"
                autoComplete="off"
              />
            </div>
            <label className="a-ack">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                我了解：<b>主密码是唯一的解锁凭证，服务端无法找回</b>，遗失将永久无法访问本保险库。
              </span>
            </label>
          </>
        )}

        <div className="auth-error">{busy ? '正在本地派生密钥，请稍候…' : error}</div>

        <button className="a-btn" type="submit" disabled={busy}>
          {busy ? '处理中…' : register ? '创建并进入' : '登录'}
        </button>
        <button className="a-switch" type="button" onClick={switchMode} disabled={busy}>
          {register ? '已有账号？返回登录 →' : '还没有账号？创建保险库 →'}
        </button>
        <p className="a-note">零知识加密 · 密钥只存在于你的浏览器内存</p>
      </form>
    </div>
  );
}
