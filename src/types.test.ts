import { describe, it, expect } from 'vitest'
import { SpotterConfigSchema } from './types'

describe('SpotterConfigSchema', () => {
  it('parses a valid minimal config', () => {
    const config = SpotterConfigSchema.parse({
      version: '1',
      baseUrl: 'https://app.com',
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
      baseUrl: 'https://app.com',
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

  it('rejects config missing baseUrl', () => {
    expect(() =>
      SpotterConfigSchema.parse({ version: '1', routes: [], actions: [], mcpServers: [] })
    ).toThrow()
  })

  it('rejects route missing description', () => {
    expect(() =>
      SpotterConfigSchema.parse({
        version: '1',
        baseUrl: 'https://app.com',
        routes: [{ path: '/foo' }],
        actions: [],
        mcpServers: [],
      })
    ).toThrow()
  })
})
