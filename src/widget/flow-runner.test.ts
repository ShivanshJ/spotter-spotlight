import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createFlowRunner, type FlowEvent, type FlowRunnerDeps } from './flow-runner'
import { createFlowStore, type Flow } from './flow-store'
import type { NavigateStep } from '../types'

const link = (path: string): NavigateStep => ({ selector: `a[href="${path}"]`, description: `go ${path}`, interactionType: 'click' })
const button = (id: string): NavigateStep => ({ selector: `#${id}`, description: `click ${id}`, interactionType: 'click' })

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  }
}

function fakeHighlighter() {
  let completeHandler: (() => void) | null = null
  let target: HTMLElement | null = null
  return {
    highlightStep: vi.fn((step: NavigateStep) => {
      target = document.querySelector<HTMLElement>(step.selector)
      target?.addEventListener('click', () => completeHandler?.(), { once: true })
    }),
    clear: vi.fn(),
    onComplete: (handler: () => void) => { completeHandler = handler },
  }
}

interface Harness {
  runner: ReturnType<typeof createFlowRunner>
  events: FlowEvent[]
  store: ReturnType<typeof createFlowStore>
  highlighter: ReturnType<typeof fakeHighlighter>
  location: { pathname: string; assign: ReturnType<typeof vi.fn> }
  clock: { now: number }
}

function build(overrides: Partial<FlowRunnerDeps> = {}): Harness {
  const events: FlowEvent[] = []
  const store = createFlowStore(memoryStorage())
  const highlighter = fakeHighlighter()
  const location = { pathname: '/', assign: vi.fn() }
  const clock = { now: 1000 }
  const runner = createFlowRunner({
    highlighter,
    store,
    waitForElement: async (selector) => document.querySelector<HTMLElement>(selector),
    location,
    mode: 'guided',
    onEvent: (event) => events.push(event),
    now: () => clock.now,
    ...overrides,
  })
  return { runner, events, store, highlighter, location, clock }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

async function begin(h: Harness, steps: NavigateStep[]): Promise<void> {
  void h.runner.start(steps)
  await tick()
}

async function resumeFlow(h: Harness): Promise<void> {
  void h.runner.resume()
  await tick()
}

beforeEach(() => {
  document.body.innerHTML = '<a href="/a">A</a><button id="b">B</button><button id="c">C</button>'
})
afterEach(() => { document.body.innerHTML = '' })

describe('guided mode', () => {
  it('emits flow_started and highlights the first step', async () => {
    const h = build()
    await begin(h, [button('b'), button('c')])
    expect(h.events).toEqual([{ type: 'flow_started', stepIndex: 0, totalSteps: 2 }])
    expect(h.highlighter.highlightStep).toHaveBeenCalledWith(button('b'))
  })

  it('advances one step per click and completes after the last', async () => {
    const h = build()
    await begin(h, [button('b'), button('c')])
    document.querySelector<HTMLElement>('#b')!.click()
    await tick()
    expect(h.highlighter.highlightStep).toHaveBeenLastCalledWith(button('c'))
    expect(h.store.load()?.index).toBe(1)
    document.querySelector<HTMLElement>('#c')!.click()
    await tick()
    expect(h.events.at(-1)).toEqual({ type: 'flow_completed', stepIndex: 2, totalSteps: 2 })
    expect(h.store.load()).toBeNull()
  })

  it('persists the next index synchronously in the click capture phase', async () => {
    const h = build()
    await begin(h, [button('b'), button('c')])
    let indexSeenByAppHandler: number | undefined
    document.querySelector('#b')!.addEventListener('click', () => { indexSeenByAppHandler = h.store.load()?.index })
    document.querySelector<HTMLElement>('#b')!.click()
    expect(indexSeenByAppHandler).toBe(1)
  })
})

describe('skipping and fallback', () => {
  it('skips a link step whose path is the current page', async () => {
    const h = build()
    h.location.pathname = '/a'
    await begin(h, [link('/a'), button('b')])
    expect(h.highlighter.highlightStep).toHaveBeenCalledTimes(1)
    expect(h.highlighter.highlightStep).toHaveBeenCalledWith(button('b'))
  })

  it('persists next index then assigns location when a link is missing', async () => {
    const h = build()
    await begin(h, [link('/gone'), button('b')])
    expect(h.location.assign).toHaveBeenCalledWith('/gone')
    expect(h.store.load()?.index).toBe(1)
    expect(h.highlighter.highlightStep).not.toHaveBeenCalled()
  })

  it('emits flow_step_failed and clears the store when a non-link target is missing', async () => {
    const h = build()
    await begin(h, [button('missing'), button('b')])
    expect(h.events.at(-1)).toEqual({ type: 'flow_step_failed', stepIndex: 0, totalSteps: 2, selector: '#missing' })
    expect(h.store.load()).toBeNull()
    expect(h.location.assign).not.toHaveBeenCalled()
  })
})

describe('auto mode', () => {
  it('persists the next index, clicks for the user and completes', async () => {
    const clicked: string[] = []
    document.querySelector('#b')!.addEventListener('click', () => clicked.push('b'))
    document.querySelector('#c')!.addEventListener('click', () => clicked.push('c'))
    const h = build({ mode: 'auto' })
    let indexAtClick: number | undefined
    document.querySelector('#b')!.addEventListener('click', () => { indexAtClick = h.store.load()?.index })
    await begin(h, [button('b'), button('c')])
    expect(clicked).toEqual(['b', 'c'])
    expect(indexAtClick).toBe(1)
    expect(h.highlighter.highlightStep).not.toHaveBeenCalled()
    expect(h.events.at(-1)).toEqual({ type: 'flow_completed', stepIndex: 2, totalSteps: 2 })
    expect(h.store.load()).toBeNull()
  })
})

describe('resume', () => {
  const steps = [button('b'), button('c')]
  const persisted = (index: number, startedAt = 1000): Flow => ({ steps, index, startedAt })

  it('is a no-op without a persisted flow', async () => {
    const h = build()
    await resumeFlow(h)
    expect(h.events).toEqual([])
    expect(h.highlighter.highlightStep).not.toHaveBeenCalled()
  })

  it('continues at the stored index without emitting flow_started', async () => {
    const h = build()
    h.store.save(persisted(1))
    await resumeFlow(h)
    expect(h.highlighter.highlightStep).toHaveBeenCalledTimes(1)
    expect(h.highlighter.highlightStep).toHaveBeenCalledWith(button('c'))
    expect(h.events).toEqual([])
  })

  it('treats an index past the end as completed', async () => {
    const h = build()
    h.store.save(persisted(2))
    await resumeFlow(h)
    expect(h.events).toEqual([{ type: 'flow_completed', stepIndex: 2, totalSteps: 2 }])
    expect(h.store.load()).toBeNull()
  })

  it('ignores and clears a flow older than five minutes', async () => {
    const h = build()
    h.store.save(persisted(0, 1000))
    h.clock.now = 1000 + 5 * 60 * 1000 + 1
    await resumeFlow(h)
    expect(h.highlighter.highlightStep).not.toHaveBeenCalled()
    expect(h.events).toEqual([])
    expect(h.store.load()).toBeNull()
  })
})

describe('cancel', () => {
  it('emits flow_abandoned, clears state and stops advancing', async () => {
    const h = build()
    await begin(h, [button('b'), button('c')])
    h.runner.cancel()
    expect(h.events.at(-1)).toEqual({ type: 'flow_abandoned', stepIndex: 0, totalSteps: 2 })
    expect(h.store.load()).toBeNull()
    expect(h.highlighter.clear).toHaveBeenCalled()
    document.querySelector<HTMLElement>('#b')!.click()
    await tick()
    expect(h.highlighter.highlightStep).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no flow is active', () => {
    const h = build()
    h.runner.cancel()
    expect(h.events).toEqual([])
  })

  it('does not emit abandoned after a flow completed', async () => {
    const h = build({ mode: 'auto' })
    await begin(h, [button('b')])
    h.runner.cancel()
    expect(h.events.map((e) => e.type)).toEqual(['flow_started', 'flow_completed'])
  })
})

describe('start while a flow is active', () => {
  it('abandons the previous flow and starts the new one', async () => {
    const h = build()
    await begin(h, [button('b')])
    await begin(h, [button('c')])
    expect(h.events.map((e) => e.type)).toEqual(['flow_started', 'flow_abandoned', 'flow_started'])
    expect(h.highlighter.highlightStep).toHaveBeenLastCalledWith(button('c'))
  })
})
