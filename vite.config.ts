import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // utif2 n'est importé que depuis le worker : sans ça, sa découverte tardive
  // en dev relance l'optimiseur et recharge la page au premier TIFF.
  optimizeDeps: { include: ['utif2'] },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
