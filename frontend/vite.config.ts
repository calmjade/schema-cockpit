import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    server: {
      port: 9022,
      host: true,
      proxy: {
        '/api': {
          target: 'http://localhost:8092',
          changeOrigin: true,
        },
      },
    },
  };
});
