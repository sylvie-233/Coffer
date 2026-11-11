import { createRoot } from 'react-dom/client';

import { CofferApp, configureApi, configureVault } from '@coffer/vault';

import brandIcon from '../assets/icon-v1.png';
import './index.css';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3000/api';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) {
    throw new Error('缺少 #root 容器');
  }

  let apiBaseUrl = DEFAULT_API_BASE_URL;
  try {
    const config = await window.cofferDesktop.getConfig();
    apiBaseUrl = config.apiBaseUrl;
  } catch (error) {
    console.error('[desktop] 读取运行配置失败，使用默认 API 地址', error);
  }

  configureApi({ baseUrl: apiBaseUrl });
  configureVault({ brandIconSrc: brandIcon });

  createRoot(container).render(<CofferApp />);
}

void bootstrap().catch((error: unknown) => {
  console.error('[desktop] 渲染进程启动失败', error);
  const container = document.getElementById('root');
  if (container) {
    container.textContent = 'Coffer 启动失败，请重启应用后重试。';
  }
});
