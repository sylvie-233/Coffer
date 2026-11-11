/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { DesktopRuntimeConfig } from './src/desktop-types';

declare global {
  interface Window {
    cofferDesktop: {
      getConfig(): Promise<DesktopRuntimeConfig>;
    };
  }
}
