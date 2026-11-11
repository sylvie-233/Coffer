import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // 共享包（@coffer/ui / @coffer/vault）各自声明了 React 依赖，
    // 强制解析到同一份 React，避免打包后出现 “Invalid hook call”。
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
