import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // The dev server proxies API, WebSocket and SOAP traffic to NestJS, so the
    // browser sees a single origin, the same way nginx serves it in production.
    // That keeps the refresh-token cookie first-party (SameSite=Strict).
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/socket.io': { target: API_TARGET, ws: true },
      '/soap': { target: API_TARGET },
    },
  },
  preview: {
    proxy: {
      '/api': { target: API_TARGET },
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Bootstrap 5.3 still uses Sass @import; silence its upstream deprecation notices.
        quietDeps: true,
        silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
      },
    },
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Long-lived vendor chunks: they change rarely, so browsers keep them cached across deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const groups: [string, RegExp][] = [
            ['react', /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|cookie)[\\/]/],
            ['state', /[\\/]node_modules[\\/](@reduxjs|react-redux|redux|immer|reselect|axios)[\\/]/],
            ['charts', /[\\/]node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|es-toolkit|decimal\.js-light)[\\/]/],
            ['socket', /[\\/]node_modules[\\/](socket\.io-client|engine\.io-client|socket\.io-parser|@socket\.io)[\\/]/],
            ['forms', /[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/],
          ];
          return groups.find(([, pattern]) => pattern.test(id))?.[0] ?? 'vendor';
        },
      },
    },
  },
});
