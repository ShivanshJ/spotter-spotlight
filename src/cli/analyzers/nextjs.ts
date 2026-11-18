import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls, extractPageTitle } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

async function walkDir(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await walkDir(full))
      else files.push(full)
    }
    return files
  } catch { return [] }
}

const PAGE_PATTERN = /\/page\.(tsx?|jsx?)$/
const SPECIAL_PATTERN = /(layout|loading|error|not-found|template|default|route)\.(tsx?|jsx?)$/
const PAGES_EXCLUDE = /(^|\/)(_(app|document|error)\.(tsx?|jsx?)|api\/)/

function appRoutePath(rootDir: string, filePath: string): string {
  const rel = path.relative(path.join(rootDir, 'app'), filePath)
  const withoutPage = rel.replace(/\/page\.(tsx?|jsx?)$/, '').replace(/^page\.(tsx?|jsx?)$/, '')
  return withoutPage ? `/${withoutPage}` : '/'
}

function pagesRoutePath(rootDir: string, filePath: string): string {
  const rel = path.relative(path.join(rootDir, 'pages'), filePath)
  return '/' + rel.replace(/\.(tsx?|jsx?)$/, '')
}

async function routeFromFile(filePath: string, routePath: string): Promise<DiscoveredRoute> {
  const content = await fsp.readFile(filePath, 'utf-8')
  return {
    path: routePath,
    componentFile: filePath,
    pageTitle: extractPageTitle(content),
    selectors: extractSelectors(content),
    apiCalls: extractApiCalls(content),
  }
}

async function appRoutes(rootDir: string): Promise<DiscoveredRoute[]> {
  const files = await walkDir(path.join(rootDir, 'app'))
  const pageFiles = files.filter(f => PAGE_PATTERN.test(f) && !SPECIAL_PATTERN.test(f))
  return Promise.all(pageFiles.map(f => routeFromFile(f, appRoutePath(rootDir, f))))
}

async function pagesRoutes(rootDir: string): Promise<DiscoveredRoute[]> {
  const pagesDir = path.join(rootDir, 'pages')
  const files = await walkDir(pagesDir)
  const pageFiles = files.filter(f => {
    const rel = path.relative(pagesDir, f)
    return !PAGES_EXCLUDE.test(rel) && /\.(tsx?|jsx?)$/.test(f)
  })
  return Promise.all(pageFiles.map(f => routeFromFile(f, pagesRoutePath(rootDir, f))))
}

export const nextjsAnalyzer: FrameworkAnalyzer = {
  name: 'Next.js',

  detect(rootDir) {
    return (
      existsSync(path.join(rootDir, 'next.config.js')) ||
      existsSync(path.join(rootDir, 'next.config.ts')) ||
      existsSync(path.join(rootDir, 'next.config.mjs'))
    )
  },

  async analyze(rootDir) {
    const [app, pages] = await Promise.all([appRoutes(rootDir), pagesRoutes(rootDir)])
    const seen = new Set<string>()
    return [...app, ...pages].filter(r => {
      if (seen.has(r.path)) return false
      seen.add(r.path)
      return true
    })
  },
}
