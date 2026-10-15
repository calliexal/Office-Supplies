/// <reference types="vitest" />
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const stripMockAssets = (useMock: boolean): Plugin => ({
  name: 'strip-mock-assets',
  apply: 'build',
  async closeBundle() {
    if (!useMock) await rm(resolve(process.cwd(), 'dist', 'mock'), { recursive: true, force: true });
  },
});

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const proxyTarget = env.VITE_DEV_PROXY_TARGET;

  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), stripMockAssets(env.VITE_USE_MOCK === 'true')],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: proxyTarget
        ? { '/api': { target: proxyTarget, changeOrigin: true, secure: false } }
        : undefined,
    },
    build: {
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query', 'zod'],
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
