export type ToastListener = (message: string) => void;

const listeners = new Set<ToastListener>();

/** 全局轻提示：任意组件可调用，由 <ToastHost /> 统一展示。 */
export function toast(message: string): void {
  for (const listener of listeners) {
    listener(message);
  }
}

export function subscribeToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
