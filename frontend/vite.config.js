import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 80,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://maes-api:3000',
        changeOrigin: true
      },
      // Socket.IO needs an upgrade-aware proxy; nginx already does this in
      // production (frontend/nginx.conf), so the dev server must match.
      '/socket.io': {
        target: 'http://maes-api:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})