
import { defineConfig, Format } from 'tsup';

const baseConfig = {
    format: ['esm','cjs','iife'] as Format[],   // the default would be .mjs, .global.js, and .js
                                    // if type=module, files produced are .js, .global.js, and .cjs
    entry: ['src/index.ts'],
    bundle: true, // bundles all dependencies
    minify: false, // Optional, set to true for production
    dts: false, // Generates .d.ts files if using TypeScript
    shims: true,
    skipNodeModulesBundle: false,
    clean: true,
    outExtension({ format }) {
        return {
          js: `.${format}.js`,
        }
    },
    globalName: 'SpotterSDK',  // Global variable name for IIFE (e.g., window.SpotterSDK)
}
 
export default defineConfig([
    {
        ...baseConfig,
        platform: "browser",
        format: ['esm', 'iife'],    // iife bundles all other dependencies as well (like openai) in 1 single file
        injectStyle: true,          // Add this option for including .css
        outDir: "dist/",
    },
    {
        ...baseConfig,
        platform: "node",
        format: ['esm', 'cjs'],
        outDir: "dist/node",
    }
]);



// Now, your package can be used in:

// Vue via <script> (with window.SpotterSDK)
// Vue via imports (import X from 'spotter-sdk')
// React with ESM (import X from 'spotter-sdk')
// React with CJS (const X = require('spotter-sdk'))