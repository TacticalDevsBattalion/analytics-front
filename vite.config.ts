import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import buildConfig from './config/frontend/build.json'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', '')
  const apiPrefix = (environment.API_PREFIX || '/api').replace(/\/$/, '')
  const proxy = Object.fromEntries(
    buildConfig.dev_server.proxy.map(({ prefix, target }) => [prefix, {
      target: environment.DEV_API_PROXY_TARGET || target,
      changeOrigin: false,
      // Browser URLs keep /api/ even when the backend uses a different prefix.
      rewrite: (requestPath: string) => requestPath.replace(/^\/api(?=\/|$)/, apiPrefix),
    }]),
  )
  return {
    plugins: [react()],
    worker: { format: 'es' },
    server: {
      port: buildConfig.dev_server.port,
      proxy,
    },
  }
})
