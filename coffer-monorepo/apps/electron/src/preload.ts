import { contextBridge, ipcRenderer } from 'electron';

import type { DesktopRuntimeConfig } from './desktop-types';

contextBridge.exposeInMainWorld('cofferDesktop', {
  getConfig: (): Promise<DesktopRuntimeConfig> => ipcRenderer.invoke('desktop:get-config'),
});
