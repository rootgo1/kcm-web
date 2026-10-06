import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Read PORT only for the local proxy. No RETELL_* variable is exposed to Vite's client.
  const port = Number(process.env.PORT ?? loadEnv(mode, process.cwd(), 'PORT').PORT ?? 8787);
  const backendPort = Number.isInteger(port) && port > 0 && port <= 65535 ? port : 8787;
  return {
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: {
      '/retell': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/live-calls': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/inventory': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/data': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/briefings': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/effective-price': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
      '/api/products': { target: `http://127.0.0.1:${backendPort}`, changeOrigin: true },
    },
  },
  build: { target: 'es2022', sourcemap: false },
  };
});
