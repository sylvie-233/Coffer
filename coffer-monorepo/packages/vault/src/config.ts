/**
 * 宿主可配置项：Web 使用 Next.js 静态资源与同源 `/api`；
 * Electron 可在渲染进程启动时指定本地资源路径与 API 地址。
 */
let brandIconSrc = '/icon-v1.png';

export function configureVault(options: { brandIconSrc?: string }): void {
  if (options.brandIconSrc) {
    brandIconSrc = options.brandIconSrc;
  }
}

export function getBrandIconSrc(): string {
  return brandIconSrc;
}
