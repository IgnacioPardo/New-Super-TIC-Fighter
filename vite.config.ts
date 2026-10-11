import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: 'http://127.0.0.1:8787', ws: true } } },
  build: { rollupOptions: { output: { manualChunks: (id: string) => id.includes('phaser') ? 'phaser' : undefined } } },
});
