import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

function hasVueRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'vue-router' in deps
  } catch { return false }
}

function extractPaths(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/path:\s*["']([^"']+)["']/g)) paths.push(match[1])
  return [...new Set(paths)].filter(p => p.startsWith('/'))
}

const ROUTER_CANDIDATES = [
  'src/router/index.ts', 'src/router/index.js',
  'src/router.ts', 'src/router.js',
  'router/index.ts', 'router/index.js',
]

async function findRouterFile(rootDir: string): Promise<string | null> {
  for (const candidate of ROUTER_CANDIDATES) {
    const filePath = path.join(rootDir, candidate)
    if (existsSync(filePath)) return filePath
  }
  return null
}

export const vueRouterAnalyzer: FrameworkAnalyzer = {
  name: 'Vue Router',

  detect(rootDir) {
    return hasVueRouterDep(rootDir)
  },

  async analyze(rootDir) {
    const routerFile = await findRouterFile(rootDir)
    if (!routerFile) return []

    const content = await fsp.readFile(routerFile, 'utf-8')
    return extractPaths(content).map(routePath => ({
      path: routePath,
      componentFile: routerFile,
      pageTitle: undefined,
      selectors: extractSelectors(content),
      apiCalls: extractApiCalls(content),
    }))
  },
}
