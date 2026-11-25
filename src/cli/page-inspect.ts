// Reads what is on each page: the page component plus the local components it imports
// (two levels deep), and the controls a user can interact with in them.
//
// Components imported by most pages (app shell, nav bar) are left out, so every page doesn't
// inherit the same header buttons.
import fs from 'fs'
import path from 'path'
import { resolveSourceFile } from './analyzers/route-config'
import { extractApiCalls, extractControls, type Control } from './analyzers/extract'
import type { DiscoveredRoute } from './analyzers/types'

export type InspectedRoute = DiscoveredRoute & {
  files: string[]
  controls: Control[]
  resourceOnly: boolean
}

const MAX_DEPTH = 2
const MAX_FILES_PER_PAGE = 12
const MAX_FILE_BYTES = 200_000
const UI_FILE = /\.(tsx|jsx|vue|svelte|js)$/
const LOOKS_LIKE_UI = /<[A-Za-z][\w.]*[\s>/]/

const IMPORT_SPEC = /import\s+(?!type\s)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g

export class SourceReader {
  private cache = new Map<string, string>()

  read(file: string): string {
    if (!this.cache.has(file)) {
      let content = ''
      try {
        content = fs.statSync(file).size <= MAX_FILE_BYTES ? fs.readFileSync(file, 'utf-8') : ''
      } catch {
        content = ''
      }
      this.cache.set(file, content)
    }
    return this.cache.get(file)!
  }
}

function localImports(file: string, content: string, rootDir: string, reader: SourceReader): string[] {
  const found: string[] = []
  for (const m of content.matchAll(IMPORT_SPEC)) {
    const resolved = resolveSourceFile(file, m[1] ?? m[2], rootDir)
    if (!resolved || resolved.includes(`${path.sep}node_modules${path.sep}`) || !UI_FILE.test(resolved)) continue
    if (LOOKS_LIKE_UI.test(reader.read(resolved))) found.push(resolved)
  }
  return found
}

export function pageFiles(entry: string, rootDir: string, reader: SourceReader, skip: Set<string> = new Set()): string[] {
  const files = [entry]
  let frontier = [entry]
  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = []
    for (const file of frontier) {
      for (const imported of localImports(file, reader.read(file), rootDir, reader)) {
        if (files.length >= MAX_FILES_PER_PAGE) return files
        if (files.includes(imported) || skip.has(imported)) continue
        files.push(imported)
        next.push(imported)
      }
    }
    frontier = next
  }
  return files
}

function sharedComponents(routes: DiscoveredRoute[], rootDir: string, reader: SourceReader): Set<string> {
  const pageCount = new Map<string, number>()
  for (const r of routes) {
    for (const f of new Set(pageFiles(r.componentFile, rootDir, reader).slice(1))) {
      pageCount.set(f, (pageCount.get(f) ?? 0) + 1)
    }
  }
  const threshold = Math.max(4, Math.ceil(routes.length / 2))
  return new Set([...pageCount].filter(([, n]) => n >= threshold).map(([f]) => f))
}

export function isResourceOnly(content: string): boolean {
  if (!content) return false
  const hasDefault = /export\s+default\b|export\s*\{[^}]*\bdefault\b/.test(content)
  const hasHandler = /export\s+(async\s+)?function\s+(loader|action)\b|export\s+const\s+(loader|action)\b|export\s*\{[^}]*\b(loader|action)\b/.test(content)
  return hasHandler && !hasDefault
}

export function inspectPages(routes: DiscoveredRoute[], rootDir: string, reader = new SourceReader()): InspectedRoute[] {
  const shared = sharedComponents(routes, rootDir, reader)
  return routes.map(r => {
    const files = pageFiles(r.componentFile, rootDir, reader, shared)
    const byKey = new Map<string, Control>()
    for (const f of files) for (const c of extractControls(reader.read(f))) if (!byKey.has(c.key)) byKey.set(c.key, c)
    const controls = [...byKey.values()]
    return {
      ...r,
      files,
      controls,
      selectors: Object.fromEntries(controls.map(c => [c.key, c.selector])),
      apiCalls: [...new Set(files.flatMap(f => extractApiCalls(reader.read(f))))],
      resourceOnly: isResourceOnly(reader.read(r.componentFile)),
    }
  })
}
