import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: process.env.SYMFONY_API_URL || env.SYMFONY_API_URL || 'http://127.0.0.1:8081',
          changeOrigin: true,
        },
      },
    },
  }
})
