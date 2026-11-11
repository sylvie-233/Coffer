'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@coffer/utils';

import { subscribeToast } from '../toast-store';

/** 全局轻提示宿主，固定在视口底部。 */
export function ToastHost() {
  const [message, setMessage] = useState('');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return subscribeToast((next) => {
      setMessage(next);
      setVisible(true);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setVisible(false), 2600);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        'fixed bottom-[34px] left-1/2 z-[120] max-w-[80vw] overflow-hidden text-ellipsis whitespace-nowrap rounded-[9px] bg-[rgba(24,22,19,0.92)] px-[15px] py-[9px] text-[12.5px] text-white transition duration-200',
        visible
          ? 'translate-x-[-50%] translate-y-0 opacity-100'
          : 'pointer-events-none translate-x-[-50%] translate-y-[10px] opacity-0',
        'max-[960px]:bottom-6',
      )}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}
