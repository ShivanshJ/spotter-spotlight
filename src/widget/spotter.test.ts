import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./client', () => ({ sendQuery: vi.fn() }))

import { sendQuery } from './client'
import { createSpotter } from './spotter'
import type { FlowEvent } from './flow-runner'
import type { NavigateStep } from '../types'

const step = (selector: string, description: string): NavigateStep => ({ selector, description, interactionType: 'click' })
const THREE_STEPS = [step('#one', 'First'), step('#two', 'Second'), step('#three', 'Third')]

let fakeLocation: { pathname: string; assign: ReturnType<typeof vi.fn> }
let spotter: ReturnType<typeof createSpotter>

function newSpotter() {
  return createSpotter(() => ({ location: fakeLocation, now: () => Date.now(), waitTimeoutMs: 30 }))
}

function tooltipText(): string | null {
  return document.querySelector('[data-spotter-tooltip]')?.textContent ?? null
}

function clickTarget(id: string): void {
  document.getElementById(id)!.click()
}

async function ask(steps: NavigateStep[]): Promise<void> {
  vi.mocked(sendQuery).mockResolvedValue({ type: 'navigate', steps })
  const input = document.querySelector<HTMLInputElement>('[data-spotter-input]')!
  input.value = 'take me there'
  document.querySelector<HTMLFormElement>('[data-spotter-form]')!.dispatchEvent(new Event('submit'))
  await vi.waitFor(() => expect(sendQuery).toHaveBeenCalled())
}

beforeEach(() => {
  sessionStorage.clear()
  document.body.innerHTML = '<button id="one">1</button><button id="two">2</button><button id="three">3</button>'
  fakeLocation = { pathname: '/', assign: vi.fn() }
  spotter = newSpotter()
})

afterEach(() => {
  spotter.destroy()
  sessionStorage.clear()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('guided flow', () => {
  it('highlights each step in turn and reports completion', async () => {
    const events: FlowEvent[] = []
    spotter.init({ proxyUrl: '/p', onFlowEvent: (e) => events.push(e) })
    await ask(THREE_STEPS)

    await vi.waitFor(() => expect(tooltipText()).toBe('First'))
    clickTarget('one')
    await vi.waitFor(() => expect(tooltipText()).toBe('Second'))
    clickTarget('two')
    await vi.waitFor(() => expect(tooltipText()).toBe('Third'))
    clickTarget('three')
    await vi.waitFor(() => expect(events.map((e) => e.type)).toEqual(['flow_started', 'flow_completed']))
    expect(tooltipText()).toBeNull()
    expect(sessionStorage.getItem('spotter:flow')).toBeNull()
  })

  it('still lists the steps in the panel', async () => {
    spotter.init({ proxyUrl: '/p' })
    await ask(THREE_STEPS)
    expect(document.querySelectorAll('[data-spotter-messages] li').length).toBe(3)
  })
})

describe('resume after a page load', () => {
  it('continues at the persisted index on init', async () => {
    spotter.init({ proxyUrl: '/p' })
    await ask(THREE_STEPS)
    await vi.waitFor(() => expect(tooltipText()).toBe('First'))
    clickTarget('one')
    await vi.waitFor(() => expect(tooltipText()).toBe('Second'))
    const persisted = sessionStorage.getItem('spotter:flow')!
    spotter.destroy()
    document.body.innerHTML = '<button id="one">1</button><button id="two">2</button><button id="three">3</button>'

    sessionStorage.setItem('spotter:flow', persisted)
    const events: FlowEvent[] = []
    spotter = newSpotter()
    spotter.init({ proxyUrl: '/p', onFlowEvent: (e) => events.push(e) })

    await vi.waitFor(() => expect(tooltipText()).toBe('Second'))
    clickTarget('two')
    await vi.waitFor(() => expect(tooltipText()).toBe('Third'))
    clickTarget('three')
    await vi.waitFor(() => expect(events.map((e) => e.type)).toEqual(['flow_completed']))
  })
})

describe('auto mode', () => {
  it('clicks every step for the user', async () => {
    const clicked: string[] = []
    ;['one', 'two', 'three'].forEach((id) => document.getElementById(id)!.addEventListener('click', () => clicked.push(id)))
    const events: FlowEvent[] = []
    spotter.init({ proxyUrl: '/p', mode: 'auto', onFlowEvent: (e) => events.push(e) })
    await ask(THREE_STEPS)

    await vi.waitFor(() => expect(events.map((e) => e.type)).toEqual(['flow_started', 'flow_completed']))
    expect(clicked).toEqual(['one', 'two', 'three'])
  })
})

describe('missing link target', () => {
  it('falls back to navigating with location.assign', async () => {
    const steps = [step('a[href="/rewards"]', 'Rewards'), step('#two', 'Second')]
    spotter.init({ proxyUrl: '/p' })
    await ask(steps)
    await vi.waitFor(() => expect(fakeLocation.assign).toHaveBeenCalledWith('/rewards'))
    expect(JSON.parse(sessionStorage.getItem('spotter:flow')!).index).toBe(1)
  })
})

describe('destroy', () => {
  it('abandons an active flow', async () => {
    const events: FlowEvent[] = []
    spotter.init({ proxyUrl: '/p', onFlowEvent: (e) => events.push(e) })
    await ask(THREE_STEPS)
    await vi.waitFor(() => expect(tooltipText()).toBe('First'))
    spotter.destroy()
    expect(events.at(-1)?.type).toBe('flow_abandoned')
    expect(sessionStorage.getItem('spotter:flow')).toBeNull()
  })

  it('does not let a throwing onFlowEvent break the flow', async () => {
    spotter.init({ proxyUrl: '/p', onFlowEvent: () => { throw new Error('boom') } })
    await ask(THREE_STEPS)
    await vi.waitFor(() => expect(tooltipText()).toBe('First'))
  })
})
