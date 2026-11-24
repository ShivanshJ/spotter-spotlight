import { describe, it, expect, vi } from 'vitest'
import { createFlowStore, FLOW_STORAGE_KEY, type Flow } from './flow-store'

const flow: Flow = {
  steps: [{ selector: '#a', description: 'A', interactionType: 'click' }],
  index: 0,
  startedAt: 1000,
}

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

describe('createFlowStore', () => {
  it('round-trips a flow under the spotter:flow key', () => {
    const storage = memoryStorage()
    const store = createFlowStore(storage)
    store.save(flow)
    expect(storage.data.has(FLOW_STORAGE_KEY)).toBe(true)
    expect(FLOW_STORAGE_KEY).toBe('spotter:flow')
    expect(store.load()).toEqual(flow)
  })

  it('returns null when nothing is stored', () => {
    expect(createFlowStore(memoryStorage()).load()).toBeNull()
  })

  it('returns null for corrupt JSON', () => {
    const storage = memoryStorage()
    storage.data.set(FLOW_STORAGE_KEY, '{nope')
    expect(createFlowStore(storage).load()).toBeNull()
  })

  it('returns null for an invalid shape', () => {
    const storage = memoryStorage()
    storage.data.set(FLOW_STORAGE_KEY, JSON.stringify({ steps: 'x', index: 0, startedAt: 1 }))
    expect(createFlowStore(storage).load()).toBeNull()
    storage.data.set(FLOW_STORAGE_KEY, JSON.stringify({ steps: [{ selector: 1 }], index: 0, startedAt: 1 }))
    expect(createFlowStore(storage).load()).toBeNull()
    storage.data.set(FLOW_STORAGE_KEY, JSON.stringify({ ...flow, index: -1 }))
    expect(createFlowStore(storage).load()).toBeNull()
  })

  it('clear removes the flow', () => {
    const storage = memoryStorage()
    const store = createFlowStore(storage)
    store.save(flow)
    store.clear()
    expect(store.load()).toBeNull()
  })

  it('never throws when storage throws', () => {
    const boom = vi.fn(() => { throw new Error('denied') })
    const store = createFlowStore({ getItem: boom, setItem: boom, removeItem: boom })
    expect(() => store.save(flow)).not.toThrow()
    expect(store.load()).toBeNull()
    expect(() => store.clear()).not.toThrow()
  })
})
