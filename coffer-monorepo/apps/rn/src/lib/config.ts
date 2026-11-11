/**
 * Android 统一走 adb reverse（`adb reverse tcp:3000 tcp:3000`），
 * 这样雷电模拟器不依赖 10.0.2.2 的 NAT 映射。
 * 真机或其它环境可在构建时通过 EXPO_PUBLIC_API_BASE_URL 覆盖。
 */
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api';
