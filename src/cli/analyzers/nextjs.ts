import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import type { FrameworkAnalyzer, DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls, extractPageTitle } from './extract'

function existsSync(filePath: string): boolean {
  try { fs.accessSync(filePath); return true } catch { return false }
}

function hasNextDep(rootDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'))
    return 'next' in { ...pkg.dependencies, ...pkg.devDependencies }
  } catch { return false }
}

async function walkDir(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) files.push(...await walkDir(full))
      else files.push(full)
    }
    return files
  } catch { return [] }
}

const PAGE_EXT = /\.(tsx?|jsx?|mdx)$/
const NOT_A_PAGE = /\.(test|spec|stories|d)\.[^.]+$/
const PAGES_SPECIAL = new Set(['_app', '_document', '_error', '404', '500'])

// Converts one directory or file segment to a URL segment.
// Returns '' for segments that don't appear in the URL, and null when the page can't be addressed.
function urlSegment(segment: string): string | null {
  if (/^\(\.+\)/.test(segment)) return null
  if (/^\(.*\)$/.test(segment)) return ''
  if (segment.startsWith('@')) return ''
  if (segment.startsWith('_')) return null
  if (/^\[\[\.\.\..+\]\]$/.test(segment)) return ''
  if (/^\[\.\.\..+\]$/.test(segment)) return null
  const dynamic = segment.match(/^\[(.+)\]$/)
  if (dynamic) return `:${dynamic[1]}`
  return segment
}

function toRoutePath(segments: string[]): string | null {
  const parts: string[] = []
  for (const segment of segments) {
    const part = urlSegment(segment)
    if (part === null) return null
    if (part) parts.push(part)
  }
  return '/' + parts.join('/')
}

export function appRoutePath(appDir: string, filePath: string): string | null {
  const rel = path.relative(appDir, filePath).split(path.sep)
  if (!/^page\.(tsx?|jsx?|mdx)$/.test(rel[rel.length - 1])) return null
  return toRoutePath(rel.slice(0, -1))
}

export function pagesRoutePath(pagesDir: string, filePath: string): string | null {
  const rel = path.relative(pagesDir, filePath).replace(PAGE_EXT, '').split(path.sep)
  if (rel[0] === 'api' || PAGES_SPECIAL.has(rel[rel.length - 1])) return null
  if (rel[rel.length - 1] === 'index') rel.pop()
  return toRoutePath(rel)
}

async function routeFromFile(filePath: string, routePath: string): Promise<DiscoveredRoute> {
  const content = await fsp.readFile(filePath, 'utf-8')
  return {
    path: routePath,
    componentFile: filePath,
    sourceFile: filePath,
    pageTitle: extractPageTitle(content),
    selectors: extractSelectors(content),
    apiCalls: extractApiCalls(content),
  }
}

async function routesIn(dir: string, toPath: (dir: string, file: string) => string | null): Promise<DiscoveredRoute[]> {
  const files = (await walkDir(dir)).filter(f => PAGE_EXT.test(f) && !NOT_A_PAGE.test(f))
  const found = files
    .map(file => ({ file, routePath: toPath(dir, file) }))
    .filter((r): r is { file: string; routePath: string } => r.routePath !== null)
  return Promise.all(found.map(r => routeFromFile(r.file, r.routePath)))
}

function sourceDirs(rootDir: string, name: string): string[] {
  return [path.join(rootDir, name), path.join(rootDir, 'src', name)].filter(existsSync)
}

export const nextjsAnalyzer: FrameworkAnalyzer = {
  name: 'Next.js',

  detect(rootDir) {
    return ['next.config.js', 'next.config.ts', 'next.config.mjs', 'next.config.cjs']
      .some(f => existsSync(path.join(rootDir, f))) || hasNextDep(rootDir)
  },

  async analyze(rootDir) {
    const groups = await Promise.all([
      ...sourceDirs(rootDir, 'app').map(dir => routesIn(dir, appRoutePath)),
      ...sourceDirs(rootDir, 'pages').map(dir => routesIn(dir, pagesRoutePath)),
    ])
    const seen = new Set<string>()
    return groups.flat().filter(r => {
      if (seen.has(r.path)) return false
      seen.add(r.path)
      return true
    })
  },
}
