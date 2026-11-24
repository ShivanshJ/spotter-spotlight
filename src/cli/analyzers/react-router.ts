import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer } from './types'
import { extractSelectors, extractApiCalls } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

function hasReactRouterDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    return 'react-router' in deps || 'react-router-dom' in deps
  } catch { return false }
}

function extractPaths(content: string): string[] {
  const paths: string[] = []
  for (const match of content.matchAll(/path=["']([^"']+)["']/g)) paths.push(match[1])
  for (const match of content.matchAll(/path:\s*["']([^"']+)["']/g)) paths.push(match[1])
  return [...new Set(paths)].filter(p => p.startsWith('/'))
}

const ROUTER_CANDIDATES = [
  'src/App.tsx', 'src/App.jsx', 'src/App.ts', 'src/App.js',
  'src/router.tsx', 'src/router.jsx', 'src/router.ts', 'src/router.js',
  'App.tsx', 'App.jsx', 'router.tsx', 'router.js',
]

async function findRouterFile(rootDir: string): Promise<string | null> {
  for (const candidate of ROUTER_CANDIDATES) {
    const filePath = path.join(rootDir, candidate)
    if (!existsSync(filePath)) continue
    const content = await fsp.readFile(filePath, 'utf-8')
    if (content.includes('react-router') || content.includes('createBrowserRouter') || content.includes('<Route')) {
      return filePath
    }
  }
  return null
}

export const reactRouterAnalyzer: FrameworkAnalyzer = {
  name: 'React Router',

  detect(rootDir) {
    return hasReactRouterDep(rootDir)
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
