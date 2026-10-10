import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    // xlsx and exceljs are large but lazily imported, so they never load until a
    // file is actually dropped in. Splitting them out is the point.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('exceljs')) return 'exceljs';
            if (id.includes('xlsx')) return 'xlsx';
            return 'vendor';
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});