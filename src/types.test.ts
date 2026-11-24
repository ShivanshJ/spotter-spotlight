import { describe, it, expect } from 'vitest'
import { SpotterConfigSchema } from './types'

describe('SpotterConfigSchema', () => {
  it('parses a valid minimal config', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      routes: [],
      actions: [],
      mcpServers: [],
    })
    expect(config.version).toBe('1')
    expect(config.routes).toEqual([])
  })

  it('parses a config with routes and actions', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      routes: [
        {
          path: '/settings/appearance',
          description: 'Dark mode and theme settings',
          selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
        },
      ],
      actions: [
        {
          intent: 'get user points balance',
          type: 'api',
          endpoint: 'GET /api/user/rewards',
          auth: 'session',
        },
      ],
      mcpServers: [
        { url: 'https://api.app.com/mcp', allowedTools: ['getPoints'] },
      ],
    })
    expect(config.routes[0].path).toBe('/settings/appearance')
    expect(config.actions[0].intent).toBe('get user points balance')
    expect(config.mcpServers[0].url).toBe('https://api.app.com/mcp')
  })

  it('accepts a config without baseUrl', () => {
    const config = SpotterConfigSchema.parse({ version: '1', routes: [], actions: [], mcpServers: [] })
    expect(config.routes).toEqual([])
  })

  it('still accepts a legacy config that contains baseUrl', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      baseUrl: 'https://app.com',
      routes: [],
      actions: [],
      mcpServers: [],
    })
    expect(config).not.toHaveProperty('baseUrl')
  })

  it('rejects route missing description', () => {
    expect(() =>
      SpotterConfigSchema.parse({
        version: '1',
          routes: [{ path: '/foo' }],
        actions: [],
        mcpServers: [],
      })
    ).toThrow()
  })
})

describe('Route v1.1 fields', () => {
  const base = { version: '1', actions: [], mcpServers: [] }

  it('parses a route with title, reachableFrom and page actions', () => {
    const config = SpotterConfigSchema.parse({
      ...base,
      routes: [
        {
          path: '/settings/billing',
          description: 'Manage subscription',
          title: 'Billing',
          reachableFrom: ['/settings'],
          actions: [
            { name: 'change_plan', description: 'Change subscription plan', selector: '[data-testid="change-plan"]' },
          ],
        },
      ],
    })
    expect(config.routes[0].title).toBe('Billing')
    expect(config.routes[0].reachableFrom).toEqual(['/settings'])
    expect(config.routes[0].actions?.[0].name).toBe('change_plan')
  })

  it('still parses a v1.0 route without the new fields', () => {
    const config = SpotterConfigSchema.parse({
      ...base,
      routes: [{ path: '/rewards', description: 'Points' }],
    })
    expect(config.routes[0].actions).toBeUndefined()
    expect(config.routes[0].reachableFrom).toBeUndefined()
    expect(config.routes[0].selectors).toEqual({})
  })

  it('rejects a page action missing its selector', () => {
    expect(() =>
      SpotterConfigSchema.parse({
        ...base,
        routes: [{ path: '/x', description: 'X', actions: [{ name: 'a', description: 'A' }] }],
      })
    ).toThrow()
  })
})
