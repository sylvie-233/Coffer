import type { NextConfig } from 'next';

/**
 * - 开发态：Next 自带 rewrites，把 /api 代理到本地 Hono 服务（localhost:3000）。
 * - 生产构建：静态导出到 out/，由 Nginx 托管，并把 /api 反向代理到 API 容器。
 */
const isProduction = process.env.NODE_ENV === 'production';
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

const nextConfig: NextConfig = {
  ...(isProduction ? { output: 'export' as const } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isProduction
    ? {}
    : {
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }];
        },
      }),
};

export default nextConfig;
