import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SpotterConfig } from '../types'

vi.mock('./llm-client', () => ({
  createLLMClient: vi.fn(() => ({})),
  routeQuery: vi.fn(),
}))

import { routeQuery } from './llm-client'
import { createSpotterProxy } from './index'

const mockConfig: SpotterConfig = {
  version: '1',
  mcpServers: [],
  routes: [
    {
      path: '/settings/appearance',
      description: 'Dark mode and theme settings',
      selectors: { darkModeToggle: '[data-testid="dark-mode"]' },
    },
  ],
  actions: [],
}

function makeReqRes(body: object) {
  const req = { body } as any
  const jsonFn = vi.fn()
  const res = { json: jsonFn, status: vi.fn().mockReturnThis() } as any
  return { req, res, jsonFn }
}

describe('createSpotterProxy', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns navigate steps when LLM routes to a known route', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/settings/appearance' })
    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'dark mode', url: 'https://app.com/home' })
    await handler(req, res)
    const response = jsonFn.mock.calls[0][0]
    expect(response.type).toBe('navigate')
    expect(response.steps).toBeInstanceOf(Array)
    expect(response.steps[0]).toMatchObject({ description: expect.any(String), selector: expect.any(String) })
  })

  it('returns navigate steps with fallback when route has no selectors', async () => {
    const configNoSelectors: SpotterConfig = {
      ...mockConfig,
      routes: [{ path: '/rewards', description: 'Points page', selectors: {} }],
    }
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/rewards' })
    const handler = createSpotterProxy({ config: configNoSelectors, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'show my points', url: 'https://app.com/home' })
    await handler(req, res)
    const response = jsonFn.mock.calls[0][0]
    expect(response.type).toBe('navigate')
    expect(response.steps[0].description).toContain('/rewards')
  })

  it('returns unhandled when LLM returns general', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'general' })
    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'what is your phone number?', url: 'https://app.com' })
    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'unhandled', query: 'what is your phone number?' })
  })

  it('returns error response on unexpected throw', async () => {
    vi.mocked(routeQuery).mockRejectedValue(new Error('network failure'))
    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'test', url: 'https://app.com' })
    await handler(req, res)
    expect(jsonFn.mock.calls[0][0]).toMatchObject({ type: 'error' })
  })

  it('calls onAnalytics with correct event shape after each response', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'navigate', routePath: '/settings/appearance' })
    const onAnalytics = vi.fn()
    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' }, onAnalytics })
    const { req, res } = makeReqRes({ query: 'dark mode', url: 'https://app.com', role: 'admin' })
    await handler(req, res)
    expect(onAnalytics).toHaveBeenCalledWith({
      type: 'query',
      query: 'dark mode',
      responseType: 'navigate',
      url: 'https://app.com',
      role: 'admin',
    })
  })

  it('returns parent, route and page-action steps when the LLM picks a page action', async () => {
    const config: SpotterConfig = {
      ...mockConfig,
      routes: [
        { path: '/settings', description: 'Settings hub', selectors: {} },
        {
          path: '/settings/billing',
          description: 'Billing',
          selectors: {},
          reachableFrom: ['/settings'],
          actions: [{ name: 'change_plan', description: 'Change plan', selector: '[data-testid="change-plan"]' }],
        },
      ],
    }
    vi.mocked(routeQuery).mockResolvedValue({
      type: 'navigate',
      routePath: '/settings/billing',
      actionName: 'change_plan',
    })
    const handler = createSpotterProxy({ config, llm: { apiKey: 'test' } })
    const { req, res, jsonFn } = makeReqRes({ query: 'change my plan', url: 'https://app.com/home' })
    await handler(req, res)
    const response = jsonFn.mock.calls[0][0]
    expect(response.steps.map((s: { selector: string }) => s.selector)).toEqual([
      'a[href="/settings"]',
      'a[href="/settings/billing"]',
      '[data-testid="change-plan"]',
    ])
  })

  it('does not throw when onAnalytics is not provided', async () => {
    vi.mocked(routeQuery).mockResolvedValue({ type: 'general' })
    const handler = createSpotterProxy({ config: mockConfig, llm: { apiKey: 'test' } })
    const { req, res } = makeReqRes({ query: 'test', url: 'https://app.com' })
    await expect(handler(req, res)).resolves.not.toThrow()
  })
})
