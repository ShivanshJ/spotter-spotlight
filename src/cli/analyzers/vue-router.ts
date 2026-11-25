import fs from 'fs'
import path from 'path'
import type { FrameworkAnalyzer } from './types'
import { extractRoutes, findSourceFiles, toDiscoveredRoutes } from './route-config'

function hasVueRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'vue-router' in deps
  } catch { return false }
}

const ROUTER_MARKERS = /\bcreateRouter\s*\(/

export const vueRouterAnalyzer: FrameworkAnalyzer = {
  name: 'Vue Router',

  detect(rootDir) {
    return hasVueRouterDep(rootDir)
  },

  async analyze(rootDir, options) {
    const specs = options?.routeFiles
      ?? findSourceFiles(rootDir, content => ROUTER_MARKERS.test(content) && content.includes('vue-router'))
        .map(file => ({ file }))
    return toDiscoveredRoutes(extractRoutes(specs, rootDir))
  },
}
