import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api/jellyseerr': {
        target: 'http://192.168.50.19:5055',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/jellyseerr/, '/api/v1')
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});
