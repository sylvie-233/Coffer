import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Coffer · 凭证管理器',
  description: '只记一个秘密，其余全部安全托管。Coffer 是你的零知识个人凭证管理器。',
  icons: [{ rel: 'icon', url: '/icon-v1.png' }],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#123F35',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
