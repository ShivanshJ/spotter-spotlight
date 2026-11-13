import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ['src/widget/**', 'happy-dom'],
      ['src/proxy/**', 'node'],
    ],
  },
})
