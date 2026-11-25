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
    await writeConfig(routes, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
    expect(content).not.toHaveProperty('baseUrl')
    expect(content.routes).toHaveLength(2)
    expect(content.routes[0].path).toBe('/')
  })

  it('preserves existing descriptions on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath })

    const updatedRoutes: RouteWithDescription[] = [
      ...routes,
      { path: '/new-page', componentFile: 'new.tsx', selectors: {}, apiCalls: [], description: 'New page' },
    ]
    await writeConfig(updatedRoutes, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    const appearance = content.routes.find((r: { path: string }) => r.path === '/settings/appearance')
    expect(appearance.description).toBe('Change theme and appearance settings')
  })

  it('does not overwrite a manually-edited description', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[0].description = 'Manually edited home description'
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].description).toBe('Manually edited home description')
  })

  it('preserves existing actions and mcpServers on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.actions = [{ intent: 'change theme', type: 'api', endpoint: '/api/prefs', auth: 'session' }]
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.actions).toHaveLength(1)
  })

  it('creates the output directory if it does not exist', async () => {
    const outputPath = path.join(tmpDir, 'subdir', 'spotter.config.json')
    await writeConfig(routes, { outputPath })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.version).toBe('1')
  })

  it('derives reachableFrom from existing ancestor routes', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const nested: RouteWithDescription[] = [
      { path: '/settings', componentFile: 's.tsx', selectors: {}, apiCalls: [], description: 'Settings' },
      { path: '/settings/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Billing' },
    ]
    await writeConfig(nested, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('reachableFrom')
    expect(content.routes[1].reachableFrom).toEqual(['/settings'])
  })

  it('writes title from the discovered page title', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const titled: RouteWithDescription[] = [
      { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], pageTitle: 'Billing', description: 'Billing' },
    ]
    await writeConfig(titled, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].title).toBe('Billing')
  })

  it('preserves manually authored page actions and reachableFrom on merge', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath })

    const existing = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    existing.routes[1].actions = [{ name: 'toggle_theme', description: 'Toggle dark mode', selector: '[data-testid="x"]' }]
    existing.routes[1].reachableFrom = ['/custom-parent']
    await fsp.writeFile(outputPath, JSON.stringify(existing, null, 2))

    await writeConfig(routes, { outputPath })

    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[1].actions[0].name).toBe('toggle_theme')
    expect(content.routes[1].reachableFrom).toEqual(['/custom-parent'])
  })

  it('omits actions when none exist', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig(routes, { outputPath })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).not.toHaveProperty('actions')
  })
})

describe('writeConfig: placeholders, hidden routes and generated actions', () => {
  it('upgrades placeholder descriptions but keeps written ones', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    await writeConfig([
      { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Billing page' },
      { path: '/team', componentFile: 't.tsx', selectors: {}, apiCalls: [], description: 'Invite teammates' },
    ], { outputPath })
    await writeConfig([
      { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Change your plan' },
      { path: '/team', componentFile: 't.tsx', selectors: {}, apiCalls: [], description: 'Something new' },
    ], { outputPath })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes.map((r: { description: string }) => r.description)).toEqual(['Change your plan', 'Invite teammates'])
  })

  it('writes navigable: false with a note, and keeps the developer\'s choice on re-runs', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const paywall = { path: '/paywall', componentFile: 'p.tsx', selectors: {}, apiCalls: [], description: 'Paywall' }
    await writeConfig([{ ...paywall, navigable: false, note: 'Interstitial' }], { outputPath })
    let content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0]).toMatchObject({ navigable: false, note: 'Interstitial' })

    content.routes[0].navigable = true
    await fsp.writeFile(outputPath, JSON.stringify(content))
    await writeConfig([{ ...paywall, navigable: false, note: 'Interstitial' }], { outputPath })
    content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].navigable).toBe(true)
    expect(content.routes[0]).not.toHaveProperty('note')
  })

  it('adds generated actions only where none exist yet', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const generated = [{ name: 'change_plan', description: 'Change plan', selector: 'role=button[name="Change plan"]' }]
    const billing = { path: '/billing', componentFile: 'b.tsx', selectors: {}, apiCalls: [], description: 'Billing' }
    await writeConfig([{ ...billing, actions: generated }], { outputPath })
    const content = JSON.parse(await fsp.readFile(outputPath, 'utf-8'))
    expect(content.routes[0].actions).toEqual(generated)
    content.routes[0].actions = [{ name: 'mine', description: 'Mine', selector: '#mine' }]
    await fsp.writeFile(outputPath, JSON.stringify(content))
    await writeConfig([{ ...billing, actions: generated }], { outputPath })
    expect(JSON.parse(await fsp.readFile(outputPath, 'utf-8')).routes[0].actions[0].name).toBe('mine')
  })
})

describe('writeConfig: refreshing unreviewed routes', () => {
  it('lets a later model run overrule a guess from a no-key run', async () => {
    const outputPath = path.join(tmpDir, 'spotter.config.json')
    const base = { path: '/paywall', componentFile: 'p.tsx', selectors: {}, apiCalls: [] }
    await writeConfig([{ ...base, description: 'Paywall page', navigable: false, note: 'guessed' }], { outputPath })
    const config = await writeConfig([{ ...base, description: 'Upgrade to unlock exports', title: 'Upgrade' }], { outputPath })
    expect(config.routes[0]).toMatchObject({ description: 'Upgrade to unlock exports', title: 'Upgrade' })
    expect(config.routes[0].navigable).toBeUndefined()
  })
})
