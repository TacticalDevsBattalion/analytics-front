import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import buildConfig from './config/frontend/build.json'
import packageJson from './package.json'

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
    // Shown in the sidebar: the release number, the build date and, when the build passes it, the commit.
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __APP_BUILD_DATE__: JSON.stringify(new Date().toISOString()),
      __APP_COMMIT__: JSON.stringify((environment.GIT_COMMIT || '').slice(0, 7)),
    },
    worker: { format: 'es' },
    server: {
      port: buildConfig.dev_server.port,
      proxy,
    },
  }
})
