import { defineConfig } from 'orval'
import buildConfig from './config/frontend/build.json'

export default defineConfig({
  backendApi: {
    input: {
      target: buildConfig.openapi.target,
    },
    output: {
      mode: 'single',
      target: buildConfig.openapi.output,
      schemas: buildConfig.openapi.schemas,
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        query: {
          useQuery: true,
          useMutation: true,
          signal: true,
        },
      },
    },
  },
})
