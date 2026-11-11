import path from 'node:path';

import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import MakerNsis from 'electron-forge-maker-nsis';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'Coffer',
    icon: path.resolve(__dirname, 'assets/icon'),
    win32metadata: {
      CompanyName: 'Coffer',
      FileDescription: 'Coffer 零知识凭证管理器',
      ProductName: 'Coffer',
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerNsis({
      // 关闭一键安装，显示安装向导；允许用户选择安装目录。
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Coffer',
      uninstallDisplayName: 'Coffer',
      artifactName: 'Coffer-Setup-${version}.${ext}',
      installerIcon: path.resolve(__dirname, 'assets/icon.ico'),
      uninstallerIcon: path.resolve(__dirname, 'assets/icon.ico'),
      language: '2052',
    }),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
