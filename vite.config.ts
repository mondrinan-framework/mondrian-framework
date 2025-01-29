import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      exclude: ['packages/example/**', 'packages/docs/**'],
      include: ['packages/*/src/**'],
    },
  },
})
