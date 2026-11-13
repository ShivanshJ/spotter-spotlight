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
          include: ['src/proxy/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['src/widget/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
})
