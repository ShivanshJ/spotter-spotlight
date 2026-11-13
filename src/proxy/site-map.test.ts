import { describe, it, expect } from 'vitest'
import { summarizeConfig, findRouteByPath, findActionByIntent } from './site-map'
import type { SpotterConfig } from '../types'

const config: SpotterConfig = {
  version: '1',
  baseUrl: 'https://app.com',
  mcpServers: [],
  routes: [
    {
      path: '/settings/appearance',
      description: 'Dark mode and theme settings',
      selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
    },
    {
      path: '/rewards',
      description: 'User points balance and rewards history',
      selectors: {},
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
}

describe('summarizeConfig', () => {
  it('includes all route paths and descriptions', () => {
    const summary = summarizeConfig(config)
    expect(summary).toContain('/settings/appearance')
    expect(summary).toContain('Dark mode and theme settings')
    expect(summary).toContain('/rewards')
  })

  it('includes all action intents', () => {
    const summary = summarizeConfig(config)
    expect(summary).toContain('get user points balance')
  })
})

describe('findRouteByPath', () => {
  it('returns route for exact path match', () => {
    const route = findRouteByPath(config, '/settings/appearance')
    expect(route?.description).toBe('Dark mode and theme settings')
  })

  it('returns undefined for unknown path', () => {
    expect(findRouteByPath(config, '/unknown')).toBeUndefined()
  })
})

describe('findActionByIntent', () => {
  it('returns action for exact intent match', () => {
    const action = findActionByIntent(config, 'get user points balance')
    expect(action?.endpoint).toBe('GET /api/user/rewards')
  })

  it('returns undefined for unknown intent', () => {
    expect(findActionByIntent(config, 'delete account')).toBeUndefined()
  })
})
