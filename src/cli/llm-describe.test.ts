import { describe, it, expect } from 'vitest'
import { describeRoutes } from './llm-describe'
import type { DiscoveredRoute } from './analyzers/types'

const routes: DiscoveredRoute[] = [
  { path: '/settings/appearance', componentFile: 'page.tsx', pageTitle: 'Appearance', selectors: {}, apiCalls: [] },
  { path: '/billing', componentFile: 'billing.tsx', pageTitle: undefined, selectors: {}, apiCalls: [] },
]

describe('describeRoutes', () => {
  it('returns heuristic descriptions when llmConfig is null', async () => {
    const result = await describeRoutes(routes, null)
    expect(result.get('/settings/appearance')).toBe('Settings Appearance page')
    expect(result.get('/billing')).toBe('Billing page')
  })

  it('returns a description for every route passed in', async () => {
    const result = await describeRoutes(routes, null)
    expect(result.size).toBe(routes.length)
  })
})
