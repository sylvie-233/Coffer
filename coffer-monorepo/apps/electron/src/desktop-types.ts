/** 主进程暴露给渲染进程的只读运行配置。 */
export interface DesktopRuntimeConfig {
  /** API 根地址，已包含 `/api`。 */
  apiBaseUrl: string;
  /** 应用版本，来自 package.json。 */
  appVersion: string;
  /** 当前运行平台。 */
  platform: NodeJS.Platform;
  /** 用户配置文件位置，便于排查连接问题。 */
  configPath: string;
}
