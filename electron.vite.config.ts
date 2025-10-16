import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/main',
      lib: {
        entry: 'electron/main/index.ts',
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: 'electron/preload/index.ts',
      },
    },
  },
  renderer: {
    root: '.',
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve('src'),
        '@/components': resolve('src/components'),
        '@/lib': resolve('src/lib'),
        '@/hooks': resolve('src/hooks'),
        '@/types': resolve('src/types'),
      },
    },
    build: {
      outDir: 'dist-react',
      rollupOptions: {
        input: resolve(__dirname, 'index.html'),
      },
    },
  },
});
