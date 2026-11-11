import * as Clipboard from 'expo-clipboard';

import { toast } from '../components/Toast';

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** 复制文本；密码等敏感内容可在指定时间后自动清空剪贴板。 */
export async function copyText(
  value: string,
  message = '已复制',
  clearAfterMs = 0,
): Promise<void> {
  if (!value) {
    return;
  }
  await Clipboard.setStringAsync(value);
  toast(message);

  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
  if (clearAfterMs > 0) {
    clearTimer = setTimeout(() => {
      void (async () => {
        try {
          const current = await Clipboard.getStringAsync();
          if (current === value) {
            await Clipboard.setStringAsync('');
          }
        } catch {
          // 剪贴板被其它应用占用时忽略即可。
        }
      })();
      clearTimer = null;
    }, clearAfterMs);
  }
}
