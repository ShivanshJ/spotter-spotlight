import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import noCommentsInFunctions from './eslint-rules/no-comments-in-functions.js'

const spotterPlugin = { rules: { 'no-comments-in-functions': noCommentsInFunctions } }

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'packages', '.vitest', '**/__fixtures__/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { spotter: spotterPlugin },
    rules: {
      'spotter/no-comments-in-functions': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      eqeqeq: 'error',
    },
  },
  {
    files: ['src/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/**/*.test.ts', 'src/test-helpers/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'spotter/no-comments-in-functions': 'off',
      'no-console': 'off',
    },
  },
)
