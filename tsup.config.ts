import { defineConfig, Format } from 'tsup'

const sharedConfig = {
  bundle: true,
  minify: false,
  dts: false,
  shims: true,
  skipNodeModulesBundle: false,
  clean: false,
  outExtension({ format }: { format: string }) {
    if (format === 'cjs') return { js: '.cjs' }
    return { js: `.${format}.js` }
  },
}

export default defineConfig([
  {
    ...sharedConfig,
    platform: 'browser',
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm', 'iife'] as Format[],
    globalName: 'Spotter',
    injectStyle: true,
    outDir: 'dist',
    clean: true,
  },
  {
    ...sharedConfig,
    platform: 'node',
    entry: ['src/proxy.ts'],
    dts: true,
    format: ['esm', 'cjs'] as Format[],
    outDir: 'dist/node',
  },
  {
    ...sharedConfig,
    platform: 'node',
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'] as Format[],
    outDir: 'dist/cli',
    banner: { js: '#!/usr/bin/env node' },
    outExtension() { return { js: '.js' } },
  },
])
