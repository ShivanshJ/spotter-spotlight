import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./client', () => ({ sendQuery: vi.fn() }))

import { sendQuery } from './client'
import { Spotter } from './index'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { Spotter.destroy(); document.body.innerHTML = ''; vi.clearAllMocks() })

describe('Spotter.init', () => {
  it('mounts the widget into the DOM', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    expect(document.querySelector('[data-spotter-root]')).not.toBeNull()
  })

  it('does not mount twice if init is called again', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    Spotter.init({ proxyUrl: '/api/spotter' })
    expect(document.querySelectorAll('[data-spotter-root]').length).toBe(1)
  })

  it('calls sendQuery with query + sessionToken + url on form submit', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'test' })
    Spotter.init({ proxyUrl: '/api/spotter', sessionToken: () => 'tok123' })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'dark mode'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(sendQuery).toHaveBeenCalled())

    expect(sendQuery).toHaveBeenCalledWith('/api/spotter', expect.objectContaining({
      query: 'dark mode',
      sessionToken: 'tok123',
      url: expect.any(String),
    }))
  })

  it('calls onUnhandled callback for unhandled response', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'refund policy' })
    const onUnhandled = vi.fn()
    Spotter.init({ proxyUrl: '/api/spotter', onUnhandled })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'refund policy'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() => expect(onUnhandled).toHaveBeenCalledWith('refund policy'))
  })

  it('shows fallback message when no onUnhandled is provided', async () => {
    vi.mocked(sendQuery).mockResolvedValue({ type: 'unhandled', query: 'anything' })
    Spotter.init({ proxyUrl: '/api/spotter' })

    const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
    input.value = 'anything'
    document.querySelector<HTMLFormElement>('[data-spotter-form]')?.dispatchEvent(new Event('submit'))
    await vi.waitFor(() =>
      expect(document.querySelector('[data-spotter-messages]')?.textContent).toContain("I can only help")
    )
  })
})

describe('Spotter.destroy', () => {
  it('removes the widget from DOM', () => {
    Spotter.init({ proxyUrl: '/api/spotter' })
    Spotter.destroy()
    expect(document.querySelector('[data-spotter-root]')).toBeNull()
  })
})
