import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'
import { writeConfig } from './config-writer'
import type { RouteWithDescription } from './config-writer'

const routes: RouteWithDescription[] = [
  { path: '/', componentFile: 'page.tsx', selectors: {}, apiCalls: [], description: 'Home page' },
  {
    path: '/settings/appearance',
    componentFile: 'appearance/page.tsx',
    selectors: { darkModeToggle: '[data-testid="dark-mode-toggle"]' },
    apiCalls: ['/api/preferences'],
    description: 'Change theme and appearance settings',
  },
]

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'spotter-test-'))
})

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true })
})

describe('writeConfig', () => {
  it('writes a valid spotter.config.json', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
    expect(content.baseUrl).toBe('https://app.example.com')
    expect(content.routes).toHaveLength(2)
    expect(content.routes[0].path).toBe('/')
  })

  it('preserves existing descriptions on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const updatedRoutes: RouteWithDescription[] = [
      ...routes,
      { path: '/new-page', componentFile: 'new.tsx', selectors: {}, apiCalls: [], description: 'New page' },
    ]
    await writeConfig(updatedRoutes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    const appearance = content.routes.find((r: { path: string }) => r.path === '/settings/appearance')
    expect(appearance.description).toBe('Change theme and appearance settings')
  })

  it('does not overwrite a manually-edited description', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[0].description = 'Manually edited home description'
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].description).toBe('Manually edited home description')
  })

  it('preserves existing actions and mcpServers on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.actions = [{ intent: 'change theme', type: 'api', endpoint: '/api/prefs', auth: 'session' }]
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.actions).toHaveLength(1)
  })

  it('creates the output directory if it does not exist', async () => {
    const outputPath = path.join(tmpDir, 'subdir', 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
  })

  it('derives reachableFrom from existing ancestor routes', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const nested: RouteWithDescription[] = [
      { path: '/settings', componentFile: 's.tsx', selectors: {}, apiCalls: [], description: 'Settings' },
      { path: '/settings/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Billing' },
    ]
    await writeConfig(nested, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('reachableFrom')
    expect(content.routes[1].reachableFrom).toEqual(['/settings'])
  })

  it('writes title from the discovered page title', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const titled: RouteWithDescription[] = [
      { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], pageTitle: 'Billing', description: 'Billing' },
    ]
    await writeConfig(titled, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].title).toBe('Billing')
  })

  it('preserves manually authored page actions and reachableFrom on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[1].actions = [{ name: 'toggle_theme', description: 'Toggle dark mode', selector: '[data-testid="x"]' }]
    existing.routes[1].reachableFrom = ['/custom-parent']
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[1].actions[0].name).toBe('toggle_theme')
    expect(content.routes[1].reachableFrom).toEqual(['/custom-parent'])
  })

  it('omits actions when none exist', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath, baseUrl: 'https://app.example.com' })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('actions')
  })
})
