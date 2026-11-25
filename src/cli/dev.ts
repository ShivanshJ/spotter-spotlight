// `spotter-sdk dev`: try Spotter on a running app without changing its code.
//
// Starts a proxy in front of the app's dev server. Every HTML page gets the widget script
// injected, /__spotter/api answers widget queries with the developer's own LLM key, and all
// other requests (including HMR websockets) pass straight through to the dev server.
import fs from 'fs'
import http from 'http'
import net from 'net'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'
import { createSpotterProxy } from '../proxy/index'
import { loadConfig } from '../proxy/site-map'
import type { LLMSettings } from './llm-env'
import type { SpotterEvent } from '../proxy/analytics'

export const SPOTTER_PREFIX = '/__spotter'
const WIDGET_PATH = `${SPOTTER_PREFIX}/widget.js`
const API_PATH = `${SPOTTER_PREFIX}/api`
const DEFAULT_PORT = 4400
const CANDIDATE_PORTS = [5173, 3000, 8080, 5174, 4200, 8000]
const MAX_BODY = 64 * 1024

export type DevOptions = {
  rootDir: string
  configPath: string
  llm: LLMSettings
  target?: string
  port?: number
  widgetFile?: string
  quiet?: boolean
}

const BOOTSTRAP = `
;(function () {
  var S = typeof Spotter !== 'undefined' ? Spotter : window.Spotter
  if (S && S.Spotter) S = S.Spotter
  if (!S || window.__spotterDev) return
  window.__spotterDev = true
  var options = { proxyUrl: '${API_PATH}' }
  var queued = false
  function ensure() {
    queued = false
    if (!document.body || document.querySelector('[data-spotter-root]')) return
    S.destroy()
    S.init(options)
  }
  function start() {
    S.init(options)
    new MutationObserver(function () {
      if (!queued) { queued = true; requestAnimationFrame(ensure) }
    }).observe(document.documentElement, { childList: true, subtree: true })
  }
  if (document.readyState === 'complete') setTimeout(start, 300)
  else window.addEventListener('load', function () { setTimeout(start, 300) })
})();
`

export function injectWidget(html: string): string {
  const tag = `<script src="${WIDGET_PATH}" defer></script>`
  if (html.includes(WIDGET_PATH)) return html
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`)
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`)
  return html + tag
}

function findWidgetBundle(explicit?: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = explicit ? [explicit] : [path.join(here, '../index.iife.js'), path.join(here, '../../dist/index.iife.js')]
  const found = candidates.find(f => fs.existsSync(f))
  if (!found) throw new Error('Widget bundle not found. If you are developing spotter-sdk itself, run `npm run build` first.')
  return found
}

function probe(url: string): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: 700 }, res => { res.resume(); resolve(true) })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

async function findTarget(explicit?: string): Promise<URL> {
  if (explicit) {
    const url = new URL(/^https?:\/\//.test(explicit) ? explicit : `http://${explicit}`)
    if (!(await probe(url.href))) throw new Error(`Nothing is answering at ${url.origin}. Start your dev server first.`)
    return url
  }
  for (const port of CANDIDATE_PORTS) {
    const url = new URL(`http://localhost:${port}`)
    if (await probe(url.href)) return url
  }
  throw new Error(
    `No dev server found on localhost ports ${CANDIDATE_PORTS.join(', ')}.\n` +
    'Start your app (e.g. `npm run dev`), or point at it: spotter-sdk dev --target http://localhost:<port>'
  )
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) { reject(new Error('request too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function decode(body: Buffer, encoding: string | undefined): Buffer {
  if (encoding === 'gzip') return zlib.gunzipSync(body)
  if (encoding === 'br') return zlib.brotliDecompressSync(body)
  if (encoding === 'deflate') return zlib.inflateSync(body)
  return body
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function rewriteLocation(location: string, target: URL, proxyOrigin: string): string {
  let url: URL
  try { url = new URL(location) } catch { return location }
  const sameHost = url.hostname === target.hostname || (LOOPBACK.has(url.hostname) && LOOPBACK.has(target.hostname))
  if (!sameHost || url.port !== target.port) return location
  return proxyOrigin + url.pathname + url.search + url.hash
}

function forwardHeaders(headers: http.IncomingHttpHeaders, target: URL, proxyOrigin: string): http.OutgoingHttpHeaders {
  const out: http.OutgoingHttpHeaders = { ...headers }
  if (typeof headers.location === 'string') out.location = rewriteLocation(headers.location, target, proxyOrigin)
  return out
}

function proxyRequest(req: http.IncomingMessage, res: http.ServerResponse, target: URL, proxyOrigin: string): void {
  const headers = { ...req.headers }
  delete headers['accept-encoding']
  const upstream = http.request({
    hostname: target.hostname,
    port: target.port || 80,
    method: req.method,
    path: req.url,
    headers,
  }, up => {
    const isHtml = String(up.headers['content-type'] ?? '').includes('text/html')
    if (!isHtml) {
      res.writeHead(up.statusCode ?? 502, forwardHeaders(up.headers, target, proxyOrigin))
      up.pipe(res)
      return
    }
    const chunks: Buffer[] = []
    up.on('data', (c: Buffer) => chunks.push(c))
    up.on('end', () => {
      const raw = Buffer.concat(chunks)
      let html: string
      try { html = injectWidget(decode(raw, up.headers['content-encoding'] as string | undefined).toString('utf-8')) } catch { html = raw.toString('utf-8') }
      const out = forwardHeaders(up.headers, target, proxyOrigin)
      delete out['content-encoding']
      delete out['content-length']
      delete out['transfer-encoding']
      delete out['content-security-policy']
      res.writeHead(up.statusCode ?? 200, { ...out, 'content-length': Buffer.byteLength(html) })
      res.end(html)
    })
  })
  upstream.on('error', err => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(`Spotter dev proxy: can't reach ${target.origin} (${err.message}). Is your dev server still running?`)
  })
  req.pipe(upstream)
}

function proxyUpgrade(req: http.IncomingMessage, socket: net.Socket, head: Buffer, target: URL): void {
  const upstream = net.connect(Number(target.port || 80), target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
    upstream.write(lines.join('\r\n') + '\r\n\r\n')
    if (head.length) upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
  })
  upstream.on('error', () => socket.destroy())
  upstream.on('close', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
  socket.on('close', () => upstream.destroy())
}

function logQuery(event: SpotterEvent): void {
  console.log(`  "${event.query}" → ${event.responseType}${event.error ? ` (LLM error: ${event.error})` : ''}`)
}

export async function startDevServer(options: DevOptions): Promise<http.Server> {
  if (!fs.existsSync(options.configPath)) {
    throw new Error(`${path.relative(process.cwd(), options.configPath) || options.configPath} not found. Run \`spotter-sdk analyze\` first.`)
  }
  const config = await loadConfig(options.configPath)
  if (!options.llm.config) {
    throw new Error('No LLM key found. Set OPENAI_API_KEY (or SPOTTER_LLM_API_KEY and SPOTTER_LLM_BASE_URL) in your shell or .env.')
  }
  const widget = fs.readFileSync(findWidgetBundle(options.widgetFile), 'utf-8') + BOOTSTRAP
  const target = await findTarget(options.target)
  const port = options.port ?? DEFAULT_PORT
  const handle = createSpotterProxy({
    config: options.configPath,
    llm: options.llm.config,
    onAnalytics: options.quiet ? undefined : logQuery,
  })

  const server = http.createServer(async (req, res) => {
    const pathname = (req.url ?? '/').split('?')[0]
    if (pathname === WIDGET_PATH) {
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-store' })
      res.end(widget)
      return
    }
    if (pathname === API_PATH) {
      if (req.method !== 'POST') { sendJson(res, 405, { type: 'error', message: 'POST only' }); return }
      try {
        const body = JSON.parse(await readBody(req))
        let status = 200
        await handle({ body }, {
          status(code: number) { status = code; return this },
          json(data: unknown) { sendJson(res, status, data) },
        })
      } catch (err) {
        sendJson(res, 400, { type: 'error', message: err instanceof Error ? err.message : 'bad request' })
      }
      return
    }
    const proxyOrigin = `http://${req.headers.host ?? `localhost:${port}`}`
    proxyRequest(req, res, target, proxyOrigin)
  })
  server.on('upgrade', (req, socket, head) => proxyUpgrade(req, socket as net.Socket, head, target))

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err.code === 'EADDRINUSE' ? new Error(`Port ${port} is in use. Pick another with --port.`) : err)
    })
    server.listen(port, resolve)
  })

  if (!options.quiet) {
    const address = server.address() as net.AddressInfo
    const pages = config.routes.filter(r => r.navigable !== false).length
    console.log(`\nSpotter dev proxy\n` +
      `  Open      http://localhost:${address.port}   (your app at ${target.origin}, with the widget added)\n` +
      `  Config    ${path.relative(process.cwd(), options.configPath) || options.configPath} (${pages} pages, reloaded on every question)\n` +
      `  Model     ${options.llm.config.model ?? 'gpt-4o-mini'}${options.llm.keySource ? ` via ${options.llm.keySource}` : ''}\n\n` +
      'Click "✦ Ask Spotter" in the corner of any page. Questions are logged below. Ctrl+C to stop.\n')
  }
  return server
}
