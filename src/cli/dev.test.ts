import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fsp from 'fs/promises'
import http from 'http'
import net from 'net'
import os from 'os'
import path from 'path'
import { injectWidget, startDevServer } from './dev'

const sockets = new Set<net.Socket>()

function listen(server: http.Server): Promise<number> {
  server.on('connection', c => sockets.add(c))
  return new Promise(resolve => server.listen(0, () => resolve((server.address() as net.AddressInfo).port)))
}

let dir: string
let app: http.Server
let llm: http.Server
let dev: http.Server
let devUrl: string

beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-dev-'))
  await fsp.writeFile(path.join(dir, 'widget.js'), 'window.Spotter = { init() {}, destroy() {} }')
  await fsp.writeFile(path.join(dir, 'spotter.config.json'), JSON.stringify({
    version: '1',
    routes: [{ path: '/billing', description: 'Change your plan', selectors: {} }],
    actions: [],
  }))

  app = http.createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html><head><title>App</title></head><body>hi</body></html>')
    } else if (req.url === '/old') {
      res.writeHead(302, { location: `http://localhost:${appPort}/new` })
      res.end()
    } else {
      res.writeHead(200, { 'content-type': 'application/javascript' })
      res.end('console.log(1)')
    }
  })
  const appPort = await listen(app)
  app.on('upgrade', (_req, socket) => {
    socket.on('error', () => {})
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    socket.on('data', d => socket.write(d))
  })

  llm = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'x', object: 'chat.completion', created: 0, model: 'm',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"type":"navigate","routePath":"/billing"}' } }],
    }))
  })
  const llmPort = await listen(llm)

  dev = await startDevServer({
    rootDir: dir,
    configPath: path.join(dir, 'spotter.config.json'),
    llm: { config: { apiKey: 'k', baseURL: `http://127.0.0.1:${llmPort}/v1` } },
    target: `http://127.0.0.1:${appPort}`,
    port: 0,
    widgetFile: path.join(dir, 'widget.js'),
    quiet: true,
  })
  dev.on('connection', c => sockets.add(c))
  devUrl = `http://127.0.0.1:${(dev.address() as net.AddressInfo).port}`
})

afterAll(async () => {
  for (const socket of sockets) socket.destroy()
  for (const s of [dev, app, llm]) await new Promise(r => s?.close(r))
  await fsp.rm(dir, { recursive: true, force: true })
})

describe('injectWidget', () => {
  it('adds the script once, before </head> when there is one', () => {
    const once = injectWidget('<html><head></head><body></body></html>')
    expect(once).toBe('<html><head><script src="/__spotter/widget.js" defer></script></head><body></body></html>')
    expect(injectWidget(once)).toBe(once)
    expect(injectWidget('<p>x</p>')).toContain('<script src="/__spotter/widget.js"')
  })
})

describe('spotter-sdk dev', () => {
  it('injects the widget into HTML pages', async () => {
    const html = await (await fetch(`${devUrl}/`)).text()
    expect(html).toContain('<script src="/__spotter/widget.js" defer></script></head>')
  })

  it('passes other files through untouched', async () => {
    expect(await (await fetch(`${devUrl}/main.js`)).text()).toBe('console.log(1)')
  })

  it('rewrites redirects to stay on the proxy', async () => {
    const res = await fetch(`${devUrl}/old`, { redirect: 'manual' })
    expect(res.headers.get('location')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/new$/)
    expect(res.headers.get('location')).toContain(new URL(devUrl).port)
  })

  it('serves the widget with an init call', async () => {
    const js = await (await fetch(`${devUrl}/__spotter/widget.js`)).text()
    expect(js).toContain('window.Spotter = { init() {}, destroy() {} }')
    expect(js).toContain("proxyUrl: '/__spotter/api'")
  })

  it('answers widget queries with the configured model', async () => {
    const res = await fetch(`${devUrl}/__spotter/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'change my plan', url: 'http://x/' }),
    })
    const body = await res.json()
    expect(body.type).toBe('navigate')
    expect(body.steps.at(-1).selector).toBe('a[href="/billing"]')
  })

  it('passes websocket upgrades through (HMR)', async () => {
    const { port } = new URL(devUrl)
    const echoed = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(Number(port), '127.0.0.1', () => {
        socket.write('GET /hmr HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
      })
      let seen = ''
      socket.on('data', d => {
        seen += d.toString()
        if (seen.includes('101') && !seen.includes('ping')) socket.write('ping')
        if (seen.includes('ping')) { socket.destroy(); resolve(seen) }
      })
      socket.on('error', reject)
    })
    expect(echoed).toContain('101 Switching Protocols')
    expect(echoed).toContain('ping')
  })

  it('refuses to start without a config', async () => {
    await expect(startDevServer({
      rootDir: dir, configPath: path.join(dir, 'missing.json'), llm: { config: { apiKey: 'k' } }, quiet: true,
    })).rejects.toThrow('Run `spotter-sdk analyze` first')
  })
})
