// Deterministic route extraction from source code, without executing it.
//
// Understands:
//   - object route trees:  createBrowserRouter([...]), useRoutes([...]), Vue createRouter({ routes })
//     with nested `children`, `index: true`, and relative child paths
//   - React Router framework mode (app/routes.ts): route(), index(), layout(), prefix(), flatRoutes()
//   - JSX trees:  <Route path="..."> ... </Route>
//   - routes split across files: identifiers and spreads are followed through relative imports
import fs from 'fs'
import path from 'path'
import type { DiscoveredRoute } from './types'
import { extractSelectors, extractApiCalls } from './extract'

// ---------------------------------------------------------------- tokenizer

type Tok = { t: 'str' | 'id' | 'punc' | 'other'; v: string }

const PUNC = new Set(['[', ']', '{', '}', '(', ')', ',', ':', ';', '=', '.', '<', '>'])

export function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  const n = src.length
  let i = 0
  while (i < n) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? n : end + 2; continue }
    if (c === '"' || c === "'") {
      let j = i + 1
      let v = ''
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue }
        v += src[j++]
      }
      out.push({ t: 'str', v })
      i = j + 1
      continue
    }
    if (c === '`') {
      let j = i + 1
      let v = ''
      let dynamic = false
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { v += src[j + 1] ?? ''; j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '{') {
          dynamic = true
          let depth = 0
          while (j < n) {
            if (src[j] === '{') depth++
            else if (src[j] === '}' && --depth === 0) { j++; break }
            j++
          }
          continue
        }
        v += src[j++]
      }
      out.push(dynamic ? { t: 'other', v: '`' } : { t: 'str', v })
      i = j + 1
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1
      while (j < n && /[\w$]/.test(src[j])) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
      continue
    }
    if (src.startsWith('...', i)) { out.push({ t: 'punc', v: '...' }); i += 3; continue }
    if (src.startsWith('=>', i)) { out.push({ t: 'punc', v: '=>' }); i += 2; continue }
    out.push({ t: PUNC.has(c) ? 'punc' : 'other', v: c })
    i++
  }
  return out
}

// ---------------------------------------------------------------- parser (loose expression trees)

export type Node =
  | { k: 'arr'; items: Node[] }
  | { k: 'obj'; props: Map<string, Node> }
  | { k: 'call'; name: string; args: Node[] }
  | { k: 'str'; v: string }
  | { k: 'id'; name: string }
  | { k: 'spread'; v: Node }
  | { k: 'other' }

const OTHER: Node = { k: 'other' }
const OPEN: Record<string, string> = { '[': ']', '{': '}', '(': ')' }
const STOP = new Set([',', ']', '}', ')', ';'])
const PREFIX_KEYWORDS = new Set(['new', 'await', 'async', 'typeof', 'void', 'return'])

class Parser {
  p = 0
  constructor(private toks: Tok[]) {}

  private is(v: string, o = 0): boolean {
    const t = this.toks[this.p + o]
    return !!t && t.t === 'punc' && t.v === v
  }

  private atStop(): boolean {
    const t = this.toks[this.p]
    return !t || (t.t === 'punc' && STOP.has(t.v))
  }

  // Skip one token, or a whole balanced group if it opens one.
  private skipOne(): void {
    const t = this.toks[this.p]
    if (!t) return
    if (t.t === 'punc' && OPEN[t.v]) {
      let depth = 0
      while (this.p < this.toks.length) {
        const u = this.toks[this.p++]
        if (u.t !== 'punc') continue
        if (OPEN[u.v]) depth++
        else if (u.v === ']' || u.v === '}' || u.v === ')') { if (--depth === 0) return }
      }
      return
    }
    this.p++
  }

  // A value runs until a comma or closer at its own depth; trailing tokens
  // (`satisfies X`, `as const`, `.then(...)`) are skipped.
  value(): Node {
    const start = this.p
    const node = this.primary()
    while (!this.atStop()) this.skipOne()
    if (this.p === start) this.p++
    return node
  }

  private list(close: string): Node[] {
    const items: Node[] = []
    while (this.p < this.toks.length && !this.is(close)) {
      if (this.is(',')) { this.p++; continue }
      if (this.atStop()) { this.p++; continue }
      items.push(this.value())
    }
    this.p++
    return items
  }

  primary(): Node {
    const t = this.toks[this.p]
    if (!t) return OTHER
    if (t.t === 'str') { this.p++; return { k: 'str', v: t.v } }
    if (t.t === 'punc') {
      if (t.v === '[') { this.p++; return { k: 'arr', items: this.list(']') } }
      if (t.v === '{') { this.p++; return this.object() }
      if (t.v === '...') { this.p++; return { k: 'spread', v: this.value() } }
      if (t.v === '(') {
        this.p++
        const inner = this.list(')')
        if (this.is('=>')) { this.p++; return this.primary() }
        return inner.length === 1 ? inner[0] : OTHER
      }
      return OTHER
    }
    if (t.t === 'id') {
      if (PREFIX_KEYWORDS.has(t.v)) { this.p++; return this.primary() }
      this.p++
      let name = t.v
      while (this.is('.') && this.toks[this.p + 1]?.t === 'id') { name = this.toks[this.p + 1].v; this.p += 2 }
      if (this.is('(')) { this.p++; return { k: 'call', name, args: this.list(')') } }
      if (this.is('=>')) { this.p++; return this.primary() }
      return { k: 'id', name }
    }
    return OTHER
  }

  private object(): Node {
    const props = new Map<string, Node>()
    while (this.p < this.toks.length && !this.is('}')) {
      if (this.is(',')) { this.p++; continue }
      if (this.is('...')) { this.p++; this.value(); continue }
      const t = this.toks[this.p]
      if (t.t === 'id' || t.t === 'str') {
        this.p++
        if (this.is(':')) { this.p++; props.set(t.v, this.value()); continue }
        if (this.is('(')) { this.skipOne(); if (this.is('{')) this.skipOne(); continue }
        props.set(t.v, { k: 'id', name: t.v })
        continue
      }
      if (this.atStop()) { this.p++; continue }
      this.skipOne()
    }
    this.p++
    return { k: 'obj', props }
  }
}

// ---------------------------------------------------------------- modules

type ImportRef = { from: string; name: string } // name: 'default' or the exported name

export type RouteModule = {
  file: string
  content: string
  bindings: Map<string, Node>
  imports: Map<string, ImportRef>
  defaultExport: Node | null
  routerRoots: Node[]       // first argument of createBrowserRouter / useRoutes / createRouter
  isRouteConfig: boolean    // React Router framework-mode routes.ts
  hasJsxRoutes: boolean
}

const ROUTER_FNS = new Set([
  'createBrowserRouter', 'createHashRouter', 'createMemoryRouter', 'createStaticRouter',
  'useRoutes', 'createRouter',
])

export function parseModule(file: string, content: string): RouteModule {
  const toks = tokenize(content)
  const bindings = new Map<string, Node>()
  const imports = new Map<string, ImportRef>()
  const routerRoots: Node[] = []
  let defaultExport: Node | null = null

  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (t.t !== 'id') continue
    const next = toks[i + 1]

    if (t.v === 'import' && !(next?.t === 'punc' && (next.v === '(' || next.v === '.'))) {
      i = parseImport(toks, i + 1, imports)
      continue
    }

    if (t.v === 'export' && next?.t === 'id' && next.v === 'default') {
      const parser = new Parser(toks)
      parser.p = i + 2
      defaultExport = parser.value()
      continue
    }

    if ((t.v === 'const' || t.v === 'let' || t.v === 'var') && next?.t === 'id') {
      let j = i + 2
      if (toks[j]?.t === 'punc' && toks[j].v === ':') {
        let depth = 0
        while (j < toks.length) {
          const u = toks[j]
          if (u.t === 'punc') {
            if (OPEN[u.v]) depth++
            else if (u.v === ']' || u.v === '}' || u.v === ')') depth--
            else if (depth === 0 && (u.v === '=' || u.v === ';')) break
          }
          j++
        }
      }
      if (toks[j]?.t === 'punc' && toks[j].v === '=') {
        const parser = new Parser(toks)
        parser.p = j + 1
        bindings.set(next.v, parser.value())
      }
      continue
    }

    if (ROUTER_FNS.has(t.v) && next?.t === 'punc' && next.v === '(') {
      const prev = toks[i - 1]
      if (prev?.t === 'id' && (prev.v === 'function' || prev.v === 'import')) continue
      const parser = new Parser(toks)
      parser.p = i
      const call = parser.primary()
      if (call.k === 'call' && call.args[0]) {
        const arg = call.args[0]
        if (arg.k === 'obj') { const r = arg.props.get('routes'); if (r) routerRoots.push(r) }
        else routerRoots.push(arg)
      }
    }
  }

  return {
    file,
    content,
    bindings,
    imports,
    defaultExport,
    routerRoots,
    isRouteConfig: /@react-router\/dev\/routes/.test(content) || /satisfies\s+RouteConfig\b/.test(content),
    hasJsxRoutes: /<Route[\s>/]/.test(content),
  }
}

function parseImport(toks: Tok[], i: number, imports: Map<string, ImportRef>): number {
  const locals: Array<[string, string]> = []
  if (toks[i]?.t === 'id' && toks[i].v === 'type') i++
  while (i < toks.length) {
    const t = toks[i]
    if (t.t === 'str') {
      for (const [local, name] of locals) imports.set(local, { from: t.v, name })
      return i
    }
    if (t.t === 'punc' && t.v === ';') return i
    if (t.t === 'id' && t.v === 'from') { i++; continue }
    if (t.t === 'punc' && t.v === '{') {
      i++
      while (i < toks.length && !(toks[i].t === 'punc' && toks[i].v === '}')) {
        const u = toks[i]
        if (u.t === 'id' && u.v !== 'type') {
          if (toks[i + 1]?.v === 'as' && toks[i + 2]?.t === 'id') { locals.push([toks[i + 2].v, u.v]); i += 3; continue }
          locals.push([u.v, u.v])
        }
        i++
      }
      i++
      continue
    }
    if (t.t === 'id' && t.v !== 'as') {
      if (toks[i - 1]?.v !== 'as') locals.push([t.v, 'default'])
    }
    i++
  }
  return i
}

// ---------------------------------------------------------------- resolution across files

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function isFile(p: string): boolean {
  try { return fs.statSync(p).isFile() } catch { return false }
}

export function resolveSourceFile(fromFile: string, spec: string, rootDir: string): string | null {
  const bases: string[] = []
  if (spec.startsWith('.')) bases.push(path.resolve(path.dirname(fromFile), spec))
  else if (spec.startsWith('~/') || spec.startsWith('@/')) {
    for (const dir of ['app', 'src', '.']) bases.push(path.join(rootDir, dir, spec.slice(2)))
  } else if (spec.startsWith('/')) bases.push(spec)
  else return null

  for (const base of bases) {
    if (isFile(base)) return base
    for (const ext of SOURCE_EXTS) if (isFile(base + ext)) return base + ext
    for (const ext of SOURCE_EXTS) if (isFile(path.join(base, 'index' + ext))) return path.join(base, 'index' + ext)
  }
  return null
}

export type ExtractedRoute = {
  path: string
  componentFile: string
  sourceFile: string
}

class Extractor {
  private modules = new Map<string, RouteModule | null>()
  readonly referenced = new Set<string>() // `${file}#${name}` bindings pulled in by another route tree
  readonly routes: ExtractedRoute[] = []
  private seen = new Set<string>()

  constructor(private rootDir: string) {}

  load(file: string): RouteModule | null {
    const abs = path.resolve(file)
    if (this.modules.has(abs)) return this.modules.get(abs)!
    let mod: RouteModule | null = null
    try { mod = parseModule(abs, fs.readFileSync(abs, 'utf-8')) } catch { mod = null }
    this.modules.set(abs, mod)
    return mod
  }

  private resolve(node: Node, mod: RouteModule, depth = 0): { node: Node; mod: RouteModule } | null {
    if (depth > 20) return null
    if (node.k !== 'id') return { node, mod }
    const local = mod.bindings.get(node.name)
    if (local) {
      this.referenced.add(`${mod.file}#${node.name}`)
      return this.resolve(local, mod, depth + 1)
    }
    const imp = mod.imports.get(node.name)
    if (!imp) return null
    const target = resolveSourceFile(mod.file, imp.from, this.rootDir)
    const tmod = target ? this.load(target) : null
    if (!tmod) return null
    if (imp.name === 'default') {
      this.referenced.add(`${tmod.file}#default`)
      return tmod.defaultExport ? this.resolve(tmod.defaultExport, tmod, depth + 1) : null
    }
    return this.resolve({ k: 'id', name: imp.name }, tmod, depth + 1)
  }

  private emit(routePath: string, componentFile: string | null, mod: RouteModule): void {
    const p = normalizePath(routePath)
    if (p.includes('*')) return
    if (this.seen.has(p)) return
    this.seen.add(p)
    this.routes.push({ path: p, componentFile: componentFile ?? mod.file, sourceFile: mod.file })
  }

  collect(node: Node, mod: RouteModule, parent: string): void {
    const r = this.resolve(node, mod)
    if (!r) return
    const { node: n, mod: m } = r
    if (n.k === 'arr') { for (const item of n.items) this.item(item, m, parent); return }
    this.item(n, m, parent)
  }

  private item(node: Node, mod: RouteModule, parent: string): void {
    if (node.k === 'spread') { this.collect(node.v, mod, parent); return }
    if (node.k === 'id') { this.collect(node, mod, parent); return }

    if (node.k === 'obj') {
      const pathNode = node.props.get('path')
      const indexNode = node.props.get('index')
      const isIndex = indexNode?.k === 'id' && indexNode.name === 'true'
      const full = pathNode?.k === 'str' ? joinPath(parent, pathNode.v) : isIndex ? parent : null
      if (full !== null) this.emit(full, this.componentOf(node, mod), mod)
      const children = node.props.get('children')
      if (children) this.collect(children, mod, full ?? parent)
      return
    }

    if (node.k === 'call') {
      const a = node.args
      const childrenArg = (from: number) => a.slice(from).find(x => x.k === 'arr' || x.k === 'id' || x.k === 'call')
      switch (node.name) {
        case 'route': {
          if (a[0]?.k !== 'str') return
          const full = joinPath(parent, a[0].v)
          this.emit(full, this.fileArg(a[1], mod), mod)
          const children = childrenArg(2)
          if (children) this.collect(children, mod, full)
          return
        }
        case 'index':
          this.emit(parent, this.fileArg(a[0], mod), mod)
          return
        case 'layout': {
          const children = childrenArg(1)
          if (children) this.collect(children, mod, parent)
          return
        }
        case 'prefix': {
          if (a[0]?.k !== 'str') return
          const children = childrenArg(1)
          if (children) this.collect(children, mod, joinPath(parent, a[0].v))
          return
        }
        case 'flatRoutes': {
          const opts = a[0]?.k === 'obj' ? a[0] : null
          const dir = opts?.props.get('rootDirectory')
          this.flatRoutes(mod, parent, dir?.k === 'str' ? dir.v : 'routes')
          return
        }
      }
    }
  }

  private fileArg(node: Node | undefined, mod: RouteModule): string | null {
    if (node?.k !== 'str') return null
    const abs = path.resolve(path.dirname(mod.file), node.v)
    return isFile(abs) ? abs : null
  }

  private componentOf(obj: Extract<Node, { k: 'obj' }>, mod: RouteModule): string | null {
    for (const key of ['lazy', 'component', 'Component', 'element']) {
      const v = obj.props.get(key)
      if (!v) continue
      const spec = findDynamicImport(v) ?? (v.k === 'id' ? mod.imports.get(v.name)?.from : undefined)
      if (spec) {
        const file = resolveSourceFile(mod.file, spec, this.rootDir)
        if (file) return file
      }
    }
    return null
  }

  // React Router flat-routes file convention: app/routes/rules.$id.tsx -> /rules/:id
  private flatRoutes(mod: RouteModule, parent: string, rootDirectory: string): void {
    const dir = path.resolve(path.dirname(mod.file), rootDirectory)
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    const items: Array<{ name: string; file: string }> = []
    for (const e of entries) {
      if (e.name.startsWith('.')) continue
      if (e.isFile()) {
        const ext = path.extname(e.name)
        if (!SOURCE_EXTS.includes(ext) || /\.(test|spec|stories)$/.test(path.basename(e.name, ext))) continue
        items.push({ name: path.basename(e.name, ext), file: path.join(dir, e.name) })
      } else if (e.isDirectory()) {
        const routeFile = SOURCE_EXTS.map(ext => path.join(dir, e.name, 'route' + ext)).find(isFile)
        if (routeFile) items.push({ name: e.name, file: routeFile })
      }
    }
    items.sort((x, y) => x.name.localeCompare(y.name))
    for (const { name, file } of items) {
      const segs: string[] = []
      for (const raw of splitFlatName(name)) {
        if (raw === '_index' || raw === 'route') continue
        if (raw.startsWith('(') && raw.endsWith(')')) continue
        if (raw.startsWith('_')) continue
        let seg = raw.endsWith('_') ? raw.slice(0, -1) : raw
        if (seg === '$') seg = '*'
        else if (seg.startsWith('$')) seg = ':' + seg.slice(1)
        segs.push(seg.replace(/\[([^\]]*)\]/g, '$1'))
      }
      this.emit(joinPath(parent, segs.join('/')), file, mod)
    }
  }

  // <Route path="a"><Route path="b" /></Route>  ->  /a, /a/b
  jsxRoutes(mod: RouteModule, parent: string): void {
    const src = mod.content
    const stack: string[] = []
    const re = /<(\/?)Route(?=[\s>/])/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      if (m[1]) { stack.pop(); continue }
      let j = m.index + m[0].length
      let depth = 0
      let top = ''
      let group = ''
      let quote: string | null = null
      for (; j < src.length; j++) {
        const c = src[j]
        if (quote) { if (c === quote) quote = null; if (depth === 0) top += c; else group += c; continue }
        if (c === '"' || c === "'" || c === '`') { quote = c; if (depth === 0) top += c; else group += c; continue }
        if (c === '{') { if (depth++ === 0) { group = ''; continue } }
        if (c === '}' && depth === 0) { top += c; continue }
        if (c === '}') {
          if (--depth === 0) {
            top += /^\s*(["'`])[^"'`]*\1\s*$/.test(group) ? group.trim() : '{}'
            continue
          }
        }
        if (depth > 0) { group += c; continue }
        if (c === '>') break
        top += c
      }
      const tag = src.slice(m.index, j)
      re.lastIndex = j
      const selfClosing = top.trimEnd().endsWith('/')
      const pathMatch = top.match(/\bpath\s*=\s*(["'`])([^"'`]*)\1/)
      const base = stack.length ? stack[stack.length - 1] : parent
      const full = pathMatch ? joinPath(base, pathMatch[2]) : base
      if (pathMatch || /\bindex\b/.test(top)) this.emit(full, null, mod)
      if (pathMatch && full.endsWith('*')) this.mountSplat(mod, tag, full.replace(/\/?\*$/, '') || '/')
      if (!selfClosing) stack.push(full)
    }
  }

  // <Route path="dashboard/*" element={<DashboardRoutes />} /> renders a nested <Routes>
  // from another file: read that file's routes under /dashboard.
  private mountDepth = 0
  readonly mountedFiles = new Set<string>()

  private mountSplat(mod: RouteModule, tag: string, base: string): void {
    const comp = tag.match(/\belement\s*=\s*\{\s*<([A-Z][\w$]*)/)?.[1]
      ?? tag.match(/\bComponent\s*=\s*\{\s*([A-Z][\w$]*)\s*\}/)?.[1]
    const imp = comp ? mod.imports.get(comp) : undefined
    const target = imp ? resolveSourceFile(mod.file, imp.from, this.rootDir) : null
    const tmod = target ? this.load(target) : null
    if (!tmod || tmod === mod || this.mountDepth >= 10) return
    this.mountedFiles.add(tmod.file)
    this.mountDepth++
    this.roots(tmod, base)
    this.mountDepth--
  }

  // Unambiguous roots of a file: router calls, route-config default export, JSX trees.
  roots(mod: RouteModule, mount: string): boolean {
    let found = false
    for (const root of mod.routerRoots) { this.collect(root, mod, mount); found = true }
    if (mod.isRouteConfig && mod.defaultExport) { this.collect(mod.defaultExport, mod, mount); found = true }
    if (mod.hasJsxRoutes) { this.jsxRoutes(mod, mount); found = true }
    return found
  }
}

function findDynamicImport(node: Node): string | undefined {
  if (node.k === 'call') {
    if (node.name === 'import' && node.args[0]?.k === 'str') return node.args[0].v
    for (const a of node.args) { const r = findDynamicImport(a); if (r) return r }
  }
  return undefined
}

function splitFlatName(name: string): string[] {
  const segs: string[] = []
  let cur = ''
  let inBracket = false
  for (const c of name) {
    if (c === '[') inBracket = true
    if (c === ']') inBracket = false
    if (c === '.' && !inBracket) { segs.push(cur); cur = ''; continue }
    cur += c
  }
  segs.push(cur)
  return segs.filter(Boolean)
}

export function joinPath(parent: string, child: string): string {
  if (child.startsWith('/')) return normalizePath(child)
  if (child === '') return normalizePath(parent)
  return normalizePath(parent.replace(/\/+$/, '') + '/' + child)
}

export function normalizePath(p: string): string {
  const collapsed = ('/' + p).replace(/\/{2,}/g, '/')
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed
}

// ---------------------------------------------------------------- entry point

export type RouteFileSpec = {
  file: string
  mount?: string      // prefix the file's routes are mounted under, e.g. "/admin"
  explicit?: boolean  // named by the user: fall back to its exported arrays if it has no router call
}

// Pass 1 reads each file's unambiguous roots (router calls, route-config default exports, JSX trees).
// Pass 2 reads files the user named that have no router call (e.g. `export const adminRoutes = [...]`):
// their exported arrays are roots unless another route tree already pulled them in.
// Files rendered as nested <Routes> under a splat route are only read under that mount, so the
// extraction re-runs once without reading them standalone.
export function extractRoutes(specs: RouteFileSpec[], rootDir: string): ExtractedRoute[] {
  const first = runExtraction(specs, rootDir, new Set())
  if (first.mountedFiles.size === 0) return first.routes
  return runExtraction(specs, rootDir, first.mountedFiles).routes
}

function runExtraction(specs: RouteFileSpec[], rootDir: string, mountedElsewhere: Set<string>): Extractor {
  const ex = new Extractor(rootDir)
  const loaded = specs
    .map(spec => ({ spec, mod: ex.load(path.resolve(rootDir, spec.file)) }))
    .filter((x): x is { spec: RouteFileSpec; mod: RouteModule } => x.mod !== null)

  const strong = new Set<RouteModule>()
  for (const { spec, mod } of loaded) {
    if (!spec.mount && mountedElsewhere.has(mod.file)) { strong.add(mod); continue }
    if (ex.roots(mod, spec.mount ?? '/')) strong.add(mod)
  }

  for (const { spec, mod } of loaded) {
    if (!spec.explicit || strong.has(mod)) continue
    const mount = spec.mount ?? '/'
    if (mod.defaultExport && !ex.referenced.has(`${mod.file}#default`)) ex.collect(mod.defaultExport, mod, mount)
    for (const [name, value] of mod.bindings) {
      if (value.k !== 'arr' || ex.referenced.has(`${mod.file}#${name}`)) continue
      ex.collect(value, mod, mount)
    }
  }

  return ex
}

// ---------------------------------------------------------------- discovery

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'out', 'coverage', '__tests__', '__fixtures__', 'storybook-static'])

export function findSourceFiles(rootDir: string, test: (content: string) => boolean, maxFiles = 5000): string[] {
  const found: string[] = []
  let scanned = 0
  const visit = (dir: string, recurse: boolean) => {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (scanned >= maxFiles) return
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (recurse && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) visit(full, true)
        continue
      }
      const ext = path.extname(e.name)
      if (!SOURCE_EXTS.includes(ext)) continue
      if (/\.(test|spec|stories|d)$/.test(path.basename(e.name, ext))) continue
      scanned++
      let content: string
      try {
        if (fs.statSync(full).size > 512_000) continue
        content = fs.readFileSync(full, 'utf-8')
      } catch { continue }
      if (test(content)) found.push(full)
    }
  }
  visit(rootDir, false)
  for (const dir of ['src', 'app']) visit(path.join(rootDir, dir), true)
  return found
}

// Attach selectors and API calls read from each route's component file.
export function toDiscoveredRoutes(routes: ExtractedRoute[]): DiscoveredRoute[] {
  const cache = new Map<string, string>()
  const read = (file: string) => {
    if (!cache.has(file)) {
      let content = ''
      try { content = fs.readFileSync(file, 'utf-8') } catch { content = '' }
      cache.set(file, content)
    }
    return cache.get(file)!
  }
  return routes.map(r => {
    const content = read(r.componentFile)
    return {
      path: r.path,
      componentFile: r.componentFile,
      sourceFile: r.sourceFile,
      pageTitle: undefined,
      selectors: extractSelectors(content),
      apiCalls: extractApiCalls(content),
    }
  })
}
