import { describe, it, expect, vi, afterEach } from 'vitest'
import { sendQuery } from './client'
import type { SpotterResponse } from '../types'

afterEach(() => vi.restoreAllMocks())

describe('sendQuery', () => {
  it('POSTs to proxyUrl and returns parsed response', async () => {
    const mockResponse: SpotterResponse = {
      type: 'navigate',
      steps: [{ selector: '#foo', description: 'Click foo', interactionType: 'click' }],
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }))

    const result = await sendQuery('/api/spotter', {
      query: 'dark mode',
      url: 'https://app.com',
      sessionToken: 'tok123',
    })

    expect(fetch).toHaveBeenCalledWith('/api/spotter', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(result).toEqual(mockResponse)
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(sendQuery('/api/spotter', { query: 'test', url: 'https://app.com' })).rejects.toThrow('500')
  })
})
