import type { NavigateStep } from '../types'
import type { FlowStore } from './flow-store'
import { linkPathOf } from './flow-steps'

export type FlowMode = 'guided' | 'auto'

export type FlowEvent = {
  type: 'flow_started' | 'flow_completed' | 'flow_step_failed' | 'flow_abandoned'
  stepIndex: number
  totalSteps: number
  selector?: string
}

export interface FlowHighlighter {
  highlightStep(step: NavigateStep): void
  clear(): void
  onComplete(handler: () => void): void
}

export interface FlowLocation {
  pathname: string
  assign(url: string): void
}

export interface FlowRunnerDeps {
  highlighter: FlowHighlighter
  store: FlowStore
  waitForElement: (selector: string) => Promise<HTMLElement | null>
  location: FlowLocation
  mode: FlowMode
  onEvent: (event: FlowEvent) => void
  now: () => number
}

export interface FlowRunner {
  start(steps: NavigateStep[]): Promise<void>
  resume(): Promise<void>
  cancel(): void
}

interface Run {
  steps: NavigateStep[]
  index: number
  startedAt: number
  cancelled: boolean
  release: (() => void) | null
}

export const MAX_FLOW_AGE_MS = 5 * 60 * 1000

export function createFlowRunner(deps: FlowRunnerDeps): FlowRunner {
  const { highlighter, store, location } = deps
  let current: Run | null = null

  function emit(run: Run, type: FlowEvent['type'], selector?: string): void {
    const event: FlowEvent = { type, stepIndex: run.index, totalSteps: run.steps.length }
    deps.onEvent(selector === undefined ? event : { ...event, selector })
  }

  function persist(run: Run, index: number): void {
    store.save({ steps: run.steps, index, startedAt: run.startedAt })
  }

  function finish(run: Run): void {
    if (current === run) current = null
    store.clear()
  }

  function complete(run: Run): void {
    run.index = run.steps.length
    emit(run, 'flow_completed')
    finish(run)
  }

  function fail(run: Run, step: NavigateStep): void {
    emit(run, 'flow_step_failed', step.selector)
    finish(run)
  }

  function clickForUser(run: Run, element: HTMLElement): Promise<void> {
    persist(run, run.index + 1)
    element.click()
    return Promise.resolve()
  }

  function waitForUserClick(run: Run, step: NavigateStep, element: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
      const persistNext = () => persist(run, run.index + 1)
      element.addEventListener('click', persistNext, { capture: true, once: true })
      run.release = () => {
        element.removeEventListener('click', persistNext, { capture: true })
        resolve()
      }
      highlighter.onComplete(resolve)
      highlighter.highlightStep(step)
    })
  }

  function interact(run: Run, step: NavigateStep, element: HTMLElement): Promise<void> {
    return deps.mode === 'auto' ? clickForUser(run, element) : waitForUserClick(run, step, element)
  }

  async function runStep(run: Run, step: NavigateStep): Promise<boolean> {
    const path = linkPathOf(step)
    if (path !== null && path === location.pathname) return true
    const element = await deps.waitForElement(step.selector)
    if (run.cancelled) return false
    if (element) {
      await interact(run, step, element)
      return true
    }
    if (path === null) {
      fail(run, step)
      return false
    }
    persist(run, run.index + 1)
    location.assign(path)
    return false
  }

  async function execute(run: Run): Promise<void> {
    current = run
    while (run.index < run.steps.length) {
      const advanced = await runStep(run, run.steps[run.index])
      if (run.cancelled || !advanced) return
      run.index += 1
    }
    complete(run)
  }

  function newRun(steps: NavigateStep[], index: number, startedAt: number): Run {
    return { steps, index, startedAt, cancelled: false, release: null }
  }

  function abandon(run: Run): void {
    run.cancelled = true
    run.release?.()
    highlighter.clear()
    emit(run, 'flow_abandoned')
    finish(run)
  }

  return {
    start(steps) {
      if (steps.length === 0) return Promise.resolve()
      if (current) abandon(current)
      const run = newRun(steps, 0, deps.now())
      persist(run, 0)
      emit(run, 'flow_started')
      return execute(run)
    },

    resume() {
      const flow = store.load()
      if (!flow || current) return Promise.resolve()
      if (deps.now() - flow.startedAt > MAX_FLOW_AGE_MS) {
        store.clear()
        return Promise.resolve()
      }
      const run = newRun(flow.steps, flow.index, flow.startedAt)
      if (run.index >= run.steps.length) {
        complete(run)
        return Promise.resolve()
      }
      return execute(run)
    },

    cancel() {
      if (current) abandon(current)
    },
  }
}
