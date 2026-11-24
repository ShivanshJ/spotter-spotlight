import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          include: ['src/widget/**/*.test.ts'],
          environment: 'happy-dom',
        },
      },
      {
        test: {
          include: ['src/**/*.test.ts', 'eslint-rules/**/*.test.js'],
          exclude: ['src/widget/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
