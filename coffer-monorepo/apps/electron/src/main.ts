import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
} from 'electron';
import started from 'electron-squirrel-startup';

import type { DesktopRuntimeConfig } from './desktop-types';

const APP_SCHEME = 'app';
const APP_HOST = 'coffer';
const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;
const CONFIG_FILE = 'desktop-config.json';
const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

let rendererRoot: string | null = null;
let mainWindow: BrowserWindow | null = null;
let runtimeConfig: DesktopRuntimeConfig | null = null;

// 自定义协议必须在 app ready 之前声明为安全上下文，否则 Clipboard / WebCrypto 不可用。
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function normalizeApiBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/api';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function apiBaseUrlFromArgv(): string | undefined {
  const prefix = '--api-base-url=';
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf('--api-base-url');
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadRuntimeConfig(): Promise<DesktopRuntimeConfig> {
  const userDataDir = app.getPath('userData');
  const configPath = path.join(userDataDir, CONFIG_FILE);

  let fileApiBaseUrl: unknown;
  try {
    await mkdir(userDataDir, { recursive: true });
    const text = await readFile(configPath, 'utf8');
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'apiBaseUrl' in parsed) {
      fileApiBaseUrl = (parsed as { apiBaseUrl?: unknown }).apiBaseUrl;
    }
  } catch {
    // 首次运行或配置文件损坏时，写入默认配置，不阻断应用启动。
    await writeFile(
      configPath,
      `${JSON.stringify({ apiBaseUrl: DEFAULT_API_BASE_URL }, null, 2)}\n`,
      'utf8',
    );
  }

  const candidate =
    apiBaseUrlFromArgv() ??
    process.env.COFFER_API_BASE_URL ??
    (typeof fileApiBaseUrl === 'string' ? fileApiBaseUrl : undefined) ??
    DEFAULT_API_BASE_URL;
  const apiBaseUrl = normalizeApiBaseUrl(candidate);

  if (!apiBaseUrl) {
    console.warn(`[desktop] API 地址无效，回退到 ${DEFAULT_API_BASE_URL}: ${candidate}`);
  }

  return {
    apiBaseUrl: apiBaseUrl ?? DEFAULT_API_BASE_URL,
    appVersion: app.getVersion(),
    platform: process.platform,
    configPath,
  };
}

function contentSecurityPolicy(apiBaseUrl: string): string {
  let apiOrigin = '';
  try {
    apiOrigin = new URL(apiBaseUrl).origin;
  } catch {
    // 已在配置解析阶段校验，这里仅做兜底。
  }
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
  ].join('; ');
}

async function registerAppProtocol(): Promise<void> {
  rendererRoot = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const root = path.resolve(rendererRoot);

  protocol.handle(APP_SCHEME, async (request) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const relative = pathname === '/' || pathname === '' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      return new Response('Not found', { status: 404 });
    }

    try {
      const data = await readFile(filePath);
      const mime = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      return new Response(data, {
        headers: {
          'content-type': mime,
          'content-security-policy': contentSecurityPolicy(
            runtimeConfig?.apiBaseUrl ?? DEFAULT_API_BASE_URL,
          ),
          'x-content-type-options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function isExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function configureSessionPermissions(): void {
  const allow = (permission: string): boolean =>
    permission === 'clipboard-read' || permission === 'clipboard-sanitized-write';

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allow(permission));
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allow(permission));
  });
}

function buildWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1160,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#e7e4db',
    title: 'Coffer · 凭证管理器',
    icon: path.join(__dirname, '../../assets/icon-v1.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, targetUrl) => {
    const devOrigin = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin
      : null;
    let allowed = targetUrl.startsWith(`${APP_SCHEME}://${APP_HOST}/`);
    if (devOrigin) {
      try {
        allowed = new URL(targetUrl).origin === devOrigin;
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      event.preventDefault();
      if (isExternalUrl(targetUrl)) {
        void shell.openExternal(targetUrl);
      }
    }
  });

  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        event.preventDefault();
        window.webContents.toggleDevTools();
      }
    });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadURL(APP_ENTRY_URL);
  }

  return window;
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null);
  app.setAppUserModelId('com.coffer.desktop');
  configureSessionPermissions();

  runtimeConfig = await loadRuntimeConfig();
  await registerAppProtocol();

  ipcMain.handle('desktop:get-config', () => runtimeConfig);

  mainWindow = buildWindow();
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const squirrelStarted = started;
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (squirrelStarted || !gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(bootstrap).catch((error: unknown) => {
    console.error('[desktop] 启动失败', error);
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = buildWindow();
    }
  });
}
