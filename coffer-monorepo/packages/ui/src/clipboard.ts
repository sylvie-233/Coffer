import { toast } from './toast-store';

/**
 * 复制文本；密码类内容在 10 秒后尽量从剪贴板清除。
 * 清除前会比对剪贴板内容，避免误删用户随后复制的其他内容。
 */
export async function copyText(text: string, message = '已复制', clearAfterMs = 0): Promise<void> {
  if (!text) {
    toast('没有可复制的内容');
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 非安全上下文或权限受限时退化为老式复制
    try {
      const helper = document.createElement('textarea');
      helper.value = text;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      const ok = document.execCommand('copy');
      helper.remove();
      if (!ok) {
        throw new Error('copy failed');
      }
    } catch {
      toast('复制失败，请手动选择复制');
      return;
    }
  }

  toast(clearAfterMs > 0 ? `${message}，${Math.round(clearAfterMs / 1000)} 秒后清空` : message);

  if (clearAfterMs > 0) {
    window.setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === text) {
          await navigator.clipboard.writeText('');
        }
      } catch {
        // 无法读取剪贴板时不做处理，避免误清空
      }
    }, clearAfterMs);
  }
}
