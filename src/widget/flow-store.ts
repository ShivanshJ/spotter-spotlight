import type { NavigateStep } from '../types'

export const FLOW_STORAGE_KEY = 'spotter:flow'

export type Flow = { steps: NavigateStep[]; index: number; startedAt: number }

export interface FlowStore {
  save(flow: Flow): void
  load(): Flow | null
  clear(): void
}

type FlowStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const INTERACTION_TYPES = ['click', 'expand', 'none']

function isStep(value: unknown): value is NavigateStep {
  if (typeof value !== 'object' || value === null) return false
  const step = value as Record<string, unknown>
  return (
    typeof step.selector === 'string' &&
    typeof step.description === 'string' &&
    typeof step.interactionType === 'string' &&
    INTERACTION_TYPES.includes(step.interactionType)
  )
}

function isFlow(value: unknown): value is Flow {
  if (typeof value !== 'object' || value === null) return false
  const flow = value as Record<string, unknown>
  return (
    Array.isArray(flow.steps) &&
    flow.steps.every(isStep) &&
    Number.isInteger(flow.index) &&
    (flow.index as number) >= 0 &&
    typeof flow.startedAt === 'number'
  )
}

function parseFlow(raw: string | null): Flow | null {
  if (raw === null) return null
  const parsed: unknown = JSON.parse(raw)
  return isFlow(parsed) ? parsed : null
}

function attempt<T>(action: () => T, fallback: T): T {
  try {
    return action()
  } catch {
    return fallback
  }
}

function defaultStorage(): FlowStorage {
  return sessionStorage
}

export function createFlowStore(storage?: FlowStorage): FlowStore {
  const resolve = (): FlowStorage => storage ?? defaultStorage()
  return {
    save(flow) {
      attempt(() => resolve().setItem(FLOW_STORAGE_KEY, JSON.stringify(flow)), undefined)
    },
    load() {
      return attempt(() => parseFlow(resolve().getItem(FLOW_STORAGE_KEY)), null)
    },
    clear() {
      attempt(() => resolve().removeItem(FLOW_STORAGE_KEY), undefined)
    },
  }
}
