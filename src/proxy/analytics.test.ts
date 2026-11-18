import { describe, it, expect, vi } from 'vitest'
import { noopAnalytics } from './analytics'
import type { AnalyticsHandler, SpotterEvent } from './analytics'

describe('analytics', () => {
  it('noopAnalytics does not throw', () => {
    const event: SpotterEvent = {
      type: 'query',
      query: 'dark mode',
      responseType: 'navigate',
      url: 'https://app.com',
    }
    expect(() => noopAnalytics(event)).not.toThrow()
  })

  it('AnalyticsHandler type accepts an event with optional role', () => {
    const handler: AnalyticsHandler = vi.fn()
    handler({ type: 'query', query: 'test', responseType: 'unhandled', url: 'https://app.com', role: 'admin' })
    expect(handler).toHaveBeenCalledOnce()
  })
})
