import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { waitForElement } from './element-waiter'

beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = '' })

describe('waitForElement', () => {
  it('resolves immediately when the element exists', async () => {
    document.body.innerHTML = '<button id="a"></button>'
    expect(await waitForElement('#a')).toBe(document.getElementById('a'))
  })

  it('resolves when the element appears later', async () => {
    const pending = waitForElement('#late', { timeoutMs: 1000 })
    const el = document.createElement('div')
    el.id = 'late'
    document.body.appendChild(el)
    expect(await pending).toBe(el)
  })

  it('resolves null on timeout', async () => {
    vi.useFakeTimers()
    const pending = waitForElement('#never', { timeoutMs: 500 })
    await vi.advanceTimersByTimeAsync(500)
    expect(await pending).toBeNull()
  })

  it('searches inside a custom root', async () => {
    document.body.innerHTML = '<div id="root"><i class="x"></i></div><i class="x" id="outside"></i>'
    const root = document.getElementById('root')!
    expect(await waitForElement('.x', { root })).toBe(root.firstElementChild)
  })

  it('resolves null for an invalid selector', async () => {
    expect(await waitForElement('a[href=', { timeoutMs: 10 })).toBeNull()
  })
})
